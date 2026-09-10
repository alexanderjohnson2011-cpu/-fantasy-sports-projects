"""Capture Johnny's Jerks league truth and its full Sleeper schedule.

Sleeper exposes fantasy pairings one week at a time. This adapter captures the
entire regular-season schedule, plus the current live scoring payload, so the
forecast and matchup screens can be regenerated from one repeatable command.
"""

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import urllib.request

from .johnnys_jerks_config import DRAFT_ID, LEAGUE_ID, SEASON


SLEEPER_BASE_URL = "https://api.sleeper.app/v1"
FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
FIXTURES_DIR.mkdir(parents=True, exist_ok=True)


def fetch_json(path):
    url = f"{SLEEPER_BASE_URL}/{path.lstrip('/')}"
    request = urllib.request.Request(url, headers={"User-Agent": "johnnys-jerks-pipeline/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8")), url


def write_json(path, payload):
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)


def pairings_from_rows(rows):
    grouped = {}
    for row in rows:
        grouped.setdefault(row.get("matchup_id"), []).append(row.get("roster_id"))
    return [
        {"matchupId": matchup_id, "rosterIds": sorted(roster_ids)}
        for matchup_id, roster_ids in sorted(grouped.items())
        if matchup_id is not None and len(roster_ids) == 2
    ]


def capture(start_week=1, end_week=None):
    captured_at = datetime.now(timezone.utc).isoformat()
    league, league_url = fetch_json(f"league/{LEAGUE_ID}")
    playoff_week_start = int((league.get("settings") or {}).get("playoff_week_start") or 15)
    last_regular_week = max(1, playoff_week_start - 1)
    end_week = min(int(end_week or last_regular_week), last_regular_week)
    start_week = max(1, int(start_week))

    print(f"Capturing {league.get('name') or LEAGUE_ID} through Sleeper Week {end_week}...")
    write_json(FIXTURES_DIR / f"league_{LEAGUE_ID}.json", league)

    draft, _ = fetch_json(f"draft/{DRAFT_ID}")
    picks, _ = fetch_json(f"draft/{DRAFT_ID}/picks")
    rosters, _ = fetch_json(f"league/{LEAGUE_ID}/rosters")
    users, _ = fetch_json(f"league/{LEAGUE_ID}/users")
    write_json(FIXTURES_DIR / f"draft_{DRAFT_ID}.json", draft)
    write_json(FIXTURES_DIR / f"draft_{DRAFT_ID}_picks.json", picks)
    write_json(FIXTURES_DIR / f"rosters_{LEAGUE_ID}.json", rosters)
    write_json(FIXTURES_DIR / f"users_{LEAGUE_ID}.json", users)

    weeks = []
    for week in range(start_week, end_week + 1):
        rows, matchup_url = fetch_json(f"league/{LEAGUE_ID}/matchups/{week}")
        write_json(FIXTURES_DIR / f"matchups_{LEAGUE_ID}_week_{week}.json", rows)
        pairings = pairings_from_rows(rows)
        weeks.append({
            "week": week,
            "sourceUrl": matchup_url,
            "pairings": pairings,
            "rosterCount": len(rows),
            "matchupCount": len(pairings),
            "nonZeroScoreCount": sum(1 for row in rows if float(row.get("points") or 0.0) > 0.0),
        })
        print(f"  Week {week:02d}: {len(pairings)} pairings, {len(rows)} rosters")

    schedule = {
        "schemaVersion": "1.0.0",
        "publicationId": "johnnys-jerks",
        "leagueId": LEAGUE_ID,
        "season": str(league.get("season") or SEASON),
        "capturedAt": captured_at,
        "source": {"provider": "Sleeper", "leagueUrl": league_url},
        "leagueStatus": league.get("status"),
        "currentWeek": int((league.get("settings") or {}).get("leg") or 1),
        "playoffWeekStart": playoff_week_start,
        "regularSeasonWeeks": last_regular_week,
        "weeks": weeks,
    }
    write_json(FIXTURES_DIR / f"sleeper_schedule_{LEAGUE_ID}_{schedule['season']}.json", schedule)
    print(f"Captured {len(weeks)} weeks and wrote the full schedule manifest.")
    return schedule


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--start-week", type=int, default=1)
    parser.add_argument("--end-week", type=int)
    args = parser.parse_args()
    capture(args.start_week, args.end_week)


if __name__ == "__main__":
    main()
