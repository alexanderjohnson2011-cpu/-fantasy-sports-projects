"""Block inconsistent analytics before a generated snapshot is committed."""
import argparse
import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from sleeper_work.publication_contract import canonical_power_rows, validate_final_week

ROOT = Path(__file__).resolve().parent.parent / "src" / "generated"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate_recap(recap, roster_ids):
    weeks = [w["week"] for w in recap["weeks"]]
    require(weeks == list(range(1, len(weeks) + 1)), "Final weeks must be unique, consecutive, and ordered")
    require(recap["availableWeeks"] == weeks, "Available recap weeks disagree with final results")
    require(recap["activeWeek"] == (weeks[-1] if weeks else 1), "Recap default is not the latest final week")
    totals = defaultdict(lambda: {"wins": 0, "losses": 0, "ties": 0, "pointsFor": 0., "pointsAgainst": 0.})
    for week in recap["weeks"]:
        validate_final_week(week, roster_ids, recap["league"]["season"])
        for match in week["matchups"]:
            a, b = match["teamA"], match["teamB"]
            for team, opponent in ((a, b), (b, a)):
                total = totals[team["rosterId"]]
                key = "wins" if team["points"] > opponent["points"] else "losses" if team["points"] < opponent["points"] else "ties"
                total[key] += 1
                total["pointsFor"] += team["points"]
                total["pointsAgainst"] += opponent["points"]
    standings = {row["rosterId"]: row for row in recap["standings"]}
    require(len(standings) == len(recap["standings"]) and set(standings) == set(totals), "Standings roster coverage is incomplete")
    for rid, total in totals.items():
        for key, value in total.items():
            require(abs(standings[rid][key] - value) < .011, f"Standings {rid}/{key} disagree with final recaps")
    return weeks


def validate_snapshot(power, recap, forecast, matchups, insights, fresh_since=None):
    roster_ids = {int(r) for r in insights["teams"]}
    rows = canonical_power_rows(power, roster_ids)
    require(power["league"] == {k: recap["league"][k] for k in ("leagueId", "season")}, "Power/recap league mismatch")
    weeks = validate_recap(recap, roster_ids)
    require(forecast.get("powerSnapshotAt") == power["generatedAtUtc"], "Forecast uses a different Power Index snapshot")
    require(forecast.get("recapSnapshotAt") == recap["generatedAtUtc"], "Forecast uses a different recap snapshot")
    require(forecast.get("rosterInsightsAt") == insights["generatedAt"], "Forecast uses different roster insights")
    require({int(r) for r in forecast["teams"]} == roster_ids, "Forecast roster coverage is incomplete")
    require(matchups["week"] == recap["league"]["currentWeek"], "Live matchups and NFL current week disagree")
    require(matchups.get("powerSnapshotAt") == power["generatedAtUtc"], "Matchups use a different Power Index snapshot")
    seen = []
    for match in matchups["matchups"]:
        for key in ("teamA", "teamB"):
            team = match[key]
            seen.append(team["rosterId"])
            require(team["powerRank"] == rows[team["rosterId"]]["rank"], "Matchup Power Rank disagrees with published index")
    require(set(seen) == roster_ids and len(seen) == len(roster_ids), "Matchup roster coverage is incomplete")
    for key, fc in forecast["teams"].items():
        row = rows[int(key)]
        require(fc["powerRank"] == row["rank"] and fc["powerScore"] == row["score"], "Forecast Power Rank/score disagrees with published index")
        require(fc["completedWeeks"] == weeks, "Forecast locked an unfinished or missing week")
        schedule = {entry["week"]: entry for entry in fc["weeklySchedule"]}
        require(len(schedule) == 14 and set(schedule) == set(range(1, 15)), "Forecast schedule is incomplete")
        require(sorted(w for w, entry in schedule.items() if entry["isCompleted"]) == weeks, "Schedule completion disagrees with verified recaps")
        for week in recap["weeks"]:
            match = next(m for m in week["matchups"] if int(key) in (m["teamA"]["rosterId"], m["teamB"]["rosterId"]))
            a, b = match["teamA"], match["teamB"]
            team, opp = (a, b) if a["rosterId"] == int(key) else (b, a)
            entry = schedule[week["week"]]
            result = "W" if team["points"] > opp["points"] else "L" if team["points"] < opp["points"] else "T"
            require(entry["actualScore"] == team["points"] and entry["opponentActualScore"] == opp["points"] and entry["result"] == result, "Forecast locked scores/results disagree with recap")
        for metric in ("championshipProbability", "playoffProbability", "byeProbability"):
            require(0 <= fc[metric] <= 100, "Invalid forecast probability")
        note = fc["fluctuationNarrative"]["historyNotes"][-1]
        require(note["expectedWins"] == fc["expectedWins"] and note["playoffOdds"] == fc["playoffProbability"], "Forecast narrative disagrees with current results")
    for metric, total in (("championshipProbability", 100), ("playoffProbability", 600), ("byeProbability", 200)):
        require(abs(sum(t[metric] for t in forecast["teams"].values()) - total) <= .61, "Forecast probabilities do not conserve bracket places")
    if fresh_since:
        start = datetime.fromisoformat(fresh_since.replace("Z", "+00:00"))
        for name, payload in (("power", power), ("recap", recap), ("forecast", forecast), ("matchups", matchups)):
            timestamp = payload.get("generatedAtUtc") or payload.get("generatedAt")
            require(datetime.fromisoformat(timestamp.replace("Z", "+00:00")) >= start, f"{name} was not refreshed in this run")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fresh-since", help="Require required payloads to have been generated in this refresh")
    args = parser.parse_args()
    def read(name):
        return json.loads((ROOT / f"{name}.json").read_text())
    validate_snapshot(read("power-rankings"), read("weekly-recap"), read("forecast-insights"), read("matchups-current"), read("league-insights"), args.fresh_since)
    johnny = json.loads((ROOT / "johnnys-jerks" / "weekly-recap.json").read_text())
    validate_recap(johnny, range(1, 13))
    print("Publication contract passed: shared rankings, verified final results, consistent standings and forecast.")


if __name__ == "__main__":
    main()
