"""Shared, fail-closed contracts for recaps and season forecasts.

Scores are not a completion signal. All NFL games in the scheduled week must
have an explicit final status before fantasy results can enter a final recap.
"""
import json
import math
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

FIXTURES = Path(__file__).resolve().parent / "fixtures"


def normalize_team(team):
    return {"WSH": "WAS", "JAC": "JAX", "LA": "LAR"}.get(team, team)


def completion_from_scoreboard(board, fixture, season, week):
    """Validate coverage, including postponed/missing games; never infer finality."""
    if (board.get("season", {}).get("type"), board.get("season", {}).get("year")) != (2, int(season)) or board.get("week", {}).get("number") != week:
        raise ValueError(f"Completion feed returned the wrong season/week for {season}/{week}")
    if int(fixture.get("season", 0)) != int(season) or fixture.get("week") != week:
        raise ValueError("Schedule fixture does not match requested season/week")
    expected = {frozenset((normalize_team(g["away"]), normalize_team(g["home"]))) for g in fixture["games"]}
    if not expected or len(expected) != len(fixture["games"]):
        raise ValueError("Empty or duplicate NFL schedule")
    observed, games = set(), []
    for event in board.get("events", []):
        if event.get("season", {}).get("year") != int(season) or event.get("season", {}).get("type") != 2 or event.get("week", {}).get("number") != week:
            raise ValueError("Completion feed contains an unexpected game")
        competitors = event["competitions"][0]["competitors"]
        pairing = frozenset(normalize_team(c["team"]["abbreviation"]) for c in competitors)
        if len(pairing) != 2 or pairing in observed:
            raise ValueError("Incomplete or duplicate NFL game")
        observed.add(pairing)
        status = event.get("status", {}).get("type", {})
        games.append({"eventId": event["id"], "teams": sorted(pairing),
                      "final": status.get("completed") is True and status.get("state") == "post" and status.get("name") == "STATUS_FINAL"})
    if observed != expected:
        raise ValueError(f"NFL schedule/completion coverage mismatch for Week {week}")
    return {"season": str(season), "week": week, "provider": "ESPN scoreboard",
            "checkedAtUtc": datetime.now(timezone.utc).isoformat(),
            "expectedGames": len(expected), "games": games,
            "status": "final" if all(g["final"] for g in games) else "in_progress"}


def fetch_week_completion(season, week):
    fixture = json.loads((FIXTURES / f"nfl_schedule_{season}_week_{week}.json").read_text())
    url = f"https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates={season}&seasontype=2&week={week}&limit=1000"
    request = urllib.request.Request(url, headers={"User-Agent": "ApesMacSalad/3.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        board = json.load(response)
    result = completion_from_scoreboard(board, fixture, season, week)
    result["sourceUrl"] = url
    return result


def winner_id(team_a, team_b):
    if team_a["points"] == team_b["points"]:
        return None
    return (team_a if team_a["points"] > team_b["points"] else team_b)["rosterId"]


def validate_final_week(week, roster_ids, season):
    """Shared by the simulator and publication gate; rejects legacy unverified recaps."""
    evidence = week.get("completion", {})
    games = evidence.get("games", [])
    if (week.get("status") != "final" or evidence.get("status") != "final"
            or evidence.get("week") != week.get("week") or str(evidence.get("season")) != str(season)
            or not games or evidence.get("expectedGames") != len(games)
            or any(g.get("final") is not True for g in games)
            or len({g.get("eventId") for g in games}) != len(games)):
        raise ValueError(f"Week {week.get('week')} has no complete final-game evidence")
    seen = []
    matchup_ids = []
    for match in week.get("matchups", []):
        a, b = match["teamA"], match["teamB"]
        for team in (a, b):
            if not isinstance(team.get("points"), (int, float)) or not math.isfinite(team["points"]):
                raise ValueError("Missing or non-finite final score")
            seen.append(team["rosterId"])
        matchup_ids.append(match["matchupId"])
        if match.get("status") != "final" or match.get("winnerRosterId") != winner_id(a, b):
            raise ValueError("Final matchup status/winner disagrees with scores")
    if set(seen) != set(roster_ids) or len(seen) != len(set(seen)) or len(matchup_ids) != len(set(matchup_ids)):
        raise ValueError("Final week must contain exactly one matchup for every roster")


def canonical_power_rows(payload, roster_ids):
    rows = payload["teams"]
    ids = [r["rosterId"] for r in rows]
    if set(ids) != set(roster_ids) or len(ids) != len(set(ids)):
        raise ValueError("Power rankings must cover every roster exactly once")
    ordered = sorted(rows, key=lambda r: r["rank"])
    if [r["rank"] for r in ordered] != list(range(1, len(rows) + 1)):
        raise ValueError("Power ranking positions must be contiguous and unique")
    for row in ordered:
        for key in ("score", "lineupScore", "depthScore", "balanceScore", "priorScore"):
            if not isinstance(row[key], (int, float)) or not math.isfinite(row[key]) or not 0 <= row[key] <= 100:
                raise ValueError(f"Invalid power component: {key}")
        score = sum(row[k] * weight for k, weight in (("lineupScore", .55), ("depthScore", .25), ("balanceScore", .1), ("priorScore", .1)))
        if abs(score - row["score"]) > .06:
            raise ValueError("Power score disagrees with its published components")
    if any(a["score"] < b["score"] for a, b in zip(ordered, ordered[1:])):
        raise ValueError("Power ranks disagree with score order")
    return {r["rosterId"]: r for r in rows}
