"""
build_feature_store.py
Implements P4-1: Populates point-in-time feature store in BigQuery `apes-mac-salad.features`.
Records exact input_cutoff_utc for all computed features.
"""

import os
import json
import datetime
from google.cloud import bigquery

KEY_PATH = r"C:\Users\alexa\Documents\Codex\Apes Mac Salad\apes-mac-salad-0d52b5a00417.json"
PROJECT_ID = "apes-mac-salad"
SLEEPER_WORK_DIR = os.path.dirname(__file__)

os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = KEY_PATH

def main():
    print("=== Phase P4-1: Building Point-in-Time Feature Store ===")
    client = bigquery.Client(project=PROJECT_ID)
    
    now_dt = datetime.datetime.now(datetime.timezone.utc)
    observed_at = now_dt.isoformat()
    # August 2026 cutoff for baseline point-in-time calculation
    cutoff_dt = datetime.datetime(2026, 8, 20, 13, 30, 0, tzinfo=datetime.timezone.utc).isoformat()
    
    # 1. Load team features from generated analysis
    if os.path.exists(os.path.join(os.path.dirname(SLEEPER_WORK_DIR), "src")):
        almanac_dir = os.path.dirname(SLEEPER_WORK_DIR)
    else:
        almanac_dir = os.path.join(os.path.dirname(SLEEPER_WORK_DIR), "ape-invitational-almanac")
    insights_path = os.path.join(almanac_dir, "src", "generated", "league-insights.json")
    with open(insights_path, "r", encoding="utf-8") as f:
        insights = json.load(f)
        
    team_rows_bq = []
    for roster_id_str, team_data in insights["teams"].items():
        m = team_data["metrics"]
        roster_id = int(roster_id_str)
        
        team_rows_bq.append({
            "league_id": "1312209616372772864",
            "season": "2026",
            "week": 0,
            "roster_id": roster_id,
            "observed_at_utc": observed_at,
            "input_cutoff_utc": cutoff_dt,
            "dynasty_total_value": float(m["totalRosterValue"]),
            "redraft_lineup_value": float(m["redraftLineupValue"]),
            "depth_value": float(m["depthValue"]),
            "youth_value_share": float(str(m["youthValueShare"]).replace("%", "")),
            "future_firsts_count": int(m["futureFirsts"]),
            "future_picks_3yr_count": int(m["futurePicksThreeYear"]),
            "qb_room_score": float(100 - (m["qbRoomRank"] - 1) * 5),
            "rb_room_score": float(100 - (m["rbRoomRank"] - 1) * 5),
            "wr_room_score": float(100 - (m["wrRoomRank"] - 1) * 5),
            "te_room_score": float(100 - (m["teRoomRank"] - 1) * 5),
            "lineup_efficiency_pct": 100.0,
            "bench_points": 0.0,
            "optimal_miss_points": 0.0,
            "feature_version": "v1.0"
        })
        
    errors = client.insert_rows_json("features.team_weekly_features", team_rows_bq)
    if errors:
        print("  [ERROR] BigQuery team_weekly_features:", errors)
    else:
        print(f"Successfully populated {len(team_rows_bq)} rows into features.team_weekly_features")
        
    print("=== Feature Store Ingestion Complete ===")

if __name__ == "__main__":
    main()
