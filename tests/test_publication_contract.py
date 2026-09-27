import copy
import json
import tempfile
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch
from sleeper_work.publication_contract import completion_from_scoreboard, validate_final_week, winner_id
from sleeper_work.validate_publication import validate_snapshot
from sleeper_work import build_weekly_recap as builder

ROOT = Path(__file__).resolve().parent.parent / 'src/generated'


def scoreboard(final=True):
    return {'season': {'type': 2, 'year': 2026}, 'week': {'number': 1}, 'events': [
        {'id': 'one', 'season': {'year': 2026, 'type': 2}, 'week': {'number': 1},
         'competitions': [{'competitors': [{'team': {'abbreviation': 'ATL'}}, {'team': {'abbreviation': 'GB'}}]}],
         'status': {'type': {'name': 'STATUS_FINAL' if final else 'STATUS_SCHEDULED', 'state': 'post' if final else 'pre', 'completed': final}}}]}


def evidence(final=True):
    return completion_from_scoreboard(scoreboard(final), {'season': 2026, 'week': 1, 'games': [{'away': 'ATL', 'home': 'GB'}]}, '2026', 1)


class CompletionTests(unittest.TestCase):
    def test_all_games_must_be_explicitly_final(self):
        self.assertEqual(evidence()['status'], 'final')
        self.assertEqual(evidence(False)['status'], 'in_progress')

    def test_missing_postponed_and_wrong_week_fail_closed(self):
        fixture = {'season': 2026, 'week': 1, 'games': [{'away': 'ATL', 'home': 'GB'}]}
        for mutate in (lambda b: b.update(events=[]), lambda b: b.update(week={'number': 2}), lambda b: b['events'].append(copy.deepcopy(b['events'][0]))):
            board = scoreboard(); mutate(board)
            with self.assertRaises(ValueError): completion_from_scoreboard(board, fixture, 2026, 1)
        board = scoreboard(); board['events'][0]['status']['type']['name'] = 'STATUS_POSTPONED'
        self.assertEqual(completion_from_scoreboard(board, fixture, 2026, 1)['status'], 'in_progress')

    def test_thursday_partial_slate_cannot_finalize_week(self):
        fixture = {'season': 2026, 'week': 1, 'games': [{'away': 'ATL', 'home': 'GB'}, {'away': 'PHI', 'home': 'CHI'}]}
        board = scoreboard(); later = copy.deepcopy(scoreboard(False)['events'][0]); later['id'] = 'two'
        later['competitions'][0]['competitors'] = [{'team': {'abbreviation': 'PHI'}}, {'team': {'abbreviation': 'CHI'}}]
        board['events'].append(later)
        self.assertEqual(completion_from_scoreboard(board, fixture, 2026, 1)['status'], 'in_progress')

    def test_zero_zero_has_no_winner(self):
        self.assertIsNone(winner_id({'rosterId': 1, 'points': 0}, {'rosterId': 2, 'points': 0}))

    def generate(self, final, points=(0, 0)):
        with tempfile.TemporaryDirectory() as tmp, ExitStack() as stack:
            stack.enter_context(patch.dict('os.environ', {'GEMINI_API_KEY': '', 'GOOGLE_API_KEY': ''}))
            for name, value in {'load_players_map': {}, 'fetch_league_metadata': {1: {'teamName': 'A', 'manager': 'a'}, 2: {'teamName': 'B', 'manager': 'b'}}, 'fetch_week_completion': evidence(final), 'fetch_nfl_stats': {}, 'fetch_nfl_projections': {}, 'load_nfl_window_map': {}, 'fetch_next_week_pairings': {}, 'generate_matchup_commentary': 'placeholder', 'generate_yahoo_deep_dive_story': {'headline': 'placeholder', 'story': 'placeholder'}}.items():
                stack.enter_context(patch.object(builder, name, return_value=value))
            stack.enter_context(patch.object(builder, 'HERE', tmp))
            stack.enter_context(patch.object(builder, 'OUT', str(Path(tmp) / 'weekly-recap.json')))
            rows = [{'roster_id': i, 'matchup_id': 1, 'points': point, 'starters': []} for i, point in zip((1, 2), points)]
            fetch = stack.enter_context(patch.object(builder, 'fetch_sleeper_json', side_effect=lambda path: {'season': '2026', 'week': 1} if path == 'state/nfl' else rows))
            result = builder.build_weekly_recap_payload()
            return result, fetch.call_count

    def test_generator_does_not_fetch_scores_or_publish_recap_for_live_week(self):
        result, calls = self.generate(False, points=(30, 0))
        self.assertEqual(calls, 1)
        self.assertEqual(result['weeks'], [])
        self.assertEqual(result['standings'], [])

    def test_final_tie_has_no_winner_story_or_winner_award(self):
        result, _ = self.generate(True)
        week = result['weeks'][0]; card = week['matchups'][0]
        self.assertIsNone(card['winnerRosterId'])
        self.assertIn('Tie', card['title'])
        self.assertIsNone(card['deepDive'])
        self.assertTrue(all(r['ties'] == 1 and r['wins'] == 0 for r in result['standings']))
        self.assertIsNone(week['superlatives']['managerOfTheWeek'])
        validate_final_week(week, [1, 2], '2026')

    def test_recap_headline_scores_follow_named_winner(self):
        result, _ = self.generate(True, points=(99.7, 123.34))
        card = result['weeks'][0]['matchups'][0]
        self.assertEqual(card['winnerRosterId'], 2)
        self.assertEqual(card['title'], 'B Defeats A (123.3 – 99.7)')


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.inputs = [json.loads((ROOT / (name + '.json')).read_text()) for name in ('power-rankings', 'weekly-recap', 'forecast-insights', 'matchups-current', 'league-insights')]

    def test_checked_in_snapshot_is_consistent(self):
        validate_snapshot(*self.inputs)

    def test_stale_required_payload_blocks_scheduled_publication(self):
        with self.assertRaisesRegex(ValueError, 'not refreshed'):
            validate_snapshot(*self.inputs, fresh_since='2099-01-01T00:00:00+00:00')

    def test_conflicting_rank_score_and_snapshot_are_rejected(self):
        for key, value in [('powerRank', 99), ('powerScore', 99), ('completedWeeks', [1, 2, 3])]:
            data = copy.deepcopy(self.inputs); data[2]['teams']['1'][key] = value
            with self.assertRaises(ValueError): validate_snapshot(*data)
        data = copy.deepcopy(self.inputs); data[2]['powerSnapshotAt'] = 'old'
        with self.assertRaises(ValueError): validate_snapshot(*data)

    def test_partial_or_unverified_recap_is_rejected(self):
        for mutate in (lambda w: w.pop('completion'), lambda w: w.update(status='live'), lambda w: w['matchups'].pop(), lambda w: w['matchups'][0].update(winnerRosterId=999)):
            data = copy.deepcopy(self.inputs); mutate(data[1]['weeks'][0])
            with self.assertRaises(ValueError): validate_snapshot(*data)

    def test_standings_and_forecast_must_match_final_scores(self):
        data = copy.deepcopy(self.inputs); data[1]['standings'][0]['wins'] += 1
        with self.assertRaises(ValueError): validate_snapshot(*data)
        data = copy.deepcopy(self.inputs); data[2]['teams']['1']['weeklySchedule'][0]['actualScore'] += 1
        with self.assertRaises(ValueError): validate_snapshot(*data)


if __name__ == '__main__': unittest.main()
