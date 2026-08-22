"""
capture_missing_fixtures.py
Fetches and saves Sleeper fixtures for P0-9:
- Completed 48-pick draft board (draft 1312209616385343488)
- Traded picks for draft 1312209616385343488
- Transactions rounds 1..18 for current league (1312209616372772864)
- Transactions rounds 1..18 for prior league (1187879775490527232)
- Traded picks for both leagues
Updates sleeper_work/raw/picks.json and saves complete fixtures into sleeper_work/fixtures/
"""

import os
import json
import urllib.request
import time

SLEEPER_BASE_URL = "https://api.sleeper.app/v1"
FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")
RAW_DIR = os.path.join(os.path.dirname(__file__), "raw")

os.makedirs(FIXTURES_DIR, exist_ok=True)
os.makedirs(RAW_DIR, exist_ok=True)

def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "ApesMacSalad/1.0"})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

def main():
    print("=== P0-9: Capturing Missing Fixtures ===")
    
    # 1. Draft picks
    draft_id = "1312209616385343488"
    picks_url = f"{SLEEPER_BASE_URL}/draft/{draft_id}/picks"
    print(f"Fetching draft picks from {picks_url}...")
    picks = fetch_json(picks_url)
    print(f"Captured {len(picks)} picks.")
    assert len(picks) == 48, f"Expected 48 picks, got {len(picks)}"
    
    # Save to fixtures & update sleeper_work/raw/picks.json
    fixtures_picks_path = os.path.join(FIXTURES_DIR, f"draft_{draft_id}_picks.json")
    raw_picks_path = os.path.join(RAW_DIR, "picks.json")
    with open(fixtures_picks_path, "w", encoding="utf-8") as f:
        json.dump(picks, f, indent=2)
    with open(raw_picks_path, "w", encoding="utf-8") as f:
        json.dump(picks, f, indent=2)
    print(f"Saved picks to {fixtures_picks_path} and updated {raw_picks_path}")
    
    # 2. Draft traded picks
    draft_traded_url = f"{SLEEPER_BASE_URL}/draft/{draft_id}/traded_picks"
    print(f"Fetching draft traded picks from {draft_traded_url}...")
    draft_traded = fetch_json(draft_traded_url)
    print(f"Captured {len(draft_traded)} draft traded picks.")
    fixtures_draft_traded_path = os.path.join(FIXTURES_DIR, f"draft_{draft_id}_traded_picks.json")
    with open(fixtures_draft_traded_path, "w", encoding="utf-8") as f:
        json.dump(draft_traded, f, indent=2)

    # 3. Transactions for current & prior league
    leagues = ["1312209616372772864", "1187879775490527232"]
    for league_id in leagues:
        all_txs = []
        print(f"Fetching transactions rounds 1..18 for league {league_id}...")
        for r in range(1, 19):
            tx_url = f"{SLEEPER_BASE_URL}/league/{league_id}/transactions/{r}"
            txs = fetch_json(tx_url)
            all_txs.extend(txs)
            time.sleep(0.1)
        print(f"League {league_id}: Captured {len(all_txs)} transactions across 18 rounds.")
        league_tx_path = os.path.join(FIXTURES_DIR, f"league_{league_id}_transactions.json")
        with open(league_tx_path, "w", encoding="utf-8") as f:
            json.dump(all_txs, f, indent=2)
            
        # Traded picks for league
        league_traded_url = f"{SLEEPER_BASE_URL}/league/{league_id}/traded_picks"
        league_traded = fetch_json(league_traded_url)
        print(f"League {league_id}: Captured {len(league_traded)} traded picks.")
        league_traded_path = os.path.join(FIXTURES_DIR, f"league_{league_id}_traded_picks.json")
        with open(league_traded_path, "w", encoding="utf-8") as f:
            json.dump(league_traded, f, indent=2)

    print("\n=== P0-9 Capture Completed Successfully ===")

if __name__ == "__main__":
    main()
