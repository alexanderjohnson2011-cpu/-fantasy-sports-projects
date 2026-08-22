"""
save_league_fixtures.py
Fetches and saves local JSON fixtures for league metadata, previous rosters, and bracket files.
"""

import os
import json
import urllib.request

SLEEPER_BASE_URL = "https://api.sleeper.app/v1"
FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")

def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "ApesMacSalad/1.0"})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

def main():
    current_league_id = "1312209616372772864"
    previous_league_id = "1187879775490527232"
    
    print("Saving current league fixture...")
    curr_league = fetch_json(f"{SLEEPER_BASE_URL}/league/{current_league_id}")
    with open(os.path.join(FIXTURES_DIR, f"league_{current_league_id}.json"), "w", encoding="utf-8") as f:
        json.dump(curr_league, f, indent=2)
        
    print("Saving previous league fixture...")
    prev_league = fetch_json(f"{SLEEPER_BASE_URL}/league/{previous_league_id}")
    with open(os.path.join(FIXTURES_DIR, f"league_{previous_league_id}.json"), "w", encoding="utf-8") as f:
        json.dump(prev_league, f, indent=2)
        
    print("Saving previous rosters fixture...")
    prev_rosters = fetch_json(f"{SLEEPER_BASE_URL}/league/{previous_league_id}/rosters")
    with open(os.path.join(FIXTURES_DIR, f"rosters_{previous_league_id}.json"), "w", encoding="utf-8") as f:
        json.dump(prev_rosters, f, indent=2)
        
    print("Saving previous winners bracket fixture...")
    prev_wb = fetch_json(f"{SLEEPER_BASE_URL}/league/{previous_league_id}/winners_bracket")
    with open(os.path.join(FIXTURES_DIR, f"winners_bracket_{previous_league_id}.json"), "w", encoding="utf-8") as f:
        json.dump(prev_wb, f, indent=2)
        
    print("Saving previous losers bracket fixture...")
    prev_lb = fetch_json(f"{SLEEPER_BASE_URL}/league/{previous_league_id}/losers_bracket")
    with open(os.path.join(FIXTURES_DIR, f"losers_bracket_{previous_league_id}.json"), "w", encoding="utf-8") as f:
        json.dump(prev_lb, f, indent=2)
        
    print("=== All League Fixtures Saved ===")

if __name__ == "__main__":
    main()
