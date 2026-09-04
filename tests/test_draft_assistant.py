from __future__ import annotations

import json
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path

from draft_assistant import board, db, offline
from draft_assistant.ai import fallback_commentary, fallback_player_take
from draft_assistant.db import snake_slot
from draft_assistant.scoring import score_stat_line
from sleeper_work.build_public_release import assert_private_fields_absent, build, sanitize


class SnakeDraftTests(unittest.TestCase):
    def test_snake_turn_corners(self):
        self.assertEqual([snake_slot(pick, 12) for pick in (1, 12, 13, 24, 25)], [1, 12, 12, 1, 1])

    def test_next_user_picks(self):
        self.assertEqual(board.next_user_picks(1, 12, 3, 3), [3, 22, 27])

    def test_yahoo_scoring_modifiers_are_applied(self):
        line = {"passing_yards": 4000, "passing_tds": 30, "passing_interceptions": 10}
        rules = [{"name": "Passing Yards", "value": 0.04}, {"name": "Passing Touchdowns", "value": 4}, {"name": "Interceptions", "value": -2}]
        self.assertEqual(score_stat_line(line, rules), 260.0)

    def test_wooglins_custom_scoring_categories_are_applied(self):
        line = {
            "return_yards": 333, "return_touchdowns": 1, "rushing_first_downs": 20,
            "field_goals_50_plus": 2, "defensive_sacks": 3, "three_and_outs_forced": 4,
        }
        rules = [
            {"name": "Return Yards", "value": 1 / 33.3}, {"name": "Return Touchdowns", "value": 6},
            {"name": "Rushing 1st Downs", "value": 0.5}, {"name": "Field Goals 50+ Yards", "value": 5},
            {"name": "Sack", "value": 2}, {"name": "Three and Outs Forced", "value": 0.5},
        ]
        self.assertAlmostEqual(score_stat_line(line, rules), 44.0, places=3)


class RecommendationTests(unittest.TestCase):
    def setUp(self):
        self.original_settings = board.settings
        board.settings = replace(board.settings, simulations=500)

    def tearDown(self):
        board.settings = self.original_settings

    def test_recommendations_are_deterministic_and_exclude_drafted(self):
        session = {"strategy": "balanced", "num_teams": 12, "user_slot": 3}
        first = board.recommend(session, [])
        drafted = first["recommendations"][0]
        event = {"pick_no": 1, "player_id": drafted["playerId"], "position": drafted["position"], "team_slot": 1}
        second = board.recommend(session, [event])
        third = board.recommend(session, [event])
        self.assertNotIn(drafted["playerId"], {item["playerId"] for item in second["available"]})
        self.assertEqual(second["recommendations"], third["recommendations"])

    def test_survival_never_increases_at_later_picks(self):
        result = board.recommend({"strategy": "balanced", "num_teams": 12, "user_slot": 3}, [])
        for player in result["recommendations"]:
            values = [item["probability"] for item in player["survival"]]
            self.assertEqual(values, sorted(values, reverse=True))

    def test_commentary_only_uses_recommendation_values(self):
        player = board.recommend({"strategy": "balanced", "num_teams": 12, "user_slot": 3}, [])["recommendations"][0]
        copy = fallback_commentary(player)
        self.assertIn(player["name"], copy)
        self.assertIn(str(player["vorp"]), copy)

    def test_player_take_has_recommendation_upside_and_risk_without_unsupplied_facts(self):
        player = board.recommend({"strategy": "balanced", "num_teams": 12, "user_slot": 3}, [])["recommendations"][0]
        take = fallback_player_take(player)
        self.assertIn("Recommendation:", take)
        self.assertIn("Upside:", take)
        self.assertIn("Risk:", take)

    def test_sleeper_radar_explains_market_signals_without_claiming_depth_chart_facts(self):
        player = {"name": "Example Sleeper", "position": "WR", "team": "EX", "adp": 115.0, "marketRank": 70, "trend30Day": 250.0, "marketValue": 3500.0, "newsRisk": "clear", "news": "No active injury flag"}
        radar = board.sleeper_radar([player], 1)
        self.assertEqual(radar[0]["name"], "Example Sleeper")
        self.assertIn("price gap", " ".join(radar[0]["qualitative"]["reasons"]))
        self.assertIn("Not asserted", radar[0]["qualitative"]["teamSituation"])
        copy = fallback_commentary(None, "Who are the sleepers?", radar)
        self.assertIn("Example Sleeper", copy)

    def test_player_dossier_has_positive_case_cautions_and_source_boundary(self):
        player = board.recommend({"strategy": "balanced", "num_teams": 12, "user_slot": 3}, [])["recommendations"][0]
        dossier = board.player_dossier(player)
        self.assertEqual(dossier["player"]["playerId"], player["playerId"])
        self.assertTrue(dossier["positiveCase"])
        self.assertTrue(dossier["cautions"])
        self.assertTrue(dossier["marketSynthesis"])
        self.assertTrue(dossier["commentaryCoverage"])
        self.assertIn("does not reproduce article text", dossier["sourceBoundary"])

    def test_top_player_crosswalk_has_durable_identity(self):
        players = board.load_board()
        self.assertTrue(all(player.get("gsisId") for player in players[:100]))
        self.assertGreaterEqual(sum(bool(player.get("gsisId")) for player in players[:200]) / min(200, len(players)), 0.99)


class SourceHealthTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.original_settings = db.settings
        db.settings = replace(db.settings, database_path=Path(self.temp.name) / "draft.sqlite3")
        db.initialize()

    def tearDown(self):
        db.settings = self.original_settings
        self.temp.cleanup()

    def test_failed_refresh_keeps_last_successful_snapshot_visible_as_stale(self):
        db.save_snapshot({
            "snapshotId": "fresh", "publicationId": "mooseys-mommy", "provider": "sample",
            "fetchedAt": "2026-09-03T10:00:00+00:00", "checksum": "abc", "publicAllowed": True,
            "status": "fresh", "detail": "10 records", "localPath": "saved.json.gz",
        })
        db.save_snapshot({
            "snapshotId": "failed", "publicationId": "mooseys-mommy", "provider": "sample",
            "fetchedAt": "2026-09-03T10:05:00+00:00", "checksum": "", "publicAllowed": True,
            "status": "degraded", "detail": "network unavailable", "localPath": None,
        })
        source = db.latest_snapshots("mooseys-mommy")[0]
        self.assertEqual(source["status"], "stale")
        self.assertEqual(source["fetched_at"], "2026-09-03T10:00:00+00:00")
        self.assertIn("network unavailable", source["detail"])

    def test_rehearsal_events_can_be_cleared_without_touching_real_picks(self):
        rehearsal_player = {"playerId": "rehearsal-1", "name": "Rehearsal Player", "position": "QB"}
        db.add_event("tonight", rehearsal_player, 1, "rehearsal", 1)
        self.assertEqual(db.clear_events_by_source("tonight", "rehearsal"), 1)
        self.assertEqual(db.list_events("tonight"), [])


class PublicReleaseTests(unittest.TestCase):
    def test_sanitizer_removes_private_and_restricted_data(self):
        source = {
            "teams": [{"teamName": "Dial Tones", "managerName": "Private Person", "yahooId": "123"}],
            "sources": [{"provider": "fantasypros-private", "publicAllowed": False}, {"provider": "nflverse", "publicAllowed": True}],
            "news": [{"headline": "Update", "sourceUrl": "https://example.com", "body": "not allowed"}],
        }
        cleaned = sanitize(source)
        assert_private_fields_absent(cleaned)
        self.assertEqual(cleaned["teams"], [{"teamName": "Dial Tones"}])
        self.assertEqual([item["provider"] for item in cleaned["sources"]], ["nflverse"])
        self.assertNotIn("body", cleaned["news"][0])

    def test_release_has_checksum_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            input_path = base / "input.json"
            input_path.write_text(json.dumps({"teams": [{"teamName": "Dial Tones"}]}), encoding="utf-8")
            release, manifest = build("mooseys-mommy", input_path, base / "out")
            self.assertTrue(release.exists())
            self.assertEqual(json.loads(manifest.read_text())["publicationId"], "mooseys-mommy")


class ChatGPTPacketTests(unittest.TestCase):
    def test_packet_is_upload_ready_and_excludes_credentials_and_platform_ids(self):
        with tempfile.TemporaryDirectory() as tmp:
            original_data_dir = offline.DATA_DIR
            offline.DATA_DIR = Path(tmp)
            try:
                player = {"name": "Example Player", "position": "WR", "team": "EX", "tier": 1, "projectedPoints": 200, "vorp": 40, "utility": 60, "incrementalValue": 3, "adp": 8, "samePositionDropoff": 5, "survival": [], "newsRisk": "clear", "news": "No alert", "sourceLabel": "Internal"}
                result = offline.export_chatgpt_packet({
                    "session": {"league_name": "Moosey's Mommy", "league_key": "nfl.l.123", "user_team_key": "nfl.l.123.t.1", "num_teams": 12, "rounds": 16, "user_slot": 1, "scoring_format": "half-ppr", "strategy": "balanced", "sync_mode": "manual", "refresh_token": "never-export"},
                    "events": [{"pick_no": 1, "round_no": 1, "team_slot": 1, "player_name": "Example Player", "position": "WR", "source": "manual"}],
                    "draft": {"currentPick": 2, "currentRound": 1, "onClockSlot": 2, "nextUserPicks": [24], "simulations": 2000, "projectionLabel": "Internal", "rosterCounts": {"WR": 1}, "recommendations": [player], "available": [player]},
                    "sources": [{"provider": "example", "status": "fresh", "local_path": "C:/private", "detail": "ok"}],
                    "news": [],
                })
                payload = Path(result["jsonPath"]).read_text(encoding="utf-8")
                self.assertIn("Example Player", payload)
                self.assertNotIn("never-export", payload)
                self.assertNotIn("nfl.l.123", payload)
                self.assertNotIn("C:/private", payload)
                self.assertTrue(Path(result["markdownPath"]).exists())
            finally:
                offline.DATA_DIR = original_data_dir


if __name__ == "__main__":
    unittest.main()
