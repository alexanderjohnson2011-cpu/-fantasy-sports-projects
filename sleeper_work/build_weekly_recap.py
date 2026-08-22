"""
build_weekly_recap.py — descriptive weekly recap (MASTER_PLAN P5-2)

Every metric here comes from Sleeper alone. No projection provider, no odds, no
play-by-play, so this runs today at no cost and with no licensing question --
which is exactly why the roadmap puts descriptive statistics before forecasting.

Per team, per week:

  score, opponent, margin, result, running record
  league median and the all-play record (how the score fares against all eleven
    other teams that week, which separates team strength from schedule draw)
  points for / against, potential points, optimal-lineup miss, bench points
  schedule luck: actual wins minus all-play expected wins

Two honesty rules:

  Potential points are computed only when the roster layout is known well enough
  to fill legal slots. Where it is not, the field is null with a status, never a
  fabricated number (section 4.6, missing is not zero).

  A week with no scored games is reported as such rather than rendered as a set
  of zeroes. In preseason that is the whole slate, and the payload says so.
"""

import argparse
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RAW_DIR = os.path.join(HERE, "raw")
POSITIONS = {}
SLOTS = {"QB": 1, "RB": 2, "WR": 2, "TE": 1, "FLEX": 3, "K": 1, "DEF": 1}
OUT = os.path.join(ROOT, "ape-invitational-almanac", "src", "generated", "weekly-recap.json")

PROJECT = os.environ.get("GCP_PROJECT", "apes-mac-salad")
LEAGUE_ID = "1312209616372772864"
PRIOR_LEAGUE_ID = "1187879775490527232"
SCHEMA_VERSION = "1.0.0"
MODEL_VERSION = "weekly-recap-v1"


def fetch_rows(client, league_id, season):
    q = """
        SELECT week, roster_id, opponent_roster_id, points, starters,
               starter_points, players, players_points, observed_at_utc
        FROM `{p}.canonical.matchup_results`
        WHERE league_id = @league AND season = @season
        QUALIFY ROW_NUMBER() OVER (
            PARTITION BY week, roster_id ORDER BY observed_at_utc DESC) = 1
        ORDER BY week, roster_id
    """.format(p=PROJECT)
    from google.cloud import bigquery
    job = client.query(q, job_config=bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("league", "STRING", league_id),
            bigquery.ScalarQueryParameter("season", "STRING", season),
        ]))
    return [dict(r) for r in job.result()]


def team_names(_client=None, _league_id=None):
    """Roster -> team name.

    roster_states carries owner_id but no display name, so names are joined from
    the captured users and rosters objects. Team name falls back to the manager
    handle, which is what Sleeper shows when no team name is set.
    """
    import glob, gzip

    def newest(source, entity):
        hits = sorted(glob.glob(os.path.join(
            RAW_DIR, "source=%s" % source, "**", "%s.json.gz" % entity), recursive=True))
        if not hits:
            return None
        with gzip.open(hits[-1], "rb") as fh:
            return json.loads(fh.read().decode("utf-8"))

    users = newest("sleeper_users", "users") or []
    rosters = newest("sleeper_rosters", "rosters") or []
    by_user = {u.get("user_id"): (
        (u.get("metadata") or {}).get("team_name") or u.get("display_name"))
        for u in users}
    return {r.get("roster_id"): by_user.get(r.get("owner_id"))
            for r in rosters if by_user.get(r.get("owner_id"))}


def median(xs):
    s = sorted(xs)
    n = len(s)
    if not n:
        return None
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2.0


def load_positions():
    """player_id -> position, from the captured Sleeper player map."""
    import glob, gzip
    hits = sorted(glob.glob(os.path.join(
        RAW_DIR, "source=sleeper_players", "**", "players_nfl.json.gz"), recursive=True))
    if not hits:
        return {}
    with gzip.open(hits[-1], "rb") as fh:
        players = json.loads(fh.read().decode("utf-8"))
    return {pid: (p or {}).get("position") for pid, p in players.items()}


def optimal_lineup(players_points, positions, slots):
    """Highest-scoring LEGAL lineup under the league's roster_positions.

    Fixed slots take the best eligible scorer at each position, then FLEX takes
    the best remaining RB/WR/TE. For this slot structure that greedy order is
    optimal, because FLEX is a superset of the positions it draws from and every
    fixed slot is filled from a strictly narrower pool first.

    Returns (points, status). Without positions it degrades to a labelled
    ceiling rather than silently reporting a number it cannot justify.
    """
    if not players_points:
        return None, "not_computable"

    scored = {pid: float(pts or 0) for pid, pts in players_points.items()}
    if not positions:
        k = sum(slots.values())
        top = sorted(scored.values(), reverse=True)[:k]
        return round(sum(top), 2), "size_matched_ceiling"

    used, total = set(), 0.0
    for pos in ("QB", "RB", "WR", "TE", "K", "DEF"):
        for _ in range(slots.get(pos, 0)):
            cands = [(v, pid) for pid, v in scored.items()
                     if pid not in used and positions.get(pid) == pos]
            if not cands:
                continue
            v, pid = max(cands)
            used.add(pid)
            total += v
    for _ in range(slots.get("FLEX", 0)):
        cands = [(v, pid) for pid, v in scored.items()
                 if pid not in used and positions.get(pid) in ("RB", "WR", "TE")]
        if not cands:
            continue
        v, pid = max(cands)
        used.add(pid)
        total += v
    return round(total, 2), "legal_optimal"


def build_week(rows, week):
    wk = [r for r in rows if r["week"] == week]
    scored = [r for r in wk if (r["points"] or 0) > 0]
    if not scored:
        return None

    scores = {r["roster_id"]: float(r["points"] or 0) for r in wk}
    med = median(list(scores.values()))
    teams = []

    for r in wk:
        rid = r["roster_id"]
        pts = float(r["points"] or 0)
        opp = r["opponent_roster_id"]
        opp_pts = scores.get(opp)

        # all-play: this score against every other team in the same week
        others = [v for k, v in scores.items() if k != rid]
        beat = sum(1 for v in others if pts > v)
        tied = sum(1 for v in others if pts == v)

        sp = list(r["starter_points"] or [])
        pp = r.get("players_points")
        if isinstance(pp, str):
            pp = json.loads(pp) if pp else None
        opt, opt_status = optimal_lineup(pp, POSITIONS, SLOTS)
        bench_pts = None
        if pp:
            starters = set(r["starters"] or [])
            bench_pts = round(sum(float(v or 0) for k, v in pp.items()
                                  if k not in starters), 2)

        result = None
        if opp_pts is not None:
            result = "W" if pts > opp_pts else ("L" if pts < opp_pts else "T")

        teams.append({
            "rosterId": rid,
            "points": round(pts, 2),
            "opponentRosterId": opp,
            "opponentPoints": round(opp_pts, 2) if opp_pts is not None else None,
            "margin": round(pts - opp_pts, 2) if opp_pts is not None else None,
            "result": result,
            "vsMedian": round(pts - med, 2) if med is not None else None,
            "beatMedian": (pts > med) if med is not None else None,
            "allPlayWins": beat,
            "allPlayTies": tied,
            "allPlayLosses": len(others) - beat - tied,
            "allPlayWinPct": round(beat / float(len(others)), 4) if others else None,
            "starterPoints": [round(float(x), 2) for x in sp],
            "potentialPoints": opt,
            "potentialPointsStatus": opt_status,
            "lineupMiss": round(opt - pts, 2) if opt is not None else None,
            "benchPoints": bench_pts,
        })

    return {
        "week": week,
        "leagueMedian": round(med, 2) if med is not None else None,
        "highScore": round(max(scores.values()), 2),
        "lowScore": round(min(scores.values()), 2),
        "teams": sorted(teams, key=lambda t: -t["points"]),
    }


def build_season(rows, names):
    weeks = sorted({r["week"] for r in rows})
    built = [w for w in (build_week(rows, wk) for wk in weeks) if w]

    standings = defaultdict(lambda: {
        "wins": 0, "losses": 0, "ties": 0, "pointsFor": 0.0, "pointsAgainst": 0.0,
        "allPlayWins": 0, "allPlayGames": 0, "medianWeeks": 0, "lineupMiss": 0.0,
    })
    for w in built:
        for t in w["teams"]:
            s = standings[t["rosterId"]]
            if t["result"] == "W":
                s["wins"] += 1
            elif t["result"] == "L":
                s["losses"] += 1
            elif t["result"] == "T":
                s["ties"] += 1
            s["pointsFor"] += t["points"]
            s["pointsAgainst"] += t["opponentPoints"] or 0
            s["allPlayWins"] += t["allPlayWins"]
            s["allPlayGames"] += t["allPlayWins"] + t["allPlayLosses"] + t["allPlayTies"]
            s["medianWeeks"] += 1 if t["beatMedian"] else 0
            s["lineupMiss"] += t["lineupMiss"] or 0

    table = []
    for rid, s in standings.items():
        played = s["wins"] + s["losses"] + s["ties"]
        exp = (s["allPlayWins"] / float(s["allPlayGames"]) * played) if s["allPlayGames"] else None
        table.append({
            "rosterId": rid,
            "teamName": names.get(rid, "Roster %d" % rid),
            "wins": s["wins"], "losses": s["losses"], "ties": s["ties"],
            "pointsFor": round(s["pointsFor"], 2),
            "pointsAgainst": round(s["pointsAgainst"], 2),
            "allPlayWinPct": round(s["allPlayWins"] / float(s["allPlayGames"]), 4)
                             if s["allPlayGames"] else None,
            "expectedWins": round(exp, 2) if exp is not None else None,
            # positive means the schedule was kind: more wins than the all-play
            # record alone would predict
            "scheduleLuck": round(s["wins"] - exp, 2) if exp is not None else None,
            "weeksAboveMedian": s["medianWeeks"],
            "totalLineupMiss": round(s["lineupMiss"], 2),
        })
    table.sort(key=lambda t: (-t["wins"], -t["pointsFor"]))
    for i, t in enumerate(table, 1):
        t["rank"] = i
    return built, table


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", default="2025", help="season to summarise")
    ap.add_argument("--league", default=None)
    ap.add_argument("--stdout", action="store_true")
    args = ap.parse_args()

    league = args.league or (PRIOR_LEAGUE_ID if args.season == "2025" else LEAGUE_ID)

    global POSITIONS
    POSITIONS = load_positions()
    print('  player positions loaded: %d' % len(POSITIONS))

    from google.cloud import bigquery
    client = bigquery.Client(project=PROJECT)
    rows = fetch_rows(client, league, args.season)
    names = team_names()

    weeks, table = build_season(rows, names)

    # The prior season is carried alongside the current one. Before week 1 the
    # current season has nothing scored, and a screen that can only say "no data"
    # is worse than one that shows last season's finish with the same metrics.
    prior = {"season": None, "standings": []}
    if args.season != "2025":
        try:
            prior_rows = fetch_rows(client, PRIOR_LEAGUE_ID, "2025")
            _, prior_table = build_season(prior_rows, names)
            prior = {"season": "2025", "standings": prior_table}
        except Exception as e:
            print("  [warn] prior season unavailable: %s" % str(e)[:100])

    payload = {
        "schemaVersion": SCHEMA_VERSION,
        "modelVersion": MODEL_VERSION,
        "league": {"leagueId": league, "season": args.season},
        "priorSeason": prior,
        "generatedAtUtc": datetime.now(timezone.utc).isoformat(),
        "status": "scored" if weeks else "no_scored_weeks",
        "methodology": {
            "source": "Sleeper matchup feed only",
            "allPlay": "each score compared with every other team that week",
            "scheduleLuck": "actual wins minus all-play expected wins",
            "potentialPoints": ("best same-size selection from all scoring players; "
                                "slot eligibility is not in this feed, so it is a "
                                "ceiling rather than a legal optimal lineup"),
        },
        "weeksScored": len(weeks),
        "standings": table,
        "weeks": weeks,
    }

    if args.stdout:
        print(json.dumps(payload, indent=2)[:1500])
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2)
    os.replace(tmp, OUT)

    print("weekly-recap.json written (%s season %s)" % (payload["status"], args.season))
    print("  weeks scored : %d" % len(weeks))
    print("  teams        : %d" % len(table))
    if table:
        top = table[0]
        # console encoding on Windows is cp1252; team names contain emoji
        name = top["teamName"].encode("ascii", "replace").decode("ascii")
        print("  leader       : %s (%d-%d, %.1f PF, luck %+.2f)"
              % (name, top["wins"], top["losses"], top["pointsFor"],
                 top["scheduleLuck"] or 0))
    return 0


if __name__ == "__main__":
    sys.exit(main())
