"""
load_reference_canonical.py — reference data into canonical (MASTER_PLAN P3-2)

Fills the three canonical tables that existed but were never populated:

  canonical.players           the Sleeper player map: identity, position, team,
                              and the status flags that overwrite in place
  canonical.market_values     FantasyCalc dynasty and redraft values
  canonical.expert_rankings   the retained four-board consensus

All three are already captured in Cloud Storage; nothing parsed them. That is
the difference that matters: the data was never lost, just unqueryable.

Why these belong in canonical rather than being read from raw on demand:

  Sleeper overwrites a player's injury status in place, so the map is a
  perishable source. The daily capture preserves each day's copy, but only a
  bitemporal table can answer "what was his status on the Sunday of week 4" --
  which is the question every ex-ante lineup analysis depends on.

  Per-entity content hashing keeps the cost honest. The first load writes every
  player; after that a day where twelve players change status writes twelve
  rows, not twelve thousand.

Reads from OUTPUT_BUCKET when set, else the local raw/ tree.
"""

import argparse
import hashlib
import os
import sys

import bq_idempotent
import raw_source

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
PROJECT = os.environ.get("GCP_PROJECT", "apes-mac-salad")
PARSER_VERSION = "v1.0"

FANTASY_POSITIONS = {"QB", "RB", "WR", "TE", "K", "DEF"}


def sha(*parts):
    return hashlib.sha256("|".join(str(p) for p in parts).encode("utf-8")).hexdigest()


def captures(source):
    return raw_source.iter_captures(
        source, local_root=RAW, bucket=os.environ.get("OUTPUT_BUCKET"))


def build_players(all_positions=False):
    """One row per player per observed change.

    Restricted to fantasy-relevant positions by default. The full map carries
    roughly twelve thousand entries, most of them offensive linemen and long
    snappers who can never appear in a lineup; loading them would triple the
    table to answer no question anyone asks. The raw map is retained in full
    either way, so widening this later is a re-parse, not a re-capture.
    """
    rows, seen = [], set()
    for payload, sidecar, _ident in captures("sleeper_players"):
        if not isinstance(payload, dict):
            continue
        observed = sidecar.get("retrieval_utc")
        snap = sidecar.get("content_sha256") or "unknown"
        run = sidecar.get("run_id") or "unknown"

        for pid, p in payload.items():
            if not isinstance(p, dict):
                continue
            pos = (p.get("position") or "").upper()
            if not all_positions and pos not in FANTASY_POSITIONS:
                continue

            first, last = p.get("first_name"), p.get("last_name")
            full = p.get("full_name") or " ".join(x for x in (first, last) if x)
            # status is the field that overwrites, so it drives the hash
            h = sha(PARSER_VERSION, pid, pos, p.get("team"),
                    p.get("status"), p.get("injury_status"), full)
            if h in seen:
                continue
            seen.add(h)

            age = p.get("age")
            rows.append({
                "player_id": str(pid),
                "first_name": first, "last_name": last, "full_name": full or str(pid),
                "position": pos or None, "nfl_team": p.get("team"),
                "age": int(age) if isinstance(age, (int, float)) else None,
                "status": p.get("injury_status") or p.get("status"),
                "gsis_id": p.get("gsis_id"),
                "fantasycalc_id": None,          # filled by the crosswalk, not here
                "observed_at_utc": observed, "valid_from_utc": observed,
                "valid_to_utc": None, "content_hash": h,
                "source_snapshot_id": snap, "parser_version": PARSER_VERSION,
                "ingest_run_id": run,
            })
    return rows


def build_market_values():
    """Dynasty and redraft rows, tagged by which feed produced them."""
    rows, seen = [], set()
    for source, is_dynasty in (("fantasycalc_dynasty", True),
                               ("fantasycalc_redraft", False)):
        for payload, sidecar, _ident in captures(source):
            if not isinstance(payload, list):
                continue
            observed = sidecar.get("retrieval_utc")
            snap = sidecar.get("content_sha256") or "unknown"
            run = sidecar.get("run_id") or "unknown"

            for entry in payload:
                pl = (entry or {}).get("player") or {}
                pid = pl.get("sleeperId") or pl.get("id")
                if pid is None:
                    continue
                value = entry.get("value")
                h = sha(PARSER_VERSION, source, pid, value,
                        entry.get("overallRank"), observed)
                if h in seen:
                    continue
                seen.add(h)

                rows.append({
                    "player_id": str(pid),
                    "player_name": pl.get("name") or str(pid),
                    "position": (pl.get("position") or "").upper() or None,
                    "is_dynasty": is_dynasty,
                    "dynasty_value": float(value) if is_dynasty and value is not None else None,
                    "redraft_value": (float(entry.get("redraftValue"))
                                      if entry.get("redraftValue") is not None
                                      else (float(value) if not is_dynasty and value is not None else None)),
                    "overall_rank": entry.get("overallRank"),
                    "position_rank": entry.get("positionRank"),
                    "trend_30_day": (float(entry["trend30Day"])
                                     if entry.get("trend30Day") is not None else None),
                    "observed_at_utc": observed, "valid_from_utc": observed,
                    "valid_to_utc": None, "content_hash": h,
                    "source_snapshot_id": snap, "parser_version": PARSER_VERSION,
                    "ingest_run_id": run,
                })
    return rows


def build_expert_rankings():
    """Consensus ranks from the retained multi-board snapshot.

    ecr_spread is rank_high minus rank_low: how far the boards disagree, which
    is the part worth keeping. A player every source ranks 3rd and a player
    ranked anywhere from 2nd to 40th are not the same signal even when their
    medians match.
    """
    rows, seen = [], set()
    for source in ("expert_ranks_2026", "expert/ranks_2026"):
        for payload, sidecar, _ident in captures(source.replace("/", "_")):
            players = (payload or {}).get("players")
            if not isinstance(players, dict):
                continue
            observed = sidecar.get("retrieval_utc") or payload.get("generated_at")
            snap = sidecar.get("content_sha256") or "unknown"
            run = sidecar.get("run_id") or "unknown"

            for _key, p in players.items():
                rank = p.get("consensus_rank")
                if rank is None:
                    continue
                lo, hi = p.get("rank_low"), p.get("rank_high")
                spread = float(hi - lo) if isinstance(lo, (int, float)) and isinstance(hi, (int, float)) else None
                detail = (p.get("source_details") or {}).get("fantasypros_ecr") or {}

                h = sha(PARSER_VERSION, p.get("name"), rank, p.get("sources_count"), observed)
                if h in seen:
                    continue
                seen.add(h)

                rows.append({
                    "player_name": p.get("name") or str(_key),
                    "position": (p.get("position") or "").upper() or None,
                    "consensus_rank": int(round(float(rank))),
                    "tier": detail.get("tier"),
                    "ecr_spread": spread,
                    "sources_count": p.get("sources_count"),
                    "observed_at_utc": observed, "valid_from_utc": observed,
                    "valid_to_utc": None, "content_hash": h,
                    "source_snapshot_id": snap, "parser_version": PARSER_VERSION,
                    "ingest_run_id": run,
                })
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--all-positions", action="store_true",
                    help="load every player, not just fantasy-relevant positions")
    args = ap.parse_args()

    bucket = os.environ.get("OUTPUT_BUCKET")
    print("reading raw from: %s" % ("gs://" + bucket if bucket else "local raw/"))

    players = build_players(args.all_positions)
    market = build_market_values()
    experts = build_expert_rankings()

    print("parsed:")
    print("  players          : %d" % len(players))
    print("  market values    : %d" % len(market))
    print("  expert rankings  : %d" % len(experts))

    if args.dry_run:
        print("\ndry run - nothing written")
        return 0

    from google.cloud import bigquery
    client = bigquery.Client(project=PROJECT)
    for table, rows in (("players", players), ("market_values", market),
                        ("expert_rankings", experts)):
        if not rows:
            print("  canonical.%s: nothing to load" % table)
            continue
        ins, skip = bq_idempotent.merge_rows(client, "canonical", table, rows)
        print("  canonical.%-16s %d inserted, %d already present" % (table + ":", ins, skip))
    return 0


if __name__ == "__main__":
    sys.exit(main())
