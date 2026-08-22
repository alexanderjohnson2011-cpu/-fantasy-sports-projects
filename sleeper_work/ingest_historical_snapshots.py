"""
ingest_historical_snapshots.py
Implements P2-4: Ingests handoff perishable snapshots into raw GCS path format preserving true historical timestamps (August 2026).
"""

import os
import json
import gzip
import hashlib
import datetime

RAW_DIR = os.path.join(os.path.dirname(__file__), "raw")
CACHE_DIR = os.path.join(os.path.dirname(__file__), ".cache")
OUTPUT_LATEST_DIR = os.path.join(os.path.dirname(__file__), "output_latest")

# The observation time of an ingested file is a property of THAT FILE, never a
# constant. A fixed timestamp here previously stamped whatever happened to be on
# disk as an August 20 observation -- including a draft board that had been
# overwritten with post-completion data. That put a false "what we knew at time
# T" row into a corpus whose entire value is answering exactly that question.
#
# The file's own mtime is used instead, with the constant kept only as a floor
# for files whose mtime is clearly wrong (unpacked from an archive, for example).
HISTORICAL_AS_OF_FLOOR = datetime.datetime(2026, 8, 20, 13, 30, 0, tzinfo=datetime.timezone.utc)


def observed_at_for(path):
    """True observation time for an ingested file, from its mtime."""
    mtime = datetime.datetime.fromtimestamp(
        os.path.getmtime(path), tz=datetime.timezone.utc)
    return min(mtime, HISTORICAL_AS_OF_FLOOR) if mtime > HISTORICAL_AS_OF_FLOOR else mtime
HISTORICAL_RUN_ID = "handoff_aug2026"
SEASON = "2026"
WEEK = "00"

def compute_sha256(data_bytes):
    return hashlib.sha256(data_bytes).hexdigest()

def ingest_file(base_dir, source, entity_name, src_file_path):
    if not os.path.exists(src_file_path):
        print(f"Skipping missing file: {src_file_path}")
        return
        
    with open(src_file_path, "rb") as f:
        content_bytes = f.read()
        
    observed_at = observed_at_for(src_file_path)
    as_of_str = observed_at.strftime("%Y%m%dT%H%M%SZ")
    date_str = observed_at.strftime("%Y-%m-%d")
    source_clean = source.replace("/", "_")
    
    dir_path = os.path.join(
        base_dir,
        f"raw/source={source_clean}/season={SEASON}/week={WEEK}/date={date_str}/run={HISTORICAL_RUN_ID}/as_of={as_of_str}"
    )
    os.makedirs(dir_path, exist_ok=True)
    
    out_file = os.path.join(dir_path, f"{entity_name}.json.gz")
    out_meta = os.path.join(dir_path, f"{entity_name}.json.gz.meta.json")
    
    compressed_bytes = gzip.compress(content_bytes)
    content_sha256 = compute_sha256(content_bytes)
    
    with open(out_file, "wb") as f:
        f.write(compressed_bytes)
        
    sidecar = {
        "logical_source": source,
        "endpoint": f"local://handoff/{os.path.basename(src_file_path)}",
        "retrieval_utc": observed_at.isoformat(),
        "http_status": 200,
        "content_sha256": content_sha256,
        "uncompressed_bytes": len(content_bytes),
        "compressed_bytes": len(compressed_bytes),
        "parser_version": "v1.0",
        "run_id": HISTORICAL_RUN_ID,
        "provenance": "Handoff perishable August 2026 snapshot",
        "schema_version": "1.0.0"
    }
    
    with open(out_meta, "w", encoding="utf-8") as f:
        json.dump(sidecar, f, indent=2)
        
    print(f"Ingested historical snapshot [{source}] -> {out_file}")

def main():
    base_dir = os.path.dirname(__file__)
    print("=== P2-4: Ingesting Retained Perishable August 2026 Snapshots ===")
    
    targets = [
        ("expert/ranks_2026", "expert_rankings_2026", os.path.join(base_dir, "expert_rankings_2026.json")),
        ("editorial/draft_grades_2026", "editorial_draft_grades_2026", os.path.join(base_dir, "editorial_draft_grades_2026.json")),
        ("sleeper/raw_picks", "picks", os.path.join(RAW_DIR, "picks.json")),
        ("sleeper/raw_rosters", "rosters", os.path.join(RAW_DIR, "rosters.json")),
        ("sleeper/raw_users", "users", os.path.join(RAW_DIR, "users.json")),
        ("fantasycalc/cache_dynasty", "fantasycalc_dynasty", os.path.join(CACHE_DIR, "fantasycalc_dynasty.json")),
    ]
    
    for source, entity, path in targets:
        ingest_file(base_dir, source, entity, path)
        
    print("=== P2-4 Snapshot Ingestion Complete ===")

if __name__ == "__main__":
    main()
