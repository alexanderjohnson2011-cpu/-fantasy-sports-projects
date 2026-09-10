import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sleeper_work.build_redraft_recap_payload import (
    load_nfl_schedule,
    load_universe,
)
from sleeper_work.johnnys_jerks_config import (
    LEAGUE_ID,
    DRAFT_ID,
    SEASON,
    ROUNDS,
    TEAMS,
)

FIXTURES_DIR = ROOT / "sleeper_work" / "fixtures"
GENERATED_DIR = ROOT / "src" / "generated" / "johnnys-jerks"


class TestJohnnysPipeline(unittest.TestCase):
    """Data contract and pipeline verification tests for Johnny's Jerks."""

    def test_fixtures_contract(self):
        """Verify the full 14-week regular season schedule fixtures."""
        schedule_file = FIXTURES_DIR / f"sleeper_schedule_{LEAGUE_ID}_{SEASON}.json"
        self.assertTrue(schedule_file.exists(), f"Schedule fixture missing: {schedule_file}")

        with open(schedule_file, "r", encoding="utf-8") as f:
            schedule = json.load(f)

        weeks = schedule.get("weeks", [])
        self.assertEqual(len(weeks), 14, f"Expected 14 weeks, found {len(weeks)}")

        all_roster_ids = set()
        for week_data in weeks:
            week_num = week_data.get("week")
            pairings = week_data.get("pairings", [])
            self.assertEqual(len(pairings), 6, f"Week {week_num} must have exactly 6 pairings")

            week_rosters = []
            for p in pairings:
                r_ids = p.get("rosterIds", [])
                self.assertEqual(len(r_ids), 2, f"Pairing in week {week_num} must have 2 rosters")
                week_rosters.extend(r_ids)

            self.assertEqual(len(week_rosters), TEAMS, f"Week {week_num} must have {TEAMS} rosters")
            self.assertEqual(len(set(week_rosters)), TEAMS, f"Week {week_num} rosters must be unique")
            all_roster_ids.update(week_rosters)

        self.assertEqual(len(all_roster_ids), TEAMS)

    def test_draft_picks_contract(self):
        """Verify draft picks fixture contains 192 total picks across 16 rounds."""
        picks_file = FIXTURES_DIR / f"draft_{DRAFT_ID}_picks.json"
        self.assertTrue(picks_file.exists(), f"Draft picks fixture missing: {picks_file}")

        with open(picks_file, "r", encoding="utf-8") as f:
            picks = json.load(f)

        expected_picks = TEAMS * ROUNDS  # 12 * 16 = 192
        self.assertEqual(len(picks), expected_picks, f"Expected {expected_picks} picks, got {len(picks)}")

    def test_tv_schedule_contract_and_fallback(self):
        """Verify Week 1 has valid TV broadcast data and missing weeks fall back cleanly."""
        w1_schedule = load_nfl_schedule(1)
        self.assertGreater(len(w1_schedule.get("games", [])), 0, "Week 1 must have games")
        first_game = w1_schedule["games"][0]
        self.assertIn("network", first_game)
        self.assertIn("timeLabel", first_game)

        # Future weeks without a fixture return empty games cleanly without throwing
        w99_schedule = load_nfl_schedule(99)
        self.assertEqual(w99_schedule.get("games", []), [])
        self.assertEqual(w99_schedule.get("week"), 99)

    def test_generated_artifacts_integrity(self):
        """Verify all 4 Johnny's Jerks output payloads exist and adhere to schemas."""
        draft_recap_file = GENERATED_DIR / "draft-recap.json"
        power_rankings_file = GENERATED_DIR / "power-rankings.json"
        matchups_file = GENERATED_DIR / "matchups-current.json"
        forecast_file = GENERATED_DIR / "forecast-insights.json"

        for p, name in [
            (draft_recap_file, "draft-recap.json"),
            (power_rankings_file, "power-rankings.json"),
            (matchups_file, "matchups-current.json"),
            (forecast_file, "forecast-insights.json"),
        ]:
            self.assertTrue(p.exists(), f"Generated artifact {name} does not exist at {p}")

        # Check Draft Recap
        with open(draft_recap_file, "r", encoding="utf-8") as f:
            recap = json.load(f)
        self.assertEqual(recap.get("leagueId"), LEAGUE_ID)
        self.assertEqual(len(recap.get("teams", [])), TEAMS)
        for t in recap["teams"]:
            self.assertIn("pillars", t)
            self.assertIn("capitalEfficiency", t["pillars"])
            self.assertIn("positionalBalance", t["pillars"])
            self.assertIn("starPower", t["pillars"])
            self.assertTrue("cycleGrade" in t or "letterGrade" in t)

        # Check Power Rankings
        # Check Power Rankings
        with open(power_rankings_file, "r", encoding="utf-8") as f:
            power = json.load(f)
        self.assertEqual(len(power.get("rankings", [])), TEAMS)
        ranks = [t["rank"] for t in power["rankings"]]
        self.assertEqual(sorted(ranks), list(range(1, TEAMS + 1)))
        for r in power["rankings"]:
            self.assertIn("projectedWins", r)
            self.assertIn("winDelta", r)
            self.assertIn("preSeasonWins", r)

        # Check Matchups
        with open(matchups_file, "r", encoding="utf-8") as f:
            matchups = json.load(f)
        self.assertEqual(matchups.get("season"), SEASON)
        self.assertEqual(len(matchups.get("matchups", [])), 6)
        for m in matchups["matchups"]:
            self.assertIn("team1", m)
            self.assertIn("team2", m)
            self.assertIn("tvSchedule", m)

        # Check Forecast & Trajectory Timeline
        with open(forecast_file, "r", encoding="utf-8") as f:
            fc = json.load(f)
        self.assertIn(fc.get("modelVersion"), ("johnnys-forecast-v3", "johnnys-forecast-v4"))
        self.assertEqual(fc.get("simulationsCount"), 10000)
        self.assertEqual(len(fc.get("teams", [])), TEAMS)
        self.assertIn("trendTimeline", fc)
        self.assertGreaterEqual(len(fc["trendTimeline"].get("milestones", [])), 3)
        self.assertIn("biggestRiser", fc["trendTimeline"])
        self.assertIn("biggestFaller", fc["trendTimeline"])
        for t in fc["teams"]:
            total_games = t["expectedWins"] + t["expectedLosses"]
            self.assertAlmostEqual(total_games, 14.0, delta=0.01)
            self.assertIn("trajectory", t)
            self.assertIn("winDelta", t)
            self.assertIn("preSeasonExpectedWins", t)


if __name__ == "__main__":
    unittest.main()

