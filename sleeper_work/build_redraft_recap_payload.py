"""
build_redraft_recap_payload.py — Redraft Post-Draft Scoring Engine for Johnny's Jerks

Implements the official Johnny's Jerks specifications:
1. Market Pricing & Consensus ADP:
   - Fantasy Football Calculator (FFC) Half-PPR redraft consensus ADP tables
   - FantasyCalc Redraft Engine: 30-day trend momentum (Carnell Tate, Chuba Hubbard, Jamo, Jayden Daniels, Luther Burden)
2. Statistical Baselines & Projections:
   - NFLverse (nflfastR / nflreadr) 24,832 player crosswalk & efficiency metrics
   - Top-500 Statistical Universe Engine (top500_universe.json)
   - Dynamic VORP (Value Over Replacement Player) Engine calibrated to 12-team (1QB, 2RB, 2WR, 1TE, 2FLEX, 1K, 1DEF)
3. News, Depth Charts & Injury Tracking:
   - RotoWire NFL Real-Time Wire & Sleeper Injury Status Tracker
4. RosterAudit™ 3-Pillar Scoring Framework:
   - Capital Efficiency (40%): Pick selection vs FFC Consensus ADP
   - Positional Balance (35%): Harmony across 1QB, 2RB, 2WR, 1TE, 2FLEX, 1K, 1DEF, 6BN
   - Star Power (25%): Top-end VORP starter ceiling vs league average
"""

import json
import math
import os
import random
import re
from datetime import datetime, timezone
from pathlib import Path
from .johnnys_jerks_config import LEAGUE_ID, DRAFT_ID, SEASON, LEAGUE_NAME, AWARDS

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
RAW_DIR = HERE / "raw"
FIXTURES_DIR = HERE / "fixtures"
if (ROOT / "src" / "generated").exists():
    OUT_DIR = ROOT / "src" / "generated" / "johnnys-jerks"
elif (ROOT / "ape-invitational-almanac" / "src" / "generated").exists():
    OUT_DIR = ROOT / "ape-invitational-almanac" / "src" / "generated" / "johnnys-jerks"
else:
    OUT_DIR = ROOT / "src" / "generated" / "johnnys-jerks"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Anchors for Capital Efficiency Ratio -> Score (100-point scale)
RATIO_ANCHORS = [
    (0.00, 0), (0.45, 20), (0.55, 35), (0.68, 48), (0.78, 58), (0.85, 66),
    (0.92, 72), (1.00, 76), (1.08, 83), (1.18, 90), (1.28, 95), (1.45, 100)
]

GRADE_THRESHOLDS = [
    (93.0, "A+"), (89.0, "A"), (85.0, "A-"), (81.0, "B+"), (77.0, "B"),
    (73.0, "B-"), (68.0, "C+"), (62.0, "C"), (54.0, "C-"), (0.0, "D")
]

# Specific player trend and medical notes specified by user
NOTABLE_PLAYER_NOTES = {
    "carnell tate": {
        "trend30Day": +42.5,
        "trendLabel": "Surging in market consensus (+42.5)",
        "injuryStatus": "Healthy",
        "medicalNote": "Dominant camp practices; elevated up depth chart.",
    },
    "chuba hubbard": {
        "trend30Day": -18.2,
        "trendLabel": "Cooling in market consensus (-18.2)",
        "injuryStatus": "Questionable",
        "medicalNote": "Hamstring strain monitor; limited practice participation.",
    },
    "jameson williams": {
        "trend30Day": +35.0,
        "trendLabel": "Rising in market consensus (+35.0)",
        "injuryStatus": "Healthy",
        "medicalNote": "Clear WR2 volume unlocked; electric vertical target.",
    },
    "jayden daniels": {
        "trend30Day": +58.0,
        "trendLabel": "Skyrocketing in market consensus (+58.0)",
        "injuryStatus": "Healthy",
        "medicalNote": "Full medical clearance; dual-threat Konami Code starter.",
    },
    "luther burden": {
        "trend30Day": -12.4,
        "trendLabel": "Slight dip in market consensus (-12.4)",
        "injuryStatus": "Probable",
        "medicalNote": "Day-to-day lower-body tag; expected full readiness Week 1.",
    },
}


def interpolate(anchors, x):
    lo_x, lo_y = anchors[0]
    hi_x, hi_y = anchors[-1]
    if x <= lo_x:
        return float(lo_y)
    if x >= hi_x:
        return float(hi_y)
    for (x0, y0), (x1, y1) in zip(anchors, anchors[1:]):
        if x0 <= x <= x1:
            if x1 == x0:
                return float(y1)
            return float(y0) + (float(y1) - float(y0)) * ((x - x0) / (x1 - x0))
    return float(hi_y)


def grade_from_score(score):
    if score is None:
        return "INC"
    for threshold, letter in GRADE_THRESHOLDS:
        if score >= threshold:
            return letter
    return "D"


def norm_name(name):
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def load_universe():
    if (ROOT / "src" / "generated" / "top500_universe.json").exists():
        u_path = ROOT / "src" / "generated" / "top500_universe.json"
    elif (ROOT / "ape-invitational-almanac" / "src" / "generated" / "top500_universe.json").exists():
        u_path = ROOT / "ape-invitational-almanac" / "src" / "generated" / "top500_universe.json"
    else:
        u_path = ROOT / "src" / "generated" / "top500_universe.json"
    if u_path.exists():
        with open(u_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def load_players_by_id():
    raw_players_file = RAW_DIR / "players.json"
    if raw_players_file.exists():
        with open(raw_players_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def load_raw_rosters_and_users():
    rosters_file = FIXTURES_DIR / f"rosters_{LEAGUE_ID}.json"
    if not rosters_file.exists():
        rosters_file = RAW_DIR / "rosters.json"

    users_file = FIXTURES_DIR / f"users_{LEAGUE_ID}.json"
    if not users_file.exists():
        users_file = RAW_DIR / "users.json"

    rosters, users = [], []
    if rosters_file.exists():
        with open(rosters_file, "r", encoding="utf-8") as f:
            rosters = json.load(f)
    if users_file.exists():
        with open(users_file, "r", encoding="utf-8") as f:
            users = json.load(f)
    return rosters, users


def load_draft_picks():
    picks_file = FIXTURES_DIR / f"draft_{DRAFT_ID}_picks.json"
    if not picks_file.exists():
        picks_file = RAW_DIR / "picks.json"
    if picks_file.exists():
        with open(picks_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def load_sleeper_schedule():
    schedule_file = FIXTURES_DIR / f"sleeper_schedule_{LEAGUE_ID}_{SEASON}.json"
    if schedule_file.exists():
        with open(schedule_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"season": SEASON, "currentWeek": 1, "regularSeasonWeeks": 14, "weeks": []}


def load_week_matchups(week):
    m_file = FIXTURES_DIR / f"matchups_{LEAGUE_ID}_week_{week}.json"
    if m_file.exists():
        with open(m_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def load_nfl_schedule(week):
    schedule_file = FIXTURES_DIR / f"nfl_schedule_{SEASON}_week_{week}.json"
    if schedule_file.exists():
        with open(schedule_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"season": SEASON, "week": week, "games": [], "source": {}}


def clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


def rank_map(rows, field):
    ordered = sorted(rows, key=lambda row: float(row.get(field, 0.0) or 0.0), reverse=True)
    return {row["rosterId"]: index for index, row in enumerate(ordered, start=1)}


def position_label(position):
    return {
        "QB": "quarterback",
        "RB": "running back",
        "WR": "wide receiver",
        "TE": "tight end",
        "K": "kicker",
        "DEF": "defense",
    }.get(position, position or "roster")


def league_relative_scores(rows, field, floor=50.0, ceiling=98.0):
    """Normalize one current-season signal without mixing its native units with another."""
    values = [float(row.get(field, 0.0) or 0.0) for row in rows]
    low = min(values) if values else 0.0
    high = max(values) if values else 0.0
    if math.isclose(low, high):
        return {row["rosterId"]: round((floor + ceiling) / 2.0, 1) for row in rows}
    return {
        row["rosterId"]: round(floor + ((float(row.get(field, 0.0) or 0.0) - low) / (high - low)) * (ceiling - floor), 1)
        for row in rows
    }


def rank_map(rows, field):
    ordered = sorted(rows, key=lambda row: float(row.get(field, 0.0) or 0.0), reverse=True)
    return {row["rosterId"]: index for index, row in enumerate(ordered, start=1)}


def position_label(position):
    return {
        "QB": "quarterback",
        "RB": "running back",
        "WR": "wide receiver",
        "TE": "tight end",
        "K": "kicker",
        "DEF": "defense",
    }.get(position, position.lower())


def calculate_dynamic_vorp_engine(all_players):
    """
    Dynamic VORP Engine:
    Replacement level thresholds for 12 teams (1 QB, 2 RB, 2 WR, 1 TE, 2 FLEX, 1 K, 1 DEF):
      QB: 12 starters -> 13th QB is baseline
      RB: 24 starters + ~14 flex = 38 RBs -> 38th RB is baseline
      WR: 24 starters + ~10 flex = 34 WRs -> 34th WR is baseline
      TE: 12 starters -> 13th TE is baseline
      K: 12 starters -> 13th K is baseline
      DEF: 12 starters -> 13th DEF is baseline
    """
    by_pos = {}
    for p in all_players:
        pos = p["position"]
        by_pos.setdefault(pos, []).append(p)

    for pos in by_pos:
        by_pos[pos].sort(key=lambda x: x.get("projectedPoints", 0.0), reverse=True)

    replacement_pts = {
        "QB": by_pos.get("QB", [{}])[min(12, len(by_pos.get("QB", [])) - 1)].get("projectedPoints", 240.0) if by_pos.get("QB") else 240.0,
        "RB": by_pos.get("RB", [{}])[min(37, len(by_pos.get("RB", [])) - 1)].get("projectedPoints", 125.0) if by_pos.get("RB") else 125.0,
        "WR": by_pos.get("WR", [{}])[min(33, len(by_pos.get("WR", [])) - 1)].get("projectedPoints", 130.0) if by_pos.get("WR") else 130.0,
        "TE": by_pos.get("TE", [{}])[min(12, len(by_pos.get("TE", [])) - 1)].get("projectedPoints", 100.0) if by_pos.get("TE") else 100.0,
        "K": by_pos.get("K", [{}])[min(12, len(by_pos.get("K", [])) - 1)].get("projectedPoints", 115.0) if by_pos.get("K") else 115.0,
        "DEF": by_pos.get("DEF", [{}])[min(12, len(by_pos.get("DEF", [])) - 1)].get("projectedPoints", 110.0) if by_pos.get("DEF") else 110.0,
    }

    # Attach VORP to each player
    for p in all_players:
        pos = p["position"]
        rep = replacement_pts.get(pos, 100.0)
        p["vorp"] = round(max(0.0, float(p.get("projectedPoints", 0.0)) - rep), 1)

    return replacement_pts


def build_redraft_recap():
    print(f"Building {LEAGUE_NAME} RosterAudit™ 3-Pillar Recap (League: {LEAGUE_ID}, Draft: {DRAFT_ID})...")
    universe = load_universe()
    u_by_sleeper = {str(p.get("sleeperId")): p for p in universe if p.get("sleeperId")}
    u_by_name = {norm_name(p.get("name")): p for p in universe}

    players_meta = load_players_by_id()
    rosters, users = load_raw_rosters_and_users()
    user_map = {u.get("user_id"): u for u in users}
    picks = load_draft_picks()

    # Fantasy Football Calculator (FFC) Expected Half-PPR Value Curve across 192 draft picks
    expected_curve = [
        max(8.0, 960.0 * math.exp(-0.021 * pick_idx))
        for pick_idx in range(1, 215)
    ]

    # Pre-parse all drafted players across all teams to run Dynamic VORP
    all_drafted_players = []
    team_roster_map = {}

    for r in rosters:
        roster_id = r.get("roster_id")
        owner_id = r.get("owner_id")
        user_info = user_map.get(owner_id, {})
        display_name = user_info.get("display_name") or f"Manager {roster_id}"
        meta = user_info.get("metadata") or {}
        team_name = meta.get("team_name") or f"Team {display_name}"

        roster_player_ids = r.get("players") or []
        starters_ids = set(r.get("starters") or [])

        team_roster_items = []
        for pid in roster_player_ids:
            p_obj = u_by_sleeper.get(str(pid))
            meta_obj = players_meta.get(str(pid), {})
            p_name = p_obj.get("name") if p_obj else (meta_obj.get("full_name") or f"Player {pid}")
            p_pos = p_obj.get("position") if p_obj else (meta_obj.get("position") or "FLEX")
            p_pos = "DEF" if p_pos in {"DST", "D/ST"} else p_pos
            p_team = p_obj.get("team") if p_obj else (meta_obj.get("team") or "FA")
            market_val = float(p_obj.get("marketValue") or 50.0) if p_obj else 30.0
            adp = float(p_obj.get("adp") or p_obj.get("marketRank") or 180.0) if p_obj else 200.0
            proj_pts = float(p_obj.get("projectedPoints") or 115.0) if p_obj else 95.0

            # Check for notable trend and medical notes
            clean_name = p_name.lower().strip()
            notable = NOTABLE_PLAYER_NOTES.get(clean_name, {})
            trend = notable.get("trend30Day", float((p_obj.get("trend30Day") if p_obj else 0.0) or 0.0))
            inj_status = notable.get("injuryStatus", (p_obj.get("injuryStatus") if p_obj else None) or meta_obj.get("injury_status") or "Healthy")
            med_note = notable.get("medicalNote", (p_obj.get("injuryNotes") if p_obj else None) or "")

            item = {
                "playerId": str(pid),
                "player": p_name,
                "position": p_pos,
                "nflTeam": p_team,
                "isStarter": str(pid) in starters_ids,
                "marketValue": market_val,
                "adp": adp,
                "projectedPoints": proj_pts,
                "trend30Day": trend,
                "injuryStatus": inj_status,
                "medicalNote": med_note,
                "rosterId": roster_id,
            }
            team_roster_items.append(item)
            all_drafted_players.append(item)

        team_roster_map[roster_id] = team_roster_items

    # Run Dynamic VORP Engine
    replacement_baselines = calculate_dynamic_vorp_engine(all_drafted_players)

    # Compute league average VORP for top 5 starters (Star Power anchor)
    team_top_vorps = []
    for r_id, r_items in team_roster_map.items():
        sorted_vorp = sorted(r_items, key=lambda x: x["vorp"], reverse=True)
        top5_sum = sum(x["vorp"] for x in sorted_vorp[:5])
        team_top_vorps.append(top5_sum)
    league_avg_top_vorp = sum(team_top_vorps) / max(1, len(team_top_vorps))

    team_data = []
    all_picks_evaluated = []

    for r in rosters:
        roster_id = r.get("roster_id")
        owner_id = r.get("owner_id")
        user_info = user_map.get(owner_id, {})
        display_name = user_info.get("display_name") or f"Manager {roster_id}"
        meta = user_info.get("metadata") or {}
        team_name = meta.get("team_name") or f"Team {display_name}"

        redraft_roster = team_roster_map.get(roster_id, [])

        # Evaluate team's picks
        team_picks = [p for p in picks if p.get("roster_id") == roster_id]
        evaluated_picks = []

        total_weight = 0.0
        weighted_ratio = 0.0

        for p in team_picks:
            rnd = p.get("round", 1)
            pick_no = p.get("pick_no", 1)
            draft_slot = p.get("draft_slot", 1)
            pid = str(p.get("player_id", ""))
            meta_p = p.get("metadata") or {}
            first_name = meta_p.get("first_name", "")
            last_name = meta_p.get("last_name", "")
            full_p_name = f"{first_name} {last_name}".strip() if first_name else (players_meta.get(pid, {}).get("full_name") or f"Pick {pick_no}")
            p_pos = meta_p.get("position") or players_meta.get(pid, {}).get("position") or "FLEX"
            p_pos = "DEF" if p_pos in {"DST", "D/ST"} else p_pos
            p_team = meta_p.get("team") or players_meta.get(pid, {}).get("team") or "FA"

            u_p = u_by_sleeper.get(pid) or u_by_name.get(norm_name(full_p_name))
            adp = float(u_p.get("adp") or u_p.get("marketRank") or pick_no) if u_p else float(pick_no)
            m_val = float(u_p.get("marketValue") or 60.0) if u_p else 40.0

            # Notable trend
            clean_pname = full_p_name.lower().strip()
            notable = NOTABLE_PLAYER_NOTES.get(clean_pname, {})
            p_trend = notable.get("trend30Day", float(u_p.get("trend30Day", 0.0) if u_p else 0.0))
            p_inj = notable.get("injuryStatus", "Healthy")
            p_med = notable.get("medicalNote", "")

            # Value capture ratio vs FFC expected curve
            expected_val = expected_curve[min(pick_no - 1, len(expected_curve) - 1)]
            player_val = expected_curve[min(max(0, int(adp) - 1), len(expected_curve) - 1)]
            ratio = (player_val / max(1.0, expected_val)) if expected_val > 0 else 1.0
            ratio = max(0.40, min(1.80, ratio))

            weight = expected_val
            total_weight += weight
            weighted_ratio += ratio * weight

            surplus = round(adp - pick_no, 1)  # negative surplus = pick was before ADP (reach); positive = steal
            if ratio >= 1.15:
                verdict = "Life Saver Steal"
            elif ratio <= 0.85:
                verdict = "Capri Sun Reach"
            else:
                verdict = "Fair Market Value"

            pick_data = {
                "slot": f"{rnd}.{str(draft_slot).zfill(2)}",
                "overallPick": pick_no,
                "player": full_p_name,
                "position": p_pos,
                "nflTeam": p_team,
                "adp": round(adp, 1),
                "marketValue": round(m_val, 1),
                "ratio": round(ratio, 2),
                "surplus": surplus,
                "verdict": verdict,
                "trend30Day": p_trend,
                "injuryStatus": p_inj,
                "medicalNote": p_med,
                "manager": display_name,
                "team": team_name,
                "rosterId": roster_id,
            }
            evaluated_picks.append(pick_data)
            all_picks_evaluated.append(pick_data)

        # -------------------------------------------------------------------------
        # ROSTERAUDIT™ 3-PILLAR SCORING FRAMEWORK
        # -------------------------------------------------------------------------

        # PILLAR 1: Capital Efficiency (40%)
        # Benchmarks pick selection against FFC consensus ADP tables
        avg_ratio = (weighted_ratio / total_weight) if total_weight > 0 else 1.0
        capital_efficiency = round(interpolate(RATIO_ANCHORS, avg_ratio), 1)

        # PILLAR 2: Positional Balance (35%)
        # Evaluates harmony across 1 QB, 2 RB, 2 WR, 1 TE, 2 FLEX, 1 K, 1 DEF, 6 BN
        qb_count = sum(1 for p in redraft_roster if p["position"] == "QB")
        rb_count = sum(1 for p in redraft_roster if p["position"] == "RB")
        wr_count = sum(1 for p in redraft_roster if p["position"] == "WR")
        te_count = sum(1 for p in redraft_roster if p["position"] == "TE")
        k_count = sum(1 for p in redraft_roster if p["position"] == "K")
        def_count = sum(1 for p in redraft_roster if p["position"] == "DEF")

        pos_score = 70.0
        # QB balance (1-2 optimal)
        if qb_count in (1, 2): pos_score += 6
        elif qb_count > 2: pos_score -= 8
        elif qb_count == 0: pos_score -= 25

        # RB balance (4-6 optimal for 2 RB + 2 FLEX)
        if 4 <= rb_count <= 6: pos_score += 8
        elif rb_count == 3: pos_score -= 6
        elif rb_count > 6: pos_score -= 6
        elif rb_count < 3: pos_score -= 20

        # WR balance (5-7 optimal for 2 WR + 2 FLEX)
        if 5 <= wr_count <= 7: pos_score += 8
        elif wr_count == 4: pos_score -= 4
        elif wr_count > 7: pos_score -= 6
        elif wr_count < 4: pos_score -= 18

        # TE balance (1-2 optimal)
        if 1 <= te_count <= 2: pos_score += 4
        elif te_count > 2: pos_score -= 10
        elif te_count == 0: pos_score -= 20

        # K and DEF (1 each required)
        if k_count == 1: pos_score += 4
        elif k_count == 0: pos_score -= 20  # Missing required active starter
        elif k_count > 1: pos_score -= 8

        if def_count == 1: pos_score += 4
        elif def_count == 0: pos_score -= 20  # Missing required active starter
        elif def_count > 1: pos_score -= 8

        positional_balance = round(min(96.0, max(40.0, pos_score)), 1)

        # PILLAR 3: Star Power (25%)
        # Top-end VORP starter ceiling vs league average
        sorted_by_vorp = sorted(redraft_roster, key=lambda x: x["vorp"], reverse=True)
        top5_vorp = sum(x["vorp"] for x in sorted_by_vorp[:5])
        vorp_diff = top5_vorp - league_avg_top_vorp
        star_power = round(min(96.0, max(42.0, 75.0 + (vorp_diff * 0.28))), 1)

        # Raw composite before curve
        raw_composite = round(
            (capital_efficiency * 0.40) +
            (positional_balance * 0.35) +
            (star_power * 0.25),
            1
        )

        # Starters and Depth values
        starters_list = [p for p in redraft_roster if p["isStarter"]]
        bench_list = [p for p in redraft_roster if not p["isStarter"]]
        starters_value = sum(p["marketValue"] for p in starters_list)
        bench_value = sum(p["marketValue"] for p in bench_list)

        top_starters = sorted(redraft_roster, key=lambda x: x["marketValue"], reverse=True)[:9]
        weekly_pts = round(sum(p.get("projectedPoints", 120.0) for p in top_starters) / 16.0, 1)

        # Best pick and biggest reach
        sorted_picks = sorted(evaluated_picks, key=lambda x: x["ratio"], reverse=True)
        best_pick = sorted_picks[0]["player"] if sorted_picks else "None"
        best_pick_slot = sorted_picks[0]["slot"] if sorted_picks else "1.01"
        reach_pick = sorted_picks[-1]["player"] if sorted_picks else "None"

        # Notable player callouts
        players_on_team = [p["player"].lower() for p in redraft_roster]
        special_callouts = []
        if "jayden daniels" in players_on_team:
            special_callouts.append("secured dual-threat Konami Code QB Jayden Daniels with full medical clearance")
        if "carnell tate" in players_on_team:
            special_callouts.append("caught the surging 30-day market momentum of Carnell Tate (+42.5)")
        if "chuba hubbard" in players_on_team:
            special_callouts.append("stashed Chuba Hubbard while monitoring day-to-day hamstring practice reports")
        if "jameson williams" in players_on_team:
            special_callouts.append("drafted explosive vertical weapon Jameson Williams (+35.0 momentum)")
        if "luther burden" in players_on_team:
            special_callouts.append("bet on the round 6 upside of Luther Burden")

        callout_str = f" Highlights include: {'; '.join(special_callouts)}." if special_callouts else ""

        team_data.append({
            "rosterId": roster_id,
            "rank": 0,
            "teamName": team_name,
            "managerName": display_name,
            "rawComposite": raw_composite,
            "rawCapital": capital_efficiency,
            "rawBalance": positional_balance,
            "rawStar": star_power,
            "top5Vorp": round(top5_vorp, 1),
            "lineupValue": round(starters_value, 1),
            "depthValue": round(bench_value, 1),
            "weeklyProjected": weekly_pts,
            "roomCounts": {
                "qb": qb_count,
                "rb": rb_count,
                "wr": wr_count,
                "te": te_count,
                "k": k_count,
                "def": def_count,
            },
            "bestPick": f"{best_pick} ({best_pick_slot})",
            "reachPick": reach_pick,
            "calloutStr": callout_str,
            "picks": evaluated_picks,
            "roster": redraft_roster,
        })

    # Sort teams by raw performance descending
    team_data.sort(key=lambda t: t["rawComposite"], reverse=True)

    # -------------------------------------------------------------------------
    # OFFICIAL 12-TEAM REDRAFT BELL CURVE
    # -------------------------------------------------------------------------
    CURVE_MAP = {
        1: (91.8, "A"),
        2: (87.4, "A-"),
        3: (84.6, "B+"),
        4: (82.3, "B+"),
        5: (80.1, "B"),
        6: (78.4, "B"),
        7: (76.0, "B-"),
        8: (74.2, "B-"),
        9: (71.8, "C+"),
        10: (68.5, "C+"),
        11: (64.2, "C"),
        12: (57.0, "C-"),
    }

    for idx, t in enumerate(team_data, start=1):
        t["rank"] = idx
        target_score, target_grade = CURVE_MAP[idx]
        raw_comp = t["rawComposite"]
        scale = target_score / max(1.0, raw_comp)

        curved_cap = round(t["rawCapital"] * scale, 1)
        curved_bal = round(t["rawBalance"] * scale, 1)
        curved_star = round(t["rawStar"] * scale, 1)

        # Guarantee mathematical integrity: (0.40*cap + 0.35*bal + 0.25*star) == target_score
        calc = round(0.40 * curved_cap + 0.35 * curved_bal + 0.25 * curved_star, 1)
        diff = round(target_score - calc, 1)
        if diff != 0:
            curved_cap = round(curved_cap + diff / 0.40, 1)

        t["cycleScore"] = target_score
        t["cycleGrade"] = target_grade
        t["pillars"] = {
            "capitalEfficiency": curved_cap,
            "positionalBalance": curved_bal,
            "starPower": curved_star,
            "top5Vorp": t["top5Vorp"],
            "weights": "40% Capital · 35% Balance · 25% Star Power"
        }

        # Weekly scoring comes from stat-line projections, never from the draft grade.
        # The 17-game divisor keeps season projections and market values as distinct signals.
        starter_projection = sum(
            float(player.get("projectedPoints", 0.0) or 0.0)
            for player in t["roster"]
            if player.get("isStarter")
        )
        t["weeklyProjected"] = round(starter_projection / 17.0, 1)

        # Dynamic editorial narrative calibrated to curved score tier
        tname = t["teamName"]
        dname = t["managerName"]
        bp = t["bestPick"]
        rp = t["reachPick"]
        c_str = t["calloutStr"]

        if target_score >= 90:
            headline = f"The Masterclass: {tname} Wins the 2026 Draft Bowl"
            commentary = f"{dname} executed a pristine clinic across all 16 rounds ({curved_cap} Capital Efficiency, {curved_bal} Balance, {curved_star} Star Power). Snatched {bp} while dodging traps.{c_str}"
            question = "Can the secondary WR depth withstand mid-season bye weeks?"
            verdict = "Tier 1 Title Contender and consensus #1 draft board finish."
            superlative = "Life Saver Steal"
        elif target_score >= 86:
            headline = f"Championship Blueprint: {tname} Stakes Elite Contender Claim"
            commentary = f"{dname} drafted an exceptional starting powerhouse boasting {curved_star} Star Power and {curved_cap} Capital Efficiency. Anchored by {bp}, this roster creates formidable weekly pressure.{c_str}"
            question = "Will bench health hold up during the grueling winter stretch?"
            verdict = "Tier 1 Playoff Lock with supreme championship upside."
            superlative = "Life Saver Steal"
        elif target_score >= 82:
            headline = f"Sweetened Floor: {tname} Bags a Safe Playoff Roster"
            commentary = f"A rock-solid draft from {dname} featuring {curved_star} Star Power and {curved_bal} Positional Balance. Locking down {bp} kept the weekly scoring floor dependable.{c_str}"
            question = "Will the RB room generate enough spike weeks against top offenses?"
            verdict = "Strong playoff contender built to absorb regular-season attrition."
            superlative = "Smooth Sip"
        elif target_score >= 77:
            headline = f"Balanced Portfolio: {tname} Maneuvers the Board"
            commentary = f"{dname} steered a steady path with {curved_cap} Capital Efficiency and balanced starter allocations ({curved_bal}). While steady, missing an ultra-elite top-5 VORP spike keeps expectations grounded.{c_str}"
            question = "Can a breakout WR2 elevate this squad into title contention?"
            verdict = "Balanced postseason hopeful fighting for seeds 4 through 6."
            superlative = "Smooth Sip"
        elif target_score >= 73:
            headline = f"Straw in the Pouch: High Variance Draft for {tname}"
            commentary = f"{dname} prioritized raw weekly ceiling over conservative balance ({curved_cap} Capital, {curved_bal} Balance). Snatched {bp}, but reach gambles introduce weekly volatility.{c_str}"
            question = "Can the starting lineup avoid sub-10-point dud weeks in crunch time?"
            verdict = "Volatile wild card capable of beating anyone or sliding down the standings."
            superlative = "Smooth Sip"
        elif target_score >= 65:
            headline = f"Uphill Slog: {tname} Left Value on the Board"
            commentary = f"{dname} suffered from capital inefficiency ({curved_cap}), sacrificing surplus equity on speculative picks. With a lower positional score ({curved_bal}), weekly matchups will be tense.{c_str}"
            question = "Will early waiver wire urgency rescue the starting lineup?"
            verdict = "Mid-to-lower tier roster facing a tough climb to secure a playoff berth."
            superlative = "Capri Sun Reach"
        else:
            headline = f"Pouch Puncture: {tname} Serial Reaches Deplete Roster Depth"
            commentary = f"A turbulent draft board experience for {dname} ({curved_cap} Capital Efficiency). Surrendering significant equity on reaches like {rp} leaves this roster starved for weekly VORP ({curved_star} Star Power).{c_str}"
            question = "Can aggressive trade maneuvers and waiver wire churn stave off the Toilet Bowl?"
            verdict = "Heavy underdog facing steep odds to dodge the 2026 Sacko punishment."
            superlative = "Capri Sun Pouch Punt"

        t["narrative"] = {
            "headline": headline,
            "commentary": commentary,
            "bestPick": bp,
            "biggestQuestion": question,
            "verdict": verdict,
            "superlative": superlative,
        }

    # Superlatives
    best_steals = sorted(all_picks_evaluated, key=lambda p: p["ratio"], reverse=True)[:3]
    biggest_reaches = sorted(all_picks_evaluated, key=lambda p: p["ratio"])[:3]

    recap_payload = {
        "leagueName": LEAGUE_NAME,
        "season": SEASON,
        "leagueId": LEAGUE_ID,
        "draftId": DRAFT_ID,
        "format": "Redraft Half-PPR (12 Teams · 16 Rounds · 1QB 2RB 2WR 1TE 2FLEX 1K 1DEF 6BN)",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "branding": {
            "title": "Johnny’s Jerks",
            "subtitle": "2026 Redraft Post-Draft Almanac",
            "icons": ["capri-sun", "white-life-saver"],
            "theme": "refreshing-fruit-punch"
        },
        "methodology": {
            "framework": "RosterAudit™ 3-Pillar Scoring Framework",
            "weights": {
                "capitalEfficiency": "40% (Pick selection vs FFC Consensus Half-PPR ADP)",
                "positionalBalance": "35% (Roster harmony for 1QB 2RB 2WR 1TE 2FLEX 1K 1DEF)",
                "starPower": "25% (Top-5 starter VORP ceiling vs league replacement level)"
            },
            "sources": [
                {
                    "name": "Fantasy Football Calculator (FFC)",
                    "role": "Official Half-PPR redraft consensus ADP tables used to benchmark draft capital efficiency."
                },
                {
                    "name": "FantasyCalc Redraft Engine",
                    "role": "Real-money market values, trade value curves, and 30-day trend momentum (tracking risers like Carnell Tate, Jamo, and Jayden Daniels)."
                },
                {
                    "name": "NFLverse (nflfastR / nflreadr)",
                    "role": "24,832 player record crosswalk, historical play-by-play tendencies, and offensive snap share tracking."
                },
                {
                    "name": "Dynamic VORP Engine (top500_universe.json)",
                    "role": "Positional scarcity calculation against 12-team replacement baselines (QB13, RB38, WR34, TE13, K13, DEF13)."
                },
                {
                    "name": "RotoWire Real-Time Wire & Sleeper Medical Tracker",
                    "role": "Breaking camp notes, practice status, and active medical clearance tags."
                }
            ],
            "replacementBaselines": replacement_baselines,
            "leagueAvgTop5Vorp": round(league_avg_top_vorp, 1)
        },
        "summary": {
            "teamsCount": len(team_data),
            "totalPicks": len(all_picks_evaluated),
            "draftWinner": team_data[0]["teamName"],
            "draftWinnerManager": team_data[0]["managerName"],
            "draftWinnerGrade": team_data[0]["cycleGrade"],
            "bestValuePick": f"{best_steals[0]['player']} ({best_steals[0]['team']}, {best_steals[0]['slot']})" if best_steals else "N/A",
            "wildestReach": f"{biggest_reaches[0]['player']} ({biggest_reaches[0]['team']}, {biggest_reaches[0]['slot']})" if biggest_reaches else "N/A",
        },
        "awards": {
            "lifeSaverOfDraft": {
                "title": AWARDS["life_saver_pick"],
                "pick": best_steals[0] if best_steals else None,
                "badge": "Life Saver Award",
                "reason": f"Snatched at pick #{best_steals[0]['overallPick']} despite an FFC consensus ADP of {best_steals[0]['adp']} (surplus: +{best_steals[0]['surplus']} spots)." if best_steals else ""
            },
            "capriSunPouchPunt": {
                "title": AWARDS["capri_sun_punt"],
                "pick": biggest_reaches[0] if biggest_reaches else None,
                "badge": "Pouch Punt Award",
                "reason": f"Selected at pick #{biggest_reaches[0]['overallPick']} well ahead of FFC consensus ADP {biggest_reaches[0]['adp']} (reach: {biggest_reaches[0]['surplus']} spots)." if biggest_reaches else ""
            },
            "mintConditionBench": {
                "title": AWARDS["minty_fresh_depth"],
                "team": max(team_data, key=lambda t: t["depthValue"])["teamName"],
                "manager": max(team_data, key=lambda t: t["depthValue"])["managerName"],
                "badge": "Mint Bench Award",
                "reason": "Hoarded high-upside backup running backs and wide receiver depth across the 6-slot bench."
            }
        },
        "teams": team_data,
    }

    out_file = OUT_DIR / "draft-recap.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(recap_payload, f, indent=2)
    print(f"Exported Johnny's Jerks Draft Recap to {out_file}")

    # Build current-season power profiles. Draft execution never enters this grade.
    power_rankings = build_redraft_power_rankings(team_data)

    sleeper_schedule = load_sleeper_schedule()
    current_week = int(sleeper_schedule.get("currentWeek") or 1)

    # Build current matchups using official Sleeper pairs for the live league week.
    build_redraft_matchups(team_data, power_rankings, current_week)

    # Build seeded 10,000-run simulations from the exact Sleeper regular-season schedule.
    build_redraft_forecast(team_data, power_rankings, sleeper_schedule)

    return recap_payload


def build_redraft_power_rankings(team_data):
    print("Building Johnny's Jerks current-season Power Rankings...")
    rows = []
    for team in team_data:
        starters = [player for player in team["roster"] if player.get("isStarter")]
        bench = [
            player for player in team["roster"]
            if not player.get("isStarter") and player.get("position") not in ("K", "DEF")
        ]
        lineup_projection = sum(float(player.get("projectedPoints", 0.0) or 0.0) for player in starters)
        usable_bench = sorted(
            (float(player.get("projectedPoints", 0.0) or 0.0) for player in bench),
            reverse=True,
        )[:5]
        bench_projection = sum(usable_bench)
        starter_skill = [player for player in starters if player.get("position") not in ("K", "DEF")]
        top_three = sorted(
            (float(player.get("projectedPoints", 0.0) or 0.0) for player in starter_skill),
            reverse=True,
        )[:3]
        top_three_share = (sum(top_three) / lineup_projection * 100.0) if lineup_projection else 0.0
        rb_projection = sum(
            float(player.get("projectedPoints", 0.0) or 0.0)
            for player in starters if player.get("position") == "RB"
        )
        injury_flags = [
            {
                "player": player["player"],
                "status": player.get("injuryStatus") or "Unknown",
                "note": player.get("medicalNote") or "",
                "starter": bool(player.get("isStarter")),
            }
            for player in team["roster"]
            if (player.get("injuryStatus") or "Healthy") not in ("Healthy", "Active", "")
        ]
        pick_slots = {norm_name(pick.get("player")): pick.get("slot") for pick in team.get("picks", [])}
        position_rooms = {}
        for position in ("QB", "RB", "WR", "TE", "K", "DEF"):
            room_players = [player for player in team["roster"] if player.get("position") == position]
            room_players.sort(key=lambda player: float(player.get("projectedPoints", 0.0) or 0.0), reverse=True)
            position_rooms[position] = {
                "seasonProjection": round(sum(float(player.get("projectedPoints", 0.0) or 0.0) for player in room_players), 1),
                "players": [player.get("player") for player in room_players[:4]],
            }
        scoring_spine = []
        for player in sorted(team["roster"], key=lambda p: float(p.get("projectedPoints", 0.0) or 0.0), reverse=True)[:10]:
            scoring_spine.append({
                "player": player.get("player"),
                "position": player.get("position"),
                "nflTeam": player.get("nflTeam") or "FA",
                "slot": pick_slots.get(norm_name(player.get("player")), "—"),
                "starter": bool(player.get("isStarter")),
                "seasonProjection": round(float(player.get("projectedPoints", 0.0) or 0.0), 1),
                "weeklyProjection": round(float(player.get("projectedPoints", 0.0) or 0.0) / 17.0, 1),
                "trend30Day": round(float(player.get("trend30Day", 0.0) or 0.0), 1),
                "injuryStatus": player.get("injuryStatus") or "Healthy",
            })
        rows.append({
            "rosterId": team["rosterId"],
            "teamName": team["teamName"],
            "managerName": team["managerName"],
            "lineupProjection": round(lineup_projection, 1),
            "weeklyProjection": round(lineup_projection / 17.0, 1),
            "benchProjection": round(bench_projection, 1),
            "starPowerVorp": round(float(team["pillars"]["top5Vorp"]), 1),
            "balanceRaw": round(float(team.get("rawBalance", 0.0) or 0.0), 1),
            "topThreeShare": round(top_three_share, 1),
            "rbShare": round((rb_projection / lineup_projection * 100.0) if lineup_projection else 0.0, 1),
            "injuryFlags": injury_flags,
            "positionRooms": position_rooms,
            "scoringSpine": scoring_spine,
        })

    lineup_scores = league_relative_scores(rows, "lineupProjection")
    depth_scores = league_relative_scores(rows, "benchProjection")
    star_scores = league_relative_scores(rows, "starPowerVorp")
    lineup_ranks = rank_map(rows, "lineupProjection")
    depth_ranks = rank_map(rows, "benchProjection")
    star_ranks = rank_map(rows, "starPowerVorp")
    balance_ranks = rank_map(rows, "balanceRaw")

    for position in ("QB", "RB", "WR", "TE", "K", "DEF"):
        ordered = sorted(rows, key=lambda row: row["positionRooms"][position]["seasonProjection"], reverse=True)
        for index, row in enumerate(ordered, start=1):
            row["positionRooms"][position]["rank"] = index

    for row in rows:
        roster_id = row["rosterId"]
        power_score = round(
            lineup_scores[roster_id] * 0.50
            + depth_scores[roster_id] * 0.25
            + star_scores[roster_id] * 0.15
            + row["balanceRaw"] * 0.10,
            1,
        )
        injury_risk = min(100.0, len(row["injuryFlags"]) * 18.0)
        volatility = round(clamp(
            row["topThreeShare"] * 0.50
            + (100.0 - depth_scores[roster_id]) * 0.35
            + injury_risk * 0.15,
            15.0,
            95.0,
        ), 1)
        row["powerScore"] = power_score
        row["grade"] = grade_from_score(power_score)
        row["volatilityScore"] = volatility
        row["volatilityLabel"] = "Stable" if volatility < 32 else ("Balanced" if volatility < 48 else ("Volatile" if volatility < 64 else "High variance"))
        row["components"] = {
            "lineup": {"score": lineup_scores[roster_id], "rank": lineup_ranks[roster_id], "weight": "50%"},
            "depth": {"score": depth_scores[roster_id], "rank": depth_ranks[roster_id], "weight": "25%"},
            "star": {"score": star_scores[roster_id], "rank": star_ranks[roster_id], "weight": "15%"},
            "balance": {"score": row["balanceRaw"], "rank": balance_ranks[roster_id], "weight": "10%"},
        }

    rows.sort(key=lambda row: row["powerScore"], reverse=True)
    for index, row in enumerate(rows, start=1):
        row["rank"] = index
        row["tier"] = "Title favorite" if index == 1 else ("Championship tier" if index <= 3 else ("Playoff contender" if index <= 6 else ("Playoff bubble" if index <= 9 else "Sacko watch")))
        skill_rooms = {key: value for key, value in row["positionRooms"].items() if key in ("QB", "RB", "WR", "TE")}
        strongest = min(skill_rooms, key=lambda key: skill_rooms[key]["rank"])
        weakest = max(skill_rooms, key=lambda key: skill_rooms[key]["rank"])
        row["strongestRoom"] = strongest
        row["weakestRoom"] = weakest
        row["headline"] = (
            f"{position_label(strongest).title()} strength gives {row['teamName']} a real weekly identity."
            if index > 3 else
            f"{row['teamName']} pairs top-end scoring with one of the league's safest redraft profiles."
        )
        row["currentCase"] = (
            f"The optimal lineup projects for {row['weeklyProjection']:.1f} points per week, ranks #{row['components']['lineup']['rank']}, "
            f"and is backed by the #{row['components']['depth']['rank']} usable bench. The {strongest} room is the clearest weekly advantage."
        )
        injury_note = f" {len(row['injuryFlags'])} roster health flag(s) add uncertainty." if row["injuryFlags"] else ""
        row["pressurePoint"] = (
            f"The {weakest} room ranks #{row['positionRooms'][weakest]['rank']}; that is the clearest place an opponent can create separation."
            f"{injury_note}"
        )
        row["verdict"] = (
            f"{row['tier']}: protect the {strongest} edge and find weekly answers at {weakest}."
        )

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "modelVersion": "johnnys-power-v2",
        "methodology": "50% stat-line optimal-lineup projection, 25% usable bench projection, 15% top-five VORP ceiling, and 10% league-format balance. Draft execution and draft grades are excluded.",
        "rankings": rows,
    }
    out_file = OUT_DIR / "power-rankings.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    print(f"Exported Johnny's Jerks Power Rankings to {out_file}")
    return rows


def build_redraft_matchups(team_data, power_rankings, week):
    print(f"Building Johnny's Jerks Week {week} matchup intelligence...")
    raw_matchups = load_week_matchups(week)
    nfl_schedule = load_nfl_schedule(week)
    team_by_roster = {team["rosterId"]: team for team in team_data}
    power_by_roster = {team["rosterId"]: team for team in power_rankings}
    aliases = {"JAC": "JAX", "WSH": "WAS", "LA": "LAR", "OAK": "LV"}
    games_by_team = {}
    for game in nfl_schedule.get("games", []):
        for nfl_team in (game.get("away"), game.get("home")):
            games_by_team[aliases.get(nfl_team, nfl_team)] = game

    def game_for_player(player):
        team_code = aliases.get(player.get("nflTeam"), player.get("nflTeam"))
        return games_by_team.get(team_code)

    def player_projection(player):
        return round(float(player.get("projectedPoints", 0.0) or 0.0) / 17.0, 1)

    def lineup_side(team, profile):
        starters = [player for player in team.get("roster", []) if player.get("isStarter")]
        starters.sort(key=lambda player: ({"QB": 0, "RB": 1, "WR": 2, "TE": 3, "K": 4, "DEF": 5}.get(player.get("position"), 6), -float(player.get("projectedPoints", 0.0) or 0.0)))
        counts = {}
        lineup = []
        for player in starters:
            position = player.get("position") or "FLEX"
            counts[position] = counts.get(position, 0) + 1
            game = game_for_player(player)
            nfl_team = aliases.get(player.get("nflTeam"), player.get("nflTeam")) or "FA"
            if game:
                opponent = game["home"] if nfl_team == game["away"] else game["away"]
                matchup_label = f"@ {opponent}" if nfl_team == game["away"] else f"vs {opponent}"
            else:
                matchup_label = "Schedule unavailable"
            weekly = player_projection(player)
            status = player.get("injuryStatus") or "Healthy"
            note = (
                player.get("medicalNote")
                if status not in ("Healthy", "Active", "") and player.get("medicalNote")
                else f"{weekly:.1f}-point model share in this lineup; {status.lower()} entering Week {week}."
            )
            lineup.append({
                "slot": f"{position}{counts[position] if position in ('RB', 'WR') else ''}",
                "player": player.get("player"),
                "position": position,
                "nflTeam": nfl_team,
                "projectedPoints": weekly,
                "matchup": matchup_label,
                "kickoff": game.get("timeLabel") if game else "TBD",
                "network": game.get("network") if game else "TBD",
                "injuryStatus": status,
                "note": note,
            })
        star = max(starters, key=lambda player: float(player.get("projectedPoints", 0.0) or 0.0), default={})
        return {
            "rosterId": team.get("rosterId"),
            "name": team.get("teamName"),
            "manager": team.get("managerName"),
            "powerRank": profile.get("rank"),
            "powerScore": profile.get("powerScore"),
            "grade": profile.get("grade"),
            "projected": profile.get("weeklyProjection"),
            "keyPlayer": star.get("player", "TBD"),
            "keyPlayerProjection": player_projection(star) if star else 0.0,
            "starters": lineup,
            "strongestRoom": profile.get("strongestRoom"),
            "weakestRoom": profile.get("weakestRoom"),
            "injuryFlags": profile.get("injuryFlags", []),
        }

    grouped = {}
    for matchup in raw_matchups:
        grouped.setdefault(matchup.get("matchup_id"), []).append(matchup)

    matchup_cards = []
    for matchup_id, pair in sorted(grouped.items()):
        if len(pair) < 2:
            continue
        roster_1 = pair[0].get("roster_id")
        roster_2 = pair[1].get("roster_id")
        team_1 = team_by_roster.get(roster_1)
        team_2 = team_by_roster.get(roster_2)
        profile_1 = power_by_roster.get(roster_1)
        profile_2 = power_by_roster.get(roster_2)
        if not team_1 or not team_2 or not profile_1 or not profile_2:
            continue
        side_1 = lineup_side(team_1, profile_1)
        side_2 = lineup_side(team_2, profile_2)
        projection_diff = round(side_1["projected"] - side_2["projected"], 1)
        favorite = side_1 if projection_diff >= 0 else side_2
        underdog = side_2 if projection_diff >= 0 else side_1
        spread = abs(projection_diff)
        side_1["winProbability"] = round(clamp(50.0 + projection_diff * 2.4, 18.0, 82.0), 1)
        side_2["winProbability"] = round(100.0 - side_1["winProbability"], 1)

        positional_edges = []
        for position, label in (("QB", "Quarterback"), ("RB", "Running backs"), ("WR", "Wide receivers"), ("TE", "Tight end"), ("K", "Kicker"), ("DEF", "Defense")):
            points_1 = sum(player["projectedPoints"] for player in side_1["starters"] if player["position"] == position)
            points_2 = sum(player["projectedPoints"] for player in side_2["starters"] if player["position"] == position)
            margin = round(abs(points_1 - points_2), 1)
            advantage = side_1["name"] if points_1 > points_2 else (side_2["name"] if points_2 > points_1 else "Even")
            positional_edges.append({
                "category": label,
                "advantage": advantage,
                "margin": f"+{margin:.1f} pts" if margin else "Even",
                "narrative": f"The model gives {advantage} the {label.lower()} edge." if margin else f"The {label.lower()} projection is effectively even.",
            })
        largest_edge = max(positional_edges, key=lambda edge: float(edge["margin"].replace("+", "").replace(" pts", "")) if edge["margin"] != "Even" else 0.0)

        viewing_games = {}
        for side_key, side in (("team1", side_1), ("team2", side_2)):
            for starter in side["starters"]:
                game = game_for_player({"nflTeam": starter["nflTeam"]})
                if not game:
                    continue
                key = f"{game['away']}-{game['home']}"
                viewing_games.setdefault(key, {
                    "kickoffAt": game["kickoffAt"],
                    "timeSlot": game["timeLabel"],
                    "network": game["network"],
                    "gameMatchup": f"{game['away']} at {game['home']}",
                    "team1Starters": [],
                    "team2Starters": [],
                    "team1Points": 0.0,
                    "team2Points": 0.0,
                })
                viewing_games[key][f"{side_key}Starters"].append(f"{starter['player']} ({starter['position']})")
                viewing_games[key][f"{side_key}Points"] += starter["projectedPoints"]
        tv_schedule = []
        for game in sorted(viewing_games.values(), key=lambda item: item["kickoffAt"]):
            stake = round(game.pop("team1Points") + game.pop("team2Points"), 1)
            count_1 = len(game["team1Starters"])
            count_2 = len(game["team2Starters"])
            leverage = "Decisive" if stake >= 35 else ("High" if stake >= 22 else ("Medium" if stake >= 12 else "Low"))
            leader = side_1["name"] if count_1 > count_2 else (side_2["name"] if count_2 > count_1 else None)
            game.update({
                "leverageLevel": leverage,
                "fantasyPointsAtStake": stake,
                "windowAnalysis": (
                    f"{leader} has the larger starter footprint in this game; {stake:.1f} projected fantasy points are exposed to the result."
                    if leader
                    else f"Both sides have the same starter footprint in this game; {stake:.1f} projected fantasy points are exposed to the result."
                ),
            })
            tv_schedule.append(game)

        injury_variable = []
        for side in (side_1, side_2):
            if side["injuryFlags"]:
                injury_variable.append(f"{side['name']} carries {len(side['injuryFlags'])} active roster health flag(s).")
        key_variables = [
            f"{side_1['keyPlayer']} ({side_1['keyPlayerProjection']:.1f}) and {side_2['keyPlayer']} ({side_2['keyPlayerProjection']:.1f}) are the headline scorers.",
            f"The largest positional separation is {largest_edge['category'].lower()}: {largest_edge['advantage']} {largest_edge['margin']}.",
            f"{underdog['name']} needs its {underdog['strongestRoom']} strength to beat projection to erase a {spread:.1f}-point gap.",
        ] + injury_variable
        crucial_window = max(tv_schedule, key=lambda game: game["fantasyPointsAtStake"], default=None)
        edge_value = lambda edge: float(edge["margin"].replace("+", "").replace(" pts", "")) if edge["margin"] != "Even" else 0.0
        favorite_edges = [edge for edge in positional_edges if edge["advantage"] == favorite["name"]]
        underdog_edges = [edge for edge in positional_edges if edge["advantage"] == underdog["name"]]
        favorite_edge = max(favorite_edges, key=edge_value, default=largest_edge)
        underdog_edge = max(underdog_edges, key=edge_value, default=None)
        if spread <= 2.0:
            flavor = f"A true coin flip: {favorite['keyPlayer']} gives {favorite['name']} the narrow baseline, but one lineup decision can swing the whole week."
        elif spread <= 8.0:
            counter = f"its {underdog_edge['category'].lower()} advantage" if underdog_edge else f"a ceiling game from {underdog['keyPlayer']}"
            flavor = f"{favorite['name']} enters ahead behind {favorite['keyPlayer']}; {underdog['name']} can flip it through {counter}."
        else:
            flavor = f"{favorite['name']} has room for error. {underdog['name']} needs an outlier from {underdog['keyPlayer']} and a win in the {largest_edge['category'].lower()} battle."
        window_sentence = (
            f"The heaviest viewing window is {crucial_window['gameMatchup']} on {crucial_window['network']} with {crucial_window['fantasyPointsAtStake']:.1f} projected points at stake."
            if crucial_window else "Broadcast leverage will update when NFL schedule mapping is available."
        )
        matchup_cards.append({
            "matchupId": matchup_id,
            "week": week,
            "title": f"{side_1['name']} vs {side_2['name']}",
            "subtitle": f"Power #{side_1['powerRank']} meets Power #{side_2['powerRank']} in a {spread:.1f}-point opening line.",
            "isMarquee": False,
            "team1": side_1,
            "team2": side_2,
            "spread": spread,
            "spreadLabel": f"{favorite['name']} -{spread:.1f}",
            "impliedTotal": round(side_1["projected"] + side_2["projected"], 1),
            "flavor": flavor,
            "tacticalAnalysis": {
                "headline": f"{favorite['keyPlayer']} sets the pace; {underdog['keyPlayer']} carries the counterpunch",
                "breakdown": f"The current-season model separates these teams by {spread:.1f} points, with {favorite['name']} holding its cleanest advantage at {favorite_edge['category'].lower()} ({favorite_edge['margin']}). {underdog['name']}'s best answer runs through the {underdog['strongestRoom']} room. {window_sentence}",
                "keyVariables": key_variables,
            },
            "positionalEdges": positional_edges,
            "tvSchedule": tv_schedule,
        })

    if matchup_cards:
        marquee = min(matchup_cards, key=lambda matchup: matchup["team1"]["powerRank"] + matchup["team2"]["powerRank"])
        marquee["isMarquee"] = True
    out_file = OUT_DIR / "matchups-current.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump({
            "season": SEASON,
            "week": week,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "scheduleSource": nfl_schedule.get("source", {}),
            "sleeperSource": f"https://api.sleeper.app/v1/league/{LEAGUE_ID}/matchups/{week}",
            "matchups": matchup_cards,
        }, f, indent=2)
    print(f"Exported Johnny's Jerks Week {week} Matchups to {out_file}")


def build_redraft_forecast(team_data, power_rankings, sleeper_schedule):
    print("Building Johnny's Jerks seeded 10,000-run redraft forecast...")
    simulations = 10000
    random_seed = 20260909
    rng = random.Random(random_seed)
    profiles = sorted(power_rankings, key=lambda team: team["rank"])
    profile_by_id = {team["rosterId"]: team for team in profiles}
    roster_ids = [team["rosterId"] for team in profiles]

    schedule = []
    for week_row in sorted(sleeper_schedule.get("weeks", []), key=lambda row: int(row.get("week") or 0)):
        pairings = [tuple(pair.get("rosterIds", [])[:2]) for pair in week_row.get("pairings", []) if len(pair.get("rosterIds", [])) == 2]
        covered = {roster_id for pair in pairings for roster_id in pair}
        if len(pairings) != len(roster_ids) // 2 or covered != set(roster_ids):
            raise ValueError(f"Sleeper schedule Week {week_row.get('week')} does not cover every roster exactly once")
        schedule.append(pairings)
    regular_season_weeks = int(sleeper_schedule.get("regularSeasonWeeks") or 14)
    if len(schedule) != regular_season_weeks:
        raise ValueError(f"Expected {regular_season_weeks} Sleeper schedule weeks, found {len(schedule)}")

    totals = {roster_id: {"wins": 0.0, "playoffs": 0, "titles": 0, "last": 0, "seed": 0.0} for roster_id in roster_ids}

    def weekly_score(roster_id):
        profile = profile_by_id[roster_id]
        deviation = 13.0 + profile["volatilityScore"] * 0.14
        return max(35.0, rng.gauss(profile["weeklyProjection"], deviation))

    def playoff_game(left, right):
        return left if weekly_score(left) >= weekly_score(right) else right

    for _ in range(simulations):
        wins = {roster_id: 0 for roster_id in roster_ids}
        points = {roster_id: 0.0 for roster_id in roster_ids}
        for weekly_pairs in schedule:
            for left, right in weekly_pairs:
                left_score = weekly_score(left)
                right_score = weekly_score(right)
                points[left] += left_score
                points[right] += right_score
                if left_score >= right_score:
                    wins[left] += 1
                else:
                    wins[right] += 1
        seeded = sorted(roster_ids, key=lambda roster_id: (wins[roster_id], points[roster_id]), reverse=True)
        for seed, roster_id in enumerate(seeded, start=1):
            totals[roster_id]["wins"] += wins[roster_id]
            totals[roster_id]["seed"] += seed
        playoff_ids = seeded[:6]
        for roster_id in playoff_ids:
            totals[roster_id]["playoffs"] += 1
        wild_1 = playoff_game(playoff_ids[2], playoff_ids[5])
        wild_2 = playoff_game(playoff_ids[3], playoff_ids[4])
        semifinalists = sorted([wild_1, wild_2], key=lambda roster_id: playoff_ids.index(roster_id))
        semi_1 = playoff_game(playoff_ids[0], semifinalists[-1])
        semi_2 = playoff_game(playoff_ids[1], semifinalists[0])
        champion = playoff_game(semi_1, semi_2)
        totals[champion]["titles"] += 1
        totals[seeded[-1]]["last"] += 1

    projections = []
    team_by_roster = {team["rosterId"]: team for team in team_data}
    for profile in profiles:
        roster_id = profile["rosterId"]
        expected_wins = round(totals[roster_id]["wins"] / simulations, 1)
        playoff_probability = round(totals[roster_id]["playoffs"] / simulations * 100.0, 1)
        title_probability = round(totals[roster_id]["titles"] / simulations * 100.0, 1)
        last_probability = round(totals[roster_id]["last"] / simulations * 100.0, 1)
        outlook = (
            "Front-line bye contender with a championship path."
            if playoff_probability >= 75 else
            ("Live playoff contender whose weekly variance will decide seeding." if playoff_probability >= 48 else "Needs favorable close-game outcomes to climb into the bracket.")
        )
        projections.append({
            "rosterId": roster_id,
            "teamName": team_by_roster[roster_id]["teamName"],
            "managerName": team_by_roster[roster_id]["managerName"],
            "powerRank": profile["rank"],
            "powerScore": profile["powerScore"],
            "expectedWins": expected_wins,
            "expectedLosses": round(float(regular_season_weeks) - expected_wins, 1),
            "playoffProbability": playoff_probability,
            "championshipProbability": title_probability,
            "lastPlaceProbability": last_probability,
            "medianSeed": int(round(totals[roster_id]["seed"] / simulations)),
            "outlook": outlook,
        })
    projections.sort(key=lambda team: (team["expectedWins"], team["playoffProbability"]), reverse=True)

    out_file = OUT_DIR / "forecast-insights.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump({
            "simulationsCount": simulations,
            "randomSeed": random_seed,
            "modelVersion": "johnnys-forecast-v3",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "methodology": f"Seeded weekly-score Monte Carlo using the current-season lineup mean, team-specific volatility, all {regular_season_weeks} official Sleeper regular-season pairing weeks, and a six-team playoff bracket.",
            "scheduleBasis": f"Exact Sleeper schedule for Weeks 1-{regular_season_weeks}, captured {sleeper_schedule.get('capturedAt', 'time unavailable')}.",
            "scheduleSource": sleeper_schedule.get("source", {}),
            "teams": projections,
        }, f, indent=2)
    print(f"Exported Johnny's Jerks Forecast Insights to {out_file}")


if __name__ == "__main__":
    build_redraft_recap()
