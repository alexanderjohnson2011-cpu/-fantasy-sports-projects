"""Compare published final recaps with fresh Sleeper matchup and NFL stat feeds."""
import argparse
import json
from pathlib import Path

from sleeper_work.build_weekly_recap import (
    fetch_sleeper_json, format_player_box_stat, load_players_map, optimal_lineup,
)

ROOT = Path(__file__).resolve().parent.parent / "src" / "generated"
LEAGUES = {
    "Ape's Mac Salad": ("1312209616372772864", ROOT / "weekly-recap.json"),
    "Johnny's Jerks": ("1401673232670539776", ROOT / "johnnys-jerks" / "weekly-recap.json"),
}


def close(actual, expected, label, errors, tolerance=.011):
    if abs(float(actual) - float(expected)) > tolerance:
        errors.append(f"{label}: published {actual}, Sleeper {expected}")


def audit_league(label, league_id, path, week, players, stats):
    payload = json.loads(path.read_text())
    final = next((w for w in payload["weeks"] if w["week"] == week), None)
    if not final or final["status"] != "final":
        return [f"{label}: Week {week} missing or not final"]
    live = fetch_sleeper_json(f"league/{league_id}/matchups/{week}")
    league = fetch_sleeper_json(f"league/{league_id}")
    slots = {position: league.get("roster_positions", []).count(position)
             for position in ("QB", "RB", "WR", "TE", "FLEX", "K", "DEF")}
    unsupported = set(league.get("roster_positions", [])) - set(slots) - {"BN", "IR", "TAXI"}
    if unsupported:
        return [f"{label}: unsupported Sleeper roster slots {sorted(unsupported)}"]
    live_by_id = {int(r["roster_id"]): r for r in live}
    errors = []
    seen = set()
    if len(live_by_id) != len(live) or len(live) != 12:
        errors.append(f"{label}: Sleeper roster coverage incomplete ({len(live_by_id)})")
    for match in final["matchups"]:
        mid = int(match["matchupId"])
        teams = (match["teamA"], match["teamB"])
        roster_ids = {int(t["rosterId"]) for t in teams}
        if len(roster_ids) != 2:
            errors.append(f"{label} matchup {mid}: duplicate roster")
            continue
        if any(rid not in live_by_id for rid in roster_ids):
            errors.append(f"{label} matchup {mid}: missing live roster")
            continue
        seen.update(roster_ids)
        for team in teams:
            rid = int(team["rosterId"])
            raw = live_by_id[rid]
            prefix = f"{label} W{week} matchup {mid} roster {rid} ({team['teamName']})"
            if int(raw["matchup_id"]) != mid:
                errors.append(f"{prefix}: Sleeper matchup ID {raw['matchup_id']}")
            close(team["points"], raw["points"], prefix + " score", errors)
            source_starters = [str(p) for p in raw.get("starters") or []]
            published_starters = [str(p["playerId"]) for p in team["starters"]]
            if source_starters != published_starters:
                errors.append(f"{prefix}: starter IDs/order differ from Sleeper")
            source_points = {str(k): float(v or 0) for k, v in (raw.get("players_points") or {}).items()}
            starter_points = raw.get("starters_points") or []
            for idx, player in enumerate(team["starters"]):
                pid = str(player["playerId"])
                if idx < len(starter_points):
                    close(player["points"], starter_points[idx], prefix + f" starter {pid}", errors)
                if pid in source_points:
                    close(player["points"], source_points[pid], prefix + f" player {pid}", errors)
                p_stat = stats.get(pid, {})
                expected = format_player_box_stat(pid, player["name"], player["position"], player["points"], stats, players.get(pid, {}))
                if player["boxSummary"] != expected["box_summary"]:
                    errors.append(f"{prefix}: box line for {player['name']} differs from Sleeper stats")
                for field, source in (("passYds", "pass_yd"), ("rushYds", "rush_yd"), ("recYds", "rec_yd"),
                                      ("passTds", "pass_td"), ("rushTds", "rush_td"), ("recTds", "rec_td")):
                    close(player["stats"][field], p_stat.get(source) or 0, prefix + f" {player['name']} {field}", errors)
            bench = sum(pts for pid, pts in source_points.items() if pid not in source_starters)
            close(team["benchPoints"], bench, prefix + " bench", errors)
            optimal, _ = optimal_lineup(source_points, players, slots)
            close(team["optimalPoints"], max(optimal, float(raw["points"])), prefix + " optimal", errors)
            close(team["lineupEfficiency"], round(float(raw["points"]) / optimal * 100, 1) if optimal else 100,
                  prefix + " efficiency", errors, tolerance=.11)
        a, b = teams
        expected_winner = a if a["points"] > b["points"] else b if b["points"] > a["points"] else None
        if match["winnerRosterId"] != (expected_winner["rosterId"] if expected_winner else None):
            errors.append(f"{label} matchup {mid}: winner differs from Sleeper score")
        close(match["margin"], abs(float(a["points"]) - float(b["points"])), f"{label} matchup {mid} margin", errors)
        if expected_winner and match.get("deepDive"):
            star = max(expected_winner["starters"], key=lambda p: p["points"])
            story = " ".join(match["deepDive"]["story"])
            if f"{expected_winner['teamName']}'s shining star was {star['name']}" not in story:
                errors.append(f"{label} matchup {mid}: winner star attribution differs from starter scores")
    if seen != set(live_by_id):
        errors.append(f"{label}: published matchup roster coverage differs from live Sleeper")
    # Callout inputs and award winners use the exact published scores, margin,
    # optimal-point gaps, and efficiencies checked above.
    print(f"{label}: {len(final['matchups'])} matchups, {len(seen)} rosters, {sum(len(t['starters']) for m in final['matchups'] for t in (m['teamA'], m['teamB']))} starter lines audited; {len(errors)} discrepancies")
    return errors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--week", type=int, help="Final week to audit (defaults to the latest published week)")
    args = parser.parse_args()
    week = args.week or json.loads((ROOT / "weekly-recap.json").read_text())["activeWeek"]
    players = load_players_map()
    if not players:
        raise RuntimeError("Player metadata unavailable; cannot verify optimal lineups")
    stats = fetch_sleeper_json(f"stats/nfl/regular/2026/{week}")
    if not isinstance(stats, dict) or not stats:
        raise RuntimeError("Sleeper NFL stat feed unavailable; cannot verify box lines")
    errors = []
    for label, (league_id, path) in LEAGUES.items():
        errors.extend(audit_league(label, league_id, path, week, players, stats))
    for error in errors:
        print("DISCREPANCY:", error)
    if errors:
        raise SystemExit(f"Live recap audit failed: {len(errors)} discrepancies")
    print(f"Live Sleeper audit passed for both Week {week} recap payloads.")


if __name__ == "__main__":
    main()
