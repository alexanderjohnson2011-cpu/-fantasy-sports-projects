"""
capture_sleeper_data.py — perishable-source capture (MASTER_PLAN P0-4, P0-5, P1-3, P1-7)

Writes exact response bytes plus a metadata sidecar to the MASTER_PLAN section 5.2
path convention, locally and optionally to GCS. It does not parse, validate or
transform: capture must never be blocked by a schema (section 4.1).

What changed from the first version, and why it mattered:

  * Weekly sources are captured. The previous version fetched league, users,
    rosters, drafts, brackets and traded picks only -- no matchups and no
    transactions. Those are the entire basis of a weekly recap, and a week that
    is not captured while it is live is not fully recoverable later.
  * The NFL week is resolved from /v1/state/nfl rather than pinned at "00", so
    the week partition in the path is real.
  * as_of in the path is bucketed to the cadence window, which makes a re-run
    inside the same window land on the same prefix instead of creating a new
    copy. This is the section 17.2 idempotency key expressed as a path.
  * Requests retry with capped exponential backoff and jitter, and carry a
    timeout. A single failing source degrades that source only (section 18) --
    the run continues and records the failure.

Usage:
  python capture_sleeper_data.py                      # current week, daily bucket
  python capture_sleeper_data.py --week 3             # a specific week
  python capture_sleeper_data.py --backfill-weeks 1-4 # catch up a range
  python capture_sleeper_data.py --gcs-bucket NAME    # also upload
  python capture_sleeper_data.py --force              # re-capture a done window
  python capture_sleeper_data.py --replay             # no network
"""

import argparse
import datetime
import gzip
import hashlib
import json
import os
import random
import sys
import time
import urllib.error
import urllib.request

try:
    from google.cloud import storage
    GCS_AVAILABLE = True
except ImportError:
    GCS_AVAILABLE = False

HERE = os.path.dirname(os.path.abspath(__file__))

CURRENT_LEAGUE_ID = "1312209616372772864"
PRIOR_LEAGUE_ID = "1187879775490527232"
CURRENT_DRAFT_ID = "1312209616385343488"
SEASON = "2026"

TRANSACTION_ROUNDS = range(1, 19)   # Sleeper exposes transactions per round
USER_AGENT = "ApesMacSalad/1.1 (+league data pipeline)"
TIMEOUT_SECONDS = 30
MAX_ATTEMPTS = 5
SCHEMA_VERSION = "1.1.0"
PARSER_VERSION = "v1.1"


# --------------------------------------------------------------------- helpers

def utc_now():
    return datetime.datetime.now(datetime.timezone.utc)


def sha256(b):
    return hashlib.sha256(b).hexdigest()


def bucket_as_of(now, cadence):
    """Collapse a timestamp to its cadence window.

    Two runs inside the same window share a bucket, so the derived path is
    identical and the second run is recognised as already done. The true
    retrieval time is still recorded in the sidecar.
    """
    if cadence == "hourly":
        return now.replace(minute=0, second=0, microsecond=0)
    if cadence == "weekly":
        monday = now - datetime.timedelta(days=now.weekday())
        return monday.replace(hour=0, minute=0, second=0, microsecond=0)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)  # daily


def fetch(url):
    """GET with capped exponential backoff and jitter.

    Retries only on timeouts, connection failures, 429 and 5xx -- never on a 4xx
    that will fail again identically.
    """
    last = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
                return resp.read(), resp.status
        except urllib.error.HTTPError as e:
            last = e
            if e.code not in (429,) and e.code < 500:
                raise
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last = e
        if attempt < MAX_ATTEMPTS:
            delay = min(30.0, (2 ** (attempt - 1))) * (0.6 + 0.8 * random.random())
            time.sleep(delay)
    raise last if last else RuntimeError("fetch failed: %s" % url)


def gcs_upload(bucket_name, path, data, content_type):
    if not GCS_AVAILABLE:
        return False
    try:
        storage.Client().bucket(bucket_name).blob(path).upload_from_string(
            data, content_type=content_type)
        return True
    except Exception as e:
        print("    [gcs] upload failed for %s: %s" % (path, str(e)[:140]))
        return False


def week_token(week, phase):
    """Week partition label.

    Sleeper restarts week numbering at each phase, so preseason week 2 and
    regular-season week 2 would otherwise write to the same prefix and clobber
    each other. The phase prefix keeps them distinct.
    """
    w = "%02d" % int(week)
    if int(week) == 0:
        return "00"
    return {"pre": "P" + w, "post": "S" + w}.get(phase, w)


def rel_dir_for(source, week, as_of_bucket, phase="regular"):
    return "raw/source=%s/season=%s/week=%s/date=%s/as_of=%s" % (
        source.replace("/", "_"),
        SEASON,
        week_token(week, phase),
        as_of_bucket.strftime("%Y-%m-%d"),
        as_of_bucket.strftime("%Y%m%dT%H%M%SZ"),
    )


def already_captured(base_dir, rel_dir, entity, gcs_bucket):
    """Has this source already been captured for this window?

    A failure to answer is not the same as "no". If the check itself errors --
    most likely the job's identity can write but not read the bucket -- then
    treating it as "not captured" makes the job re-upload and overwrite the
    earlier observation at the same window path, quietly destroying history.
    So a check failure is surfaced loudly and treated as "already captured",
    which is the non-destructive choice.
    """
    if os.path.exists(os.path.join(base_dir, rel_dir, entity + ".json.gz")):
        return True
    if gcs_bucket and GCS_AVAILABLE:
        try:
            blob = storage.Client().bucket(gcs_bucket).blob(
                "%s/%s.json.gz" % (rel_dir, entity))
            return blob.exists()
        except Exception as e:
            print("    [warn] cannot verify existence of %s/%s (%s); skipping "
                  "rather than risk overwriting an earlier observation"
                  % (rel_dir, entity, str(e)[:90]))
            return True
    return False


def save(base_dir, source, entity, content, run_id, as_of_bucket, retrieved_at,
         endpoint, week, status, gcs_bucket, idem_key, phase="regular"):
    rel_dir = rel_dir_for(source, week, as_of_bucket, phase)
    out_dir = os.path.join(base_dir, rel_dir)
    os.makedirs(out_dir, exist_ok=True)

    packed = gzip.compress(content)
    count = 1
    try:
        parsed = json.loads(content.decode("utf-8"))
        if isinstance(parsed, (list, dict)):
            count = len(parsed)
    except Exception:
        pass

    sidecar = {
        "logical_source": source,
        "endpoint": endpoint,
        "retrieval_utc": retrieved_at.isoformat(),
        "as_of_bucket_utc": as_of_bucket.isoformat(),
        "http_status": status,
        "content_sha256": sha256(content),
        "uncompressed_bytes": len(content),
        "compressed_bytes": len(packed),
        "record_count": count,
        "season": SEASON,
        "week": int(week),
        "season_type": phase,
        "parser_version": PARSER_VERSION,
        "run_id": run_id,
        "idempotency_key": idem_key,
        "schema_version": SCHEMA_VERSION,
    }
    meta = json.dumps(sidecar, indent=2).encode("utf-8")

    with open(os.path.join(out_dir, entity + ".json.gz"), "wb") as fh:
        fh.write(packed)
    with open(os.path.join(out_dir, entity + ".json.gz.meta.json"), "wb") as fh:
        fh.write(meta)

    if gcs_bucket:
        gcs_upload(gcs_bucket, "%s/%s.json.gz" % (rel_dir, entity), packed, "application/gzip")
        gcs_upload(gcs_bucket, "%s/%s.json.gz.meta.json" % (rel_dir, entity), meta, "application/json")

    return count


# ----------------------------------------------------------------- source list

def build_sources(week):
    """(source_id, url, entity, cadence, week_partition).

    Weekly sources carry the real week. Everything else is filed under week 00,
    which keeps the season-level partitions from fragmenting.
    """
    L, P, D = CURRENT_LEAGUE_ID, PRIOR_LEAGUE_ID, CURRENT_DRAFT_ID
    api = "https://api.sleeper.app/v1"
    fc = "https://api.fantasycalc.com/values/current?isDynasty=%s&numQbs=1&numTeams=12&ppr=0.5"

    sources = [
        ("sleeper/state", "%s/state/nfl" % api, "state_nfl", "daily", 0),
        ("sleeper/league", "%s/league/%s" % (api, L), "league", "daily", 0),
        ("sleeper/users", "%s/league/%s/users" % (api, L), "users", "daily", 0),
        ("sleeper/rosters", "%s/league/%s/rosters" % (api, L), "rosters", "daily", 0),
        ("sleeper/traded_picks", "%s/league/%s/traded_picks" % (api, L), "traded_picks", "daily", 0),
        ("sleeper/drafts", "%s/league/%s/drafts" % (api, L), "drafts", "weekly", 0),
        ("sleeper/draft_picks", "%s/draft/%s/picks" % (api, D), "draft_picks", "weekly", 0),
        ("sleeper/draft_traded_picks", "%s/draft/%s/traded_picks" % (api, D), "draft_traded_picks", "weekly", 0),
        ("sleeper/winners_bracket", "%s/league/%s/winners_bracket" % (api, L), "winners_bracket", "weekly", 0),
        ("sleeper/losers_bracket", "%s/league/%s/losers_bracket" % (api, L), "losers_bracket", "weekly", 0),

        # ---- the gap this rewrite closes -------------------------------------
        ("sleeper/matchups", "%s/league/%s/matchups/%d" % (api, L, week), "matchups", "hourly", week),
        ("sleeper/transactions", "%s/league/%s/transactions/%d" % (api, L, week), "transactions", "hourly", week),
        # ----------------------------------------------------------------------

        ("sleeper/players", "%s/players/nfl" % api, "players_nfl", "daily", 0),
        ("fantasycalc/dynasty", fc % "true", "fantasycalc_dynasty", "daily", 0),
        ("fantasycalc/redraft", fc % "false", "fantasycalc_redraft", "daily", 0),
    ]

    # Prior-season transactions are backfillable, so they ride the weekly bucket.
    for rnd in TRANSACTION_ROUNDS:
        sources.append((
            "sleeper/prior_transactions",
            "%s/league/%s/transactions/%d" % (api, P, rnd),
            "prior_transactions_r%02d" % rnd, "weekly", 0,
        ))
    return sources


def resolve_week(replay):
    """Returns (week, season_type)."""
    if replay:
        return 1, "regular"
    try:
        body, _ = fetch("https://api.sleeper.app/v1/state/nfl")
        state = json.loads(body.decode("utf-8"))
        wk = state.get("week") or state.get("display_week") or 1
        phase = (state.get("season_type") or "regular").lower()
        return max(1, min(18, int(wk))), phase
    except Exception as e:
        print("  [warn] could not resolve NFL week (%s); defaulting to 1" % str(e)[:80])
        return 1, "regular"


# ----------------------------------------------------------------------- main

def capture_week(week, args, run_id, now, phase="regular"):
    captured = skipped = failed = 0
    coverage = []

    for source, url, entity, cadence, wk in build_sources(week):
        wk = wk or week if source in ("sleeper/matchups", "sleeper/transactions") else wk
        as_of = bucket_as_of(now, cadence)
        idem = "%s:%s:%s:%s:%s" % (
            CURRENT_LEAGUE_ID, SEASON, week_token(wk, phase), source,
            as_of.strftime("%Y%m%dT%H%M%SZ"))
        rel = rel_dir_for(source, wk, as_of, phase)

        if not args.force and already_captured(args.output_dir, rel, entity, args.gcs_bucket):
            skipped += 1
            coverage.append({"source": source, "week": wk, "state": "already_present"})
            continue

        try:
            if args.replay:
                body = json.dumps({"replay": True, "source": source}).encode("utf-8")
                status = 0
            else:
                body, status = fetch(url)

            n = save(args.output_dir, source, entity, body, run_id, as_of, utc_now(),
                     url, wk, status, args.gcs_bucket, idem, phase)
            captured += 1
            coverage.append({"source": source, "week": wk, "phase": phase,
                             "state": "present", "records": n})
            print("  captured %-30s week=%-2s records=%s" % (source, wk, n))
            time.sleep(0.12)
        except Exception as e:
            failed += 1
            coverage.append({"source": source, "week": wk, "state": "degraded",
                             "error": str(e)[:200]})
            # A failing source must not cost the rest of the run (section 18).
            print("  [degraded] %-28s %s" % (source, str(e)[:110]))

    return captured, skipped, failed, coverage


def main():
    ap = argparse.ArgumentParser(description="Capture perishable league sources.")
    ap.add_argument("--output-dir", default=HERE)
    ap.add_argument("--gcs-bucket", default=os.environ.get("OUTPUT_BUCKET"))
    ap.add_argument("--week", type=int, help="capture this NFL week instead of the live one")
    ap.add_argument("--backfill-weeks", help="inclusive range, e.g. 1-4")
    ap.add_argument("--force", action="store_true", help="re-capture even if the window is done")
    ap.add_argument("--phase", choices=["pre", "regular", "post"],
                    help="override the season phase in the week partition")
    ap.add_argument("--replay", action="store_true", help="no network calls")
    args = ap.parse_args()

    run_id = hashlib.sha256(
        ("%s|%s" % (utc_now().strftime("%Y%m%dT%H"), os.getpid())).encode()
    ).hexdigest()[:8]
    now = utc_now()

    live_week, phase = resolve_week(args.replay)
    if args.phase:
        phase = args.phase
    if args.backfill_weeks:
        lo, _, hi = args.backfill_weeks.partition("-")
        weeks = list(range(int(lo), int(hi or lo) + 1))
    elif args.week:
        weeks = [args.week]
    else:
        weeks = [live_week]

    print("=== capture run %s | %s weeks %s | bucket=%s | replay=%s ==="
          % (run_id, phase, weeks, args.gcs_bucket or "(local only)", args.replay))

    tot_c = tot_s = tot_f = 0
    coverage = []
    for wk in weeks:
        c, s, f, cov = capture_week(wk, args, run_id, now, phase)
        tot_c, tot_s, tot_f = tot_c + c, tot_s + s, tot_f + f
        coverage.extend(cov)

    report = {
        "run_id": run_id,
        "started_utc": now.isoformat(),
        "finished_utc": utc_now().isoformat(),
        "weeks": weeks,
        "season_type": phase,
        "captured": tot_c,
        "skipped_already_present": tot_s,
        "degraded": tot_f,
        "coverage": coverage,
    }
    rep_dir = os.path.join(args.output_dir, "raw", "_runs")
    os.makedirs(rep_dir, exist_ok=True)
    rep_path = os.path.join(rep_dir, "run_%s_%s.json" % (now.strftime("%Y%m%dT%H%M%SZ"), run_id))
    with open(rep_path, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2)
    if args.gcs_bucket:
        gcs_upload(args.gcs_bucket, "raw/_runs/%s" % os.path.basename(rep_path),
                   json.dumps(report, indent=2).encode("utf-8"), "application/json")

    print("\n=== run %s: captured %d, skipped %d (already present), degraded %d ==="
          % (run_id, tot_c, tot_s, tot_f))
    print("    coverage report: %s" % rep_path)
    return 2 if tot_c == 0 and tot_f else 0


if __name__ == "__main__":
    sys.exit(main())
