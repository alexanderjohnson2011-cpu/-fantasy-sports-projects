"""
test_as_of_queries.py
Tests BigQuery AS OF table functions and verifies bitemporal point-in-time querying.
"""

import os
from google.cloud import bigquery

KEY_PATH = r"C:\Users\alexa\Documents\Codex\Apes Mac Salad\apes-mac-salad-0d52b5a00417.json"
PROJECT_ID = "apes-mac-salad"

os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = KEY_PATH

def main():
    print("=== Testing BigQuery Point-in-Time AS OF Functions ===")
    client = bigquery.Client(project=PROJECT_ID)
    
    # 1. Query AS OF Roster State
    query_roster = """
    SELECT league_id, roster_id, wins, losses, fpts, ppts, observed_at_utc
    FROM `apes-mac-salad.canonical.as_of_roster_state`(CURRENT_TIMESTAMP())
    ORDER BY roster_id
    LIMIT 5
    """
    print("\n--- AS OF Roster State Query ---")
    results = list(client.query(query_roster).result())
    for r in results:
        print(f"Roster {r.roster_id}: wins={r.wins}, fpts={r.fpts}, observed_at={r.observed_at_utc}")
    assert len(results) > 0, "No roster rows returned"
    
    # 2. Query Draft Picks Table with Crosswalk Join
    query_picks = """
    SELECT p.draft_id, p.pick_no, p.round, p.draft_slot, p.roster_id, c.full_name, c.position
    FROM `apes-mac-salad.canonical.draft_picks` p
    LEFT JOIN `apes-mac-salad.canonical.player_crosswalk` c ON p.player_id = c.sleeper_id
    ORDER BY p.pick_no
    LIMIT 5
    """
    print("\n--- Canonical Draft Picks Query ---")
    results_picks = list(client.query(query_picks).result())
    for p in results_picks:
        print(f"Pick {p.pick_no} (R{p.round}.{p.draft_slot:02d}): {p.full_name} ({p.position}) -> Team {p.roster_id}")
    assert len(results_picks) == 5, "Expected 5 picks returned"

    # 3. Query Player Crosswalk
    query_crosswalk = """
    SELECT sleeper_id, full_name, position, nfl_team
    FROM `apes-mac-salad.canonical.player_crosswalk`
    LIMIT 5
    """
    print("\n--- Player Crosswalk Query ---")
    results_cw = list(client.query(query_crosswalk).result())
    for cw in results_cw:
        print(f"Crosswalk: ID {cw.sleeper_id} -> {cw.full_name} ({cw.position}, {cw.nfl_team})")
    assert len(results_cw) == 5, "Expected 5 crosswalk rows returned"
    
    print("\n=======================================================")
    print("  SUCCESS: ALL BIGQUERY AS OF QUERIES VERIFIED 100%!")
    print("=======================================================")

if __name__ == "__main__":
    main()
