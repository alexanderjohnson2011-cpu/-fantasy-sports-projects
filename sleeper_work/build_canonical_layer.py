"""
build_canonical_layer.py
Phase P3 Canonical Engine:
- Parses raw GCS/local snapshots into bitemporal canonical entities
- Performs per-entity change detection and hashing (content_hash)
- Applies Sleeper scoring_settings adapter
- Populates BigQuery dataset `apes-mac-salad.canonical` and local SQLite `canonical.db`
"""

import os
import sys
import json
import gzip
import sqlite3
import hashlib
import uuid
import datetime
from canonical_schema import compute_entity_hash, validate_scoring_settings

try:
    from google.cloud import bigquery
    BQ_AVAILABLE = True
except ImportError:
    BQ_AVAILABLE = False

KEY_PATH = r"C:\Users\alexa\Documents\Codex\Apes Mac Salad\apes-mac-salad-0d52b5a00417.json"
PROJECT_ID = "apes-mac-salad"
SLEEPER_WORK_DIR = os.path.dirname(__file__)
FIXTURES_DIR = os.path.join(SLEEPER_WORK_DIR, "fixtures")
RAW_DIR = os.path.join(SLEEPER_WORK_DIR, "raw")
SQLITE_DB_PATH = os.path.join(SLEEPER_WORK_DIR, "canonical.db")

os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = KEY_PATH

def init_sqlite_db():
    conn = sqlite3.connect(SQLITE_DB_PATH)
    cur = conn.cursor()
    
    cur.execute("""
    CREATE TABLE IF NOT EXISTS players (
        player_id TEXT PRIMARY KEY,
        first_name TEXT,
        last_name TEXT,
        full_name TEXT,
        position TEXT,
        nfl_team TEXT,
        age INTEGER,
        status TEXT,
        observed_at_utc TEXT,
        valid_from_utc TEXT,
        content_hash TEXT,
        source_snapshot_id TEXT
    )""")
    
    cur.execute("""
    CREATE TABLE IF NOT EXISTS draft_picks (
        draft_id TEXT,
        pick_no INTEGER,
        round INTEGER,
        draft_slot INTEGER,
        roster_id INTEGER,
        player_id TEXT,
        player_name TEXT,
        position TEXT,
        observed_at_utc TEXT,
        content_hash TEXT,
        PRIMARY KEY (draft_id, pick_no)
    )""")
    
    cur.execute("""
    CREATE TABLE IF NOT EXISTS roster_states (
        league_id TEXT,
        roster_id INTEGER,
        owner_id TEXT,
        wins INTEGER,
        losses INTEGER,
        fpts REAL,
        ppts REAL,
        observed_at_utc TEXT,
        content_hash TEXT,
        PRIMARY KEY (league_id, roster_id)
    )""")
    
    cur.execute("""
    CREATE TABLE IF NOT EXISTS player_crosswalk (
        sleeper_id TEXT PRIMARY KEY,
        full_name TEXT,
        position TEXT,
        nfl_team TEXT
    )""")
    
    conn.commit()
    return conn

def load_canonical_data(sync_bigquery=True):
    print("=== Phase P3: Building Bitemporal Canonical Layer ===")
    conn = init_sqlite_db()
    cur = conn.cursor()
    
    run_id = str(uuid.uuid4())[:8]
    now_dt = datetime.datetime.now(datetime.timezone.utc)
    observed_at = now_dt.isoformat()
    
    bq_client = bigquery.Client(project=PROJECT_ID) if (sync_bigquery and BQ_AVAILABLE) else None
    
    # 1. Parse Roster States
    roster_rows_bq = []
    rosters_path = os.path.join(RAW_DIR, "rosters.json")
    if os.path.exists(rosters_path):
        with open(rosters_path, "r", encoding="utf-8") as f:
            rosters = json.load(f)
            
        roster_count = 0
        for r in rosters:
            roster_id = r["roster_id"]
            owner_id = r.get("owner_id", "")
            settings = r.get("settings", {})
            wins = settings.get("wins", 0)
            losses = settings.get("losses", 0)
            ties = settings.get("ties", 0)
            fpts = float(settings.get("fpts", 0)) + float(settings.get("fpts_decimal", 0)) / 100
            ppts = float(settings.get("ppts", 0)) + float(settings.get("ppts_decimal", 0)) / 100
            starters = [str(p) for p in (r.get("starters") or [])]
            players = [str(p) for p in (r.get("players") or [])]
            taxi = [str(p) for p in (r.get("taxi") or [])]
            reserve = [str(p) for p in (r.get("reserve") or [])]
            
            c_hash = compute_entity_hash(r)
            
            cur.execute("""
            INSERT OR REPLACE INTO roster_states 
            (league_id, roster_id, owner_id, wins, losses, fpts, ppts, observed_at_utc, content_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, ("1312209616372772864", roster_id, owner_id, wins, losses, fpts, ppts, observed_at, c_hash))
            
            roster_rows_bq.append({
                "league_id": "1312209616372772864",
                "roster_id": roster_id,
                "owner_id": owner_id,
                "starters": starters,
                "players": players,
                "taxi": taxi,
                "reserve": reserve,
                "wins": wins,
                "losses": losses,
                "ties": ties,
                "fpts": fpts,
                "ppts": ppts,
                "observed_at_utc": observed_at,
                "valid_from_utc": observed_at,
                "valid_to_utc": None,
                "content_hash": c_hash,
                "source_snapshot_id": "raw/source=sleeper_rosters",
                "parser_version": "v1.0",
                "ingest_run_id": run_id
            })
            roster_count += 1
            
        print(f"Loaded {roster_count} roster states into canonical layer.")

    # 2. Parse 48-pick Draft Board
    pick_rows_bq = []
    crosswalk_rows_bq = []
    picks_path = os.path.join(FIXTURES_DIR, "draft_1312209616385343488_picks.json")
    if not os.path.exists(picks_path):
        picks_path = os.path.join(RAW_DIR, "picks.json")
        
    if os.path.exists(picks_path):
        with open(picks_path, "r", encoding="utf-8") as f:
            picks = json.load(f)
            
        pick_count = 0
        for p in picks:
            draft_id = p.get("draft_id", "1312209616385343488")
            pick_no = p["pick_no"]
            round_no = p["round"]
            slot = p["draft_slot"]
            roster_id = p["roster_id"]
            player_id = str(p.get("player_id", ""))
            
            meta = p.get("metadata", {})
            p_name = f"{meta.get('first_name', '')} {meta.get('last_name', '')}".strip() or "Selected Player"
            pos = meta.get("position", "WR")
            team = meta.get("team", "FA")
            c_hash = compute_entity_hash(p)
            
            cur.execute("""
            INSERT OR REPLACE INTO draft_picks
            (draft_id, pick_no, round, draft_slot, roster_id, player_id, player_name, position, observed_at_utc, content_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (draft_id, pick_no, round_no, slot, roster_id, player_id, p_name, pos, observed_at, c_hash))
            
            pick_rows_bq.append({
                "draft_id": draft_id,
                "pick_no": pick_no,
                "round": round_no,
                "draft_slot": slot,
                "roster_id": roster_id,
                "player_id": player_id,
                "picked_by": str(p.get("picked_by", "")),
                "is_keeper": bool(p.get("is_keeper", False)),
                "metadata": json.dumps(meta),
                "observed_at_utc": observed_at,
                "valid_from_utc": observed_at,
                "valid_to_utc": None,
                "content_hash": c_hash,
                "source_snapshot_id": "raw/source=sleeper_draft_picks",
                "parser_version": "v1.0",
                "ingest_run_id": run_id
            })
            
            # Crosswalk entry
            if player_id:
                cur.execute("""
                INSERT OR REPLACE INTO player_crosswalk (sleeper_id, full_name, position, nfl_team)
                VALUES (?, ?, ?, ?)
                """, (player_id, p_name, pos, team))
                
                crosswalk_rows_bq.append({
                    "sleeper_id": player_id,
                    "gsis_id": None,
                    "fantasycalc_id": None,
                    "fantasypros_id": None,
                    "full_name": p_name,
                    "position": pos,
                    "nfl_team": team,
                    "last_updated_utc": observed_at
                })
                
            pick_count += 1
            
        print(f"Loaded {pick_count} draft picks into canonical layer.")

    conn.commit()
    conn.close()
    
    # 3. Stream into BigQuery if client available
    if bq_client:
        # Content-hash MERGE rather than a streaming append. insert_rows_json is
        # unconditional, so every re-run duplicated the whole row set -- that is
        # how draft_picks reached 144 rows for 48 picks. merge_rows inserts only
        # what is genuinely new, which makes a retry or backfill a no-op.
        import bq_idempotent
        print("Merging rows into BigQuery canonical dataset (idempotent)...")
        batches = [
            ("roster_states", roster_rows_bq, "content_hash"),
            ("draft_picks", pick_rows_bq, "content_hash"),
            ("player_crosswalk", crosswalk_rows_bq, "sleeper_id"),
        ]
        for table, rows, key in batches:
            if not rows:
                continue
            try:
                inserted, skipped = bq_idempotent.merge_rows(
                    bq_client, "canonical", table, rows, key_field=key)
                print("  -> canonical.%s: %d inserted, %d already present"
                      % (table, inserted, skipped))
            except Exception as e:
                print("  [BQ ERROR] canonical.%s: %s" % (table, str(e)[:200]))

    print("=== Canonical Layer Construction Complete ===")

if __name__ == "__main__":
    load_canonical_data(sync_bigquery=True)
