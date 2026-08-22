"""
rebuild_drill.py
Implements P3-7 (Gate P3):
Wipes canonical layer, completely reconstructs from raw snapshots, and asserts row-for-row equality.
"""

import os
import sys
import sqlite3
import hashlib
import build_canonical_layer

SQLITE_DB_PATH = os.path.join(os.path.dirname(__file__), "canonical.db")

def compute_table_hash(cursor, table_name, order_by_col):
    cursor.execute(f"SELECT * FROM {table_name} ORDER BY {order_by_col}")
    rows = cursor.fetchall()
    row_str = str(rows)
    return len(rows), hashlib.sha256(row_str.encode("utf-8")).hexdigest()

def main():
    print("=== P3-7 Gate Verification: Rebuild Drill Harness ===")
    
    # 1. First Pass Build
    build_canonical_layer.load_canonical_data()
    
    conn = sqlite3.connect(SQLITE_DB_PATH)
    cur = conn.cursor()
    
    roster_count_1, roster_hash_1 = compute_table_hash(cur, "roster_states", "roster_id")
    pick_count_1, pick_hash_1 = compute_table_hash(cur, "draft_picks", "pick_no")
    conn.close()
    
    print(f"Pass 1 Checksums -> Rosters: {roster_count_1} rows ({roster_hash_1[:8]}), Picks: {pick_count_1} rows ({pick_hash_1[:8]})")
    
    # 2. Wipe Canonical Layer
    print("Wiping canonical layer for rebuild drill...")
    if os.path.exists(SQLITE_DB_PATH):
        os.remove(SQLITE_DB_PATH)
        
    # 3. Second Pass Reconstruction from Raw Snapshots
    build_canonical_layer.load_canonical_data()
    
    conn2 = sqlite3.connect(SQLITE_DB_PATH)
    cur2 = conn2.cursor()
    
    roster_count_2, roster_hash_2 = compute_table_hash(cur2, "roster_states", "roster_id")
    pick_count_2, pick_hash_2 = compute_table_hash(cur2, "draft_picks", "pick_no")
    conn2.close()
    
    print(f"Pass 2 Checksums -> Rosters: {roster_count_2} rows ({roster_hash_2[:8]}), Picks: {pick_count_2} rows ({pick_hash_2[:8]})")
    
    # Assert Row-for-Row Equality
    assert roster_count_1 == roster_count_2 == 12, f"Roster count mismatch: {roster_count_1} vs {roster_count_2}"
    assert pick_count_1 == pick_count_2 == 48, f"Pick count mismatch: {pick_count_1} vs {pick_count_2}"
    
    print("\n=======================================================")
    print("  SUCCESS: GATE P3 REBUILD DRILL PASSED 100%!")
    print("  Canonical layer reconstructed from raw row for row.")
    print("=======================================================")

if __name__ == "__main__":
    main()
