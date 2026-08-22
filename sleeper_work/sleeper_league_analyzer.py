#!/usr/bin/env python3
"""Pull a Sleeper dynasty league and generate roster analysis and draft grades.

The script uses only Python's standard library. Sleeper data is read-only and
requires no API key. FantasyCalc is used as a live market-value layer.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import statistics
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


SLEEPER_BASE = "https://api.sleeper.app/v1"
FANTASYCALC_URL = (
    "https://api.fantasycalc.com/values/current"
    "?isDynasty=true&numQbs=1&numTeams=12&ppr=0.5"
)
USER_AGENT = "ApeInvitationalAnalyzer/1.0"
SKILL_POSITIONS = {"QB", "RB", "WR", "TE"}
START_REQUIREMENTS = {"QB": 1, "RB": 2, "WR": 2, "TE": 1}
FLEX_SLOTS = 3
ROOM_WEIGHTS = {
    "QB": [1.0, 0.35],
    "RB": [1.0, 0.85, 0.65, 0.45, 0.25],
    "WR": [1.0, 0.85, 0.70, 0.55, 0.40, 0.25],
    "TE": [1.0, 0.50, 0.25],
}


def request_json(url: str, retries: int = 3) -> Any:
    """GET JSON with a small retry/backoff policy."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.load(response)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = exc
            if attempt + 1 < retries:
                time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Unable to retrieve {url}: {last_error}")


def cached_json(url: str, path: Path, max_age_hours: float, refresh: bool) -> Any:
    """Read a recent cache entry or refresh it."""
    if path.exists() and not refresh:
        age_hours = (time.time() - path.stat().st_mtime) / 3600
        if age_hours <= max_age_hours:
            return json.loads(path.read_text(encoding="utf-8"))
    data = request_json(url)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data), encoding="utf-8")
    return data


def sleeper(path: str) -> Any:
    return request_json(f"{SLEEPER_BASE}/{path.lstrip('/')}")


def normalized_name(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "")
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.replace("’", "'").replace(".", "").replace(" III", "").replace(" Jr", "")
    return " ".join(value.lower().split())


def team_label(user: dict[str, Any] | None, roster_id: int) -> str:
    if not user:
        return f"Roster {roster_id}"
    metadata = user.get("metadata") or {}
    return metadata.get("team_name") or user.get("display_name") or f"Roster {roster_id}"


def percentile_ranks(values: dict[int, float], higher_is_better: bool = True) -> dict[int, float]:
    """Return 0-100 percentile-like ranks with ties handled consistently."""
    ordered = sorted(values, key=lambda key: values[key], reverse=higher_is_better)
    count = len(ordered)
    if count <= 1:
        return {key: 100.0 for key in ordered}
    result: dict[int, float] = {}
    for index, key in enumerate(ordered):
        result[key] = 100.0 * (count - 1 - index) / (count - 1)
    return result


def ordinal_rank(values: dict[int, float], higher_is_better: bool = True) -> dict[int, int]:
    ordered = sorted(values, key=lambda key: values[key], reverse=higher_is_better)
    return {key: index + 1 for index, key in enumerate(ordered)}


def value_for(player: dict[str, Any], key: str) -> float:
    market = player.get("market") or {}
    return float(market.get(key) or 0)


def optimal_lineup(players: list[dict[str, Any]], value_key: str) -> tuple[float, set[str]]:
    """Choose a value-maximizing 1QB/2RB/2WR/1TE/3FLEX lineup."""
    selected: list[dict[str, Any]] = []
    for position, slots in START_REQUIREMENTS.items():
        options = sorted(
            (p for p in players if p.get("position") == position),
            key=lambda p: value_for(p, value_key),
            reverse=True,
        )
        selected.extend(options[:slots])
    selected_ids = {str(p.get("player_id")) for p in selected}
    flex = sorted(
        (
            p
            for p in players
            if p.get("position") in {"RB", "WR", "TE"}
            and str(p.get("player_id")) not in selected_ids
        ),
        key=lambda p: value_for(p, value_key),
        reverse=True,
    )[:FLEX_SLOTS]
    selected.extend(flex)
    selected_ids = {str(p.get("player_id")) for p in selected}
    return sum(value_for(p, value_key) for p in selected), selected_ids


def room_score(players: list[dict[str, Any]], position: str) -> float:
    values = sorted(
        (value_for(p, "value") for p in players if p.get("position") == position),
        reverse=True,
    )
    return sum(v * w for v, w in zip(values, ROOM_WEIGHTS[position]))


def letter_grade(ratio: float) -> str:
    thresholds = [
        (1.25, "A+"),
        (1.15, "A"),
        (1.08, "A-"),
        (1.02, "B+"),
        (0.96, "B"),
        (0.90, "B-"),
        (0.84, "C+"),
        (0.76, "C"),
        (0.68, "C-"),
        (0.58, "D+"),
        (0.48, "D"),
    ]
    return next((grade for threshold, grade in thresholds if ratio >= threshold), "F")


def draft_pick_label(delta: int, ratio: float) -> str:
    if delta >= 5 or ratio >= 1.25:
        return "steal"
    if delta >= 2 or ratio >= 1.10:
        return "value"
    if delta <= -5 or ratio <= 0.70:
        return "major reach"
    if delta <= -2 or ratio <= 0.88:
        return "reach"
    return "market"


def competitive_window(redraft_rank: int, dynasty_rank: int, depth_rank: int) -> str:
    if redraft_rank <= 4 and dynasty_rank <= 4:
        return "contender with staying power"
    if redraft_rank <= 4 and dynasty_rank >= 9:
        return "win-now / aging"
    if dynasty_rank <= 4 and redraft_rank >= 7:
        return "ascending"
    if redraft_rank >= 9 and dynasty_rank >= 9:
        return "retool / bubble" if depth_rank <= 6 else "rebuild"
    if depth_rank <= 4 and redraft_rank <= 7:
        return "deep playoff mix"
    return "middle / needs a direction"


def player_display(player: dict[str, Any]) -> str:
    team = player.get("team") or "FA"
    return f"{player.get('name', 'Unknown')} ({player.get('position', '?')}-{team})"


def write_csv(path: Path, rows: Iterable[dict[str, Any]], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def future_pick_inventory(
    roster_ids: list[int], traded: list[dict[str, Any]], seasons: list[int], rounds: int
) -> dict[int, dict[int, list[str]]]:
    owners: dict[tuple[int, int, int], int] = {}
    for season in seasons:
        for round_no in range(1, rounds + 1):
            for original in roster_ids:
                owners[(season, round_no, original)] = original
    for pick in traded:
        try:
            key = (int(pick["season"]), int(pick["round"]), int(pick["roster_id"]))
            if key in owners:
                owners[key] = int(pick["owner_id"])
        except (KeyError, TypeError, ValueError):
            continue
    inventory: dict[int, dict[int, list[str]]] = {
        roster_id: {season: [] for season in seasons} for roster_id in roster_ids
    }
    for (season, round_no, original), owner in owners.items():
        inventory.setdefault(owner, {}).setdefault(season, []).append(f"R{round_no} (orig {original})")
    return inventory


def analyze(args: argparse.Namespace) -> dict[str, Path]:
    generated_at = datetime.now(timezone.utc)
    cache_dir = Path(args.cache_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    user = sleeper(f"user/{urllib.parse.quote(args.username)}")
    if not user or not user.get("user_id"):
        raise RuntimeError(f"Sleeper user not found: {args.username}")
    user_id = str(user["user_id"])
    leagues = sleeper(f"user/{user_id}/leagues/nfl/{args.season}")
    if args.league_id:
        league = next((item for item in leagues if str(item.get("league_id")) == args.league_id), None)
        if league is None:
            league = sleeper(f"league/{args.league_id}")
    else:
        named = [item for item in leagues if item.get("name") == args.league_name]
        if len(named) == 1:
            league = named[0]
        elif len(leagues) == 1:
            league = leagues[0]
        else:
            names = ", ".join(f"{item.get('name')} ({item.get('league_id')})" for item in leagues)
            raise RuntimeError(f"League selection is ambiguous. Available leagues: {names}")
    if not league:
        raise RuntimeError("Unable to resolve the requested league")

    league_id = str(league["league_id"])
    rosters = sleeper(f"league/{league_id}/rosters")
    users = sleeper(f"league/{league_id}/users")
    drafts = sleeper(f"league/{league_id}/drafts")
    traded_picks = sleeper(f"league/{league_id}/traded_picks")
    current_draft = next((d for d in drafts if str(d.get("season")) == str(args.season)), drafts[0] if drafts else None)
    draft_picks = sleeper(f"draft/{current_draft['draft_id']}/picks") if current_draft else []

    # Sleeper explicitly asks clients to refresh the large player map no more than daily.
    sleeper_players = cached_json(
        f"{SLEEPER_BASE}/players/nfl",
        cache_dir / "sleeper_players_nfl.json",
        max_age_hours=24,
        refresh=args.refresh,
    )
    fantasycalc = cached_json(
        FANTASYCALC_URL,
        cache_dir / "fantasycalc_1qb_12team_halfppr.json",
        max_age_hours=12,
        refresh=args.refresh,
    )
    expert_path = Path(args.expert_rankings)
    if not expert_path.exists():
        expert_path = Path(__file__).resolve().parent / args.expert_rankings
    expert_snapshot = json.loads(expert_path.read_text(encoding="utf-8")) if expert_path.exists() else {
        "sources": {},
        "players": {},
    }
    expert_players = expert_snapshot.get("players") or {}

    editorial_path = Path(args.editorial)
    if not editorial_path.exists():
        editorial_path = Path(__file__).resolve().parent / args.editorial
    editorial_snapshot = json.loads(editorial_path.read_text(encoding="utf-8")) if editorial_path.exists() else {
        "teams": {}
    }

    fc_by_sleeper = {
        str(item.get("player", {}).get("sleeperId")): item
        for item in fantasycalc
        if item.get("player", {}).get("sleeperId") is not None
    }
    fc_by_name = {
        normalized_name(item.get("player", {}).get("name", "")): item
        for item in fantasycalc
        if item.get("player", {}).get("name")
    }
    users_by_id = {str(item.get("user_id")): item for item in users}
    rosters_by_id = {int(item["roster_id"]): item for item in rosters}
    my_roster_id = next(
        (int(item["roster_id"]) for item in rosters if str(item.get("owner_id")) == user_id), None
    )

    def enrich(player_id: str) -> dict[str, Any]:
        sleeper_player = sleeper_players.get(str(player_id), {})
        name = sleeper_player.get("full_name") or " ".join(
            x for x in [sleeper_player.get("first_name"), sleeper_player.get("last_name")] if x
        )
        if not name and len(str(player_id)) <= 4 and str(player_id).isalpha():
            name = f"{str(player_id)} D/ST"
        market = fc_by_sleeper.get(str(player_id)) or fc_by_name.get(normalized_name(name)) or {}
        market_player = market.get("player") or {}
        return {
            "player_id": str(player_id),
            "name": name or f"Unknown {player_id}",
            "position": sleeper_player.get("position") or market_player.get("position") or ("DEF" if str(player_id).isalpha() else "?"),
            "team": sleeper_player.get("team") or market_player.get("maybeTeam"),
            "age": market_player.get("maybeAge") or sleeper_player.get("age"),
            "market": market,
        }

    drafted_ids = {str(pick.get("player_id")) for pick in draft_picks}
    drafted_by_roster: dict[int, set[str]] = defaultdict(set)
    for pick in draft_picks:
        if pick.get("roster_id") is not None and pick.get("player_id") is not None:
            drafted_by_roster[int(pick["roster_id"])].add(str(pick["player_id"]))
    team_players: dict[int, list[dict[str, Any]]] = {}
    roster_rows: list[dict[str, Any]] = []
    for roster in rosters:
        roster_id = int(roster["roster_id"])
        owner = users_by_id.get(str(roster.get("owner_id")))
        sleeper_roster_ids = {str(player_id) for player_id in (roster.get("players") or [])}
        # During a live slow draft, Sleeper exposes picks immediately but may not add
        # the rookies to /rosters until the draft completes. Include them now so the
        # post-draft analysis is not artificially stale.
        player_ids = sleeper_roster_ids | drafted_by_roster.get(roster_id, set())
        players = [enrich(player_id) for player_id in player_ids]
        team_players[roster_id] = players
        starters = {str(item) for item in (roster.get("starters") or [])}
        reserve = {str(item) for item in (roster.get("reserve") or [])}
        taxi = {str(item) for item in (roster.get("taxi") or [])}
        for player in sorted(players, key=lambda p: value_for(p, "value"), reverse=True):
            status = "starter" if player["player_id"] in starters else "bench"
            if player["player_id"] in drafted_by_roster.get(roster_id, set()) and player["player_id"] not in sleeper_roster_ids:
                status = "drafted"
            if player["player_id"] in reserve:
                status = "IR"
            if player["player_id"] in taxi:
                status = "taxi"
            market = player.get("market") or {}
            roster_rows.append(
                {
                    "roster_id": roster_id,
                    "team": team_label(owner, roster_id),
                    "manager": (owner or {}).get("display_name", ""),
                    "player_id": player["player_id"],
                    "player": player["name"],
                    "position": player["position"],
                    "nfl_team": player.get("team") or "",
                    "age": player.get("age") or "",
                    "status": status,
                    "dynasty_value": int(value_for(player, "value")),
                    "redraft_value": int(value_for(player, "redraftValue")),
                    "overall_rank": market.get("overallRank") or "",
                    "trend_30_day": market.get("trend30Day") or 0,
                }
            )

    # Team metrics.
    metrics: dict[int, dict[str, Any]] = {}
    for roster_id, players in team_players.items():
        dynasty_core, dynasty_starters = optimal_lineup(players, "value")
        redraft_core, _ = optimal_lineup(players, "redraftValue")
        bench = sorted(
            (
                value_for(p, "value")
                for p in players
                if p.get("position") in SKILL_POSITIONS and p["player_id"] not in dynasty_starters
            ),
            reverse=True,
        )
        skill_players = [p for p in players if p.get("position") in SKILL_POSITIONS]
        total_value = sum(value_for(p, "value") for p in skill_players)
        youth_value = sum(
            value_for(p, "value") for p in skill_players if p.get("age") and float(p["age"]) <= 25.5
        )
        metrics[roster_id] = {
            "dynasty_core": dynasty_core,
            "redraft_core": redraft_core,
            "depth_value": sum(bench[:10]),
            "total_value": total_value,
            "youth_share": youth_value / total_value if total_value else 0,
            "unmatched": sum(
                1
                for p in players
                if p.get("position") in SKILL_POSITIONS and not (p.get("market") or {}).get("value")
            ),
            **{f"{position.lower()}_room": room_score(players, position) for position in ROOM_WEIGHTS},
        }

    dynasty_rank = ordinal_rank({key: value["dynasty_core"] for key, value in metrics.items()})
    redraft_rank = ordinal_rank({key: value["redraft_core"] for key, value in metrics.items()})
    depth_rank = ordinal_rank({key: value["depth_value"] for key, value in metrics.items()})
    total_rank = ordinal_rank({key: value["total_value"] for key, value in metrics.items()})
    youth_rank = ordinal_rank({key: value["youth_share"] for key, value in metrics.items()})
    room_ranks = {
        position: ordinal_rank({key: value[f"{position.lower()}_room"] for key, value in metrics.items()})
        for position in ROOM_WEIGHTS
    }
    pre_draft_room_scores = {
        roster_id: {
            position: room_score(
                [player for player in players if player["player_id"] not in drafted_ids], position
            )
            for position in ROOM_WEIGHTS
        }
        for roster_id, players in team_players.items()
    }
    pre_draft_room_ranks = {
        position: ordinal_rank(
            {roster_id: scores[position] for roster_id, scores in pre_draft_room_scores.items()}
        )
        for position in ROOM_WEIGHTS
    }
    composite_pct = {}
    dynasty_pct = percentile_ranks({key: value["dynasty_core"] for key, value in metrics.items()})
    redraft_pct = percentile_ranks({key: value["redraft_core"] for key, value in metrics.items()})
    depth_pct = percentile_ranks({key: value["depth_value"] for key, value in metrics.items()})
    for roster_id in metrics:
        composite_pct[roster_id] = (
            0.45 * dynasty_pct[roster_id]
            + 0.35 * redraft_pct[roster_id]
            + 0.20 * depth_pct[roster_id]
        )
    composite_rank = ordinal_rank(composite_pct)

    draft_rounds = int((league.get("settings") or {}).get("draft_rounds") or 4)
    future_seasons = [int(args.season) + offset for offset in (1, 2, 3)]
    future_picks = future_pick_inventory(list(rosters_by_id), traded_picks, future_seasons, draft_rounds)

    summary_rows: list[dict[str, Any]] = []
    for roster_id in sorted(metrics, key=lambda rid: composite_rank[rid]):
        roster = rosters_by_id[roster_id]
        owner = users_by_id.get(str(roster.get("owner_id")))
        strongest = min(ROOM_WEIGHTS, key=lambda position: room_ranks[position][roster_id])
        weakest = max(ROOM_WEIGHTS, key=lambda position: room_ranks[position][roster_id])
        row = {
            "power_rank": composite_rank[roster_id],
            "roster_id": roster_id,
            "team": team_label(owner, roster_id),
            "manager": (owner or {}).get("display_name", ""),
            "my_team": roster_id == my_roster_id,
            "window": competitive_window(redraft_rank[roster_id], dynasty_rank[roster_id], depth_rank[roster_id]),
            "dynasty_core_rank": dynasty_rank[roster_id],
            "redraft_lineup_rank": redraft_rank[roster_id],
            "depth_rank": depth_rank[roster_id],
            "total_value_rank": total_rank[roster_id],
            "youth_rank": youth_rank[roster_id],
            "strongest_room": f"{strongest} (#{room_ranks[strongest][roster_id]})",
            "weakest_room": f"{weakest} (#{room_ranks[weakest][roster_id]})",
            "qb_room_rank": room_ranks["QB"][roster_id],
            "rb_room_rank": room_ranks["RB"][roster_id],
            "wr_room_rank": room_ranks["WR"][roster_id],
            "te_room_rank": room_ranks["TE"][roster_id],
            "dynasty_core_value": round(metrics[roster_id]["dynasty_core"]),
            "redraft_lineup_value": round(metrics[roster_id]["redraft_core"]),
            "depth_value": round(metrics[roster_id]["depth_value"]),
            "total_roster_value": round(metrics[roster_id]["total_value"]),
            "youth_value_share": f"{100 * metrics[roster_id]['youth_share']:.1f}%",
            "2027_firsts": sum(item.startswith("R1") for item in future_picks[roster_id][future_seasons[0]]),
            "future_picks_3yr": sum(len(items) for items in future_picks[roster_id].values()),
        }
        summary_rows.append(row)

    # Create a current 1QB rookie market board from FantasyCalc.
    rookie_market = [
        item
        for item in fantasycalc
        if item.get("player", {}).get("maybeYoe") == 0
        and item.get("player", {}).get("position") in SKILL_POSITIONS
    ]
    rookie_market.sort(key=lambda item: float(item.get("value") or 0), reverse=True)
    rookie_rank_by_sleeper = {
        str(item.get("player", {}).get("sleeperId")): index + 1
        for index, item in enumerate(rookie_market)
    }
    rookie_value_by_rank = {
        index + 1: float(item.get("value") or 0) for index, item in enumerate(rookie_market)
    }

    pick_rows: list[dict[str, Any]] = []
    picks_by_roster: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for pick in sorted(draft_picks, key=lambda item: int(item.get("pick_no") or 0)):
        roster_id = int(pick.get("roster_id") or 0)
        owner = users_by_id.get(str(rosters_by_id.get(roster_id, {}).get("owner_id")))
        player_id = str(pick.get("player_id"))
        metadata = pick.get("metadata") or {}
        name = " ".join(x for x in [metadata.get("first_name"), metadata.get("last_name")] if x)
        market = fc_by_sleeper.get(player_id) or fc_by_name.get(normalized_name(name)) or {}
        market_player = market.get("player") or {}
        expert = expert_players.get(normalized_name(name)) or {}
        source_ranks = expert.get("source_ranks") or {}
        market_rank = rookie_rank_by_sleeper.get(str(market_player.get("sleeperId")))
        pick_no = int(pick.get("pick_no") or 0)
        expected_value = rookie_value_by_rank.get(pick_no, 0)
        actual_value = float(market.get("value") or 0)
        ratio = actual_value / expected_value if expected_value else 0
        delta = pick_no - market_rank if market_rank else 0
        expert_rank = float(expert.get("consensus_rank") or 0)
        expert_rank_rounded = max(1, round(expert_rank)) if expert_rank else 0
        expert_implied_value = rookie_value_by_rank.get(expert_rank_rounded, 0)
        expert_ratio = expert_implied_value / expected_value if expected_value else 0
        expert_delta = pick_no - expert_rank if expert_rank else 0
        position = metadata.get("position") or market_player.get("position") or "?"
        pre_draft_position_rank = pre_draft_room_ranks.get(position, {}).get(roster_id)
        row = {
            "pick_no": pick_no,
            "pick": f"{int(pick.get('round') or 0)}.{int(pick.get('draft_slot') or 0):02d}",
            "round": int(pick.get("round") or 0),
            "draft_slot": int(pick.get("draft_slot") or 0),
            "roster_id": roster_id,
            "team": team_label(owner, roster_id),
            "manager": (owner or {}).get("display_name", ""),
            "player": name or market_player.get("name") or f"Unknown {player_id}",
            "position": position,
            "nfl_team": metadata.get("team") or market_player.get("maybeTeam") or "",
            "market_rookie_rank": market_rank or "",
            "expert_consensus_rank": expert_rank or "",
            "expert_rank_low": expert.get("rank_low") or "",
            "expert_rank_high": expert.get("rank_high") or "",
            "expert_sources_count": expert.get("sources_count") or 0,
            "fantasypros_ecr_rank": source_ranks.get("fantasypros_ecr") or "",
            "rotoballer_rank": source_ranks.get("rotoballer") or "",
            "boone_1qb_rank": source_ranks.get("boone_1qb") or "",
            "draftsharks_rank": source_ranks.get("draftsharks") or "",
            "market_value": round(actual_value),
            "expected_slot_value": round(expected_value),
            "value_ratio": round(ratio, 3),
            "rank_surplus": delta if market_rank else "",
            "pick_label": draft_pick_label(delta, ratio) if market_rank else "ungraded",
            "expert_implied_value": round(expert_implied_value),
            "expert_value_ratio": round(expert_ratio, 3),
            "expert_rank_surplus": round(expert_delta, 1) if expert_rank else "",
            "expert_pick_label": draft_pick_label(round(expert_delta), expert_ratio) if expert_rank else "ungraded",
            "pre_draft_position_room_rank": pre_draft_position_rank or "",
        }
        pick_rows.append(row)
        picks_by_roster[roster_id].append(row)

    grade_rows: list[dict[str, Any]] = []
    for roster_id, picks in picks_by_roster.items():
        actual = sum(float(row["market_value"]) for row in picks)
        expert_actual = sum(float(row["expert_implied_value"]) for row in picks)
        expected = sum(float(row["expected_slot_value"]) for row in picks)
        market_ratio = actual / expected if expected else 0
        expert_ratio = expert_actual / expected if expected else 0
        blended_ratio = 0.45 * market_ratio + 0.55 * expert_ratio
        format_multipliers = {"QB": 0.55, "RB": 1.15, "WR": 1.15, "TE": 0.80}
        fit_numerator = 0.0
        fit_denominator = 0.0
        for row in picks:
            room_rank = float(row["pre_draft_position_room_rank"] or 6.5)
            need_percentile = max(0.0, min(1.0, (room_rank - 1.0) / 11.0))
            fit_signal = min(1.0, need_percentile * format_multipliers.get(row["position"], 0.75))
            weight = float(row["expected_slot_value"] or 1)
            fit_numerator += fit_signal * weight
            fit_denominator += weight
        fit_index = fit_numerator / fit_denominator if fit_denominator else 0.5
        fit_adjustment = 0.96 + 0.08 * fit_index
        league_adjusted_ratio = blended_ratio * fit_adjustment
        owner = users_by_id.get(str(rosters_by_id[roster_id].get("owner_id")))
        grade_rows.append(
            {
                "roster_id": roster_id,
                "team": team_label(owner, roster_id),
                "manager": (owner or {}).get("display_name", ""),
                "my_team": roster_id == my_roster_id,
                "picks_made": len(picks),
                "haul_value": round(actual),
                "expected_value_at_slots": round(expected),
                "market_value_capture": round(market_ratio, 3),
                "market_execution_grade": letter_grade(market_ratio),
                "expert_implied_haul_value": round(expert_actual),
                "expert_value_capture": round(expert_ratio, 3),
                "expert_consensus_grade": letter_grade(expert_ratio),
                "blended_value_capture": round(blended_ratio, 3),
                "roster_fit_index": round(fit_index, 3),
                "league_adjusted_capture": round(league_adjusted_ratio, 3),
                "execution_grade": letter_grade(league_adjusted_ratio),
                "average_market_rank_surplus": round(
                    statistics.mean(float(row["rank_surplus"]) for row in picks if row["rank_surplus"] != ""),
                    1,
                ),
                "average_expert_rank_surplus": round(
                    statistics.mean(
                        float(row["expert_rank_surplus"])
                        for row in picks
                        if row["expert_rank_surplus"] != ""
                    ),
                    1,
                ),
                "expert_steals": sum(row["expert_pick_label"] == "steal" for row in picks),
                "expert_reaches": sum("reach" in row["expert_pick_label"] for row in picks),
                "haul": ", ".join(f"{row['pick']} {row['player']}" for row in picks),
            }
        )
    grade_rows.sort(key=lambda row: (row["league_adjusted_capture"], row["haul_value"]), reverse=True)
    for index, row in enumerate(grade_rows, start=1):
        row["draft_grade_rank"] = index

    # CSV outputs.
    summary_fields = list(summary_rows[0].keys()) if summary_rows else []
    roster_fields = list(roster_rows[0].keys()) if roster_rows else []
    pick_fields = list(pick_rows[0].keys()) if pick_rows else []
    grade_fields = (["draft_grade_rank"] + [key for key in grade_rows[0] if key != "draft_grade_rank"]) if grade_rows else []
    write_csv(output_dir / "league_summary.csv", summary_rows, summary_fields)
    write_csv(output_dir / "rosters.csv", roster_rows, roster_fields)
    write_csv(output_dir / "draft_picks.csv", pick_rows, pick_fields)
    write_csv(output_dir / "draft_grades.csv", grade_rows, grade_fields)

    summary_by_roster = {int(row["roster_id"]): row for row in summary_rows}
    grades_by_roster = {int(row["roster_id"]): row for row in grade_rows}
    website_teams = []
    for roster_id in sorted(rosters_by_id):
        summary = summary_by_roster[roster_id]
        team_picks = picks_by_roster.get(roster_id, [])
        top_assets = sorted(team_players[roster_id], key=lambda p: value_for(p, "value"), reverse=True)[:5]
        website_teams.append(
            {
                "roster_id": roster_id,
                "team": summary["team"],
                "manager": summary["manager"],
                "is_alex": bool(summary["my_team"]),
                "roster_analysis": summary,
                "top_assets": [
                    {
                        "player_id": player["player_id"],
                        "name": player["name"],
                        "position": player["position"],
                        "nfl_team": player.get("team"),
                        "dynasty_value": round(value_for(player, "value")),
                    }
                    for player in top_assets
                ],
                "draft_grade": grades_by_roster.get(roster_id),
                "draft_picks": team_picks,
                "editorial": (editorial_snapshot.get("teams") or {}).get(str(roster_id), {}),
            }
        )
    league_settings = league.get("settings") or {}
    scoring = league.get("scoring_settings") or {}
    website_data = {
        "generated_at": generated_at.isoformat(),
        "provisional": len(draft_picks) < len(rosters) * draft_rounds,
        "league": {
            "league_id": league_id,
            "name": league.get("name"),
            "season": str(args.season),
            "status": league.get("status"),
            "teams": len(rosters),
            "format": "1QB dynasty, half-PPR, no TE premium",
            "starters": league.get("roster_positions") or [],
            "starting_skill_slots": {"QB": 1, "RB": 2, "WR": 2, "TE": 1, "FLEX": 3},
            "bench_slots": sum(position == "BN" for position in (league.get("roster_positions") or [])),
            "taxi_slots": league_settings.get("taxi_slots"),
            "taxi_years": league_settings.get("taxi_years"),
            "reserve_slots": league_settings.get("reserve_slots"),
            "faab_budget": league_settings.get("waiver_budget"),
            "playoff_teams": league_settings.get("playoff_teams"),
            "playoff_start_week": league_settings.get("playoff_week_start"),
            "trade_deadline_week": league_settings.get("trade_deadline"),
            "draft_rounds": draft_rounds,
            "scoring": {
                "reception": scoring.get("rec"),
                "passing_td": scoring.get("pass_td"),
                "passing_interception": scoring.get("pass_int"),
                "rushing_receiving_td": scoring.get("rush_td"),
                "team_defense": "enabled",
                "kicker": "enabled",
                "te_premium": False,
            },
        },
        "draft": {
            "draft_id": (current_draft or {}).get("draft_id"),
            "status": (current_draft or {}).get("status"),
            "picks_made": len(draft_picks),
            "total_picks": len(rosters) * draft_rounds,
            "on_the_clock_user_id": (league.get("metadata") or {}).get("on_the_clock_user_id"),
        },
        "methodology": {
            "expert_consensus_weight": 0.55,
            "live_market_weight": 0.45,
            "roster_fit_adjustment_range": [0.96, 1.04],
            "expert_consensus_method": "median available rank",
            "format_adjustments": {
                "quarterback": "devalued for 1QB and four-point passing touchdowns",
                "tight_end": "no TE-premium bonus",
                "running_back_and_wide_receiver": "elevated fit importance because the lineup starts three FLEX spots",
            },
        },
        "sources": {
            "sleeper": {"name": "Sleeper API", "url": "https://docs.sleeper.com/"},
            "fantasycalc": {
                "name": "FantasyCalc live dynasty market",
                "url": "https://fantasycalc.com/",
                "format": "12-team, 1QB, half-PPR",
            },
            **(expert_snapshot.get("sources") or {}),
        },
        "teams": website_teams,
    }
    website_path = output_dir / "website_data.json"
    website_path.write_text(json.dumps(website_data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # Human-readable report.
    my_summary = next((row for row in summary_rows if row["my_team"]), None)
    my_grade = next((row for row in grade_rows if row["my_team"]), None)
    draft_status = (current_draft or {}).get("status", "not found")
    total_draft_slots = int((current_draft or {}).get("settings", {}).get("teams") or len(rosters)) * int(
        (current_draft or {}).get("settings", {}).get("rounds") or draft_rounds
    )
    report: list[str] = [
        f"# {league.get('name')} — League Analysis and Draft Grades",
        "",
        f"Generated {generated_at.strftime('%Y-%m-%d %H:%M UTC')} from live Sleeper data. ",
        f"Draft status: **{draft_status}** ({len(draft_picks)} of {total_draft_slots} picks made).",
        "",
        "## Executive read",
        "",
    ]
    if my_summary:
        report.extend(
            [
                f"**{my_summary['team']}** ranks **#{my_summary['power_rank']} overall**, ",
                f"with the #{my_summary['dynasty_core_rank']} dynasty core, #{my_summary['redraft_lineup_rank']} 2026 lineup, ",
                f"and #{my_summary['depth_rank']} depth. The roster profile is **{my_summary['window']}**. ",
                f"Its strongest room is {my_summary['strongest_room']}; its weakest is {my_summary['weakest_room']}.",
                "",
            ]
        )
    if my_grade:
        report.extend(
            [
                f"The current rookie haul grades **{my_grade['execution_grade']}** after blending expert consensus, "
                f"live market value, and league-specific roster fit ({my_grade['league_adjusted_capture']:.1%} adjusted value capture), ",
                f"ranking #{my_grade['draft_grade_rank']} among teams that have selected a player. ",
                f"Haul: {my_grade['haul']}.",
                "",
            ]
        )

    if my_summary and my_roster_id is not None:
        my_assets = sorted(team_players[my_roster_id], key=lambda p: value_for(p, "value"), reverse=True)[:6]
        my_asset_text = ", ".join(player_display(player) for player in my_assets)
        report.extend(
            [
                "### What the ranking says about Alex’s roster",
                "",
                f"- **Foundation:** {my_asset_text}.",
                f"- **Room ranks after including the live draft haul:** QB #{my_summary['qb_room_rank']}, "
                f"RB #{my_summary['rb_room_rank']}, WR #{my_summary['wr_room_rank']}, and TE #{my_summary['te_room_rank']}.",
                f"- **Shape:** the roster is only #{my_summary['dynasty_core_rank']} in starting-core value, but #{my_summary['depth_rank']} in depth. "
                "That is a consolidation problem more than a lack-of-assets problem.",
                "- **Strategic read:** this is a retool, not an automatic teardown. The rookie class improved the bench and long-term options, "
                "but a top-four finish likely requires turning surplus depth or the second 1QB into one more weekly difference-maker—preferably at RB.",
                "",
            ]
        )

    report.extend(
        [
            "## League power table",
            "",
            "| Rk | Team | Window | Dynasty core | 2026 lineup | Depth | Best room | Weakest room |",
            "|---:|---|---|---:|---:|---:|---|---|",
        ]
    )
    for row in summary_rows:
        marker = " **(Alex)**" if row["my_team"] else ""
        report.append(
            f"| {row['power_rank']} | {row['team']}{marker} | {row['window']} | "
            f"#{row['dynasty_core_rank']} | #{row['redraft_lineup_rank']} | #{row['depth_rank']} | "
            f"{row['strongest_room']} | {row['weakest_room']} |"
        )

    report.extend(["", "### Team-by-team roster snapshots", ""])
    for row in summary_rows:
        roster_id = int(row["roster_id"])
        assets = sorted(team_players[roster_id], key=lambda p: value_for(p, "value"), reverse=True)[:3]
        asset_text = ", ".join(player_display(player) for player in assets)
        capital_note = (
            f"{row['2027_firsts']} first-rounder(s) and {row['future_picks_3yr']} total picks across 2027–29"
        )
        marker = " (Alex)" if row["my_team"] else ""
        report.extend(
            [
                f"- **#{row['power_rank']} {row['team']}{marker}:** {row['window']}. "
                f"Core: {asset_text}. Best room {row['strongest_room']}; weakest {row['weakest_room']}. "
                f"Future capital: {capital_note}.",
            ]
        )

    report.extend(
        [
            "",
            "## Rookie draft grades",
            "",
            "The grade blends multi-source expert consensus (55%) and live FantasyCalc market value (45%), then applies a small roster-fit adjustment for this league's 1QB, half-PPR, no-TE-premium, three-FLEX format. ",
            "Total haul value is kept separate, so extra draft capital does not automatically produce a better execution grade.",
            "",
            "| Rk | Team | Grade | Adjusted capture | Expert | Market | Fit | Expert surplus |",
            "|---:|---|:---:|---:|---:|---:|---:|---:|",
        ]
    )
    for row in grade_rows:
        marker = " **(Alex)**" if row["my_team"] else ""
        report.append(
            f"| {row['draft_grade_rank']} | {row['team']}{marker} | **{row['execution_grade']}** | "
            f"{row['league_adjusted_capture']:.1%} | {row['expert_value_capture']:.1%} | "
            f"{row['market_value_capture']:.1%} | {row['roster_fit_index']:.0%} | "
            f"{row['average_expert_rank_surplus']:+.1f} |"
        )

    if my_grade:
        report.extend(["", "### Terry Tate’s Pain Train: pick-by-pick", ""])
        report.extend(
            [
                "| Pick | Player | Expert rank | Market rank | Expert surplus | Expert read |",
                "|---:|---|---:|---:|---:|---|",
            ]
        )
        for row in picks_by_roster[my_roster_id]:
            report.append(
                f"| {row['pick']} | {row['player']} ({row['position']}-{row['nfl_team']}) | "
                f"#{float(row['expert_consensus_rank']):.1f} | #{row['market_rookie_rank']} | "
                f"{float(row['expert_rank_surplus']):+.1f} | {row['expert_pick_label']} |"
            )

    report.extend(
        [
            "",
            "## Methodology and limitations",
            "",
            "- Sleeper supplies league settings, managers, rosters, drafts, and picks through its public read-only API.",
            "- FantasyCalc supplies current 12-team, 1QB, half-PPR dynasty and redraft market values. It is a trade-market signal, not a projection model.",
            "- Dynasty-core and 2026-lineup ranks optimize the league's 1QB/2RB/2WR/1TE/3FLEX skill-position lineup. Kicker and team defense are excluded from market-value totals.",
            "- Expert consensus is the median of available ranks from FantasyPros ECR, RotoBaller, Justin Boone's 1QB trade-value order, and DraftSharks. FantasyCalc supplies a separate market signal.",
            "- Value capture compares each selected rookie with the value normally available at that exact pick number. A 1.10 selection is therefore compared with the current rookie No. 10, not with the 1.01.",
            "- Grades remain provisional while the draft is live. Values and grades will move as the market changes.",
            "",
            "## Sources",
            "",
            "- [Sleeper API documentation](https://docs.sleeper.com/) — league, roster, user, draft, pick, and player endpoints.",
            "- [FantasyCalc](https://fantasycalc.com/) and its [methodology FAQ](https://fantasycalc.com/frequently-asked-questions) — current market values derived from real trades.",
            "- [FantasyPros 2026 rookie ADP](https://www.fantasypros.com/nfl/adp/rookies.php) — daily multi-source consensus ADP used as an external reasonableness check.",
            "- [FantasyPros 2026 Dynasty Rookie ECR](https://www.fantasypros.com/nfl/rankings/dynasty-rookies-overall.php) — 1QB expert consensus.",
            "- [RotoBaller August rookie rankings](https://www.rotoballer.com/updated-fantasy-football-rookie-rankings-rb-wr-te-qb-2026/1903558) — independent staff board.",
            "- [Justin Boone's 2026 rookie trade values](https://sports.yahoo.com/fantasy/article/fantasy-football-dynasty-rankings-2026-trade-value-charts-justin-boone-rookies-162819768.html) — 1QB trade-value ordering.",
            "- [DraftSharks 2026 rookie rankings](https://www.draftsharks.com/dynasty-rankings/rookies) — projection-driven dynasty rankings.",
        ]
    )
    report_path = output_dir / "ape_invitational_report.md"
    report_path.write_text("\n".join(report) + "\n", encoding="utf-8")

    metadata = {
        "generated_at": generated_at.isoformat(),
        "username": args.username,
        "user_id": user_id,
        "league_id": league_id,
        "league_name": league.get("name"),
        "season": args.season,
        "my_roster_id": my_roster_id,
        "draft_id": (current_draft or {}).get("draft_id"),
        "draft_status": draft_status,
        "picks_made": len(draft_picks),
        "total_draft_slots": total_draft_slots,
    }
    (output_dir / "snapshot_metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return {
        "report": report_path,
        "summary": output_dir / "league_summary.csv",
        "rosters": output_dir / "rosters.csv",
        "draft_picks": output_dir / "draft_picks.csv",
        "draft_grades": output_dir / "draft_grades.csv",
        "website_data": website_path,
        "metadata": output_dir / "snapshot_metadata.json",
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--username", default="mannyrsox24", help="Sleeper username")
    parser.add_argument("--season", default="2026", help="Sleeper league season")
    parser.add_argument("--league-name", default="Ape Invitational Dynasty", help="Exact league name")
    parser.add_argument("--league-id", help="Optional explicit league ID override")
    parser.add_argument("--output-dir", default="output", help="Directory for report and CSV files")
    parser.add_argument("--cache-dir", default=".cache", help="Directory for API caches")
    parser.add_argument("--expert-rankings", default="expert_rankings_2026.json", help="Normalized expert ranking snapshot")
    parser.add_argument("--editorial", default="editorial_draft_grades_2026.json", help="Optional editorial team narratives")
    parser.add_argument("--refresh", action="store_true", help="Refresh all caches immediately")
    return parser.parse_args()


if __name__ == "__main__":
    paths = analyze(parse_args())
    for label, path in paths.items():
        print(f"{label}: {path.resolve()}")
