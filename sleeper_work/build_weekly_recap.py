"""
build_weekly_recap.py — Descriptive weekly matchup recap & AI commentary engine.
Similar to RosterAudit.com:
- Weekly editorial commentary & macro storyline
- Superlatives: Nailbiter, Shootout, Blowout, High Roller, Tough Break, Manager of the Week
- Game-by-game recap cards with head-to-head AI narrative
- Starters & bench box scores with lineup efficiency
- Running standings, all-play records, and schedule luck
- Dual data source: BigQuery canonical layer with fail-safe direct Sleeper API fallback
"""

import argparse
import json
import os
import sys
import random
from collections import defaultdict
from datetime import datetime, timezone
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
# Check root directories
CANDIDATE_ROOTS = [
    HERE,
    os.path.dirname(HERE),
    os.path.dirname(os.path.dirname(HERE)),
    os.path.dirname(os.path.dirname(os.path.dirname(HERE))),
]

RAW_DIR = os.path.join(HERE, "raw")
LEAGUE_ID = os.environ.get("SLEEPER_LEAGUE_ID", "1312209616372772864")
PRIOR_LEAGUE_ID = os.environ.get("SLEEPER_PRIOR_LEAGUE_ID", "1187879775490527232")
PROJECT = os.environ.get("GCP_PROJECT", "apes-mac-salad")
SEASON = os.environ.get("NFL_SEASON", "2026")
SCHEMA_VERSION = "2.0.0"
MODEL_VERSION = "weekly-recap-v2"

# Roster layout for Ape's Mac Salad: 1 QB, 2 RB, 2 WR, 1 TE, 3 FLEX, 1 K, 1 DEF
SLOTS = {"QB": 1, "RB": 2, "WR": 2, "TE": 1, "FLEX": 3, "K": 1, "DEF": 1}

# Locate output directory
OUT = None
for r in CANDIDATE_ROOTS:
    gen_dir = os.path.join(r, "src", "generated")
    if os.path.exists(os.path.join(r, "src")):
        OUT = os.path.join(gen_dir, "weekly-recap.json")
        break
    almanac_gen = os.path.join(r, "ape-invitational-almanac", "src", "generated")
    if os.path.exists(os.path.join(r, "ape-invitational-almanac", "src")):
        OUT = os.path.join(almanac_gen, "weekly-recap.json")
        break
if not OUT:
    OUT = os.path.join(HERE, "output", "weekly-recap.json")

# Candidate service account keys
if "GOOGLE_APPLICATION_CREDENTIALS" not in os.environ:
    for cr in CANDIDATE_ROOTS:
        for fname in ["ams-pipeline-key.json", "apes-mac-salad-0d52b5a00417.json"]:
            cand = os.path.join(cr, fname)
            if os.path.exists(cand):
                os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = cand
                break
        if "GOOGLE_APPLICATION_CREDENTIALS" in os.environ:
            break


def load_players_map():
    """Load player metadata: id -> {name, position, team}."""
    for cr in CANDIDATE_ROOTS:
        for sub in [
            os.path.join(cr, "sleeper_work", "raw", "players.json"),
            os.path.join(cr, "raw", "players.json"),
        ]:
            if os.path.exists(sub):
                with open(sub, "r", encoding="utf-8") as f:
                    raw = json.load(f)
                    return {
                        pid: {
                            "name": p.get("full_name") or f"{p.get('first_name', '')} {p.get('last_name', '')}".strip() or f"Player {pid}",
                            "position": p.get("position") or "FLEX",
                            "team": p.get("team") or "FA",
                        }
                        for pid, p in raw.items()
                    }
    return {}


def fetch_sleeper_json(endpoint):
    url = f"https://api.sleeper.app/v1/{endpoint.lstrip('/')}"
    req = urllib.request.Request(url, headers={"User-Agent": "ApesMacSalad/2.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_league_metadata(league_id):
    """Fetch user display names and team names from Sleeper."""
    try:
        users = fetch_sleeper_json(f"league/{league_id}/users")
        rosters = fetch_sleeper_json(f"league/{league_id}/rosters")
        user_by_id = {
            u["user_id"]: {
                "displayName": u.get("display_name", f"User {u['user_id']}"),
                "teamName": (u.get("metadata") or {}).get("team_name") or u.get("display_name", f"Team {u['user_id']}"),
                "avatar": u.get("avatar"),
            }
            for u in users
        }
        team_info = {}
        for r in rosters:
            rid = r["roster_id"]
            oid = r.get("owner_id")
            meta = user_by_id.get(oid, {})
            team_info[rid] = {
                "teamName": meta.get("teamName", f"Team {rid}"),
                "manager": meta.get("displayName", f"Manager {rid}"),
                "avatar": meta.get("avatar"),
            }
        return team_info
    except Exception as e:
        print(f"  [warn] fetch_league_metadata error: {e}")
        return {}


def fetch_matchups_for_week(league_id, week, season="2026"):
    """Fetch matchups from Sleeper directly or BigQuery canonical."""
    # First attempt Sleeper public API for live freshest data
    try:
        data = fetch_sleeper_json(f"league/{league_id}/matchups/{week}")
        if data and isinstance(data, list) and any((m.get("points") or 0) > 0 for m in data):
            return data
    except Exception as e:
        print(f"  [info] Sleeper direct fetch for week {week}: {e}")

    # Fallback to BigQuery canonical
    try:
        from google.cloud import bigquery
        client = bigquery.Client(project=PROJECT)
        q = f"""
            SELECT week, roster_id, opponent_roster_id, points, starters,
                   starter_points, players, players_points, observed_at_utc
            FROM `{PROJECT}.canonical.matchup_results`
            WHERE league_id = @league AND season = @season AND week = @week
            QUALIFY ROW_NUMBER() OVER (
                PARTITION BY week, roster_id ORDER BY observed_at_utc DESC) = 1
            ORDER BY roster_id
        """
        job = client.query(q, job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("league", "STRING", str(league_id)),
                bigquery.ScalarQueryParameter("season", "STRING", str(season)),
                bigquery.ScalarQueryParameter("week", "INT64", int(week)),
            ]))
        rows = [dict(r) for r in job.result()]
        if rows:
            formatted = []
            for r in rows:
                pp = r.get("players_points")
                if isinstance(pp, str):
                    pp = json.loads(pp)
                formatted.append({
                    "roster_id": r["roster_id"],
                    "matchup_id": r.get("opponent_roster_id") or r["roster_id"],
                    "points": r["points"],
                    "starters": r.get("starters") or [],
                    "starters_points": r.get("starter_points") or [],
                    "players": r.get("players") or [],
                    "players_points": pp or {},
                })
            return formatted
    except Exception as e:
        print(f"  [info] BQ fetch error: {e}")

    return []


def optimal_lineup(players_points, players_map, slots):
    """Computes legal optimal lineup under slots."""
    if not players_points:
        return 0.0, "not_computable"
    scored = {str(pid): float(pts or 0.0) for pid, pts in players_points.items()}
    used = set()
    total = 0.0

    for pos in ("QB", "RB", "WR", "TE", "K", "DEF"):
        req = slots.get(pos, 0)
        for _ in range(req):
            candidates = [
                (pts, pid) for pid, pts in scored.items()
                if pid not in used and players_map.get(pid, {}).get("position") == pos
            ]
            if candidates:
                best_pts, best_pid = max(candidates)
                used.add(best_pid)
                total += best_pts

    # FLEX slots (RB, WR, TE)
    for _ in range(slots.get("FLEX", 0)):
        candidates = [
            (pts, pid) for pid, pts in scored.items()
            if pid not in used and players_map.get(pid, {}).get("position") in ("RB", "WR", "TE")
        ]
        if candidates:
            best_pts, best_pid = max(candidates)
            used.add(best_pid)
            total += best_pts

    return round(total, 2), "legal_optimal"


def fetch_nfl_stats(season="2026", week=1):
    """Fetches real NFL box score statistics from Sleeper for the specified week."""
    try:
        url = f"https://api.sleeper.app/v1/stats/nfl/regular/{season}/{week}"
        req = urllib.request.Request(url, headers={"User-Agent": "ApesMacSalad/2.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if isinstance(data, dict):
                return data
    except Exception as e:
        print(f"  [warn] Could not fetch real NFL stats for {season} W{week}: {e}")
    return {}


def format_player_box_stat(pid, name, pos, pts, nfl_stats, p_meta):
    """Formats player stats into real box score line (yards, TDs, catches, targets, injuries)."""
    st = nfl_stats.get(str(pid), {}) if nfl_stats else {}
    details = []
    pass_yd = int(st.get("pass_yd") or 0)
    pass_td = int(st.get("pass_td") or 0)
    pass_int = int(st.get("pass_int") or 0)
    rush_yd = int(st.get("rush_yd") or 0)
    rush_td = int(st.get("rush_td") or 0)
    rush_att = int(st.get("rush_att") or 0)
    rec = int(st.get("rec") or 0)
    rec_yd = int(st.get("rec_yd") or 0)
    rec_td = int(st.get("rec_td") or 0)
    rec_tgt = int(st.get("rec_tgt") or 0)
    fgm = st.get("fgm")
    fga = st.get("fga")
    injury = p_meta.get("injury_status") or p_meta.get("injury_notes") or ""

    if pass_yd or pass_td:
        p_str = f"{pass_yd} pass yds, {pass_td} TD"
        if pass_int:
            p_str += f", {pass_int} INT"
        details.append(p_str)
    if rush_yd or rush_td:
        r_str = f"{rush_yd} rush yds"
        if rush_att:
            r_str += f" on {rush_att} carries"
        if rush_td:
            r_str += f", {rush_td} TD"
        details.append(r_str)
    if rec or rec_tgt or rec_td:
        if rec == 0 and rec_tgt > 0:
            details.append(f"0 catches on {rec_tgt} tgts")
        else:
            rc_str = f"{rec} rec for {rec_yd} yds"
            if rec_td:
                rc_str += f", {rec_td} TD"
            details.append(rc_str)
    if fgm is not None and fga is not None and (fgm > 0 or fga > 0):
        details.append(f"{int(fgm)}/{int(fga)} FG")

    box_summary = "; ".join(details) if details else f"{pts:.1f} pts"
    return {
        "name": name,
        "pos": pos,
        "pts": pts,
        "box_summary": box_summary,
        "pass_td": pass_td,
        "rush_td": rush_td,
        "rec_td": rec_td,
        "total_td": pass_td + rush_td + rec_td,
        "pass_yd": pass_yd,
        "rush_yd": rush_yd,
        "rec_yd": rec_yd,
        "rec": rec,
        "pass_int": pass_int,
        "injury": injury,
        "is_goose_egg": pts <= 0.5,
    }


def call_gemini_api(prompt, api_key=None, model="gemini-1.5-flash"):
    """Calls Google Gemini API for bespoke journalistic fantasy commentary if API key is provided."""
    key = api_key or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        return None
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.85,
            "maxOutputTokens": 320
        }
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            candidate = data.get("candidates", [{}])[0]
            content = candidate.get("content", {}).get("parts", [{}])[0].get("text", "")
            if content:
                # Strip wrapping quotes or markdown bold headers if any
                clean = content.strip().strip('"').strip("'")
                return clean
    except Exception as e:
        print(f"  [info] Gemini API call skipped/fallback: {e}")
    return None


def generate_expressive_commentary(winner, loser, margin, is_shootout, is_nailbiter, is_blowout, week, nfl_stats=None, players_map=None):
    """Generates varied, expressive editorial commentary sourcing real NFL box scores, game events, and news."""
    nfl_stats = nfl_stats or {}
    players_map = players_map or {}

    w_starters = [
        format_player_box_stat(p["playerId"], p["name"], p["position"], p["points"], nfl_stats, players_map.get(str(p["playerId"]), {}))
        for p in winner.get("starters", [])
    ]
    l_starters = [
        format_player_box_stat(p["playerId"], p["name"], p["position"], p["points"], nfl_stats, players_map.get(str(p["playerId"]), {}))
        for p in loser.get("starters", [])
    ]

    star_w = max(w_starters, key=lambda p: p["pts"]) if w_starters else None
    star_l = max(l_starters, key=lambda p: p["pts"]) if l_starters else None
    dud_l = min(l_starters, key=lambda p: p["pts"]) if l_starters else None

    # Deterministic yet diverse pseudo-random seed per matchup
    seed_val = int(winner["points"] * 100 + loser["points"] * 10)
    rng = random.Random(seed_val)

    # 1. Opening Hook based on archetype
    openers_shootout = [
        f"In an electrifying {winner['points'] + loser['points']:.2f}-point shootout, {winner['teamName']} outslugged {loser['teamName']} in a breathtaking Week {week} showcase.",
        f"Pure offensive pyrotechnics defined this contest as {winner['teamName']} and {loser['teamName']} traded haymakers in a wild {winner['points'] + loser['points']:.2f}-point offensive spectacle.",
        f"Fantasy fireworks erupted as {winner['teamName']} held off a furious push from {loser['teamName']} in a {winner['points'] + loser['points']:.2f}-point heavyweight collision."
    ]
    openers_nailbiter = [
        f"{winner['teamName']} survived an absolute heart-stopper, edging {loser['teamName']} by a razor-thin {margin:.2f} points ({winner['points']:.2f} – {loser['points']:.2f}) in a wire-to-wire thriller.",
        f"Down to the final whistle: {winner['teamName']} fended off a relentless comeback by {loser['teamName']} to seal a nail-biting {margin:.2f}-point triumph ({winner['points']:.2f} – {loser['points']:.2f}).",
        f"A game of inches and late-game sweat: {winner['teamName']} hung on for dear life, turning back {loser['teamName']} by just {margin:.2f} points in Week {week}'s closest finish."
    ]
    openers_blowout = [
        f"{winner['teamName']} staged a ruthless Week {week} clinic, blowing past {loser['teamName']} in a commanding {margin:.2f}-point demolition ({winner['points']:.2f} – {loser['points']:.2f}).",
        f"Total domination from the opening snap: {winner['teamName']} steamrolled {loser['teamName']} by {margin:.2f} points in the slate's most lopsided affair ({winner['points']:.2f} – {loser['points']:.2f}).",
        f"A thorough, one-sided beatdown: {winner['teamName']} fired on all cylinders while dismantling {loser['teamName']} in an emphatic {margin:.2f}-point rout."
    ]
    openers_standard = [
        f"{winner['teamName']} established firm control in Week {week}, defeating {loser['teamName']} {winner['points']:.2f} to {loser['points']:.2f}.",
        f"Methodical execution propelled {winner['teamName']} to victory over {loser['teamName']} ({winner['points']:.2f} – {loser['points']:.2f}).",
        f"{winner['teamName']} notched a well-earned Week {week} victory, turning away {loser['teamName']} by {margin:.2f} points."
    ]

    if is_shootout:
        p1 = rng.choice(openers_shootout)
    elif is_nailbiter:
        p1 = rng.choice(openers_nailbiter)
    elif is_blowout:
        p1 = rng.choice(openers_blowout)
    else:
        p1 = rng.choice(openers_standard)

    # 2. Winner Star Performer highlighting real NFL stats
    w_star_phrases = []
    if star_w:
        if star_w["total_td"] >= 3:
            w_star_phrases = [
                f"{star_w['name']} put on an absolute clinic, finding paydirt {star_w['total_td']} times ({star_w['box_summary']}) to rack up a monstrous {star_w['pts']:.2f} points.",
                f"The driving force was a vintage {star_w['name']} masterclass, as he erupted for {star_w['total_td']} touchdowns ({star_w['box_summary']}) and {star_w['pts']:.2f} points.",
            ]
        elif star_w["pos"] == "QB" and star_w["pass_yd"] >= 300:
            w_star_phrases = [
                f"{star_w['name']} shredded opposing coverage through the air, carving out {star_w['box_summary']} ({star_w['pts']:.2f} pts) in a commanding aerial showcase.",
                f"Under center, {star_w['name']} was nearly flawless, dropping dimes all afternoon for {star_w['box_summary']} to lead the charge.",
            ]
        elif star_w["total_td"] >= 2:
            w_star_phrases = [
                f"{star_w['name']} provided the decisive spark, hitting the end zone twice as part of a {star_w['box_summary']} ({star_w['pts']:.2f} pts) performance.",
                f"{winner['teamName']} rode an explosive outing from {star_w['name']}, who logged two touchdowns ({star_w['box_summary']}) to establish early separation.",
            ]
        else:
            w_star_phrases = [
                f"Leading the charge was {star_w['name']}, who piled up {star_w['box_summary']} on his way to a team-high {star_w['pts']:.2f} points.",
                f"{star_w['name']} provided the offensive anchor, pacing the squad with {star_w['box_summary']} ({star_w['pts']:.2f} pts).",
            ]
    p2 = rng.choice(w_star_phrases) if w_star_phrases else ""

    # 3. Loser Star & Dud / Injury Context
    p3_parts = []
    if star_l:
        p3_parts.append(f"{loser['teamName']} countered behind {star_l['name']}'s valiant {star_l['box_summary']} ({star_l['pts']:.2f} pts)")

    if dud_l and dud_l["pts"] < 5.0:
        if dud_l["is_goose_egg"]:
            p3_parts.append(f"but were doomed by a disastrous goose egg from {dud_l['name']} ({dud_l['box_summary']})")
        elif dud_l["injury"]:
            p3_parts.append(f"but couldn't overcome an injury-limited showing from {dud_l['name']} ({dud_l['box_summary']}, battling {dud_l['injury']})")
        elif dud_l["pass_int"] >= 2:
            p3_parts.append(f"but were severely undermined by {dud_l['name']}'s {dud_l['pass_int']} costly turnovers ({dud_l['box_summary']})")
        else:
            p3_parts.append(f"but a quiet outing from {dud_l['name']} ({dud_l['box_summary']}) severely capped their comeback bid")

    p3 = ", ".join(p3_parts) + "." if p3_parts else ""

    # 4. Tactical Bench / Lineup Analysis (NEVER "bittersweet" or "points on the pine")
    p4 = ""
    loser_bench = loser.get("benchPoints", 0.0)
    if is_nailbiter and loser_bench > margin:
        bench_lines = [
            f"Managerial second-guessing will sting all week for {loser['teamName']}: leaving {loser_bench:.1f} bench points unplayed cost them a matchup decided by mere single digits.",
            f"An agonizing Sunday in the coach's box for {loser['teamName']}, who watched {loser_bench:.1f} unused points pile up on the sidelines while falling by just {margin:.2f}.",
        ]
        p4 = rng.choice(bench_lines)
    elif loser_bench > 60.0:
        bench_lines = [
            f"{loser['teamName']} had plenty of reserve ammunition with {loser_bench:.1f} bench points, but optimal roster deployment remained elusive.",
            f"While {loser['teamName']}'s sideline reserves generated {loser_bench:.1f} points, the active starting lineup couldn't find the necessary rhythm.",
        ]
        p4 = rng.choice(bench_lines)
    elif winner.get("lineupEfficiency", 0) >= 95.0:
        p4 = f"Managerial execution was razor-sharp for {winner['teamName']}, capturing a sterling {winner['lineupEfficiency']:.1f}% of their roster's maximum scoring capacity."

    full_commentary = " ".join([p for p in [p1, p2, p3, p4] if p])
    return full_commentary


def generate_matchup_commentary(team1, team2, margin, upset, shootout, nailbiter, blowout, week=1, nfl_stats=None, players_map=None):
    """Generates rich AI editorial commentary for each head to head match, supporting Gemini and real box scores."""
    winner = team1 if team1["points"] >= team2["points"] else team2
    loser = team2 if winner == team1 else team1

    # Attempt Gemini API first if key configured
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if key:
        w_stars = [f"{p['name']} ({p['position']}): {p['points']} pts" for p in winner.get("starters", [])[:3]]
        l_stars = [f"{p['name']} ({p['position']}): {p['points']} pts" for p in loser.get("starters", [])[:3]]
        gemini_prompt = (
            f"You are a sharp, witty fantasy football journalist for a high-stakes league. "
            f"Write a 3-4 sentence recap of this Week {week} fantasy matchup.\n"
            f"Winner: {winner['teamName']} ({winner['points']:.2f} pts)\n"
            f"Loser: {loser['teamName']} ({loser['points']:.2f} pts)\n"
            f"Margin: {margin:.2f} pts ({'Shootout' if shootout else 'Nailbiter' if nailbiter else 'Blowout' if blowout else 'Standard'})\n"
            f"Winner key starters: {', '.join(w_stars)}\n"
            f"Loser key starters: {', '.join(l_stars)}\n"
            f"Winner bench: {winner.get('benchPoints', 0):.1f} pts ({winner.get('lineupEfficiency', 0):.1f}% efficiency)\n"
            f"Loser bench: {loser.get('benchPoints', 0):.1f} pts ({loser.get('lineupEfficiency', 0):.1f}% efficiency)\n"
            f"Instructions: Highlight real NFL game events (TD catches, rushing touchdowns, turnovers, injury limitations). "
            f"Critique coaching decisions without clichés. DO NOT use 'bittersweet', 'points on the pine', 'offensive catalyst', or 'exploded for'. "
            f"Keep it engaging, analytical, and under 90 words."
        )
        gemini_result = call_gemini_api(gemini_prompt, key)
        if gemini_result and len(gemini_result) > 50:
            return gemini_result

    # Expressive multi-archetype generator with real box scores
    return generate_expressive_commentary(
        winner, loser, margin, shootout, nailbiter, blowout, week, nfl_stats, players_map
    )


def build_weekly_recap_payload(season="2026", league_id=LEAGUE_ID):
    print(f"=== Building RosterAudit-Style Weekly Recap for {season} (League {league_id}) ===")
    players_map = load_players_map()
    print(f"  Loaded {len(players_map)} player profiles.")

    team_info = fetch_league_metadata(league_id)
    if not team_info:
        # Fallback names
        team_info = {
            1: {"teamName": "Ertz & Krafts 🏆", "manager": "jccbraves99"},
            2: {"teamName": "2 Dagos and A Dream", "manager": "sduda351"},
            3: {"teamName": "The Ape", "manager": "kong58"},
            4: {"teamName": "Bub’s Club", "manager": "bubberdubber"},
            5: {"teamName": "My Nabers Tetties", "manager": "mannyrsox24"},
            6: {"teamName": "Final Boss", "manager": "DRockefeller"},
            7: {"teamName": "Gridiron geezers", "manager": "mdwelch11"},
            8: {"teamName": "arkinsjt", "manager": "arkinsjt"},
            9: {"teamName": "Max’s Shadynasty", "manager": "maxjabb"},
            10: {"teamName": "Bijan And The Maye-ssiah", "manager": "akwelch3492"},
            11: {"teamName": "Terry Tate’s Pain Train", "manager": "mtrebing31"},
            12: {"teamName": "Bronco Stampede", "manager": "rLee3D"},
        }

    # Discover scored weeks (1..14)
    scored_weeks_data = []
    standings_accum = defaultdict(lambda: {
        "wins": 0, "losses": 0, "ties": 0, "pointsFor": 0.0, "pointsAgainst": 0.0,
        "allPlayWins": 0, "allPlayLosses": 0, "allPlayTies": 0,
        "weeksAboveMedian": 0, "totalLineupMiss": 0.0,
    })

    try:
        nfl_state = fetch_sleeper_json("state/nfl")
        active_nfl_week = int(nfl_state.get("week") or 1)
    except Exception:
        active_nfl_week = 1

    max_check_week = min(14, max(1, active_nfl_week))
    for w in range(1, max_check_week + 1):
        raw_m = fetch_matchups_for_week(league_id, w, season)
        if not raw_m or not any((m.get("points") or 0) > 0 for m in raw_m):
            continue

        nfl_stats = fetch_nfl_stats(season, w)
        print(f"  Processing scored Week {w} ({len(raw_m)} roster entries, {len(nfl_stats)} NFL player stats loaded)...")

        # Group into pairs by matchup_id
        pairs = {}
        for item in raw_m:
            mid = item.get("matchup_id")
            if mid is not None:
                pairs.setdefault(mid, []).append(item)

        scores_by_roster = {m["roster_id"]: float(m.get("points") or 0.0) for m in raw_m}
        scores_list = sorted(scores_by_roster.values())
        med_score = scores_list[len(scores_list) // 2] if scores_list else 0.0

        matchup_cards = []
        for mid, pair in sorted(pairs.items()):
            if len(pair) != 2:
                continue
            r1, r2 = pair[0], pair[1]
            rid1, rid2 = r1["roster_id"], r2["roster_id"]
            pts1, pts2 = float(r1.get("points") or 0.0), float(r2.get("points") or 0.0)

            # Build starters
            starters1 = []
            for idx, pid in enumerate(r1.get("starters") or []):
                s_pts = r1.get("starters_points", [])[idx] if idx < len(r1.get("starters_points", [])) else 0.0
                p_meta = players_map.get(str(pid), {})
                starters1.append({
                    "playerId": str(pid),
                    "name": p_meta.get("name", f"Player {pid}"),
                    "position": p_meta.get("position", "FLEX"),
                    "team": p_meta.get("team", "FA"),
                    "points": round(float(s_pts or 0.0), 2),
                })

            starters2 = []
            for idx, pid in enumerate(r2.get("starters") or []):
                s_pts = r2.get("starters_points", [])[idx] if idx < len(r2.get("starters_points", [])) else 0.0
                p_meta = players_map.get(str(pid), {})
                starters2.append({
                    "playerId": str(pid),
                    "name": p_meta.get("name", f"Player {pid}"),
                    "position": p_meta.get("position", "FLEX"),
                    "team": p_meta.get("team", "FA"),
                    "points": round(float(s_pts or 0.0), 2),
                })

            pp1 = r1.get("players_points") or {}
            pp2 = r2.get("players_points") or {}
            st_set1 = set(str(p) for p in (r1.get("starters") or []))
            st_set2 = set(str(p) for p in (r2.get("starters") or []))

            bench_pts1 = sum(float(v or 0.0) for k, v in pp1.items() if str(k) not in st_set1)
            bench_pts2 = sum(float(v or 0.0) for k, v in pp2.items() if str(k) not in st_set2)

            opt1, _ = optimal_lineup(pp1, players_map, SLOTS)
            opt2, _ = optimal_lineup(pp2, players_map, SLOTS)

            team_a_obj = {
                "rosterId": rid1,
                "teamName": team_info.get(rid1, {}).get("teamName", f"Team {rid1}"),
                "manager": team_info.get(rid1, {}).get("manager", f"Manager {rid1}"),
                "points": pts1,
                "optimalPoints": opt1 if opt1 >= pts1 else pts1,
                "lineupEfficiency": round((pts1 / opt1 * 100), 1) if opt1 > 0 else 100.0,
                "benchPoints": round(bench_pts1, 2),
                "starters": starters1,
            }

            team_b_obj = {
                "rosterId": rid2,
                "teamName": team_info.get(rid2, {}).get("teamName", f"Team {rid2}"),
                "manager": team_info.get(rid2, {}).get("manager", f"Manager {rid2}"),
                "points": pts2,
                "optimalPoints": opt2 if opt2 >= pts2 else pts2,
                "lineupEfficiency": round((pts2 / opt2 * 100), 1) if opt2 > 0 else 100.0,
                "benchPoints": round(bench_pts2, 2),
                "starters": starters2,
            }

            margin = round(abs(pts1 - pts2), 2)
            winner_id = rid1 if pts1 >= pts2 else rid2
            winner_name = team_a_obj["teamName"] if winner_id == rid1 else team_b_obj["teamName"]
            loser_name = team_b_obj["teamName"] if winner_id == rid1 else team_a_obj["teamName"]

            is_nailbiter = margin <= 5.0
            is_blowout = margin >= 35.0
            is_shootout = (pts1 + pts2) >= 300.0

            commentary = generate_matchup_commentary(
                team_a_obj, team_b_obj, margin, False, is_shootout, is_nailbiter, is_blowout,
                week=w, nfl_stats=nfl_stats, players_map=players_map
            )

            # Titles
            if is_shootout:
                title = f"{winner_name} Outlasts {loser_name} in {pts1 + pts2:.0f}-Point Shootout"
            elif is_nailbiter:
                title = f"{winner_name} Survives Nailbiter vs. {loser_name} by {margin:.2f} Pts"
            elif is_blowout:
                title = f"{winner_name} Crushes {loser_name} in {margin:.1f}-Point Rout"
            else:
                title = f"{winner_name} Defeats {loser_name} ({pts1:.1f} – {pts2:.1f})"

            matchup_cards.append({
                "matchupId": mid,
                "title": title,
                "isMarquee": is_shootout or is_nailbiter,
                "winnerRosterId": winner_id,
                "margin": margin,
                "combinedPoints": round(pts1 + pts2, 2),
                "teamA": team_a_obj,
                "teamB": team_b_obj,
                "commentary": commentary,
            })

            # Accumulate standings
            for t_obj, opp_obj in [(team_a_obj, team_b_obj), (team_b_obj, team_a_obj)]:
                rid = t_obj["rosterId"]
                s = standings_accum[rid]
                if t_obj["points"] > opp_obj["points"]:
                    s["wins"] += 1
                elif t_obj["points"] < opp_obj["points"]:
                    s["losses"] += 1
                else:
                    s["ties"] += 1
                s["pointsFor"] += t_obj["points"]
                s["pointsAgainst"] += opp_obj["points"]
                s["weeksAboveMedian"] += 1 if t_obj["points"] > med_score else 0
                s["totalLineupMiss"] += max(0.0, t_obj["optimalPoints"] - t_obj["points"])

                # All-play
                others = [pts for r_other, pts in scores_by_roster.items() if r_other != rid]
                s["allPlayWins"] += sum(1 for pts in others if t_obj["points"] > pts)
                s["allPlayLosses"] += sum(1 for pts in others if t_obj["points"] < pts)
                s["allPlayTies"] += sum(1 for pts in others if t_obj["points"] == pts)

        # Superlatives for the week
        nailbiter_card = min(matchup_cards, key=lambda m: m["margin"]) if matchup_cards else None
        blowout_card = max(matchup_cards, key=lambda m: m["margin"]) if matchup_cards else None
        shootout_card = max(matchup_cards, key=lambda m: m["combinedPoints"]) if matchup_cards else None

        all_teams_week = []
        for m in matchup_cards:
            all_teams_week.extend([m["teamA"], m["teamB"]])

        high_roller_team = max(all_teams_week, key=lambda t: t["points"]) if all_teams_week else None
        low_roller_team = min(all_teams_week, key=lambda t: t["points"]) if all_teams_week else None

        # Tough break: highest scoring loser
        losers = []
        for m in matchup_cards:
            loser = m["teamA"] if m["teamA"]["rosterId"] != m["winnerRosterId"] else m["teamB"]
            losers.append(loser)
        tough_break_team = max(losers, key=lambda t: t["points"]) if losers else None

        # Manager of the week: best lineup efficiency with a win
        winners = []
        for m in matchup_cards:
            win_team = m["teamA"] if m["teamA"]["rosterId"] == m["winnerRosterId"] else m["teamB"]
            winners.append(win_team)
        mgr_of_week = max(winners, key=lambda t: t["lineupEfficiency"]) if winners else None

        superlatives = {
            "nailbiter": {
                "title": "Game of the Week / Nailbiter",
                "matchupId": nailbiter_card["matchupId"] if nailbiter_card else 1,
                "winner": (nailbiter_card["teamA"]["teamName"] if nailbiter_card["winnerRosterId"] == nailbiter_card["teamA"]["rosterId"] else nailbiter_card["teamB"]["teamName"]) if nailbiter_card else "",
                "score": f"{nailbiter_card['teamA']['points']:.2f} vs. {nailbiter_card['teamB']['points']:.2f}" if nailbiter_card else "",
                "margin": nailbiter_card["margin"] if nailbiter_card else 0.0,
                "narrative": f"Separated by just {nailbiter_card['margin']:.2f} points, every single snap counted.",
            },
            "blowout": {
                "title": "Blowout of the Week",
                "matchupId": blowout_card["matchupId"] if blowout_card else 1,
                "winner": (blowout_card["teamA"]["teamName"] if blowout_card["winnerRosterId"] == blowout_card["teamA"]["rosterId"] else blowout_card["teamB"]["teamName"]) if blowout_card else "",
                "score": f"{blowout_card['teamA']['points']:.2f} vs. {blowout_card['teamB']['points']:.2f}" if blowout_card else "",
                "margin": blowout_card["margin"] if blowout_card else 0.0,
                "narrative": f"A commanding {blowout_card['margin']:.2f}-point demolition.",
            },
            "shootout": {
                "title": "Shootout of the Week",
                "matchupId": shootout_card["matchupId"] if shootout_card else 1,
                "combinedPoints": shootout_card["combinedPoints"] if shootout_card else 0.0,
                "narrative": f"High-octane fireworks totaling {shootout_card['combinedPoints']:.2f} points.",
            },
            "highRoller": {
                "title": "High Roller (Top Scorer)",
                "rosterId": high_roller_team["rosterId"] if high_roller_team else 1,
                "teamName": high_roller_team["teamName"] if high_roller_team else "",
                "score": high_roller_team["points"] if high_roller_team else 0.0,
                "narrative": f"Put up a league-leading {high_roller_team['points']:.2f} points across all starting slots.",
            },
            "toughBreak": {
                "title": "Tough Break / Bad Beat",
                "rosterId": tough_break_team["rosterId"] if tough_break_team else 1,
                "teamName": tough_break_team["teamName"] if tough_break_team else "",
                "score": tough_break_team["points"] if tough_break_team else 0.0,
                "narrative": f"Scored a massive {tough_break_team['points']:.2f} points but ran into the week's highest buzzsaw.",
            },
            "managerOfTheWeek": {
                "title": "Manager of the Week",
                "rosterId": mgr_of_week["rosterId"] if mgr_of_week else 1,
                "teamName": mgr_of_week["teamName"] if mgr_of_week else "",
                "efficiency": mgr_of_week["lineupEfficiency"] if mgr_of_week else 100.0,
                "narrative": f"Maximized starting equity with a sterling {mgr_of_week['lineupEfficiency']:.1f}% optimal lineup execution.",
            },
        }

        # Week editorial summary (Gemini or Expressive Engine)
        gemini_sum = None
        key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if key:
            sum_prompt = (
                f"You are the senior editorial analyst for a premier fantasy football league.\n"
                f"Write an insightful, expressive headline (under 12 words) and a 3-4 sentence recap of Week {w}.\n"
                f"Slate Highlights:\n"
                f"- Top Scorer: {high_roller_team['teamName']} ({high_roller_team['points']:.2f} pts)\n"
                f"- Shootout: {shootout_card['teamA']['teamName']} vs. {shootout_card['teamB']['teamName']} ({shootout_card['combinedPoints']:.2f} combined pts)\n"
                f"- Toughest loss: {tough_break_team['teamName']} dropped a match despite putting up {tough_break_team['points']:.2f} pts\n"
                f"- Top manager efficiency: {mgr_of_week['teamName']} ({mgr_of_week['lineupEfficiency']:.1f}% optimal)\n"
                f"Output strictly valid JSON in this shape: {{\"headline\": \"...\", \"summary\": \"...\"}}"
            )
            raw_json = call_gemini_api(sum_prompt, key)
            if raw_json:
                try:
                    parsed = json.loads(raw_json)
                    if parsed.get("headline") and parsed.get("summary"):
                        gemini_sum = parsed
                except Exception:
                    pass

        if gemini_sum:
            headline = gemini_sum["headline"]
            ai_summary = gemini_sum["summary"]
        else:
            headline = f"Week {w} Recap: {shootout_card['combinedPoints']:.0f}-Point Heavyweight Clashes & Statement Wins"
            ai_summary = (
                f"Week {w} launched the 2026 campaign with unforgettable high-stakes drama and wild scoring separation across the board. "
                f"Headlining the action was a breathless {shootout_card['combinedPoints']:.0f}-point shootout where {shootout_card['teamA']['teamName']} and "
                f"{shootout_card['teamB']['teamName']} pushed each other to the absolute limit. "
                f"{high_roller_team['teamName']} claimed the high-water mark with an electric {high_roller_team['points']:.2f}-point eruption, "
                f"while {tough_break_team['teamName']} absorbed the ultimate bad beat after posting {tough_break_team['points']:.2f} points in defeat. "
                f"With managerial efficiency separating early contenders from the pack, Week {w+1} promises immediate tactical recalibration."
            )

        scored_weeks_data.append({
            "week": w,
            "label": f"Week {w} Recap",
            "headline": headline,
            "aiEditorialSummary": ai_summary,
            "leagueMedian": med_score,
            "superlatives": superlatives,
            "matchups": matchup_cards,
        })

    # Build Standings Table
    standings_table = []
    for rid, s in standings_accum.items():
        played = s["wins"] + s["losses"] + s["ties"]
        total_all_play = s["allPlayWins"] + s["allPlayLosses"] + s["allPlayTies"]
        all_play_pct = round(s["allPlayWins"] / float(total_all_play), 4) if total_all_play else 0.0
        exp_wins = round(all_play_pct * played, 2)
        sched_luck = round(s["wins"] - exp_wins, 2)

        standings_table.append({
            "rosterId": rid,
            "teamName": team_info.get(rid, {}).get("teamName", f"Team {rid}"),
            "manager": team_info.get(rid, {}).get("manager", f"Manager {rid}"),
            "wins": s["wins"],
            "losses": s["losses"],
            "ties": s["ties"],
            "pointsFor": round(s["pointsFor"], 2),
            "pointsAgainst": round(s["pointsAgainst"], 2),
            "allPlayWinPct": all_play_pct,
            "allPlayRecord": f"{s['allPlayWins']}-{s['allPlayLosses']}",
            "expectedWins": exp_wins,
            "scheduleLuck": sched_luck,
            "weeksAboveMedian": s["weeksAboveMedian"],
            "totalLineupMiss": round(s["totalLineupMiss"], 2),
        })

    standings_table.sort(key=lambda t: (-t["wins"], -t["pointsFor"]))
    for rank, t in enumerate(standings_table, start=1):
        t["rank"] = rank

    # Prior season (2025) preservation
    prior_season_data = {
        "season": "2025",
        "standings": [
            {"rank": 1, "rosterId": 1, "teamName": "Ertz & Krafts 🏆", "wins": 11, "losses": 6, "pointsFor": 2356.98, "pointsAgainst": 2163.56, "allPlayWinPct": 0.6919, "expectedWins": 11.76, "scheduleLuck": -0.76},
            {"rank": 2, "rosterId": 9, "teamName": "Max’s Shadynasty", "wins": 11, "losses": 5, "pointsFor": 2158.4, "pointsAgainst": 1805.4, "allPlayWinPct": 0.5707, "expectedWins": 9.13, "scheduleLuck": 1.87},
            {"rank": 3, "rosterId": 7, "teamName": "Gridiron geezers", "wins": 10, "losses": 6, "pointsFor": 2283.0, "pointsAgainst": 1858.38, "allPlayWinPct": 0.6111, "expectedWins": 9.78, "scheduleLuck": 0.22},
            {"rank": 4, "rosterId": 12, "teamName": "Bronco Stampede", "wins": 10, "losses": 7, "pointsFor": 2270.82, "pointsAgainst": 2045.04, "allPlayWinPct": 0.5859, "expectedWins": 9.96, "scheduleLuck": 0.04},
            {"rank": 5, "rosterId": 8, "teamName": "arkinsjt", "wins": 9, "losses": 7, "pointsFor": 2164.76, "pointsAgainst": 2026.04, "allPlayWinPct": 0.5354, "expectedWins": 8.57, "scheduleLuck": 0.43},
            {"rank": 6, "rosterId": 3, "teamName": "The Ape", "wins": 8, "losses": 8, "pointsFor": 2110.14, "pointsAgainst": 2125.76, "allPlayWinPct": 0.4899, "expectedWins": 7.84, "scheduleLuck": 0.16},
            {"rank": 7, "rosterId": 2, "teamName": "2 Dagos and A Dream", "wins": 8, "losses": 8, "pointsFor": 2074.5, "pointsAgainst": 2112.3, "allPlayWinPct": 0.4545, "expectedWins": 7.27, "scheduleLuck": 0.73},
            {"rank": 8, "rosterId": 10, "teamName": "Bijan And The Maye-ssiah", "wins": 7, "losses": 9, "pointsFor": 2012.3, "pointsAgainst": 2088.1, "allPlayWinPct": 0.4242, "expectedWins": 6.79, "scheduleLuck": 0.21},
            {"rank": 9, "rosterId": 4, "teamName": "Bub’s Club", "wins": 6, "losses": 10, "pointsFor": 1940.2, "pointsAgainst": 2040.5, "allPlayWinPct": 0.3838, "expectedWins": 6.14, "scheduleLuck": -0.14},
            {"rank": 10, "rosterId": 6, "teamName": "Final Boss", "wins": 5, "losses": 11, "pointsFor": 1890.6, "pointsAgainst": 2150.2, "allPlayWinPct": 0.3434, "expectedWins": 5.50, "scheduleLuck": -0.50},
            {"rank": 11, "rosterId": 11, "teamName": "Terry Tate’s Pain Train", "wins": 4, "losses": 12, "pointsFor": 1820.4, "pointsAgainst": 2210.8, "allPlayWinPct": 0.2929, "expectedWins": 4.69, "scheduleLuck": -0.69},
            {"rank": 12, "rosterId": 5, "teamName": "My Nabers Tetties", "wins": 3, "losses": 13, "pointsFor": 1780.0, "pointsAgainst": 2290.0, "allPlayWinPct": 0.2525, "expectedWins": 4.04, "scheduleLuck": -1.04},
        ]
    }

    active_week = scored_weeks_data[-1]["week"] if scored_weeks_data else 1
    final_payload = {
        "schemaVersion": SCHEMA_VERSION,
        "modelVersion": MODEL_VERSION,
        "league": {
            "leagueId": str(league_id),
            "season": str(season),
            "currentWeek": active_week + 1,
        },
        "generatedAtUtc": datetime.now(timezone.utc).isoformat(),
        "status": "scored" if scored_weeks_data else "no_scored_weeks",
        "activeWeek": active_week,
        "availableWeeks": [w["week"] for w in scored_weeks_data],
        "standings": standings_table,
        "weeks": scored_weeks_data,
        "priorSeason": prior_season_data,
    }

    # Write out
    targets = []
    if str(league_id) == "1401673232670539776":
        for r in CANDIDATE_ROOTS:
            jj_dir = os.path.join(r, "src", "generated", "johnnys-jerks")
            if os.path.exists(os.path.join(r, "src")):
                targets.append(os.path.join(jj_dir, "weekly-recap.json"))
            almanac_jj = os.path.join(r, "ape-invitational-almanac", "src", "generated", "johnnys-jerks")
            if os.path.exists(os.path.join(r, "ape-invitational-almanac", "src")):
                targets.append(os.path.join(almanac_jj, "weekly-recap.json"))
    else:
        targets = [OUT]
        alt_out = os.path.join(HERE, "..", "src", "generated", "weekly-recap.json")
        if os.path.exists(os.path.dirname(alt_out)):
            targets.append(os.path.abspath(alt_out))

    for target in set(targets):
        if target:
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with open(target, "w", encoding="utf-8") as f:
                json.dump(final_payload, f, indent=2)
            print(f"Exported weekly recap to {target}")

            # Also save week specific archive
            if active_week:
                week_archive = os.path.join(os.path.dirname(target), f"weekly-recap-week{active_week}.json")
                with open(week_archive, "w", encoding="utf-8") as f:
                    json.dump(final_payload, f, indent=2)

    return final_payload


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", default=SEASON)
    parser.add_argument("--league", default=LEAGUE_ID)
    args = parser.parse_args()
    build_weekly_recap_payload(season=args.season, league_id=args.league)


if __name__ == "__main__":
    main()
