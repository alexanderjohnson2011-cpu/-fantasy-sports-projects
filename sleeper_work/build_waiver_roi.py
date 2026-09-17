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


def process_trade_evaluations(trade_transactions, roster_info, weekly_matchups, players_map, current_week):
    trade_evaluations = []
    total_players_traded = set()
    total_picks_traded = 0
    total_faab_traded = 0

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

        date_str = (
            datetime.datetime.fromtimestamp(created_ts / 1000.0, datetime.timezone.utc).strftime("%b %d, %Y")
            if created_ts else "Pre-Season"
        )

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
                rec_players.append({
                    "id": pid,
                    "name": p_meta["name"],
                    "position": p_meta["position"],
                    "nflTeam": p_meta["team"],
                    "points": round(p_pts, 1),
                    "starts": p_starts,
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
                sent_players.append({
                    "id": pid,
                    "name": p_meta["name"],
                    "position": p_meta["position"],
                    "nflTeam": p_meta["team"],
                    "points": round(p_pts, 1),
                    "starts": p_starts,
                })

            # Picks received
            rec_picks = []
            for pick in draft_picks:
                if pick.get("owner_id") == rid:
                    orig_r = pick.get("roster_id")
                    via_note = f" (via {roster_info.get(orig_r, {}).get('teamName')})" if orig_r != pick.get("previous_owner_id") and orig_r in roster_info else ""
                    rec_picks.append(f"{pick.get('season')} Round {pick.get('round')}{via_note}")

            # Picks sent
            sent_picks = []
            for pick in draft_picks:
                if pick.get("previous_owner_id") == rid:
                    orig_r = pick.get("roster_id")
                    via_note = f" (via {roster_info.get(orig_r, {}).get('teamName')})" if orig_r != rid and orig_r in roster_info else ""
                    sent_picks.append(f"{pick.get('season')} Round {pick.get('round')}{via_note}")

            # FAAB
            rec_faab = sum(wb.get("amount", 0) for wb in waiver_budget if wb.get("receiver") == rid)
            sent_faab = sum(wb.get("amount", 0) for wb in waiver_budget if wb.get("sender") == rid)
            total_faab_traded += rec_faab

            net_pts = round(pts_rec - pts_sent, 1)
            net_starts = starts_rec - starts_sent

            teams_evaluation.append({
                "rosterId": rid,
                "teamName": r_info["teamName"],
                "manager": r_info["manager"],
                "receivedPlayers": rec_players,
                "sentPlayers": sent_players,
                "receivedPicks": rec_picks,
                "sentPicks": sent_picks,
                "receivedFaab": rec_faab,
                "sentFaab": sent_faab,
                "totalPointsReceived": round(pts_rec, 1),
                "totalPointsSent": round(pts_sent, 1),
                "startsReceived": starts_rec,
                "startsSent": starts_sent,
                "netPoints": net_pts,
                "netStarts": net_starts,
            })

            # Record in manager profile
            if rid in roster_info:
                roster_info[rid].setdefault("tradesCount", 0)
                roster_info[rid]["tradesCount"] += 1

        # Determine Deal Verdict
        if len(teams_evaluation) >= 2:
            t1, t2 = teams_evaluation[0], teams_evaluation[1]
            diff = t1["netPoints"]
            if len(t1["receivedPicks"]) > len(t1["sentPicks"]) and len(t2["receivedPlayers"]) > len(t1["receivedPlayers"]):
                verdict = f"Rebuild vs Contender ({t2['teamName']} Win-Now Push)"
                verdict_class = "badge-rebuild"
            elif len(t2["receivedPicks"]) > len(t2["sentPicks"]) and len(t1["receivedPlayers"]) > len(t2["receivedPlayers"]):
                verdict = f"Rebuild vs Contender ({t1['teamName']} Win-Now Push)"
                verdict_class = "badge-rebuild"
            elif diff >= 10.0:
                verdict = f"Clear Production Advantage: {t1['teamName']} (+{diff} pts)"
                verdict_class = "badge-win"
            elif diff <= -10.0:
                verdict = f"Clear Production Advantage: {t2['teamName']} (+{abs(diff)} pts)"
                verdict_class = "badge-win"
            elif abs(diff) < 5.0 and (t1["totalPointsReceived"] > 0 or t2["totalPointsReceived"] > 0):
                verdict = "Balanced Win-Win Production Swap"
                verdict_class = "badge-even"
            else:
                verdict = "Strategic Asset Re-allocation"
                verdict_class = "badge-flier"

            headline = f"{t1['teamName']} & {t2['teamName']} Deal"
            t1_rec_summary = ", ".join([p["name"] for p in t1["receivedPlayers"]] + t1["receivedPicks"] + ([f"${t1['receivedFaab']} FAAB"] if t1["receivedFaab"] else [])) or "Draft Capital"
            t2_rec_summary = ", ".join([p["name"] for p in t2["receivedPlayers"]] + t2["receivedPicks"] + ([f"${t2['receivedFaab']} FAAB"] if t2["receivedFaab"] else [])) or "Draft Capital"

            analysis = (
                f"{t1['teamName']} acquired {t1_rec_summary} ({t1['totalPointsReceived']} pts post-trade), "
                f"while {t2['teamName']} received {t2_rec_summary} ({t2['totalPointsReceived']} pts post-trade). "
                f"Net scoring margin currently stands at {diff:+.1f} points."
            )
        else:
            verdict = "Completed Deal"
            verdict_class = "badge-flier"
            headline = "League Trade Completed"
            analysis = "Multi-team transaction executed."

        trade_evaluations.append({
            "tradeId": tx_id,
            "leg": leg,
            "date": date_str,
            "created": created_ts,
            "teams": teams_evaluation,
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


def build_waiver_roi(league_id=AMS_LEAGUE_ID, season="2026"):
    print(f"=== Running Waiver Wire ROI Analytics for League {league_id} ===")
    is_johnny = (str(league_id) == JOHNNYS_LEAGUE_ID)

    if is_johnny:
        out_file = os.path.join(PROJECT_ROOT, "src", "generated", "johnnys-jerks", "waiver-wire-analysis.json")
    else:
        out_file = os.path.join(PROJECT_ROOT, "src", "generated", "waiver-wire-analysis.json")

    os.makedirs(os.path.dirname(out_file), exist_ok=True)

    league = fetch_sleeper(f"league/{league_id}")
    current_week = int((league.get("settings") or {}).get("leg") or 2)
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

    # Process trade evaluations separately with dedicated two-sided comparative logic
    trade_evaluations, trade_summary = process_trade_evaluations(
        trade_transactions, roster_info, weekly_matchups, players_map, current_week
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

        manager_profiles.append({
            "rosterId": rid,
            "manager": m["manager"],
            "teamName": m["teamName"],
            "faabSpent": faab_spent,
            "faabRemaining": max(0, 100 - faab_spent),
            "totalMoves": m["movesCount"],
            "waiverCount": m["waiverCount"],
            "freeAgentCount": m["freeAgentCount"],
            "tradesCount": m.get("tradesCount", 0),
            "pointsContributed": round(m["totalPointsContributed"], 2),
            "starterPoints": round(m["starterPointsContributed"], 2),
            "archetype": archetype,
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
    args = parser.parse_args()

    build_waiver_roi(league_id=args.league, season=args.season)
