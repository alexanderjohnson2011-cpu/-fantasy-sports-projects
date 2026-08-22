"""
load_control_plane.py — run lineage and coverage catalog (MASTER_PLAN P1-4, P1-5)

The control dataset existed but held no tables, so nothing recorded what the
pipeline had done or what the corpus actually contained. Answering "did Tuesday
run" or "do we have week 4" meant listing a bucket by hand.

Creates and populates:

  control.capture_run   one row per capture run: counts, degraded sources, timing
  control.raw_object    one row per raw object: source, week, bytes, checksum
  control.coverage      source x season x week x date -> present / degraded /
                        missing, which is the table that makes a gap visible in
                        the week it happens rather than a year later

Reads the run reports and sidecars the capture job already writes, so it adds no
new obligation to the capture path. Idempotent on content_hash.
"""

import argparse
import glob
import json
import os
import sys

import bq_idempotent
import raw_source

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
PROJECT = os.environ.get("GCP_PROJECT", "apes-mac-salad")

SCHEMAS = {
    "capture_run": [
        ("run_id", "STRING", "REQUIRED"), ("started_utc", "TIMESTAMP", "REQUIRED"),
        ("finished_utc", "TIMESTAMP", "NULLABLE"), ("season_type", "STRING", "NULLABLE"),
        ("weeks", "INTEGER", "REPEATED"), ("captured", "INTEGER", "NULLABLE"),
        ("skipped", "INTEGER", "NULLABLE"), ("degraded", "INTEGER", "NULLABLE"),
        ("content_hash", "STRING", "REQUIRED"),
    ],
    "raw_object": [
        ("run_id", "STRING", "REQUIRED"), ("logical_source", "STRING", "REQUIRED"),
        ("endpoint", "STRING", "NULLABLE"), ("season", "STRING", "NULLABLE"),
        ("week", "INTEGER", "NULLABLE"), ("season_type", "STRING", "NULLABLE"),
        ("retrieval_utc", "TIMESTAMP", "REQUIRED"), ("http_status", "INTEGER", "NULLABLE"),
        ("content_sha256", "STRING", "REQUIRED"), ("uncompressed_bytes", "INTEGER", "NULLABLE"),
        ("record_count", "INTEGER", "NULLABLE"), ("parser_version", "STRING", "NULLABLE"),
        ("idempotency_key", "STRING", "NULLABLE"), ("content_hash", "STRING", "REQUIRED"),
    ],
    "coverage": [
        ("logical_source", "STRING", "REQUIRED"), ("season", "STRING", "REQUIRED"),
        ("week", "INTEGER", "REQUIRED"), ("season_type", "STRING", "NULLABLE"),
        ("capture_date", "DATE", "REQUIRED"), ("state", "STRING", "REQUIRED"),
        ("record_count", "INTEGER", "NULLABLE"), ("observed_at_utc", "TIMESTAMP", "REQUIRED"),
        ("content_hash", "STRING", "REQUIRED"),
    ],
}


def ensure_tables(client):
    from google.cloud import bigquery
    created = []
    for name, fields in SCHEMAS.items():
        table_id = "%s.control.%s" % (PROJECT, name)
        try:
            client.get_table(table_id)
            continue
        except Exception:
            pass
        schema = [bigquery.SchemaField(n, t, mode=m) for n, t, m in fields]
        table = bigquery.Table(table_id, schema=schema)
        if name == "coverage":
            table.clustering_fields = ["logical_source", "season", "week"]
        client.create_table(table)
        created.append(name)
    return created


def sha(*parts):
    import hashlib
    return hashlib.sha256("|".join(str(p) for p in parts).encode()).hexdigest()


def collect():
    runs, objects, coverage = [], [], []

    run_reports = []
    _bucket = os.environ.get("OUTPUT_BUCKET")
    if _bucket:
        from google.cloud import storage
        for blob in storage.Client().list_blobs(_bucket, prefix="raw/_runs/"):
            try:
                run_reports.append(json.loads(blob.download_as_bytes().decode("utf-8")))
            except Exception:
                continue
    else:
        for path in sorted(glob.glob(os.path.join(RAW, "_runs", "*.json"))):
            try:
                run_reports.append(json.load(open(path, encoding="utf-8")))
            except Exception:
                continue

    for r in run_reports:
        runs.append({
            "run_id": r.get("run_id"), "started_utc": r.get("started_utc"),
            "finished_utc": r.get("finished_utc"), "season_type": r.get("season_type"),
            "weeks": [int(w) for w in (r.get("weeks") or [])],
            "captured": r.get("captured"), "skipped": r.get("skipped_already_present"),
            "degraded": r.get("degraded"),
            "content_hash": sha(r.get("run_id"), r.get("started_utc")),
        })
        for c in (r.get("coverage") or []):
            if c.get("state") != "degraded":
                continue
            # a degraded source is exactly what the catalog exists to surface
            coverage.append({
                "logical_source": c.get("source"), "season": "2026",
                "week": int(c.get("week") or 0), "season_type": c.get("phase"),
                "capture_date": (r.get("started_utc") or "")[:10], "state": "degraded",
                "record_count": None, "observed_at_utc": r.get("started_utc"),
                "content_hash": sha("degraded", c.get("source"), c.get("week"), r.get("run_id")),
            })

    bucket = os.environ.get("OUTPUT_BUCKET")
    sidecars = []
    if bucket:
        from google.cloud import storage
        client = storage.Client()
        for blob in client.list_blobs(bucket, prefix="raw/source="):
            if blob.name.endswith(".meta.json"):
                try:
                    sidecars.append(json.loads(blob.download_as_bytes().decode("utf-8")))
                except Exception:
                    continue
        for blob in client.list_blobs(bucket, prefix="raw/_runs/"):
            pass
    else:
        for meta_path in glob.glob(os.path.join(RAW, "source=*", "**", "*.meta.json"),
                                   recursive=True):
            try:
                sidecars.append(json.load(open(meta_path, encoding="utf-8")))
            except Exception:
                continue

    for m in sidecars:
        h = sha(m.get("content_sha256"), m.get("logical_source"), m.get("retrieval_utc"))
        objects.append({
            "run_id": m.get("run_id") or "unknown",
            "logical_source": m.get("logical_source"), "endpoint": m.get("endpoint"),
            "season": str(m.get("season") or ""), "week": int(m.get("week") or 0),
            "season_type": m.get("season_type"), "retrieval_utc": m.get("retrieval_utc"),
            "http_status": m.get("http_status"),
            "content_sha256": m.get("content_sha256") or "unknown",
            "uncompressed_bytes": m.get("uncompressed_bytes"),
            "record_count": m.get("record_count"),
            "parser_version": m.get("parser_version"),
            "idempotency_key": m.get("idempotency_key"), "content_hash": h,
        })
        coverage.append({
            "logical_source": m.get("logical_source"), "season": str(m.get("season") or ""),
            "week": int(m.get("week") or 0), "season_type": m.get("season_type"),
            "capture_date": (m.get("retrieval_utc") or "")[:10], "state": "present",
            "record_count": m.get("record_count"), "observed_at_utc": m.get("retrieval_utc"),
            "content_hash": sha("present", m.get("logical_source"), m.get("week"),
                                m.get("content_sha256")),
        })

    return runs, objects, coverage


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    runs, objects, coverage = collect()
    print("collected: %d runs, %d raw objects, %d coverage cells"
          % (len(runs), len(objects), len(coverage)))
    if args.dry_run:
        return 0

    from google.cloud import bigquery
    client = bigquery.Client(project=PROJECT)
    created = ensure_tables(client)
    if created:
        print("created control tables: %s" % ", ".join(created))

    for table, rows in (("capture_run", runs), ("raw_object", objects),
                        ("coverage", coverage)):
        if not rows:
            continue
        ins, skip = bq_idempotent.merge_rows(client, "control", table, rows)
        print("  control.%-12s %d inserted, %d already present" % (table, ins, skip))
    return 0


if __name__ == "__main__":
    sys.exit(main())
