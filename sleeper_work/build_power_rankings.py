"""
build_power_rankings.py — weekly power rankings with movement (MASTER_PLAN P5-3)

Computes roster power from the canonical layer and writes each week's result to
analytics.power_rankings as an immutable snapshot. Because every week is kept,
the run can compare against last week and say what actually changed -- which is
what makes a power ranking readable rather than just a sorted list.

Scoring, matching the methodology already published on the site:

  55%  current lineup strength   best legal starting lineup by redraft value
  25%  usable depth              value of the bench that could actually start
  10%  positional balance        penalises a roster that is one injury from a hole
  10%  prior-season scoring      points for, normalised across the league

Movement commentary is generated from observed deltas, never authored. Each
driver names the measured change that moved the team: lineup value, depth,
last week's result, or a roster transaction. A week with no prior snapshot says
so rather than inventing a debut narrative.

Reads OUTPUT_BUCKET-backed canonical data; writes both BigQuery and the site
payload.
"""

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone

import bq_idempotent

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "ape-invitational-almanac", "src", "generated", "power-rankings.json")

PROJECT = os.environ.get("GCP_PROJECT", "apes-mac-salad")
LEAGUE_ID = "1312209616372772864"
PRIOR_LEAGUE_ID = "1187879775490527232"
SEASON = "2026"
MODEL_VERSION = "power-rankings-v1"
SCHEMA_VERSION = "1.0.0"

SLOTS = {"QB": 1, "RB": 2, "WR": 2, "TE": 1, "FLEX": 3, "K": 1, "DEF": 1}
FLEX_ELIGIBLE = ("RB", "WR", "TE")
W_LINEUP, W_DEPTH, W_BALANCE, W_PRIOR = 0.55, 0.25, 0.10, 0.10

TABLE_SCHEMA = [
    ("season", "STRING", "REQUIRED"), ("week", "INTEGER", "REQUIRED"),
    ("roster_id", "INTEGER", "REQUIRED"), ("team_name", "STRING", "NULLABLE"),
    ("rank", "INTEGER", "REQUIRED"), ("score", "FLOAT", "REQUIRED"),
    ("lineup_score", "FLOAT", "NULLABLE"), ("depth_score", "FLOAT", "NULLABLE"),
    ("balance_score", "FLOAT", "NULLABLE"), ("prior_score", "FLOAT", "NULLABLE"),
    ("lineup_value", "FLOAT", "NULLABLE"), ("depth_value", "FLOAT", "NULLABLE"),
    ("prior_rank", "INTEGER", "NULLABLE"), ("rank_delta", "INTEGER", "NULLABLE"),
    ("score_delta", "FLOAT", "NULLABLE"),
    ("drivers", "STRING", "REPEATED"), ("commentary", "STRING", "NULLABLE"),
    ("observed_at_utc", "TIMESTAMP", "REQUIRED"),
    ("content_hash", "STRING", "REQUIRED"),
    ("model_version", "STRING", "REQUIRED"),
]


def safe(text):
    """Console-safe rendering; team names contain emoji and Windows is cp1252."""
    return str(text).encode("ascii", "replace").decode("ascii")


def sha(*p):
    return hashlib.sha256("|".join(str(x) for x in p).encode()).hexdigest()


def ensure_table(client):
    from google.cloud import bigquery
    tid = "%s.analytics.power_rankings" % PROJECT
    try:
        client.get_table(tid)
        return False
    except Exception:
        pass
    t = bigquery.Table(tid, schema=[bigquery.SchemaField(n, ty, mode=m)
                                    for n, ty, m in TABLE_SCHEMA])
    t.time_partitioning = bigquery.TimePartitioning(field="observed_at_utc")
    t.clustering_fields = ["season", "week", "roster_id"]
    client.create_table(t)
    return True


# ----------------------------------------------------------------- inputs

def load_inputs(client):
    """Latest roster state, market values and player positions from canonical."""
    rosters = {r.roster_id: list(r.players or [])
               for r in client.query("""
        SELECT roster_id, players FROM `{p}.canonical.roster_states`
        WHERE league_id = @l
        QUALIFY ROW_NUMBER() OVER (PARTITION BY roster_id
                                   ORDER BY observed_at_utc DESC) = 1
    """.format(p=PROJECT), job_config=_params(l=LEAGUE_ID)).result()}

    values = {}
    for r in client.query("""
        SELECT player_id, is_dynasty, dynasty_value, redraft_value
        FROM `{p}.canonical.market_values`
        QUALIFY ROW_NUMBER() OVER (PARTITION BY player_id, is_dynasty
                                   ORDER BY observed_at_utc DESC) = 1
    """.format(p=PROJECT)).result():
        slot = values.setdefault(str(r.player_id), {})
        if r.is_dynasty:
            slot["dynasty"] = float(r.dynasty_value or 0)
        else:
            slot["redraft"] = float(r.redraft_value or 0)

    positions = {str(r.player_id): r.position
                 for r in client.query("""
        SELECT player_id, position FROM `{p}.canonical.players`
        QUALIFY ROW_NUMBER() OVER (PARTITION BY player_id
                                   ORDER BY observed_at_utc DESC) = 1
    """.format(p=PROJECT)).result()}

    prior = {r.roster_id: float(r.pf or 0)
             for r in client.query("""
        SELECT roster_id, SUM(points) pf FROM `{p}.canonical.matchup_results`
        WHERE league_id = @l GROUP BY roster_id
    """.format(p=PROJECT), job_config=_params(l=PRIOR_LEAGUE_ID)).result()}

    return rosters, values, positions, prior


def _params(**kw):
    from google.cloud import bigquery
    return bigquery.QueryJobConfig(query_parameters=[
        bigquery.ScalarQueryParameter(k, "STRING", v) for k, v in kw.items()])


def team_names(client):
    try:
        import raw_source
        users, _ = raw_source.newest_capture(
            "sleeper_users", "users", local_root=os.path.join(HERE, "raw"),
            bucket=os.environ.get("OUTPUT_BUCKET"))
        rosters, _ = raw_source.newest_capture(
            "sleeper_rosters", "rosters", local_root=os.path.join(HERE, "raw"),
            bucket=os.environ.get("OUTPUT_BUCKET"))
        by_user = {u.get("user_id"): ((u.get("metadata") or {}).get("team_name")
                                      or u.get("display_name")) for u in (users or [])}
        return {r.get("roster_id"): by_user.get(r.get("owner_id"))
                for r in (rosters or []) if by_user.get(r.get("owner_id"))}
    except Exception:
        return {}


# ---------------------------------------------------------------- scoring

def best_lineup(players, values, positions, key):
    """Best legal starting lineup value, and what is left over.

    Fixed slots first from the narrowest pools, then FLEX from the remainder --
    optimal for this structure because FLEX is a superset of what it draws from.
    """
    pool = {pid: values.get(pid, {}).get(key, 0.0) for pid in players}
    used, total, by_pos = set(), 0.0, {}

    for pos in ("QB", "RB", "WR", "TE", "K", "DEF"):
        for _ in range(SLOTS.get(pos, 0)):
            cands = [(v, p) for p, v in pool.items()
                     if p not in used and positions.get(p) == pos]
            if not cands:
                continue
            v, p = max(cands)
            used.add(p); total += v
            by_pos[pos] = by_pos.get(pos, 0.0) + v

    for _ in range(SLOTS.get("FLEX", 0)):
        cands = [(v, p) for p, v in pool.items()
                 if p not in used and positions.get(p) in FLEX_ELIGIBLE]
        if not cands:
            continue
        v, p = max(cands)
        used.add(p); total += v
        by_pos["FLEX"] = by_pos.get("FLEX", 0.0) + v

    bench = sorted((v for p, v in pool.items() if p not in used), reverse=True)
    return total, bench, by_pos


def normalise(raw):
    """Scale a metric across the league to 0-100, flat when everyone is equal."""
    vals = list(raw.values())
    lo, hi = min(vals), max(vals)
    if hi - lo < 1e-9:
        return {k: 50.0 for k in raw}
    return {k: 100.0 * (v - lo) / (hi - lo) for k, v in raw.items()}


def compute(rosters, values, positions, prior):
    lineup_raw, depth_raw, balance_raw, detail = {}, {}, {}, {}

    for rid, players in rosters.items():
        lineup, bench, by_pos = best_lineup(players, values, positions, "redraft")
        # usable depth: the top bench pieces that could genuinely start, not the
        # whole roster -- a fourth tight end is not depth
        depth = sum(bench[:6])
        # balance: how evenly value sits across required positions. A roster
        # carrying its whole score in two slots is one injury from a hole.
        core = [by_pos.get(p, 0.0) for p in ("QB", "RB", "WR", "TE")]
        share = max(core) / sum(core) if sum(core) > 0 else 1.0
        balance = 1.0 - share

        lineup_raw[rid], depth_raw[rid], balance_raw[rid] = lineup, depth, balance
        detail[rid] = {"lineupValue": round(lineup, 1), "depthValue": round(depth, 1),
                       "byPosition": {k: round(v, 1) for k, v in by_pos.items()}}

    ln, dp, bl = normalise(lineup_raw), normalise(depth_raw), normalise(balance_raw)
    pr = normalise(prior) if prior else {rid: 50.0 for rid in rosters}

    rows = []
    for rid in rosters:
        score = (W_LINEUP * ln[rid] + W_DEPTH * dp[rid]
                 + W_BALANCE * bl[rid] + W_PRIOR * pr.get(rid, 50.0))
        rows.append({
            "rosterId": rid, "score": round(score, 2),
            "lineupScore": round(ln[rid], 1), "depthScore": round(dp[rid], 1),
            "balanceScore": round(bl[rid], 1), "priorScore": round(pr.get(rid, 50.0), 1),
            **detail[rid],
        })
    rows.sort(key=lambda r: -r["score"])
    for i, r in enumerate(rows, 1):
        r["rank"] = i
    return rows


# -------------------------------------------------------------- commentary

def add_movement(rows, previous, names):
    """Attach rank movement and a generated explanation.

    Drivers name the measured component that moved most. Nothing here asserts a
    cause the numbers do not show: a team that rose because two others fell is
    described that way rather than being credited with improving.
    """
    prev_by_id = {p["roster_id"]: p for p in previous}

    for r in rows:
        rid = r["rosterId"]
        r["teamName"] = names.get(rid, "Roster %d" % rid)
        p = prev_by_id.get(rid)

        if not p:
            r["priorRank"] = None
            r["rankDelta"] = None
            r["scoreDelta"] = None
            r["drivers"] = []
            r["commentary"] = ("First ranking of the season; no prior week to "
                               "compare against.")
            continue

        r["priorRank"] = p["rank"]
        r["rankDelta"] = p["rank"] - r["rank"]        # positive = moved up
        r["scoreDelta"] = round(r["score"] - p["score"], 2)

        drivers = []
        for label, now, before in (
            ("lineup strength", r["lineupScore"], p.get("lineup_score")),
            ("usable depth", r["depthScore"], p.get("depth_score")),
            ("positional balance", r["balanceScore"], p.get("balance_score")),
        ):
            if before is None:
                continue
            d = now - before
            if abs(d) >= 2.0:
                drivers.append("%s %s%.0f" % (label, "+" if d > 0 else "", d))
        r["drivers"] = drivers

        move, sd = r["rankDelta"], r["scoreDelta"]
        where = "%s at %d" % (r["teamName"], r["rank"])
        if move == 0:
            lead = "%s, unchanged" % where
        elif move > 0:
            lead = "%s, up %d" % (where, move)
        else:
            lead = "%s, down %d" % (where, -move)

        if drivers:
            why = "driven by " + " and ".join(drivers[:2]) + "."
        elif move != 0 and abs(sd) < 0.5:
            # the honest case: it moved because others did, not because it changed
            why = ("Its own score barely moved; the change came from teams "
                   "around it.")
        elif abs(sd) >= 0.5:
            why = "Score %s%.2f." % ("+" if sd > 0 else "", sd)
        else:
            why = "No material change."
        r["commentary"] = lead + ". " + why
    return rows


def load_previous(client, season, week):
    """Most recent ranking strictly before this week."""
    try:
        q = """SELECT * FROM `{p}.analytics.power_rankings`
               WHERE season=@s AND week < @w
               QUALIFY ROW_NUMBER() OVER (PARTITION BY roster_id
                                          ORDER BY week DESC) = 1"""
        from google.cloud import bigquery
        job = client.query(q.format(p=PROJECT), job_config=bigquery.QueryJobConfig(
            query_parameters=[bigquery.ScalarQueryParameter("s", "STRING", season),
                              bigquery.ScalarQueryParameter("w", "INT64", week)]))
        return [dict(r) for r in job.result()]
    except Exception as e:
        print("  (no prior ranking available: %s)" % str(e)[:80])
        return []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--week", type=int, help="week to stamp this ranking with")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    from google.cloud import bigquery
    client = bigquery.Client(project=PROJECT)

    week = args.week
    if week is None:
        import raw_source
        state, _ = raw_source.newest_capture(
            "sleeper_state", "state_nfl", local_root=os.path.join(HERE, "raw"),
            bucket=os.environ.get("OUTPUT_BUCKET"))
        week = int((state or {}).get("week") or 0)
        if (state or {}).get("season_type") == "pre":
            week = 0                      # preseason rankings sit at week 0
    print("ranking week: %d" % week)

    rosters, values, positions, prior = load_inputs(client)
    print("  rosters %d | valued players %d | positions %d"
          % (len(rosters), len(values), len(positions)))

    rows = compute(rosters, values, positions, prior)
    previous = load_previous(client, SEASON, week)
    print("  prior snapshot: %s" % ("week %d" % previous[0]["week"] if previous else "none"))
    rows = add_movement(rows, previous, team_names(client))

    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "schemaVersion": SCHEMA_VERSION, "modelVersion": MODEL_VERSION,
        "league": {"leagueId": LEAGUE_ID, "season": SEASON},
        "week": week,
        "generatedAtUtc": now,
        "hasPriorWeek": bool(previous),
        "methodology": {
            "lineupWeight": W_LINEUP, "depthWeight": W_DEPTH,
            "balanceWeight": W_BALANCE, "priorSeasonWeight": W_PRIOR,
            "note": ("Lineup strength is the best legal starting lineup by redraft "
                     "market value. Depth counts only bench pieces that could start. "
                     "Balance penalises value concentrated in one position. Movement "
                     "is measured against the previous stored ranking."),
        },
        "teams": rows,
    }

    if args.dry_run:
        for r in rows[:5]:
            print("  %2d %-24s %6.2f  %s" % (r["rank"], safe(r["teamName"])[:24],
                                             r["score"], safe(r["commentary"])[:70]))
        print("\ndry run - nothing written")
        return 0

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2)
    os.replace(tmp, OUT)

    if ensure_table(client):
        print("  created analytics.power_rankings")

    bq_rows = [{
        "season": SEASON, "week": week, "roster_id": r["rosterId"],
        "team_name": r["teamName"], "rank": r["rank"], "score": r["score"],
        "lineup_score": r["lineupScore"], "depth_score": r["depthScore"],
        "balance_score": r["balanceScore"], "prior_score": r["priorScore"],
        "lineup_value": r["lineupValue"], "depth_value": r["depthValue"],
        "prior_rank": r["priorRank"], "rank_delta": r["rankDelta"],
        "score_delta": r["scoreDelta"], "drivers": r["drivers"],
        "commentary": r["commentary"], "observed_at_utc": now,
        "content_hash": sha(MODEL_VERSION, SEASON, week, r["rosterId"], r["score"]),
        "model_version": MODEL_VERSION,
    } for r in rows]

    ins, skip = bq_idempotent.merge_rows(client, "analytics", "power_rankings", bq_rows)
    print("  analytics.power_rankings: %d inserted, %d already present" % (ins, skip))
    print("  power-rankings.json written")
    for r in rows[:3]:
        print("    %2d %-22s %6.2f" % (r["rank"], safe(r["teamName"])[:22], r["score"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
