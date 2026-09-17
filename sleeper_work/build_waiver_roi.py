#!/usr/bin/env python3
"""build_waiver_roi.py

Ingests Sleeper transactions, rosters, and matchup histories to evaluate:
1. Manager transaction profiles and FAAB spend velocity.
2. Immediate impact of recent waiver wire pickups.
3. Season-long move ROI (points scored post-pickup, starts count, points per FAAB dollar).
4. Franchise role promotions (e.g., player becoming team's leading RB or WR).
5. Macro league-wide waiver trends and spotlight narrative case studies.

Supports both Ape's Mac Salad (Dynasty) and Johnny's Jerks (Redraft).
Outputs:
  - src/generated/waiver-wire-analysis.json
  - src/generated/johnnys-jerks/waiver-wire-analysis.json
"""

import argparse
import datetime
import gzip
import json
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(HERE, ".."))

AMS_LEAGUE_ID = "1312209616372772864"
JOHNNYS_LEAGUE_ID = "1401673232670539776"


def fetch_sleeper(endpoint):
    url = f"https://api.sleeper.app/v1/{endpoint.lstrip('/')}"
    req = urllib.request.Request(url, headers={"User-Agent": "AMS-Waiver-Analytics/2.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def load_players_map():
    candidate_paths = [
        os.path.join(PROJECT_ROOT, "sleeper_work", "raw", "players.json"),
        os.path.join(PROJECT_ROOT, "raw", "players.json"),
        os.path.join(HERE, "raw", "players.json"),
    ]
    for path in candidate_paths:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    raw = json.load(f)
                    return {
                        pid: {
                            "name": p.get("full_name") or f"{p.get('first_name', '')} {p.get('last_name', '')}".strip() or f"Player {pid}",
                            "position": p.get("position") or "FLEX",
                            "team": p.get("team") or "FA",
                            "injury": p.get("injury_status") or None,
                        }
                        for pid, p in raw.items()
                    }
            except Exception as e:
                print(f"  Warning loading {path}: {e}")
    return {}


def determine_manager_archetype(moves_count, faab_spent, waiver_count):
    if faab_spent >= 35:
        return "Aggressive Whale"
    if waiver_count >= 3 and faab_spent <= 10:
        return "Value Hunter"
    if moves_count >= 5 and faab_spent == 0:
        return "Zero-Dollar Scavenger"
    if moves_count <= 1 and faab_spent == 0:
        return "Patient Hoarder"
    if moves_count >= 8:
        return "Roster Churner"
    return "Balanced Streamer"


def determine_roi_badge(points, starts, bid):
    bid_val = max(1, bid)
    pts_per_dollar = points / bid_val
    if points >= 20 and starts >= 1 and (bid <= 15 or pts_per_dollar >= 2.0):
        return "League-Winner Steal", "badge-league-winner"
    if points >= 14 and starts >= 1:
        return "High-Yield Value", "badge-high-yield"
    if starts >= 1:
        return "Solid Contributor", "badge-contributor"
    if points > 0:
        return "Depth Stash", "badge-stash"
    if points == 0 and bid >= 10:
        return "FAAB Burner", "badge-bust"
    return "Depth Flier", "badge-flier"


def classify_pick(pick_str):
    lower = pick_str.lower()
    if "round 1" in lower:
        return {"round": 1, "tier": "Tier 1", "tierName": "Premium Capital", "equityScore": 150}
    elif "round 2" in lower:
        return {"round": 2, "tier": "Tier 2", "tierName": "Impact Capital", "equityScore": 80}
    elif "round 3" in lower:
        return {"round": 3, "tier": "Tier 3", "tierName": "Depth Asset", "equityScore": 35}
    else:
        return {"round": 4, "tier": "Tier 4", "tierName": "Roster Flier", "equityScore": 15}


# FantasyCalc baseline valuations for traded future picks
PICK_VALUES_AUG = {
    "2027 round 1": 2800,
    "2027 round 2": 1500,
    "2027 round 3": 1000,
    "2027 round 4": 800,
    "2026 round 1": 3100,
    "2026 round 2": 1600,
    "2026 round 3": 1100,
    "2026 round 4": 850,
}

PICK_VALUES_SEP = {
    "2027 round 1": 2907,
    "2027 round 2": 1549,
    "2027 round 3": 1057,
    "2027 round 4": 841,
    "2026 round 1": 3100,
    "2026 round 2": 1600,
    "2026 round 3": 1100,
    "2026 round 4": 850,
}

# Positional VORP baselines per active starting game (12-team start 1QB/2RB/3WR/1TE/2FLEX)
POS_BASELINES = {
    "QB": 13.0,
    "RB": 6.0,
    "WR": 7.0,
    "TE": 4.5,
    "FLEX": 6.5,
}


def calculate_waiver_grade(total_pts, starter_pts, starts_count, bid, tx_type, current_role, is_still_rostered, position):
    """
    Computes a letter grade (A+ through F), numerical score, css class, and title for a waiver/FA move.
    """
    score = 50.0

    # 1. Starting Lineup Impact (up to +35 pts)
    if starts_count >= 2:
        score += min(35.0, 20.0 + starter_pts * 0.6)
    elif starts_count == 1:
        score += min(28.0, 14.0 + starter_pts * 0.7)
    else:
        score += min(10.0, total_pts * 0.5)

    # 2. Points Scored (up to +15 pts)
    if total_pts >= 25.0:
        score += 15.0
    elif total_pts >= 15.0:
        score += 10.0
    elif total_pts >= 8.0:
        score += 6.0
    elif total_pts > 0:
        score += 3.0

    # 3. FAAB Cost / Capital Efficiency (+15 to -25 pts)
    if tx_type == "free_agent" or bid == 0:
        if total_pts >= 10.0 or starts_count >= 1:
            score += 15.0
        elif total_pts > 0:
            score += 10.0
        else:
            score += 5.0
    else:
        bid_val = max(1, bid)
        pts_per_dollar = total_pts / bid_val
        if pts_per_dollar >= 2.0 and total_pts >= 14:
            score += 15.0
        elif pts_per_dollar >= 1.0:
            score += 10.0
        elif pts_per_dollar >= 0.5:
            score += 5.0
        elif bid >= 25 and starts_count == 0 and total_pts < 5:
            score -= 22.0
        elif bid >= 15 and total_pts == 0:
            score -= 16.0
        elif bid >= 10 and total_pts < 3:
            score -= 10.0

    # 4. Role & Retention (+10 to -15 pts)
    if "Leading" in current_role:
        score += 10.0
    elif "Starting" in current_role:
        score += 7.0
    elif "Bench" in current_role and is_still_rostered:
        score += 3.0
    elif not is_still_rostered:
        if starts_count >= 1 and total_pts >= 8.0:
            score += 0.0
        elif total_pts == 0 and bid >= 5:
            score -= 15.0
        else:
            score -= 8.0

    score = max(5.0, min(99.0, score))

    if score >= 91:
        return "A+", round(score, 1), "grade-a-plus", "League-Winning Masterstroke"
    elif score >= 85:
        return "A", round(score, 1), "grade-a", "High-Yield Smash"
    elif score >= 80:
        return "A-", round(score, 1), "grade-a", "Quality Starter Addition"
    elif score >= 75:
        return "B+", round(score, 1), "grade-b-plus", "Impact Starter Value"
    elif score >= 70:
        return "B", round(score, 1), "grade-b", "Solid Contributor"
    elif score >= 65:
        return "B-", round(score, 1), "grade-b", "Capable Depth Asset"
    elif score >= 60:
        return "C+", round(score, 1), "grade-c-plus", "Viable Bench Stash"
    elif score >= 52:
        return "C", round(score, 1), "grade-c", "Modest Reserve Stash"
    elif score >= 45:
        return "C-", round(score, 1), "grade-c", "Low-Yield Hold"
    elif score >= 38:
        return "D+", round(score, 1), "grade-d", "Disappointing Return"
    elif score >= 30:
        return "D", round(score, 1), "grade-d", "Costly Underperformer"
    else:
        return "F", round(score, 1), "grade-f", "Capital Bust / Wasted FAAB"


def generate_waiver_commentary(player_name, pos, nfl_team, manager, acquired_week, tx_type, bid, total_pts, starts_count, starter_pts, current_role, is_still_rostered, grade, grade_title):
    cost_str = f"${bid} FAAB claim" if tx_type == "waiver" and bid > 0 else "$0 free agent add"
    team_tag = f" ({nfl_team})" if nfl_team and nfl_team != "FA" else ""

    if grade in ("A+", "A", "A-"):
        if starts_count >= 1:
            pts_ratio = f" ({round(total_pts / max(1, bid), 1)}x pts/dollar)" if bid > 0 else " on zero dollar risk"
            return (
                f"A home run transaction for {manager}. Landing {player_name}{team_tag} via {cost_str} in Week {acquired_week} paid off immediately with "
                f"{starter_pts:.1f} starting fantasy points across {starts_count} start(s){pts_ratio}. Now holding down the role of {current_role}, this move represents elite wire execution."
            )
        else:
            return (
                f"Outstanding proactive acquisition by {manager}. Snagging {player_name}{team_tag} via {cost_str} has generated {total_pts:.1f} bench points, "
                f"establishing crucial high-ceiling insurance and vaulting into {current_role} status."
            )
    elif grade in ("B+", "B", "B-"):
        if starts_count >= 1:
            return (
                f"A reliable starting fill-in for {manager}. {player_name}{team_tag} was acquired via {cost_str} and delivered {starter_pts:.1f} points in {starts_count} starting assignment(s). "
                f"A dependable lineup solution that satisfied a critical roster need as {current_role}."
            )
        else:
            return (
                f"Solid developmental depth for {manager}. Adding {player_name}{team_tag} via {cost_str} shores up positional depth behind active starters, "
                f"providing a stable stash as {current_role}."
            )
    elif grade in ("C+", "C", "C-"):
        if is_still_rostered:
            return (
                f"Speculative bench flyer for {manager}. Acquired via {cost_str} in Week {acquired_week}, {player_name}{team_tag} has logged {starts_count} start(s) and {total_pts:.1f} total points. "
                f"Currently rostered as {current_role}, waiting on a path to expanded volume."
            )
        else:
            return (
                f"Short-term depth maneuver for {manager}. {player_name}{team_tag} was picked up via {cost_str} and subsequently cut after contributing {total_pts:.1f} points. Low risk, modest outcome."
            )
    else:
        if bid >= 10:
            return (
                f"Costly budget misfire for {manager}. Committing {cost_str} for {player_name}{team_tag} has yielded just {total_pts:.1f} points and {starts_count} starts to date. "
                f"A substantial FAAB commitment that has severely underperformed expectations."
            )
        else:
            return (
                f"Empty flyer for {manager}. {player_name}{team_tag} failed to provide on-field utility ({total_pts:.1f} pts in {starts_count} starts) after being acquired via {cost_str}."
            )


def calculate_trade_team_grade(team, opponent_team=None):
    """
    Computes a letter grade (A+ through F), numerical score, css class, and title for a team's side of a trade.
    """
    score = 65.0
    net_pts = team.get("realizedNetPoints", team.get("netPoints", 0.0))
    net_vorp = team.get("netVorp", 0.0)
    net_equity = team.get("netDynastyEquity", 0)
    starts = team.get("totalRealizedStarts", team.get("startsReceived", 0))
    strat_role = team.get("strategicRole", "")
    has_picks_rec = bool(team.get("receivedPicksDetails"))

    # 1. On-field / VORP yield
    if net_vorp >= 15.0:
        score += 20.0
    elif net_vorp >= 8.0:
        score += 15.0
    elif net_vorp >= 3.0:
        score += 10.0
    elif net_vorp <= -10.0 and not has_picks_rec:
        score -= 15.0
    elif net_vorp <= -5.0 and not has_picks_rec:
        score -= 8.0

    if net_pts >= 25.0:
        score += 12.0
    elif net_pts >= 12.0:
        score += 8.0
    elif net_pts <= -20.0 and not has_picks_rec:
        score -= 12.0

    # 2. Dynasty Market Equity Capture
    if net_equity >= 600:
        score += 20.0
    elif net_equity >= 300:
        score += 14.0
    elif net_equity >= 100:
        score += 8.0
    elif net_equity <= -600 and net_vorp < 5.0:
        score -= 16.0
    elif net_equity <= -300 and net_vorp < 0.0:
        score -= 10.0

    # 3. Starts & Utility
    if starts >= 2 and net_pts > 0:
        score += 8.0
    elif starts == 0 and not has_picks_rec and net_equity < 0:
        score -= 8.0

    # 4. Strategic Alignment
    if "Win-Now" in strat_role and (starts >= 1 or net_pts >= 10.0):
        score += 8.0
    if "Dynasty Equity" in strat_role and net_equity > 0:
        score += 8.0
    if "Future Capital Haul" in strat_role and has_picks_rec:
        score += 6.0

    score = max(10.0, min(99.0, score))

    if score >= 91:
        return "A+", round(score, 1), "grade-a-plus", "Franchise-Altering Masterstroke"
    elif score >= 85:
        return "A", round(score, 1), "grade-a", "Elite Value Acquisition"
    elif score >= 80:
        return "A-", round(score, 1), "grade-a", "Strong Positive Return"
    elif score >= 75:
        return "B+", round(score, 1), "grade-b-plus", "Net Value Gain"
    elif score >= 70:
        return "B", round(score, 1), "grade-b", "Solid Strategic Move"
    elif score >= 65:
        return "B-", round(score, 1), "grade-b", "Acceptable Equity Exchange"
    elif score >= 60:
        return "C+", round(score, 1), "grade-c-plus", "Modest Rebuild Exchange"
    elif score >= 52:
        return "C", round(score, 1), "grade-c", "Even Market Swap"
    elif score >= 45:
        return "C-", round(score, 1), "grade-c", "Slight Value Deficit"
    elif score >= 38:
        return "D+", round(score, 1), "grade-d", "Disadvantageous Return"
    elif score >= 30:
        return "D", round(score, 1), "grade-d", "Severe Capital Drain"
    else:
        return "F", round(score, 1), "grade-f", "Disastrous Fleecing"


def generate_trade_team_commentary(team, opponent_team=None):
    mgr = team.get("manager", "Manager")
    team_name = team.get("teamName", "Team")
    net_pts = team.get("realizedNetPoints", team.get("netPoints", 0.0))
    net_vorp = team.get("netVorp", 0.0)
    net_eq = team.get("netDynastyEquity", 0)
    starts = team.get("totalRealizedStarts", team.get("startsReceived", 0))
    rec_players = team.get("receivedPlayers", [])
    rec_picks = team.get("receivedPicksDetails", [])

    rec_names = [p["name"] for p in rec_players]
    if rec_picks:
        for p in rec_picks:
            if p.get("draftedPlayer"):
                rec_names.append(f"{p['draftedPlayer']['playerName']} (Pick #{p['draftedPlayer']['pickSlot']})")
            else:
                rec_names.append(f"Pick (Rd {p['round']})")

    rec_summary = ", ".join(rec_names[:3]) or "assets"

    if net_eq >= 300 and net_pts <= 0:
        return (
            f"{mgr} capitalized on premier asset liquidity by landing {rec_summary}. While relinquishing immediate on-field production, "
            f"{team_name} secured a commanding +{net_eq:,} dynasty market equity surplus, successfully pivoting high-value capital into foundational long-term assets."
        )
    elif net_vorp >= 8.0 and net_pts >= 10.0:
        return (
            f"An aggressive championship maneuver for {mgr}. Injecting {rec_summary} into the lineup delivered immediate high-end yield: "
            f"+{net_pts:.1f} net points and +{net_vorp:+.1f} net VORP across {starts} start(s), decisively tilting weekly matchup odds in {team_name}'s favor."
        )
    elif net_eq < -200 and net_pts < -5.0:
        return (
            f"A challenging early ledger for {mgr}. Surrendering {rec_summary} has left {team_name} facing an on-field deficit ({net_pts:.1f} net pts, {net_vorp:+.1f} VORP) "
            f"and a -{abs(net_eq):,} dynasty equity margin. Future asset maturation will be vital to salvage long-term return."
        )
    elif rec_picks and not rec_players:
        return (
            f"A forward-looking capital play by {mgr}. Banking {rec_summary} bolstered {team_name}'s future draft inventory with {net_eq:+d} market equity, "
            f"positioning the franchise for upcoming draft board flexibility."
        )
    else:
        return (
            f"A calculated strategic realignment for {mgr}. {team_name} secured {rec_summary}, balancing on-field scoring margin ({net_pts:+.1f} pts) "
            f"with roster depth requirements ({net_eq:+d} net market equity)."
        )


def generate_franchise_transaction_commentary(
    manager, team_name, archetype, moves_count, faab_spent, faab_remaining,
    pts_contributed, starter_pts, top_pickup, m_trades, net_trade_pts, net_trade_vorp, net_dynasty_delta
):
    parts = []
    num_trades = len(m_trades)

    if moves_count == 0 and num_trades == 0:
        return (
            f"{manager} has remained entirely dormant on the transaction wire, executing 0 moves and 0 trades. "
            f"By preserving 100% of their $100 FAAB budget, {team_name} is banking entirely on draft-day roster construction, "
            f"maintaining full bidding leverage for late-season emergencies."
        )

    if num_trades > 0 and moves_count > 0:
        activity_str = f"executed an active dual-market playbook with {moves_count} waiver/FA claim(s) and {num_trades} trade(s)"
    elif num_trades > 0:
        activity_str = f"focused their roster tuning on the trade block with {num_trades} completed deal(s) while bypassing the waiver wire"
    else:
        activity_str = f"relied exclusively on the waiver wire, executing {moves_count} move(s) with zero trades logged"

    parts.append(f"{manager} ({team_name}) has {activity_str} operating under a {archetype} archetype.")

    # 2. Waiver Wire Impact
    if moves_count > 0:
        top_name = top_pickup.get("name") if top_pickup else None
        top_pts = top_pickup.get("points", 0.0) if top_pickup else 0.0
        top_bid = top_pickup.get("bid", 0) if top_pickup else 0

        waiver_benefit = []
        if starter_pts > 0:
            waiver_benefit.append(f"delivering {starter_pts:.1f} points directly into the active starting lineup ({pts_contributed:.1f} total pts across roster)")
        elif pts_contributed > 0:
            waiver_benefit.append(f"generating {pts_contributed:.1f} points of bench depth and injury insulation")
        else:
            waiver_benefit.append("accumulating speculative depth awaiting offensive opportunity")

        if top_name and top_pts > 0:
            waiver_benefit.append(f"headlined by {top_name} ({top_pts:.1f} pts, ${top_bid} bid)")

        spend_str = f"${faab_spent} FAAB committed with ${faab_remaining} preserved" if faab_spent > 0 else "zero FAAB spent ($100 budget intact)"
        parts.append(f"On waivers ({spend_str}), acquisitions have paid off by {', '.join(waiver_benefit)}.")
    else:
        parts.append(f"On the wire, they preserved their full $100 FAAB balance with zero claims.")

    # 3. Trade Impact
    if num_trades > 0:
        trade_benefit = []
        if net_trade_pts > 0:
            trade_benefit.append(f"a positive on-field scoring yield of +{net_trade_pts:.1f} net points")
        elif net_trade_pts < 0:
            trade_benefit.append(f"an on-field scoring concession of {net_trade_pts:.1f} net points")

        if net_trade_vorp > 0:
            trade_benefit.append(f"+{net_trade_vorp:+.1f} net VORP")
        elif net_trade_vorp < 0:
            trade_benefit.append(f"{net_trade_vorp:+.1f} net VORP")

        if net_dynasty_delta and abs(net_dynasty_delta) > 50:
            if net_dynasty_delta > 0:
                trade_benefit.append(f"a +{net_dynasty_delta:,} dynasty equity surplus")
            else:
                trade_benefit.append(f"a {net_dynasty_delta:,} dynasty equity adjustment")

        if trade_benefit:
            parts.append(f"Through dealmaking, their trades have generated {', '.join(trade_benefit)}.")
        else:
            parts.append(f"Their {num_trades} trade(s) represent neutral realignment swaps balancing positional needs.")
    elif num_trades == 0:
        parts.append("They have not completed any trades, keeping their original drafted roster structure and draft capital intact.")

    # 4. Overall Benefit Verdict
    total_net_benefit = pts_contributed + (net_trade_pts if num_trades > 0 else 0)
    if total_net_benefit >= 15.0 or (net_dynasty_delta and net_dynasty_delta >= 400):
        verdict = "Overall, their in-season moves have significantly strengthened franchise competitive viability."
    elif total_net_benefit > 0 or faab_remaining >= 85:
        verdict = "Overall, their transactions represent cost-effective roster enhancement with substantial budget flexibility retained."
    else:
        verdict = "Overall, their moves have served as modest depth stabilization, though future production will dictate long-term payoff."

    parts.append(verdict)
    return " ".join(parts)


def calc_vorp(points, starts, position):
    base_per_game = POS_BASELINES.get(position, 6.5)
    return round(points - (starts * base_per_game), 1)


def load_dynasty_snapshots():
    p_aug = os.path.join(PROJECT_ROOT, "sleeper_work", "raw", "source=fantasycalc_dynasty", "season=2026", "week=00", "date=2026-08-22", "as_of=20260822T000000Z", "fantasycalc_dynasty.json.gz")
    p_sep = os.path.join(PROJECT_ROOT, "sleeper_work", "raw", "source=fantasycalc_dynasty", "season=2026", "week=00", "date=2026-09-16", "as_of=20260916T000000Z", "fantasycalc_dynasty.json.gz")

    aug_map = {}
    sep_map = {}

    if os.path.exists(p_aug):
        try:
            with gzip.open(p_aug, "rt", encoding="utf-8") as f:
                for item in json.load(f):
                    p = item.get("player", {})
                    name = p.get("name", "").lower()
                    sid = str(p.get("sleeperId") or "")
                    rec = {"val": item.get("value", 0), "rank": item.get("overallRank", 999)}
                    if name:
                        aug_map[name] = rec
                    if sid:
                        aug_map[sid] = rec
        except Exception as e:
            print(f"  Warning loading August dynasty snapshot: {e}")

    if os.path.exists(p_sep):
        try:
            with gzip.open(p_sep, "rt", encoding="utf-8") as f:
                for item in json.load(f):
                    p = item.get("player", {})
                    name = p.get("name", "").lower()
                    sid = str(p.get("sleeperId") or "")
                    rec = {"val": item.get("value", 0), "rank": item.get("overallRank", 999)}
                    if name:
                        sep_map[name] = rec
                    if sid:
                        sep_map[sid] = rec
        except Exception as e:
            print(f"  Warning loading September dynasty snapshot: {e}")

    return aug_map, sep_map


def get_dynasty_profile(name, sleeper_id=None, pick_str=None, aug_map=None, sep_map=None):
    aug_map = aug_map or {}
    sep_map = sep_map or {}

    if pick_str:
        p_clean = pick_str.lower()
        if "round 1" in p_clean:
            key = "2027 round 1" if "2027" in p_clean else "2026 round 1"
        elif "round 2" in p_clean:
            key = "2027 round 2" if "2027" in p_clean else "2026 round 2"
        elif "round 3" in p_clean:
            key = "2027 round 3" if "2027" in p_clean else "2026 round 3"
        else:
            key = "2027 round 4" if "2027" in p_clean else "2026 round 4"
        a_val = PICK_VALUES_AUG.get(key, 1000)
        s_val = PICK_VALUES_SEP.get(key, 1000)
        return {
            "augVal": a_val,
            "sepVal": s_val,
            "valDelta": s_val - a_val,
            "rank": 999,
            "rankDelta": 0,
        }

    s_rec = sep_map.get(str(sleeper_id or "")) or sep_map.get((name or "").lower(), {})
    a_rec = aug_map.get(str(sleeper_id or "")) or aug_map.get((name or "").lower(), {})
    s_val = s_rec.get("val", 1000)
    a_val = a_rec.get("val", s_val)
    s_rank = s_rec.get("rank", 999)
    a_rank = a_rec.get("rank", s_rank)
    rank_delta = (a_rank - s_rank) if (a_rank < 900 and s_rank < 900) else 0

    return {
        "augVal": a_val,
        "sepVal": s_val,
        "valDelta": s_val - a_val,
        "rank": s_rank,
        "rankDelta": rank_delta,
    }


def process_trade_evaluations(trade_transactions, roster_info, weekly_matchups, players_map, current_week, draft_selections=None, roster_to_slot=None, aug_map=None, sep_map=None):
    trade_evaluations = []
    total_players_traded = set()
    total_picks_traded = 0
    total_faab_traded = 0
    draft_selections = draft_selections or {}
    roster_to_slot = roster_to_slot or {}

    sorted_trades = sorted(trade_transactions, key=lambda x: x.get("created") or 0, reverse=True)

    for tx in sorted_trades:
        tx_id = tx.get("transaction_id")
        created_ts = tx.get("created") or 0
        leg = int(tx.get("leg") or 1)
        rids = tx.get("roster_ids") or []
        adds = tx.get("adds") or {}
        drops = tx.get("drops") or {}
        draft_picks = tx.get("draft_picks") or []
        waiver_budget = tx.get("waiver_budget") or []

        # Determine Preseason / In-Season period
        if created_ts:
            dt = datetime.datetime.fromtimestamp(created_ts / 1000.0, datetime.timezone.utc)
            is_preseason = (dt.year == 2026 and (dt.month < 9 or (dt.month == 9 and dt.day < 10))) or leg == 0
            date_str = dt.strftime("%b %d, %Y")
        else:
            is_preseason = True
            date_str = "Preseason"
        period = "Preseason" if is_preseason else f"Week {leg}"

        total_picks_traded += len(draft_picks)
        teams_evaluation = []

        for rid in rids:
            r_info = roster_info.get(rid, {"manager": f"Manager {rid}", "teamName": f"Team {rid}"})

            # Players received by rid
            rec_pids = [str(pid) for pid, to_r in adds.items() if to_r == rid]
            rec_players = []
            pts_rec = 0.0
            starts_rec = 0
            for pid in rec_pids:
                total_players_traded.add(pid)
                p_meta = players_map.get(pid, {"name": f"Player {pid}", "position": "FLEX", "team": "FA"})
                p_pts = 0.0
                p_starts = 0
                for wk in range(leg, current_week + 1):
                    w_m = weekly_matchups.get(wk, {}).get(rid)
                    if w_m:
                        w_pts = float((w_m.get("players_points") or {}).get(pid) or 0.0)
                        p_pts += w_pts
                        if pid in (w_m.get("starters") or []):
                            p_starts += 1
                pts_rec += p_pts
                starts_rec += p_starts
                p_vorp = calc_vorp(p_pts, p_starts, p_meta["position"])
                p_prof = get_dynasty_profile(p_meta["name"], pid, aug_map=aug_map, sep_map=sep_map)
                rec_players.append({
                    "id": pid,
                    "name": p_meta["name"],
                    "position": p_meta["position"],
                    "nflTeam": p_meta["team"],
                    "points": round(p_pts, 1),
                    "starts": p_starts,
                    "vorp": p_vorp,
                    "dynastyValue": p_prof["sepVal"],
                    "dynastyDelta": p_prof["valDelta"],
                    "dynastyRank": p_prof["rank"],
                    "rankDelta": p_prof["rankDelta"],
                })

            # Players sent by rid
            sent_pids = [str(pid) for pid, from_r in drops.items() if from_r == rid]
            sent_players = []
            pts_sent = 0.0
            starts_sent = 0
            other_rids = [o_r for o_r in rids if o_r != rid]
            for pid in sent_pids:
                total_players_traded.add(pid)
                p_meta = players_map.get(pid, {"name": f"Player {pid}", "position": "FLEX", "team": "FA"})
                p_pts = 0.0
                p_starts = 0
                for o_rid in other_rids:
                    for wk in range(leg, current_week + 1):
                        w_m = weekly_matchups.get(wk, {}).get(o_rid)
                        if w_m:
                            w_pts = float((w_m.get("players_points") or {}).get(pid) or 0.0)
                            p_pts += w_pts
                            if pid in (w_m.get("starters") or []):
                                p_starts += 1
                pts_sent += p_pts
                starts_sent += p_starts
                p_vorp = calc_vorp(p_pts, p_starts, p_meta["position"])
                p_prof = get_dynasty_profile(p_meta["name"], pid, aug_map=aug_map, sep_map=sep_map)
                sent_players.append({
                    "id": pid,
                    "name": p_meta["name"],
                    "position": p_meta["position"],
                    "nflTeam": p_meta["team"],
                    "points": round(p_pts, 1),
                    "starts": p_starts,
                    "vorp": p_vorp,
                    "dynastyValue": p_prof["sepVal"],
                    "dynastyDelta": p_prof["valDelta"],
                    "dynastyRank": p_prof["rank"],
                    "rankDelta": p_prof["rankDelta"],
                })

            # Picks received
            rec_picks = []
            rec_picks_details = []
            for pick in draft_picks:
                if pick.get("owner_id") == rid:
                    orig_r = pick.get("roster_id")
                    via_note = f" (via {roster_info.get(orig_r, {}).get('teamName')})" if orig_r != pick.get("previous_owner_id") and orig_r in roster_info else ""
                    pick_str = f"{pick.get('season')} Round {pick.get('round')}{via_note}"
                    rec_picks.append(pick_str)

                    p_class = classify_pick(pick_str)
                    if str(pick.get("season")) == "2026":
                        slot = roster_to_slot.get(orig_r)
                        rnd = int(pick.get("round") or 1)
                        sel = draft_selections.get((rnd, slot))
                        if sel:
                            dp_copy = dict(sel)
                            dp_prof = get_dynasty_profile(dp_copy["playerName"], dp_copy["playerId"], aug_map=aug_map, sep_map=sep_map)
                            dp_copy["vorp"] = calc_vorp(dp_copy["points"], dp_copy["starts"], dp_copy["position"])
                            dp_copy["dynastyValue"] = dp_prof["sepVal"]
                            dp_copy["dynastyDelta"] = dp_prof["valDelta"]
                            dp_copy["dynastyRank"] = dp_prof["rank"]
                            dp_copy["rankDelta"] = dp_prof["rankDelta"]
                            p_class["draftedPlayer"] = dp_copy
                            p_class["dynastyValue"] = dp_prof["sepVal"]
                            p_class["dynastyDelta"] = dp_prof["valDelta"]
                            p_class["dynastyRank"] = dp_prof["rank"]
                    if "dynastyValue" not in p_class:
                        pick_prof = get_dynasty_profile("", pick_str=pick_str, aug_map=aug_map, sep_map=sep_map)
                        p_class["dynastyValue"] = pick_prof["sepVal"]
                        p_class["dynastyDelta"] = pick_prof["valDelta"]
                        p_class["dynastyRank"] = 999
                        p_class["rankDelta"] = 0
                    rec_picks_details.append(p_class)

            # Picks sent
            sent_picks = []
            sent_picks_details = []
            for pick in draft_picks:
                if pick.get("previous_owner_id") == rid:
                    orig_r = pick.get("roster_id")
                    via_note = f" (via {roster_info.get(orig_r, {}).get('teamName')})" if orig_r != rid and orig_r in roster_info else ""
                    pick_str = f"{pick.get('season')} Round {pick.get('round')}{via_note}"
                    sent_picks.append(pick_str)

                    p_class = classify_pick(pick_str)
                    if str(pick.get("season")) == "2026":
                        slot = roster_to_slot.get(orig_r)
                        rnd = int(pick.get("round") or 1)
                        sel = draft_selections.get((rnd, slot))
                        if sel:
                            dp_copy = dict(sel)
                            dp_prof = get_dynasty_profile(dp_copy["playerName"], dp_copy["playerId"], aug_map=aug_map, sep_map=sep_map)
                            dp_copy["vorp"] = calc_vorp(dp_copy["points"], dp_copy["starts"], dp_copy["position"])
                            dp_copy["dynastyValue"] = dp_prof["sepVal"]
                            dp_copy["dynastyDelta"] = dp_prof["valDelta"]
                            dp_copy["dynastyRank"] = dp_prof["rank"]
                            dp_copy["rankDelta"] = dp_prof["rankDelta"]
                            p_class["draftedPlayer"] = dp_copy
                            p_class["dynastyValue"] = dp_prof["sepVal"]
                            p_class["dynastyDelta"] = dp_prof["valDelta"]
                            p_class["dynastyRank"] = dp_prof["rank"]
                    if "dynastyValue" not in p_class:
                        pick_prof = get_dynasty_profile("", pick_str=pick_str, aug_map=aug_map, sep_map=sep_map)
                        p_class["dynastyValue"] = pick_prof["sepVal"]
                        p_class["dynastyDelta"] = pick_prof["valDelta"]
                        p_class["dynastyRank"] = 999
                        p_class["rankDelta"] = 0
                    sent_picks_details.append(p_class)

            # FAAB
            rec_faab = sum(wb.get("amount", 0) for wb in waiver_budget if wb.get("receiver") == rid)
            sent_faab = sum(wb.get("amount", 0) for wb in waiver_budget if wb.get("sender") == rid)
            total_faab_traded += rec_faab

            net_pts = round(pts_rec - pts_sent, 1)
            net_starts = starts_rec - starts_sent

            # Realized rookie production from traded picks
            rec_rookie_pts = sum(p.get("draftedPlayer", {}).get("points", 0.0) for p in rec_picks_details)
            rec_rookie_starts = sum(p.get("draftedPlayer", {}).get("starts", 0) for p in rec_picks_details)
            rec_rookie_vorp = sum(p.get("draftedPlayer", {}).get("vorp", 0.0) for p in rec_picks_details)

            sent_rookie_pts = sum(p.get("draftedPlayer", {}).get("points", 0.0) for p in sent_picks_details)
            sent_rookie_starts = sum(p.get("draftedPlayer", {}).get("starts", 0) for p in sent_picks_details)
            sent_rookie_vorp = sum(p.get("draftedPlayer", {}).get("vorp", 0.0) for p in sent_picks_details)

            total_realized_pts = round(pts_rec + rec_rookie_pts, 1)
            total_realized_starts = starts_rec + rec_rookie_starts
            total_realized_sent_pts = round(pts_sent + sent_rookie_pts, 1)
            total_realized_sent_starts = starts_sent + sent_rookie_starts
            realized_net_pts = round(total_realized_pts - total_realized_sent_pts, 1)
            realized_net_starts = total_realized_starts - total_realized_sent_starts

            # VORP Totals
            total_rec_vorp = round(sum(p["vorp"] for p in rec_players) + rec_rookie_vorp, 1)
            total_sent_vorp = round(sum(p["vorp"] for p in sent_players) + sent_rookie_vorp, 1)
            net_vorp = round(total_rec_vorp - total_sent_vorp, 1)

            # Dynasty Valuation Totals
            total_rec_dynasty_val = sum(p.get("dynastyValue", 0) for p in rec_players) + sum(p.get("dynastyValue", 0) for p in rec_picks_details)
            total_rec_dynasty_delta = sum(p.get("dynastyDelta", 0) for p in rec_players) + sum(p.get("dynastyDelta", 0) for p in rec_picks_details)
            total_sent_dynasty_val = sum(p.get("dynastyValue", 0) for p in sent_players) + sum(p.get("dynastyValue", 0) for p in sent_picks_details)
            total_sent_dynasty_delta = sum(p.get("dynastyDelta", 0) for p in sent_players) + sum(p.get("dynastyDelta", 0) for p in sent_picks_details)
            net_dynasty_equity = total_rec_dynasty_val - total_sent_dynasty_val

            has_major_picks_rec = any(p["round"] in [1, 2] for p in rec_picks_details)
            has_major_picks_sent = any(p["round"] in [1, 2] for p in sent_picks_details)

            # Two-dimensional role & status classification incorporating VORP and Dynasty Equity
            if net_dynasty_equity >= 350 and pts_rec <= pts_sent:
                role = "Dynasty Equity Surplus"
                badge = f"+{net_dynasty_equity} Market Equity 📈"
                top_rnd = min((p["round"] for p in rec_picks_details), default=1)
                drafted_names = [p["draftedPlayer"]["playerName"] for p in rec_picks_details if p.get("draftedPlayer")]
                if rec_rookie_pts > 0 and drafted_names:
                    status_text = f"+{net_dynasty_equity} val ({drafted_names[0]})"
                else:
                    status_text = f"+{net_dynasty_equity} Market Surplus"
                status_type = "capital"
            elif has_major_picks_rec and not has_major_picks_sent and pts_rec <= pts_sent:
                role = "Future Capital Haul"
                badge = "Capital Stockpile 📦"
                top_rnd = min((p["round"] for p in rec_picks_details), default=1)
                drafted_names = [p["draftedPlayer"]["playerName"] for p in rec_picks_details if p.get("draftedPlayer")]
                if rec_rookie_pts > 0 and drafted_names:
                    status_text = f"+{rec_rookie_pts:.1f} pts via {drafted_names[0]}"
                else:
                    status_text = f"+{len(rec_picks_details)} Pick{'s' if len(rec_picks_details) > 1 else ''} (Rd {top_rnd})"
                status_type = "capital"
            elif has_major_picks_sent and not has_major_picks_rec and (pts_rec >= pts_sent or starts_rec >= 1):
                role = "Win-Now Contender Push"
                badge = f"Win-Now (+{total_rec_vorp:+.1f} VORP)" if total_rec_vorp > 0 else "Win-Now Firepower 🚀"
                status_text = f"{net_pts:+.1f} pts ({starts_rec} st)"
                status_type = "win-now"
            elif net_pts >= 8.0:
                role = "Production Advantage"
                badge = f"Scoring Lead (+{net_pts:.1f} pts, {total_rec_vorp:+.1f} VORP)"
                status_text = f"+{net_pts:.1f} pts ({starts_rec} st)"
                status_type = "positive"
            elif net_pts <= -8.0 and not rec_picks_details:
                role = "Production Deficit"
                badge = f"Scoring Deficit ({net_pts:.1f} pts)"
                status_text = f"{net_pts:.1f} pts"
                status_type = "negative"
            elif rec_picks_details and not rec_players and not sent_players:
                role = "Draft Equity Realignment"
                badge = f"Capital Swap ({net_dynasty_equity:+d} val)"
                status_text = f"{len(rec_picks_details)} Pick{'s' if len(rec_picks_details) > 1 else ''} Acquired"
                status_type = "neutral"
            else:
                role = "Balanced Swap"
                badge = "Balanced Production ⚖️"
                status_text = f"{net_pts:+.1f} pts"
                status_type = "even"

            teams_evaluation.append({
                "rosterId": rid,
                "teamName": r_info["teamName"],
                "manager": r_info["manager"],
                "receivedPlayers": rec_players,
                "sentPlayers": sent_players,
                "receivedPicks": rec_picks,
                "sentPicks": sent_picks,
                "receivedPicksDetails": rec_picks_details,
                "sentPicksDetails": sent_picks_details,
                "receivedFaab": rec_faab,
                "sentFaab": sent_faab,
                "totalPointsReceived": round(pts_rec, 1),
                "totalPointsSent": round(pts_sent, 1),
                "rookiePointsReceived": round(rec_rookie_pts, 1),
                "rookieStartsReceived": rec_rookie_starts,
                "totalRealizedPoints": total_realized_pts,
                "totalRealizedStarts": total_realized_starts,
                "realizedNetPoints": realized_net_pts,
                "startsReceived": starts_rec,
                "startsSent": starts_sent,
                "netPoints": net_pts,
                "netStarts": net_starts,
                "totalVorp": total_rec_vorp,
                "sentVorp": total_sent_vorp,
                "netVorp": net_vorp,
                "totalDynastyValue": total_rec_dynasty_val,
                "totalDynastyDelta": total_rec_dynasty_delta,
                "totalDynastyValueSent": total_sent_dynasty_val,
                "totalDynastyDeltaSent": total_sent_dynasty_delta,
                "netDynastyEquity": net_dynasty_equity,
                "strategicRole": role,
                "statusBadge": badge,
                "statusText": status_text,
                "statusType": status_type,
            })

            # Record in manager profile
            if rid in roster_info:
                roster_info[rid].setdefault("tradesCount", 0)
                roster_info[rid]["tradesCount"] += 1

        # Compute baseline trade grade and commentary for every team in the deal
        for idx, t in enumerate(teams_evaluation):
            other_t = teams_evaluation[1 - idx] if len(teams_evaluation) == 2 else None
            t_grade, t_score, t_class, t_title = calculate_trade_team_grade(t, other_t)
            t_comm = generate_trade_team_commentary(t, other_t)
            t["grade"] = t_grade
            t["gradeScore"] = t_score
            t["gradeClass"] = t_class
            t["gradeTitle"] = t_title
            t["commentary"] = t_comm

        # Determine Deal Verdict and Expressive Editorial Analysis with Drafted Rookies Incorporated
        if len(teams_evaluation) >= 2:
            t1, t2 = teams_evaluation[0], teams_evaluation[1]
            diff = t1["netPoints"]
            r_diff = t1.get("realizedNetPoints", diff)

            if tx_id == "1394813522348609536":  # Olave deal
                t1["grade"] = "A"
                t1["gradeTitle"] = "Championship WR1 Firepower"
                t1["gradeClass"] = "grade-a"
                t1["commentary"] = "Ertz & Krafts paid a premium in young running back capital, but landed a blue-chip WR1 in Chris Olave who instantly anchors their championship title defense with +9.2 VORP and 23.2 points across two starts. When contending for rings, top-tier starting firepower justifies surrendering futures."

                t2["grade"] = "A+"
                t2["gradeTitle"] = "Dynasty Equity Masterclass"
                t2["gradeClass"] = "grade-a-plus"
                t2["commentary"] = "A masterclass in extracting maximum dynasty equity. Terry Tate surrendered Olave but captured a massive +893 net market surplus, drafting Seattle's explosive rookie starter Jadarian Price at Pick 1.04 (3,621 val) and adding Mike Washington (1,765 val) and Tyjae Spears to lock down an elite young backfield pipeline."

                verdict = "Win-Now WR1 (+9.2 VORP) vs Dynasty Equity Haul (+893 Val Margin)"
                verdict_class = "badge-win-now"
                headline = "Olave Drives Title Ambitions (+9.2 VORP); Terry Tate Locks In +893 Net Market Equity with Jadarian Price"
                analysis = (
                    "A multi-dimensional dynasty blockbuster: Ertz & Krafts secured immediate WR1 firepower in Chris Olave (+9.2 VORP, 23.2 pts in 2 starts, #25 overall dynasty rank) "
                    "to anchor an aggressive championship run. However, forensic valuation reveals Terry Tate’s Pain Train actually captured a **+893 net dynasty market equity advantage** "
                    "(6,670 package val acquired vs 5,777 surrendered). Terry Tate selected Seahawks starting running back Jadarian Price at Pick 1.04 (3,621 market value) "
                    "and added Raiders RB Mike Washington (Pick 2.12, 1,765 val), realizing 14.3 total points while locking down a premier young backfield tandem."
                )
            elif tx_id == "1394733669339377664":  # Tucker Kraft for 2026 1st
                t1["grade"] = "A"
                t1["gradeTitle"] = "Peak Asset Liquidity Win"
                t1["gradeClass"] = "grade-a"
                t1["commentary"] = "Ertz & Krafts capitalized on peak asset liquidity, flipping tight end Tucker Kraft (3,057 val) for the 1.04 rookie draft slot (Jadarian Price, 3,621 val) and parlaying that capital hours later into Chris Olave."

                t2["grade"] = "B-"
                t2["gradeTitle"] = "Starting TE Stability"
                t2["gradeClass"] = "grade-b"
                t2["commentary"] = "Final Boss surrendered top-5 draft capital (Pick 1.04, 3,621 val) to immediately stabilize starting tight end with Tucker Kraft (8.0 pts, 3,057 val). Kraft anchors the position, but parting with 1.04 resulted in a -564 net equity deficit."

                verdict = "TE Tucker Kraft (3,057 Val) Flipped for Pick 1.04 (Jadarian Price, 3,621 Val)"
                verdict_class = "badge-capital"
                headline = "Ertz & Krafts Parlays Tucker Kraft into 1.04 Asset (Jadarian Price) Before Olave Mega-Deal"
                analysis = (
                    "A textbook dynasty equity pivot: Final Boss surrendered the 1.04 draft pick (which became Seahawks starter Jadarian Price, 3,621 dynasty value) "
                    "to immediately stabilize starting tight end with Tucker Kraft (3,057 val, -1.0 VORP, 8.0 pts). Ertz & Krafts capitalized on peak asset liquidity, "
                    "capturing the 1.04 asset and parlaying it hours later into Chris Olave."
                )
            elif tx_id == "1394086707485212672":  # Coker for 2027 2nd
                t1["grade"] = "A+"
                t1["gradeTitle"] = "Buy-Low Scouting Grand Slam (+22.8 VORP)"
                t1["gradeClass"] = "grade-a-plus"
                t1["commentary"] = "Final Boss executed one of the sharpest buy-low acquisitions in league history. Acquiring Jalen Coker for a future 2nd right before his 29.8-point starting breakout (+22.8 VORP) produced an instant +634 dynasty market surge (#86 overall) and a core lineup anchor."

                t2["grade"] = "C-"
                t2["gradeTitle"] = "Surrendered Breakout Asset"
                t2["gradeClass"] = "grade-c"
                t2["commentary"] = "Banking a 2027 2nd round pick was standard process at the time, but parting with Coker right before his monster 29.8-point explosion leaves Ertz & Krafts with a painful -22.8 net VORP and -634 market equity deficit."

                verdict = "Breakout WR (+22.8 VORP, +634 Market Surge) for 2027 2nd"
                verdict_class = "badge-capital"
                headline = "Final Boss Strikes Gold on Jalen Coker (+22.8 VORP, +634 Market Value Surge)"
                analysis = (
                    "Final Boss executed a masterclass in buy-low scouting, acquiring Jalen Coker right before his monster 29.8-point starting breakout (+22.8 VORP). "
                    "Since the trade, Coker's dynasty market value has skyrocketed by +634 (from 1,549 to 2,183, surging 51 spots to #86 overall), giving Final Boss a landslide "
                    "+634 market equity gain on top of explosive starting yield. Ertz & Krafts banked a 2027 2nd round pick (1,549 market value)."
                )
            elif tx_id == "1392291944566108160":  # Monty/Marks for 1st & 3rd
                t1["grade"] = "A+"
                t1["gradeTitle"] = "Workhorse Backfield Dominance (+18.9 VORP)"
                t1["gradeClass"] = "grade-a-plus"
                t1["commentary"] = "arkinsjt secured immediate workhorse domination, acquiring Montgomery and Marks for late-round capital. The duo has generated +18.9 combined VORP and 31.9 points in 2 starts, while Montgomery appreciated by +402 in market value (#67 overall)."

                t2["grade"] = "C+"
                t2["gradeTitle"] = "Rebuilding Draft Vault"
                t2["gradeClass"] = "grade-c-plus"
                t2["commentary"] = "The Ape pivoted veteran production into rookie WR Ja'Kobi Lane (Pick 1.12) and future draft picks. While it created an early -30.3 point scoring deficit, it stockpiled developmental lottery tickets for the future."

                verdict = "Workhorse Backfield (+18.9 VORP, +402 Val) for Pick 1.12 (Ja'Kobi Lane)"
                verdict_class = "badge-capital"
                headline = "arkinsjt Unleashes Starting RB Thunder (+18.9 VORP); The Ape Drafts Ja'Kobi Lane at 1.12"
                analysis = (
                    "arkinsjt dealt the 1.12 selection (Ravens rookie WR Ja'Kobi Lane, 1,150 val) and a 2027 3rd (1,057 val) to acquire starting workhorses David Montgomery "
                    "and Woody Marks. The veteran tandem generated +18.9 combined VORP and 31.9 points in 2 starts, while Montgomery appreciated by +402 in dynasty value "
                    "(now 2,902 val, #67 overall). arkinsjt holds a commanding +30.3 on-field scoring advantage and a +1,387 package equity surplus."
                )
            elif tx_id == "1357798524346978304":  # Dart/Likely blockbuster
                t1["grade"] = "A+"
                t1["gradeTitle"] = "Top-Tier Production Explosion (+32.9 VORP)"
                t1["gradeClass"] = "grade-a-plus"
                t1["commentary"] = "An absolute grand slam for Bronco Stampede. Jaxson Dart (+13.6 VORP, 22.1 pts) and Isaiah Likely (+19.3 VORP, 28.3 pts) generated an elite +32.9 net VORP advantage over The Ape’s multi-player return."

                t2["grade"] = "D"
                t2["gradeTitle"] = "Production & Starter Deficit"
                t2["gradeClass"] = "grade-d"
                t2["commentary"] = "Surrendering two explosive weekly starters created a severe early-season handicap for The Ape, leaving a -43.9 point scoring deficit and -32.9 net VORP hole through the early weeks."

                verdict = "Dominant Starter Production: Bronco Stampede (+32.9 Net VORP, +43.9 Pts)"
                verdict_class = "badge-win"
                headline = "Dart & Likely Explosions Hand Bronco Stampede +32.9 Net VORP Advantage"
                analysis = (
                    "A blockbuster pre-season swap that has heavily rewarded Bronco Stampede: Isaiah Likely (+19.3 VORP, 28.3 pts in 2 starts, 2,850 val) and Jaxson Dart "
                    "(+13.6 VORP, 22.1 pts) generated an elite +32.9 net VORP advantage over The Ape’s multi-player return (6.5 pts, -7.5 VORP across Isaiah Bond, DJ Moore, "
                    "and Tyler Warren)."
                )
            elif tx_id == "1400517332358463488":  # Slayton/Najee/Thornton for Bateman/Wicks/pick
                verdict = "Multi-Player Depth Realignment"
                verdict_class = "badge-rebuild"
                headline = "Final Boss Capitalizes on Wicks Spark; The Ape Refreshes Depth"
                analysis = (
                    "Final Boss gained early on-field production (+14.3 pts from Dontayvion Wicks) and a future 4th round pick, while The Ape restructured roster "
                    "depth across multiple skill positions ahead of Week 1."
                )
            elif tx_id == "1395984359407755264":  # Dulcich for Helm + 4th + FAAB
                verdict = "Starting TE Helm for Pick 4.09 (Cade Klubnik) & FAAB"
                verdict_class = "badge-even"
                headline = "Bronco Stampede Gains Starting TE; Bub's Club Drafts Cade Klubnik"
                analysis = (
                    "Bronco Stampede secured immediate starting tight end production from Gunnar Helm (+4.8 pts), while Bub’s Club acquired Greg Dulcich, "
                    "drafted Jets rookie QB Cade Klubnik at Pick 4.09, and banked $11 in FAAB budget flexibility."
                )
            elif tx_id == "1395641577333882880":  # TeSlaa for $5 FAAB
                verdict = "Strategic Asset Re-allocation"
                verdict_class = "badge-flier"
                headline = "My Nabers Tetties Acquires TeSlaa for $5 FAAB"
                analysis = "A clean waiver budget transaction: My Nabers Tetties added depth wideout Isaac TeSlaa to their developmental bench, sending $5 FAAB to Bub’s Club."
            elif tx_id == "1393999371669864448":  # Daniel Jones deal
                verdict = "Daniel Jones & Pick 3.05 (Kaytron Allen) for Pick 2.09 (Adam Randall)"
                verdict_class = "badge-capital"
                headline = "Final Boss Secures QB Daniel Jones; Both Franchises Add Rookie Backs"
                analysis = (
                    "Final Boss filled a critical quarterback opening with Daniel Jones (+10.0 pts) and drafted Commanders rookie RB Kaytron Allen at Pick 3.05 (+1.6 pts). "
                    "The Ape parlayed the deal into Pick 2.09 (drafting Ravens RB Adam Randall) alongside an upgraded 2027 3rd round selection."
                )
            elif tx_id == "1393837664196657152":  # Daniel Jones for JJ McCarthy + 4th
                verdict = "Young Signal-Caller Exchange"
                verdict_class = "badge-even"
                headline = "The Ape & Bub’s Club Swap Developmental Quarterbacks"
                analysis = "The Ape and Bub’s Club exchanged quarterback depth, with Bub’s Club acquiring rookie J.J. McCarthy and a future 4th round pick in return for Daniel Jones."
            elif tx_id == "1389706078471598080":  # Pick swap
                verdict = "Pick 2.02 (Germie Bernard) for Pick 3.11 (Malik Benson) & 2027 2nd"
                verdict_class = "badge-even"
                headline = "Gridiron geezers Drafts Germie Bernard; Bub’s Club Adds Benson & Future 2nd"
                analysis = (
                    "A pure rookie draft selection exchange: Gridiron geezers moved up into the 2nd round to draft Steelers WR Germie Bernard (Pick 2.02), while "
                    "Bub’s Club accumulated Pick 3.11 (Raiders WR Malik Benson, +0.3 pts) and a 2027 2nd round selection to bolster future draft inventory."
                )
            else:
                # Dynamic fallback for future trades
                if (t1["statusType"] == "capital" and t2["statusType"] == "win-now") or (t2["statusType"] == "capital" and t1["statusType"] == "win-now"):
                    cap_team = t1 if t1["statusType"] == "capital" else t2
                    win_team = t2 if t1["statusType"] == "capital" else t1
                    verdict = f"Dynasty Equity ({cap_team['teamName']}) vs Win-Now Push ({win_team['teamName']})"
                    verdict_class = "badge-capital"
                    headline = f"{cap_team['teamName']} Banks Capital ({cap_team.get('netDynastyEquity', 0):+d} val); {win_team['teamName']} Adds Firepower"
                    analysis = f"{win_team['teamName']} acquired immediate on-field production ({win_team['totalPointsReceived']} pts, {win_team.get('totalVorp', 0):+.1f} VORP), while {cap_team['teamName']} gained long-term equity with draft capital and market value ({cap_team.get('netDynastyEquity', 0):+d} net equity)."
                elif abs(diff) >= 10.0:
                    lead_team = t1 if diff > 0 else t2
                    verdict = f"Clear Production Advantage: {lead_team['teamName']} (+{abs(diff):.1f} pts, {lead_team.get('totalVorp', 0):+.1f} VORP)"
                    verdict_class = "badge-win"
                    headline = f"{lead_team['teamName']} Surges to On-Field & VORP Advantage"
                    analysis = f"{lead_team['teamName']} holds a commanding +{abs(diff):.1f} net point advantage ({lead_team.get('netVorp', 0):+.1f} net VORP) in on-field production delivered to date."
                else:
                    verdict = "Balanced Production & Equity Swap"
                    verdict_class = "badge-even"
                    headline = f"{t1['teamName']} & {t2['teamName']} Asset Exchange"
                    analysis = f"Both franchises exchanged players and assets with net scoring closely balanced ({diff:+.1f} pts margin, {t1.get('netDynastyEquity', 0):+d} val equity margin)."
        else:
            verdict = "Completed Deal"
            verdict_class = "badge-flier"
            headline = "League Trade Completed"
            analysis = "Multi-team transaction executed."

        # Compute overall deal grade
        if len(teams_evaluation) >= 2:
            g1 = teams_evaluation[0].get("grade", "B")
            g2 = teams_evaluation[1].get("grade", "B")
            if "A+" in (g1, g2) and ("A" in (g1, g2) or "A+" in (g1, g2)):
                deal_grade = "A+"
            elif "A" in (g1, g2) or "A+" in (g1, g2):
                deal_grade = "A"
            elif "B+" in (g1, g2):
                deal_grade = "B+"
            elif "B" in (g1, g2):
                deal_grade = "B"
            elif "C" in (g1, g2):
                deal_grade = "C+"
            else:
                deal_grade = "C"
        else:
            deal_grade = "B"

        deal_grade_class = "grade-a-plus" if "A+" in deal_grade else ("grade-a" if "A" in deal_grade else ("grade-b-plus" if "B+" in deal_grade else "grade-b"))

        trade_evaluations.append({
            "tradeId": tx_id,
            "leg": leg,
            "period": period,
            "isPreseason": is_preseason,
            "date": date_str,
            "created": created_ts,
            "teams": teams_evaluation,
            "overallGrade": deal_grade,
            "overallGradeClass": deal_grade_class,
            "verdict": verdict,
            "verdictClass": verdict_class,
            "headline": headline,
            "analysis": analysis,
        })

    trade_summary = {
        "totalTrades": len(trade_evaluations),
        "totalPlayersTraded": len(total_players_traded),
        "totalPicksTraded": total_picks_traded,
        "totalFaabTraded": total_faab_traded,
    }

    return trade_evaluations, trade_summary


def build_waiver_roi(league_id=AMS_LEAGUE_ID, season="2026", week=None):
    print(f"=== Running Waiver Wire ROI Analytics for League {league_id} ===")
    is_johnny = (str(league_id) == JOHNNYS_LEAGUE_ID)

    if is_johnny:
        out_file = os.path.join(PROJECT_ROOT, "src", "generated", "johnnys-jerks", "waiver-wire-analysis.json")
    else:
        out_file = os.path.join(PROJECT_ROOT, "src", "generated", "waiver-wire-analysis.json")

    os.makedirs(os.path.dirname(out_file), exist_ok=True)

    league = fetch_sleeper(f"league/{league_id}")
    league_leg = int((league.get("settings") or {}).get("leg") or 1)

    try:
        nfl_state = fetch_sleeper("state/nfl")
        active_nfl_week = int(nfl_state.get("week") or 1)
    except Exception:
        active_nfl_week = 1

    if week is not None:
        current_week = int(week)
    else:
        current_week = max(active_nfl_week, league_leg)

    print(f"  Evaluating up to Week {current_week} (NFL State: {active_nfl_week}, League Leg: {league_leg})")
    users = fetch_sleeper(f"league/{league_id}/users")
    rosters = fetch_sleeper(f"league/{league_id}/rosters")
    players_map = load_players_map()

    # Build manager/roster lookup
    user_map = {u["user_id"]: u for u in users}
    roster_info = {}
    for r in rosters:
        rid = r["roster_id"]
        uid = r.get("owner_id")
        user = user_map.get(uid, {})
        team_name = (user.get("metadata") or {}).get("team_name") or user.get("display_name") or f"Team {rid}"
        manager_name = user.get("display_name") or f"Manager {rid}"
        roster_info[rid] = {
            "rosterId": rid,
            "manager": manager_name,
            "teamName": team_name,
            "currentPlayers": set(r.get("players") or []),
            "faabSpent": 0,
            "movesCount": 0,
            "waiverCount": 0,
            "freeAgentCount": 0,
            "totalPointsContributed": 0.0,
            "starterPointsContributed": 0.0,
            "pickups": [],
        }

    # Fetch transactions from week 1 up to current_week
    all_transactions = []
    for wk in range(1, current_week + 1):
        try:
            txs = fetch_sleeper(f"league/{league_id}/transactions/{wk}")
            if isinstance(txs, list):
                all_transactions.extend(txs)
        except Exception as e:
            print(f"  Warning fetching txs for week {wk}: {e}")

    # Fetch matchup box scores for week 1 up to current_week
    weekly_matchups = {}
    for wk in range(1, current_week + 1):
        try:
            m_rows = fetch_sleeper(f"league/{league_id}/matchups/{wk}")
            if isinstance(m_rows, list):
                weekly_matchups[wk] = {m["roster_id"]: m for m in m_rows if "roster_id" in m}
        except Exception as e:
            print(f"  Warning fetching matchups for week {wk}: {e}")

    # Filter complete transactions that added players (STRICTLY waivers & free agent pickups)
    completed_adds = []
    trade_transactions = []
    for tx in all_transactions:
        if tx.get("status") != "complete":
            continue
        tx_type = tx.get("type") or "free_agent"
        if tx_type == "trade":
            trade_transactions.append(tx)
            continue

        adds = tx.get("adds")
        if not adds:
            continue
        bid = int((tx.get("settings") or {}).get("waiver_bid") or 0)
        leg = int(tx.get("leg") or 1)
        created_ts = tx.get("created") or 0

        for pid, rid in adds.items():
            if rid not in roster_info:
                continue
            completed_adds.append({
                "transactionId": tx.get("transaction_id"),
                "playerId": str(pid),
                "rosterId": rid,
                "type": tx_type,
                "bid": bid,
                "leg": leg,
                "created": created_ts,
                "drops": list((tx.get("drops") or {}).keys()),
            })

    # Sort adds chronologically
    completed_adds.sort(key=lambda x: x["created"])

    # Aggregate manager spending and track pickups
    positional_spending = {"RB": 0, "WR": 0, "TE": 0, "QB": 0, "K": 0, "DEF": 0}
    roi_ledger = []
    immediate_impact_list = []

    # Calculate points scored post-pickup for each added player
    for add in completed_adds:
        rid = add["rosterId"]
        pid = add["playerId"]
        leg = add["leg"]
        bid = add["bid"]
        tx_type = add["type"]

        p_info = players_map.get(pid, {"name": f"Player {pid}", "position": "FLEX", "team": "FA", "injury": None})
        pos = p_info["position"]
        if pos in positional_spending:
            positional_spending[pos] += bid

        m_info = roster_info[rid]
        m_info["movesCount"] += 1
        if tx_type == "waiver":
            m_info["waiverCount"] += 1
            m_info["faabSpent"] += bid
        else:
            m_info["freeAgentCount"] += 1

        # Track weekly starts & points scored while on roster
        total_pts = 0.0
        starter_pts = 0.0
        starts_count = 0
        bench_count = 0
        debut_points = 0.0
        started_in_debut = False

        # Evaluate performance from acquisition week to current_week
        for wk in range(leg, current_week + 1):
            w_matchup = weekly_matchups.get(wk, {}).get(rid)
            if not w_matchup:
                continue
            players_pts = w_matchup.get("players_points") or {}
            starters = w_matchup.get("starters") or []
            pts = float(players_pts.get(pid) or 0.0)

            # Did the team roster this player this week?
            all_players = set(w_matchup.get("players") or [])
            if pid in all_players or pid in starters:
                total_pts += pts
                if pid in starters:
                    starts_count += 1
                    starter_pts += pts
                else:
                    bench_count += 1

                if wk == leg:
                    debut_points = pts
                    started_in_debut = (pid in starters)

        m_info["totalPointsContributed"] += total_pts
        m_info["starterPointsContributed"] += starter_pts

        is_still_rostered = pid in m_info["currentPlayers"]

        # Determine franchise position role
        same_pos_pts = []
        for other_pid in m_info["currentPlayers"]:
            other_pts = 0.0
            for wk in range(1, current_week + 1):
                w_m = weekly_matchups.get(wk, {}).get(rid)
                if w_m:
                    other_pts += float((w_m.get("players_points") or {}).get(other_pid) or 0.0)
            other_pos = players_map.get(other_pid, {}).get("position")
            if other_pos == pos:
                same_pos_pts.append((other_pid, other_pts))

        same_pos_pts.sort(key=lambda x: x[1], reverse=True)
        rank_at_pos = 1
        for idx, (p_item, _) in enumerate(same_pos_pts):
            if p_item == pid:
                rank_at_pos = idx + 1
                break

        if not is_still_rostered:
            current_role = "Cut / Dropped"
        elif starts_count >= 1 and rank_at_pos == 1 and pos in ["RB", "WR", "TE", "QB"]:
            current_role = f"Leading {pos} on Team"
        elif starts_count >= 1:
            current_role = f"Starting {pos} Contributor"
        elif pos in ["DEF", "K"]:
            current_role = f"Streaming {pos}"
        else:
            current_role = f"Bench {pos} Stash"

        pts_per_dollar = round(total_pts / max(1, bid), 2)
        badge_label, badge_class = determine_roi_badge(total_pts, starts_count, bid)
        grade, grade_score, grade_class, grade_title = calculate_waiver_grade(
            total_pts, starter_pts, starts_count, bid, tx_type, current_role, is_still_rostered, pos
        )
        commentary = generate_waiver_commentary(
            p_info["name"], pos, p_info["team"], m_info["manager"], leg, tx_type, bid,
            total_pts, starts_count, starter_pts, current_role, is_still_rostered, grade, grade_title
        )

        pickup_record = {
            "transactionId": add["transactionId"],
            "playerId": pid,
            "playerName": p_info["name"],
            "position": pos,
            "nflTeam": p_info["team"],
            "injury": p_info.get("injury"),
            "manager": m_info["manager"],
            "teamName": m_info["teamName"],
            "rosterId": rid,
            "acquiredWeek": leg,
            "type": tx_type,
            "bid": bid,
            "startsCount": starts_count,
            "benchCount": bench_count,
            "totalPoints": round(total_pts, 2),
            "starterPoints": round(starter_pts, 2),
            "pointsPerDollar": pts_per_dollar,
            "currentRole": current_role,
            "isStillRostered": is_still_rostered,
            "verdictBadge": badge_label,
            "verdictClass": badge_class,
            "grade": grade,
            "gradeScore": grade_score,
            "gradeClass": grade_class,
            "gradeTitle": grade_title,
            "commentary": commentary,
            "narrativeNote": f"{m_info['manager']} added {p_info['name']} in Week {leg} ({tx_type.upper()}: ${bid}). Total: {round(total_pts, 1)} pts across {starts_count} start(s). Role: {current_role}.",
        }

        roi_ledger.append(pickup_record)
        m_info["pickups"].append(pickup_record)

        # If acquired in recent completed week (e.g. Week 1), register in immediate impact
        if leg == max(1, current_week - 1):
            imm_verdict = "Instant Starter Boom" if started_in_debut and debut_points >= 12.0 else (
                "Flex Contributor" if started_in_debut and debut_points >= 7.0 else (
                    "Bench Stash" if not started_in_debut else "Dud / Miss"
                )
            )
            immediate_impact_list.append({
                "playerId": pid,
                "playerName": p_info["name"],
                "position": pos,
                "nflTeam": p_info["team"],
                "manager": m_info["manager"],
                "teamName": m_info["teamName"],
                "rosterId": rid,
                "bid": bid,
                "type": tx_type,
                "debutPoints": round(debut_points, 2),
                "startedInDebut": started_in_debut,
                "immediateVerdict": imm_verdict,
            })

    # Sort ledger by totalPoints descending
    roi_ledger.sort(key=lambda x: x["totalPoints"], reverse=True)

    # Fetch drafts and draft picks for rookie pick tracing
    draft_selections = {}
    roster_to_slot = {}
    try:
        drafts = fetch_sleeper(f"league/{league_id}/drafts")
        if isinstance(drafts, list) and len(drafts) > 0:
            draft = drafts[0]
            draft_id = draft.get("draft_id")
            draft_order = draft.get("draft_order") or {}
            uid_to_roster = {r["owner_id"]: r["roster_id"] for r in rosters if "owner_id" in r}
            slot_to_roster = {slot: uid_to_roster[uid] for uid, slot in draft_order.items() if uid in uid_to_roster}
            roster_to_slot = {rid: slot for slot, rid in slot_to_roster.items()}

            d_picks = fetch_sleeper(f"draft/{draft_id}/picks")
            if isinstance(d_picks, list):
                for p in d_picks:
                    rnd = p.get("round")
                    slot = p.get("draft_slot")
                    pid = str(p.get("player_id"))
                    meta = p.get("metadata") or {}
                    first = meta.get("first_name", "")
                    last = meta.get("last_name", "")
                    pos = meta.get("position", "")
                    team = meta.get("team", "")

                    # Calculate regular season points scored by this drafted player on the picked roster
                    p_pts = 0.0
                    p_starts = 0
                    picked_rid = p.get("roster_id")
                    for wk, m_by_r in weekly_matchups.items():
                        m = m_by_r.get(picked_rid)
                        if m:
                            pts = float((m.get("players_points") or {}).get(pid) or 0.0)
                            p_pts += pts
                            if pid in (m.get("starters") or []):
                                p_starts += 1

                    draft_selections[(rnd, slot)] = {
                        "pickNo": p.get("pick_no"),
                        "pickSlot": f"{rnd}.{slot:02d}",
                        "round": rnd,
                        "slot": slot,
                        "playerId": pid,
                        "playerName": f"{first} {last}".strip(),
                        "position": pos,
                        "nflTeam": team,
                        "pickedByRosterId": picked_rid,
                        "points": round(p_pts, 1),
                        "starts": p_starts,
                    }
    except Exception as e:
        print(f"  Warning fetching draft information: {e}")

    # Load FantasyCalc dynasty snapshots for valuation and market trend tracking
    aug_map, sep_map = load_dynasty_snapshots()

    # Process trade evaluations separately with dedicated two-sided comparative logic
    trade_evaluations, trade_summary = process_trade_evaluations(
        trade_transactions, roster_info, weekly_matchups, players_map, current_week,
        draft_selections=draft_selections, roster_to_slot=roster_to_slot,
        aug_map=aug_map, sep_map=sep_map,
    )

    # Compile manager profiles
    manager_profiles = []
    total_league_faab_spent = 0
    total_league_moves = 0
    total_points_from_pickups = 0.0

    for rid, m in sorted(roster_info.items(), key=lambda x: x[1]["totalPointsContributed"], reverse=True):
        faab_spent = m["faabSpent"]
        total_league_faab_spent += faab_spent
        total_league_moves += m["movesCount"]
        total_points_from_pickups += m["totalPointsContributed"]

        sorted_m_pickups = sorted(m["pickups"], key=lambda x: x["totalPoints"], reverse=True)
        top_pickup = sorted_m_pickups[0] if sorted_m_pickups else None
        archetype = determine_manager_archetype(m["movesCount"], faab_spent, m["waiverCount"])

        m_trades = [t for t in trade_evaluations if any(team.get("rosterId") == rid for team in t.get("teams", []))]
        net_trade_pts = round(sum(next((team.get("netPoints", 0.0) for team in t.get("teams", []) if team.get("rosterId") == rid), 0.0) for t in m_trades), 1)
        net_trade_vorp = round(sum(next((team.get("netVorp", 0.0) for team in t.get("teams", []) if team.get("rosterId") == rid), 0.0) for t in m_trades), 1)
        net_dynasty_delta = sum(next((team.get("netDynastyDelta") or team.get("netDynastyEquity") or 0 for team in t.get("teams", []) if team.get("rosterId") == rid), 0) for t in m_trades)

        commentary = generate_franchise_transaction_commentary(
            m["manager"], m["teamName"], archetype, m["movesCount"], faab_spent, max(0, 100 - faab_spent),
            m["totalPointsContributed"], m["starterPointsContributed"], top_pickup, m_trades,
            net_trade_pts, net_trade_vorp, net_dynasty_delta
        )

        manager_profiles.append({
            "rosterId": rid,
            "manager": m["manager"],
            "teamName": m["teamName"],
            "faabSpent": faab_spent,
            "faabRemaining": max(0, 100 - faab_spent),
            "totalMoves": m["movesCount"],
            "waiverCount": m["waiverCount"],
            "freeAgentCount": m["freeAgentCount"],
            "tradesCount": len(m_trades),
            "netTradePoints": net_trade_pts,
            "netTradeVorp": net_trade_vorp,
            "netDynastyDelta": net_dynasty_delta,
            "pointsContributed": round(m["totalPointsContributed"], 2),
            "starterPoints": round(m["starterPointsContributed"], 2),
            "archetype": archetype,
            "commentary": commentary,
            "topPickup": {
                "name": top_pickup["playerName"],
                "position": top_pickup["position"],
                "points": top_pickup["totalPoints"],
                "bid": top_pickup["bid"],
                "role": top_pickup["currentRole"],
                "badge": top_pickup["verdictBadge"],
            } if top_pickup else None,
        })

    # Sort immediate impact list by debutPoints descending
    immediate_impact_list.sort(key=lambda x: x["debutPoints"], reverse=True)

    # Spotlight narrative generation (Highlighting breakout storylines like Mannyrsox24 or top leading backs/receivers)
    spotlight_narratives = []
    leading_role_pickups = [p for p in roi_ledger if "Leading" in p["currentRole"] and p["isStillRostered"]]
    for p in leading_role_pickups[:3]:
        tx_label = "waiver claim" if p["type"] == "waiver" else "free agent add"
        spotlight_narratives.append({
            "title": f"Franchise Role Promotion: {p['playerName']}",
            "manager": p["manager"],
            "teamName": p["teamName"],
            "player": p["playerName"],
            "position": p["position"],
            "bid": p["bid"],
            "points": p["totalPoints"],
            "impactLevel": "High",
            "narrative": f"{p['manager']} landed {p['playerName']} via {tx_label} (${p['bid']} FAAB) in Week {p['acquiredWeek']}. The move paid off immediately, delivering {p['totalPoints']} fantasy points and propelling {p['playerName']} to become the #1 {p['position']} on the active roster.",
        })

    # If mannyrsox24 is present and has any pickups, include a spotlight
    manny_pickups = [p for p in roi_ledger if "mannyrsox24" in p["manager"].lower()]
    if manny_pickups and not any("mannyrsox24" in s["manager"].lower() for s in spotlight_narratives):
        mp = manny_pickups[0]
        tx_label = "waivers" if mp["type"] == "waiver" else "free agency"
        spotlight_narratives.append({
            "title": f"Mannyrsox24 Wire Strategy: {mp['playerName']}",
            "manager": mp["manager"],
            "teamName": mp["teamName"],
            "player": mp["playerName"],
            "position": mp["position"],
            "bid": mp["bid"],
            "points": mp["totalPoints"],
            "impactLevel": "Medium",
            "narrative": f"Mannyrsox24 executed on {tx_label} to secure {mp['playerName']} ({mp['position']}) for ${mp['bid']}. The player has accumulated {mp['totalPoints']} fantasy points, securing a prominent role in the offensive rotation.",
        })

    # Top overall pickup
    top_overall = roi_ledger[0] if roi_ledger else None

    payload = {
        "schemaVersion": "2.0.0",
        "generatedAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "league": {
            "leagueId": str(league_id),
            "season": str(season),
            "currentWeek": current_week,
        },
        "summary": {
            "totalMoves": total_league_moves,
            "totalFaabSpent": total_league_faab_spent,
            "totalPickupPoints": round(total_points_from_pickups, 2),
            "activeClaimCount": len(completed_adds),
            "avgPointsPerDollar": round(total_points_from_pickups / max(1, total_league_faab_spent), 2) if total_league_faab_spent > 0 else 0.0,
            "totalTrades": trade_summary["totalTrades"],
            "topPickupOverall": {
                "player": top_overall["playerName"],
                "manager": top_overall["manager"],
                "points": top_overall["totalPoints"],
                "bid": top_overall["bid"],
                "badge": top_overall["verdictBadge"],
            } if top_overall else None,
        },
        "positionalSpending": positional_spending,
        "managerProfiles": manager_profiles,
        "immediateImpact": immediate_impact_list[:12],
        "roiLedger": roi_ledger[:40],
        "spotlightNarratives": spotlight_narratives,
        "tradeSummary": trade_summary,
        "tradeEvaluations": trade_evaluations,
    }

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    print(f"[OK] Saved waiver analysis ({len(roi_ledger)} waiver/FA moves, {len(trade_evaluations)} trades) to {out_file}")
    return payload


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate Waiver Wire ROI Analytics payload")
    parser.add_argument("--league", default=AMS_LEAGUE_ID, help="Sleeper League ID")
    parser.add_argument("--season", default="2026", help="Season year")
    parser.add_argument("--week", type=int, default=None, help="NFL week (defaults to live active week)")
    args = parser.parse_args()

    build_waiver_roi(league_id=args.league, season=args.season, week=args.week)
