"""
load_weekly_canonical.py — raw weekly captures into canonical (MASTER_PLAN P3-2)

Capture was solved separately; this is the ingest half. It reads the raw
matchup and transaction objects written by capture_sleeper_data.py and merges
them into canonical.matchup_results and canonical.transactions.

Two decisions worth stating, because both are easy to get wrong:

  Preseason is captured but not loaded. canonical.matchup_results keys on
  (season, week) with no phase column, so preseason week 2 and regular week 2
  would collide. Preseason rows are also all 0.0 points and carry no
  information. The raw objects are kept regardless -- capture-first -- and can
  be loaded later if a phase column is ever added.

  observed_at comes from the capture sidecar, not from now(). The row records
  when the pipeline saw the data, which is the whole point of the bitemporal
  design; stamping load time would make every backfill look like a fresh
  observation.

Idempotent via bq_idempotent.merge_rows on content_hash, so re-running is a
no-op and a changed matchup inserts a new observation beside the old one.
"""

import argparse
import gzip
import hashlib
import json
import os
import re
import sys

import bq_idempotent

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
LEAGUE_ID = "1312209616372772864"
PARSER_VERSION = "v1.1"   # v1.1 adds players_points (bench scoring)

WEEK_RE = re.compile(r"week=([A-Z]?\d+)")
SEASON_RE = re.compile(r"season=(\d+)")


def sha(*parts):
    return hashlib.sha256("|".join(str(p) for p in parts).encode("utf-8")).hexdigest()


def iter_captures(source):
    """Yield (payload, sidecar, path) for every capture of a logical source."""
    root = os.path.join(RAW, "source=%s" % source)
    if not os.path.isdir(root):
        return
    for dirpath, _, files in os.walk(root):
        for name in files:
            if not name.endswith(".json.gz"):
                continue
            path = os.path.join(dirpath, name)
            meta_path = path + ".meta.json"
            if not os.path.exists(meta_path):
                continue
            try:
                with gzip.open(path, "rb") as fh:
                    payload = json.loads(fh.read().decode("utf-8"))
                with open(meta_path, encoding="utf-8") as fh:
                    sidecar = json.load(fh)
            except Exception as e:
                print("  [skip] unreadable %s (%s)" % (name, str(e)[:80]))
                continue
            yield payload, sidecar, path


def phase_of(sidecar, path):
    phase = sidecar.get("season_type")
    if phase:
        return phase
    m = WEEK_RE.search(path)                      # pre-1.1 captures had no phase
    token = m.group(1) if m else ""
    return "pre" if token.startswith("P") else ("post" if token.startswith("S") else "regular")


PRIOR_LEAGUE_ID = "1187879775490527232"
PRIOR_SEASON = "2025"


def build_matchup_rows():
    """Matchup rows from every captured week, current and prior season."""
    rows, skipped_non_regular = [], 0

    for source in ("sleeper_matchups", "sleeper_prior_matchups"):
        prior = source == "sleeper_prior_matchups"
        league_id = PRIOR_LEAGUE_ID if prior else LEAGUE_ID

        for payload, sidecar, path in iter_captures(source):
            if phase_of(sidecar, path) != "regular":
                skipped_non_regular += 1
                continue
            if not isinstance(payload, list) or not payload:
                continue

            season = PRIOR_SEASON if prior else str(
                sidecar.get("season")
                or (SEASON_RE.search(path).group(1) if SEASON_RE.search(path) else ""))
            week = int(sidecar.get("week") or 0)
            observed = sidecar.get("retrieval_utc")
            snap = sidecar.get("content_sha256") or "unknown"
            run = sidecar.get("run_id") or "unknown"

            # the opponent is the other roster sharing a matchup_id
            by_matchup = {}
            for e in payload:
                by_matchup.setdefault(e.get("matchup_id"), []).append(e.get("roster_id"))

            for e in payload:
                rid = e.get("roster_id")
                mates = [r for r in by_matchup.get(e.get("matchup_id"), []) if r != rid]
                rows.append({
                    "league_id": league_id,
                    "season": season,
                    "week": week,
                    "matchup_id": e.get("matchup_id"),
                    "roster_id": rid,
                    "opponent_roster_id": mates[0] if len(mates) == 1 else None,
                    "points": float(e.get("points") or 0.0),
                    # repeated columns, not serialised blobs: starter_points is
                    # the per-slot vector, which is what lineup analysis needs
                    "starters": [str(x) for x in (e.get("starters") or [])],
                    "starter_points": [float(x or 0) for x in (e.get("starters_points") or [])],
                    "players": [str(x) for x in (e.get("players") or [])],
                    # per-player points including bench: without this, "points
                    # left on the bench" is structurally zero
                    "players_points": e.get("players_points") or None,
                    "custom_points": (float(e["custom_points"])
                                      if e.get("custom_points") is not None else None),
                    "observed_at_utc": observed,
                    "valid_from_utc": observed,
                    "valid_to_utc": None,
                    "content_hash": sha(PARSER_VERSION, league_id, season, week, rid,
                                        e.get("points"), e.get("starters"),
                                        e.get("players_points")),
                    "source_snapshot_id": snap,
                    "parser_version": PARSER_VERSION,
                    "ingest_run_id": run,
                })
    return rows, skipped_non_regular


def build_transaction_rows():
    rows = []
    seen = set()
    for source in ("sleeper_transactions", "sleeper_prior_transactions"):
        for payload, sidecar, _path in iter_captures(source):
            if not isinstance(payload, list):
                continue
            observed = sidecar.get("retrieval_utc")
            snap = sidecar.get("content_sha256")
            league = (LEAGUE_ID if source == "sleeper_transactions"
                      else "1187879775490527232")
            for t in payload:
                tid = t.get("transaction_id")
                if not tid:
                    continue
                h = sha(tid, t.get("status"), t.get("status_updated"))
                if h in seen:            # same transaction seen in several captures
                    continue
                seen.add(h)
                su = t.get("status_updated")
                rows.append({
                    "transaction_id": tid,
                    "league_id": league,
                    "status": t.get("status"),
                    "type": t.get("type"),
                    "creator_id": t.get("creator"),
                    "consenter_ids": [str(x) for x in (t.get("consenter_ids") or [])],
                    "adds": t.get("adds") or None,
                    "drops": t.get("drops") or None,
                    "draft_picks": t.get("draft_picks") or [],
                    "waiver_budget": t.get("waiver_budget") or [],
                    "status_updated_at": (
                        __import__("datetime").datetime.fromtimestamp(
                            su / 1000.0, __import__("datetime").timezone.utc
                        ).isoformat() if su else None),
                    "observed_at_utc": observed,
                    "valid_from_utc": observed,
                    "valid_to_utc": None,
                    "content_hash": h,
                    "source_snapshot_id": snap or "unknown",
                    "parser_version": PARSER_VERSION,
                    "ingest_run_id": sidecar.get("run_id") or "unknown",
                })
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    matchups, skipped_pre = build_matchup_rows()
    transactions = build_transaction_rows()

    print("parsed from raw:")
    print("  matchup rows      : %d (%d preseason captures skipped by design)"
          % (len(matchups), skipped_pre))
    print("  transaction rows  : %d" % len(transactions))

    if args.dry_run:
        print("\ndry run - nothing written")
        return 0

    from google.cloud import bigquery
    client = bigquery.Client(project=os.environ.get("GCP_PROJECT", "apes-mac-salad"))

    for table, rows in (("matchup_results", matchups), ("transactions", transactions)):
        if not rows:
            print("  canonical.%s: nothing to load" % table)
            continue
        inserted, skipped = bq_idempotent.merge_rows(
            client, "canonical", table, rows, key_field="content_hash")
        print("  canonical.%s: %d inserted, %d already present"
              % (table, inserted, skipped))
    return 0


if __name__ == "__main__":
    sys.exit(main())
