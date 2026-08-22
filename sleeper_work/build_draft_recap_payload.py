"""
build_draft_recap_payload.py — Draft Recap scoring engine (MASTER_PLAN task P5-1)

Implements DRAFT_RECAP_DATA_PIPELINE_IMPLEMENTATION_PLAN.md sections 9-14:

  ss11.2  monotonic piecewise ratio-to-score curve
  ss11.3  pick execution = 0.55 * expert score + 0.45 * market score
  ss11.4  team execution weighted by expected slot value (no volume bonus)
  ss11.5  capital score from the 2026-pick trade ledger
  ss11.6  roster fit from pre-draft position-room rank
  ss11.7  cycle score = 0.60 execution + 0.30 capital + 0.10 fit
  ss11.8  rank by unrounded score; a first-place tie blocks the award
  ss14    presentation contract

Every score derives from observed data. Nothing is hardcoded per team, and a
component that cannot be computed is emitted as null with an explicit status
rather than as a number (ss4.6, "missing is not zero").
"""

import json
import os
import re
import sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FIXTURES = os.path.join(HERE, "fixtures")
RAW = os.path.join(HERE, "raw")
OUT = os.path.join(ROOT, "ape-invitational-almanac", "src", "generated", "draft-recap.json")

LEAGUE_ID = "1312209616372772864"
PRIOR_LEAGUE_ID = "1187879775490527232"
DRAFT_ID = "1312209616385343488"
SEASON = "2026"
TEAMS = 12
ROUNDS = 4
MODEL_VERSION = "draft-cycle-2026-v1"
SCHEMA_VERSION = "1.0.0"

# ss11.2 ratio -> score anchors
RATIO_ANCHORS = [
    (0.00, 0), (0.48, 40), (0.58, 50), (0.68, 60), (0.76, 67), (0.84, 72),
    (0.90, 76), (0.96, 80), (1.02, 84), (1.08, 88), (1.15, 92), (1.25, 96),
    (1.40, 100),
]

# ss11.5 capital ratio -> score anchors
CAPITAL_ANCHORS = [
    (0.70, 45), (0.80, 58), (0.85, 65), (0.90, 71), (0.95, 77), (1.00, 82),
    (1.05, 85), (1.10, 88), (1.20, 92), (1.35, 95), (1.60, 98), (2.00, 100),
]

# ss11.6 format-aware fit multipliers (1QB, half-PPR, no TE premium)
FIT_MULTIPLIER = {"QB": 0.55, "RB": 1.15, "WR": 1.15, "TE": 0.80}

# ss11.7 letter thresholds. ASCII in JSON; the UI may render a typographic minus.
GRADE_THRESHOLDS = [
    (95.0, "A+"), (92.0, "A"), (87.0, "A-"), (80.0, "B+"), (76.5, "B"),
    (73.0, "B-"), (68.0, "C+"), (60.0, "C"), (50.0, "C-"), (0.0, "D"),
]

EXECUTION_WEIGHT, CAPITAL_WEIGHT, FIT_WEIGHT = 0.60, 0.30, 0.10
EXPERT_WEIGHT, MARKET_WEIGHT = 0.55, 0.45
NEUTRAL_SCORE = 80.0  # ss12.2 best-pick impact baseline
FUTURE_PICK_DISCOUNT = 0.85  # per season out, applied to later-year pick legs


# ----------------------------------------------------------------- utilities

def interpolate(anchors, x):
    """Monotonic piecewise-linear interpolation, clamped at both ends."""
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


def ratio_to_score(r):
    return interpolate(RATIO_ANCHORS, r)


def capital_to_score(r):
    return interpolate(CAPITAL_ANCHORS, r)


def grade_from_score(score):
    if score is None:
        return "INC"
    for threshold, letter in GRADE_THRESHOLDS:
        if score >= threshold:
            return letter
    return "D"


def norm_name(s):
    s = (s or "").lower().strip()
    s = re.sub(r"[.'`]", "", s)
    s = re.sub(r"\s+(jr|sr|ii|iii|iv|v)$", "", s)
    return re.sub(r"\s+", " ", s)


def load(path):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def first_existing(*paths):
    for p in paths:
        if os.path.exists(p):
            return p
    raise FileNotFoundError("none of: %s" % ", ".join(paths))


# ------------------------------------------------------------------- loading

def load_inputs():
    picks = load(first_existing(
        os.path.join(FIXTURES, "draft_%s_picks.json" % DRAFT_ID),
        os.path.join(RAW, "picks.json"),
    ))
    rosters = load(os.path.join(RAW, "rosters.json"))
    users = load(os.path.join(RAW, "users.json"))
    expert = load(os.path.join(HERE, "expert_rankings_2026.json"))
    market = load(os.path.join(RAW, "fantasycalc.json"))

    draft_traded = []
    p = os.path.join(FIXTURES, "draft_%s_traded_picks.json" % DRAFT_ID)
    if os.path.exists(p):
        draft_traded = load(p)

    transactions = []
    for lg in (LEAGUE_ID, PRIOR_LEAGUE_ID):
        p = os.path.join(FIXTURES, "league_%s_transactions.json" % lg)
        if not os.path.exists(p):
            continue
        raw = load(p)
        flat = raw if isinstance(raw, list) else [t for v in raw.values() for t in (v or [])]
        for t in flat:
            t["_league_id"] = lg
        transactions.extend(flat)

    return picks, rosters, users, expert, market, draft_traded, transactions


# ------------------------------------------------------- identity + valuation

def build_market_index(market):
    """Sleeper id and normalized name -> FantasyCalc row."""
    by_sleeper, by_name = {}, {}
    for row in market:
        pl = row.get("player") or {}
        sid = pl.get("sleeperId")
        if sid:
            by_sleeper[str(sid)] = row
        by_name.setdefault(norm_name(pl.get("name")), row)
    return by_sleeper, by_name


def build_rookie_curve(market):
    """Expected dynasty value at each rookie draft slot.

    The 2026 rookie class sorted by current market value: the value at ordinal
    N is what a pick at N could normally return. This is the denominator for
    every value-capture ratio (ss11.3) and the weight for team execution (ss11.4).
    """
    rookies = [
        r for r in market
        if ((r.get("player") or {}).get("maybeDraftInfo") or {}).get("year") == 2026
    ]
    rookies.sort(key=lambda r: r.get("value") or 0, reverse=True)
    rookie_rank = {}
    for i, r in enumerate(rookies, start=1):
        sid = (r.get("player") or {}).get("sleeperId")
        if sid:
            rookie_rank[str(sid)] = i
    return [r.get("value") or 0 for r in rookies], rookie_rank


def curve_at(curve, ordinal):
    if not curve:
        return 0.0
    i = max(1, int(round(ordinal))) - 1
    return float(curve[min(i, len(curve) - 1)])


def expert_lookup(expert, name):
    players = expert.get("players") or {}
    key = norm_name(name)
    if key in players:
        return players[key]
    for k, v in players.items():
        if norm_name(k) == key or norm_name(v.get("name")) == key:
            return v
    return None


# --------------------------------------------------------- slot ownership

def derive_slot_owner(picks, draft_traded):
    """draft_slot -> roster_id that originally held it.

    slot_to_roster_id is null on this draft, so it is reconstructed: a roster
    that used its own (untraded) pick in a round reveals its slot; remaining
    slots are filled from the traded-pick ledger.
    """
    traded = {}
    for tp in draft_traded or []:
        traded[(tp.get("round"), tp.get("owner_id"))] = tp.get("roster_id")

    slot_owner = {}
    for p in picks:
        rnd, slot, picker = p.get("round"), p.get("draft_slot"), p.get("roster_id")
        if (rnd, picker) in traded:
            continue  # picked with an acquired pick; says nothing about its own slot
        slot_owner.setdefault(slot, picker)

    for p in picks:
        rnd, slot, picker = p.get("round"), p.get("draft_slot"), p.get("roster_id")
        origin = traded.get((rnd, picker))
        if origin is not None:
            slot_owner.setdefault(slot, origin)
    return slot_owner


# ---------------------------------------------------------------- trade ledger

def build_trade_ledger(transactions, picks, slot_owner, by_sleeper, curve, floor_value):
    """Sent/received value per roster across every completed trade containing a
    2026 pick (ss10).

    The whole package is valued, not only the 2026 leg (ss10.1): a trade that sends
    a 2026 pick for a 2027 first must show both sides, or the sender appears to
    have received nothing. Valuation basis per leg is recorded explicitly:

      realized        a 2026 pick, valued at the player actually selected with it
      market          a player, valued at the market snapshot
      slot_estimate   a 2026 pick that produced no selection
      future_estimate a pick in a later season, mid-round curve value discounted
                      by FUTURE_PICK_DISCOUNT per season out
      floor           a player absent from the market feed, valued at the feed
                      floor rather than zero (ss9.2 forbids missing -> zero)
    """
    realized = {}
    for p in picks:
        origin = slot_owner.get(p.get("draft_slot"))
        if origin is not None:
            realized[(p.get("round"), origin)] = p

    ledger = {rid: {"sent": 0.0, "received": 0.0, "transactions": set(),
                    "legs": [], "estimated": 0, "floored": 0}
              for rid in range(1, TEAMS + 1)}
    used = []

    for t in transactions:
        if t.get("type") != "trade" or t.get("status") != "complete":
            continue
        dps = t.get("draft_picks") or []
        if not any(str(dp.get("season")) == SEASON for dp in dps):
            continue
        used.append(t.get("transaction_id"))

        def leg(roster, direction, value, label, basis):
            if roster not in ledger:
                return
            ledger[roster][direction] += value
            ledger[roster]["transactions"].add(t.get("transaction_id"))
            ledger[roster]["legs"].append({
                "transactionId": t.get("transaction_id"),
                "direction": direction,
                "asset": label,
                "value": round(value, 1),
                "valuationBasis": basis,
            })
            if basis in ("slot_estimate", "future_estimate"):
                ledger[roster]["estimated"] += 1
            elif basis == "floor":
                ledger[roster]["floored"] += 1

        for pid, to_roster in (t.get("adds") or {}).items():
            row = by_sleeper.get(str(pid))
            if row:
                val, basis = float(row.get("value") or 0), "market"
                name = (row.get("player") or {}).get("name") or ("player %s" % pid)
            else:
                val, basis = floor_value, "floor"
                name = "unlisted player %s" % pid
            from_roster = (t.get("drops") or {}).get(pid)
            leg(to_roster, "received", val, name, basis)
            if from_roster is not None:
                leg(from_roster, "sent", val, name, basis)

        for dp in dps:
            season = str(dp.get("season"))
            rnd, origin = dp.get("round") or 1, dp.get("roster_id")
            if season == SEASON:
                sel = realized.get((rnd, origin))
                if sel:
                    row = by_sleeper.get(str(sel.get("player_id")))
                    val = float(row.get("value") or 0) if row else curve_at(curve, sel.get("pick_no") or 1)
                    md = sel.get("metadata") or {}
                    label = "R%s pick -> %s %s" % (rnd, md.get("first_name", ""), md.get("last_name", ""))
                    basis = "realized"
                else:
                    val = curve_at(curve, (rnd - 1) * TEAMS + (TEAMS // 2))
                    label = "%s round %s pick" % (season, rnd)
                    basis = "slot_estimate"
            else:
                years_out = max(1, int(season) - int(SEASON)) if season.isdigit() else 1
                mid = (rnd - 1) * TEAMS + (TEAMS // 2)
                val = curve_at(curve, mid) * (FUTURE_PICK_DISCOUNT ** years_out)
                label = "%s round %s pick" % (season, rnd)
                basis = "future_estimate"
            leg(dp.get("owner_id"), "received", val, label.strip(), basis)
            leg(dp.get("previous_owner_id"), "sent", val, label.strip(), basis)

    return ledger, used


# ------------------------------------------------------------------ room fit

def build_pre_draft_rooms(rosters, picks, by_sleeper):
    """Position-room strength per team before the draft.

    Reconstruction method is post_draft_minus_rookies (ss8.3): the retained roster
    snapshot minus every player selected in this draft. Recorded in metadata.
    """
    drafted = {str(p.get("player_id")) for p in picks}
    rooms = {}
    for r in rosters:
        rid = r.get("roster_id")
        totals = {"QB": 0.0, "RB": 0.0, "WR": 0.0, "TE": 0.0}
        for pid in (r.get("players") or []):
            if str(pid) in drafted:
                continue
            row = by_sleeper.get(str(pid))
            if not row:
                continue
            pos = ((row.get("player") or {}).get("position") or "").upper()
            if pos in totals:
                totals[pos] += float(row.get("value") or 0)
        rooms[rid] = totals

    ranks = {}
    for pos in ("QB", "RB", "WR", "TE"):
        order = sorted(rooms, key=lambda rid: rooms[rid][pos], reverse=True)
        for i, rid in enumerate(order, start=1):
            ranks.setdefault(rid, {})[pos] = i
    return rooms, ranks


# ------------------------------------------------------------------ narrative

def build_narrative(team, picks_rows, ledger_entry):
    """Deterministic evidence-backed narrative (ss12).

    Templates only. Every number and player name below is read from a computed
    field on this team, never authored. Process language, not outcome prediction.
    """
    name = team["teamName"]
    ex = team["components"]["execution"]["score"]
    cap = team["components"]["capital"]
    fit = team["components"]["fit"]["score"]
    ratio = cap.get("ratio")
    n = team["pickCounts"]
    facts = []

    scored = [p for p in picks_rows if p["executionScore"] is not None]
    best = max(scored, key=lambda p: p["impact"]) if scored else None
    worst = min(scored, key=lambda p: p["impact"]) if scored else None

    # ss12.4 headline from the component pattern
    if not scored:
        headline = "No selections; graded on capital management alone"
    else:
        hi_ex, hi_cap = (ex or 0) >= NEUTRAL_SCORE, (cap.get("score") or 0) >= NEUTRAL_SCORE
        if hi_ex and hi_cap:
            headline = "Strong selections backed by sound capital management"
        elif hi_ex and not hi_cap:
            headline = "Excellent selections, weaker capital management"
        elif not hi_ex and hi_cap:
            headline = "Capital gains carry an inefficient set of selections"
        elif (fit or 0) >= 80:
            headline = "Picks fit the roster better than they beat the board"
        else:
            headline = "Below-market selections and a costly capital path"

    # ss12.2 best pick
    if best is None:
        best_pick = "No selection made in this cycle."
    elif best["impact"] > 0:
        best_pick = "%s at %s (execution %.0f)" % (best["playerName"], best["slot"], best["executionScore"])
        facts.append("pick:%s:%s:execution" % (DRAFT_ID, best["pickNo"]))
    else:
        best_pick = "%s at %s, best of a class that did not beat its slots" % (best["playerName"], best["slot"])
        facts.append("pick:%s:%s:execution" % (DRAFT_ID, best["pickNo"]))

    # ss12.3 biggest question, first matching driver wins
    early = [p for p in scored if p["round"] in (1, 2)]
    if not scored:
        question = "Does standing pat through four rounds fit this roster's window?"
    elif early and min(early, key=lambda p: p["executionScore"])["executionScore"] < NEUTRAL_SCORE:
        w = min(early, key=lambda p: p["executionScore"])
        question = "Was %s at %s worth an early pick the board valued higher?" % (w["playerName"], w["slot"])
        facts.append("pick:%s:%s:execution" % (DRAFT_ID, w["pickNo"]))
    elif ratio is not None and ratio < 0.95:
        question = "Was the capital spent to assemble this class recoverable elsewhere?"
        facts.append("team:%s:%s:capital_ratio" % (LEAGUE_ID, team["rosterId"]))
    elif worst is not None and worst["impact"] < 0:
        question = "Did %s at %s duplicate strength this roster already had?" % (worst["playerName"], worst["slot"])
        facts.append("pick:%s:%s:execution" % (DRAFT_ID, worst["pickNo"]))
    else:
        question = "Can this class hold its value once the rookie market settles?"

    # ss12.6 capital note, generated from ledger fields
    if cap["status"] == "not_applicable":
        capital_note = "No completed trade in this cycle involved 2026 draft capital."
    elif ratio is None:
        capital_note = "Capital outcome requires manual audit: value was received with none sent."
    else:
        capital_note = (
            "Received %s of the value sent across %d completed trade%s containing 2026 capital "
            "(%s received against %s sent, market snapshot)."
            % (("%.1f%%" % (ratio * 100)), cap["transactionCount"],
               "" if cap["transactionCount"] == 1 else "s",
               "{:,.0f}".format(cap["valueReceived"]), "{:,.0f}".format(cap["valueSent"]))
        )
        facts.append("team:%s:%s:capital_ratio" % (LEAGUE_ID, team["rosterId"]))
        if cap.get("estimatedLegs"):
            capital_note += " %d leg%s valued by estimate rather than a realized selection." % (
                cap["estimatedLegs"], "" if cap["estimatedLegs"] == 1 else "s")

    # ss12.4 commentary, at most three evidence claims
    bits = []
    if scored:
        bits.append("%s used %d pick%s (%d original, %d acquired)"
                    % (name, n["total"], "" if n["total"] == 1 else "s", n["original"], n["acquired"]))
        if best and best["impact"] > 0:
            bits.append("%s at %s was the class-defining selection" % (best["playerName"], best["slot"]))
        if fit is not None:
            bits.append("the class %s the rooms that were thinnest before the draft"
                        % ("attacked" if fit >= 70 else "largely bypassed"))
    else:
        bits.append("%s made no selection in this cycle" % name)
    commentary = "; ".join(bits) + "."

    # ss12.5 verdict, process language only
    if team["cycle"]["score"] is None:
        verdict = "Incomplete: no selections to grade. Capital activity is shown separately."
    else:
        driver = "pick execution" if (ex or 0) >= (cap.get("score") or 0) else "capital management"
        drag = "capital management" if driver == "pick execution" else "pick execution"
        verdict = ("Cycle score %.1f (%s). %s carried the grade; %s was the drag."
                   % (team["cycle"]["score"], team["cycle"]["grade"],
                      driver.capitalize(), drag))

    return {
        "headline": headline,
        "commentary": commentary,
        "bestPick": best_pick,
        "biggestQuestion": question,
        "verdict": verdict,
        "capitalNote": capital_note,
        "evidenceFactIds": facts,
    }


# --------------------------------------------------------------------- build

def main():
    picks, rosters, users, expert, market, draft_traded, transactions = load_inputs()

    quality = {"errors": [], "warnings": [], "checks": {}}

    # ss9.1 completion invariant
    pick_nos = sorted(p.get("pick_no") for p in picks)
    expected = list(range(1, TEAMS * ROUNDS + 1))
    complete = pick_nos == expected and all(p.get("player_id") for p in picks)
    quality["checks"]["pickCount"] = len(picks)
    quality["checks"]["contiguous"] = pick_nos == expected
    if not complete:
        quality["errors"].append("draft board is not a complete contiguous 1..%d" % (TEAMS * ROUNDS))

    by_sleeper, by_name = build_market_index(market)
    curve, rookie_rank = build_rookie_curve(market)
    floor_value = float(min((r.get("value") or 0) for r in market)) if market else 0.0
    slot_owner = derive_slot_owner(picks, draft_traded)
    ledger, tx_used = build_trade_ledger(
        transactions, picks, slot_owner, by_sleeper, curve, floor_value)
    rooms, room_ranks = build_pre_draft_rooms(rosters, picks, by_sleeper)

    user_by_id = {u.get("user_id"): u for u in users}
    team_meta = {}
    for r in rosters:
        u = user_by_id.get(r.get("owner_id")) or {}
        team_meta[r.get("roster_id")] = {
            "manager": u.get("display_name") or "Roster %s" % r.get("roster_id"),
            "teamName": ((u.get("metadata") or {}).get("team_name")
                         or u.get("display_name") or "Roster %s" % r.get("roster_id")),
        }

    by_roster = {r.get("roster_id"): [] for r in rosters}
    for p in sorted(picks, key=lambda x: x.get("pick_no") or 0):
        by_roster.setdefault(p.get("roster_id"), []).append(p)

    market_matched = expert_matched = 0
    teams_out = []

    for rid in sorted(by_roster):
        tp = by_roster[rid]
        meta = team_meta.get(rid, {"manager": "Roster %s" % rid, "teamName": "Roster %s" % rid})
        pick_rows, num, den = [], 0.0, 0.0
        fit_num, fit_den = 0.0, 0.0
        acquired = 0

        for p in tp:
            pick_no = p.get("pick_no")
            rnd, slot = p.get("round"), p.get("draft_slot")
            md = p.get("metadata") or {}
            name = ("%s %s" % (md.get("first_name", ""), md.get("last_name", ""))).strip()
            pos = (md.get("position") or "").upper()

            origin = slot_owner.get(slot)
            provenance = "original" if origin == rid else ("acquired" if origin is not None else "unresolved")
            if provenance == "acquired":
                acquired += 1

            slot_value = curve_at(curve, pick_no)

            mrow = by_sleeper.get(str(p.get("player_id"))) or by_name.get(norm_name(name))
            market_value = float(mrow.get("value")) if mrow else None
            if mrow:
                market_matched += 1

            erow = expert_lookup(expert, name)
            consensus = erow.get("consensus_rank") if erow else None
            if erow:
                expert_matched += 1
            expert_value = curve_at(curve, consensus) if consensus else None

            market_ratio = (market_value / slot_value) if (market_value and slot_value) else None
            expert_ratio = (expert_value / slot_value) if (expert_value and slot_value) else None
            market_score = ratio_to_score(market_ratio) if market_ratio is not None else None
            expert_score = ratio_to_score(expert_ratio) if expert_ratio is not None else None

            if market_score is not None and expert_score is not None:
                pick_score = EXPERT_WEIGHT * expert_score + MARKET_WEIGHT * market_score
            elif market_score is not None:
                pick_score = market_score
            elif expert_score is not None:
                pick_score = expert_score
            else:
                pick_score = None

            if pick_score is not None:
                num += pick_score * slot_value
                den += slot_value

            # ss11.6 fit: weakest room -> highest need, damped by format multiplier
            rank = (room_ranks.get(rid) or {}).get(pos)
            if rank is not None:
                need = (rank - 1) / float(TEAMS - 1)
                signal = max(0.0, min(1.0, need * FIT_MULTIPLIER.get(pos, 1.0)))
                fit_num += signal * slot_value
                fit_den += slot_value

            pick_rows.append({
                "pickKey": "%s:%s" % (DRAFT_ID, pick_no),
                "pickNo": pick_no,
                "round": rnd,
                "draftSlot": slot,
                "slot": "%d.%02d" % (rnd, slot),
                "playerId": str(p.get("player_id")),
                "playerName": name,
                "position": pos,
                "nflTeam": md.get("team"),
                "provenance": provenance,
                "originalRosterId": origin,
                "expertConsensusRank": consensus,
                "expertSourceCount": (erow or {}).get("sources_count"),
                "marketOverallRank": (mrow or {}).get("overallRank"),
                "marketRookieRank": rookie_rank.get(str(p.get("player_id"))),
                "marketValue": market_value,
                "expectedSlotValue": round(slot_value, 1),
                "marketRatio": round(market_ratio, 4) if market_ratio else None,
                "expertRatio": round(expert_ratio, 4) if expert_ratio else None,
                "marketScore": round(market_score, 1) if market_score is not None else None,
                "expertScore": round(expert_score, 1) if expert_score is not None else None,
                "executionScore": round(pick_score, 1) if pick_score is not None else None,
                "grade": grade_from_score(pick_score),
                "impact": round((pick_score - NEUTRAL_SCORE) * slot_value, 1) if pick_score is not None else None,
                "evidenceFactIds": ["pick:%s:%s:execution" % (DRAFT_ID, pick_no)],
            })

        has_picks = len(tp) > 0
        execution = (num / den) if den else None
        fit = (100.0 * fit_num / fit_den) if fit_den else None

        led = ledger.get(rid, {"sent": 0.0, "received": 0.0, "transactions": set(),
                               "legs": [], "estimated": 0, "floored": 0})
        sent, received = led["sent"], led["received"]
        if sent <= 0 and received <= 0:
            capital, capital_ratio, capital_status = None, None, "not_applicable"
        elif sent <= 0:
            capital, capital_ratio, capital_status = None, None, "manual_audit_required"
            quality["warnings"].append("roster %s received value with no value sent" % rid)
        else:
            capital_ratio = received / sent
            capital = capital_to_score(capital_ratio)
            capital_status = "scored"

        # ss11.7 cycle score. Renormalize over the components actually present so a
        # not-applicable capital ledger cannot silently depress the grade.
        parts = []
        if execution is not None:
            parts.append((EXECUTION_WEIGHT, execution))
        if capital is not None:
            parts.append((CAPITAL_WEIGHT, capital))
        if fit is not None:
            parts.append((FIT_WEIGHT, fit))
        if has_picks and execution is not None and parts:
            wsum = sum(w for w, _ in parts)
            cycle = sum(w * v for w, v in parts) / wsum
            cycle_status = "official" if len(parts) == 3 else "partial_components"
        else:
            cycle, cycle_status = None, "incomplete_no_picks"

        teams_out.append({
            "rosterId": rid,
            "teamName": meta["teamName"],
            "managerName": meta["manager"],
            "rank": None,
            "rankStatus": "ranked" if cycle is not None else "unranked",
            "cycle": {
                "status": cycle_status,
                "score": round(cycle, 1) if cycle is not None else None,
                "scoreExact": cycle,
                "grade": grade_from_score(cycle) if cycle is not None else "INC",
            },
            "components": {
                "execution": {
                    "status": "scored" if execution is not None else "not_applicable",
                    "score": round(execution, 1) if execution is not None else None,
                    "grade": grade_from_score(execution) if execution is not None else "INC",
                },
                "capital": {
                    "status": capital_status,
                    "score": round(capital, 1) if capital is not None else None,
                    "ratio": round(capital_ratio, 4) if capital_ratio is not None else None,
                    "valueSent": round(sent, 1),
                    "valueReceived": round(received, 1),
                    "transactionCount": len(led["transactions"]),
                    "estimatedLegs": led["estimated"],
                    "flooredLegs": led["floored"],
                    "legs": led["legs"],
                },
                "fit": {
                    "status": "scored" if fit is not None else "not_applicable",
                    "score": round(fit, 1) if fit is not None else None,
                    "preDraftRoomRanks": room_ranks.get(rid),
                    "reconstructionMethod": "post_draft_minus_rookies",
                },
            },
            "capture": {
                "expertPct": round(100.0 * sum(
                    (p["expertRatio"] or 0) * p["expectedSlotValue"] for p in pick_rows
                ) / den, 1) if den else None,
                "marketPct": round(100.0 * sum(
                    (p["marketRatio"] or 0) * p["expectedSlotValue"] for p in pick_rows
                ) / den, 1) if den else None,
            },
            "pickCounts": {
                "total": len(tp),
                "original": len(tp) - acquired,
                "acquired": acquired,
            },
            "picks": pick_rows,
        })

    # ss11.8 rank on unrounded score; equal scores share a rank
    ranked = sorted([t for t in teams_out if t["cycle"]["scoreExact"] is not None],
                    key=lambda t: -t["cycle"]["scoreExact"])
    for i, t in enumerate(ranked):
        if i and abs(t["cycle"]["scoreExact"] - ranked[i - 1]["cycle"]["scoreExact"]) < 1e-9:
            t["rank"] = ranked[i - 1]["rank"]
        else:
            t["rank"] = i + 1
    for t in teams_out:
        t["cycle"].pop("scoreExact", None)

    # ss12 narrative, generated after ranking so the verdict can cite the final grade
    for t in teams_out:
        t["narrative"] = build_narrative(t, t["picks"], ledger.get(t["rosterId"]))

    winners = [t["rosterId"] for t in ranked if t["rank"] == 1]
    if len(winners) > 1:
        quality["errors"].append("first-place tie between rosters %s; award blocked (ss11.8)" % winners)
        award_status = "blocked_tie"
    else:
        award_status = "candidate"  # confirmation is a product decision, not a model output

    # ss9.2 coverage gates
    total_picks = len(picks)
    market_cov = market_matched / float(total_picks or 1)
    expert_cov = expert_matched / float(total_picks or 1)
    quality["checks"]["marketCoverage"] = round(market_cov, 4)
    quality["checks"]["expertCoverage"] = round(expert_cov, 4)
    quality["checks"]["tradesWith2026Capital"] = len(tx_used)
    if market_cov < 0.95:
        quality["warnings"].append("market coverage %.1f%% is below the 95%% finalization gate" % (market_cov * 100))
    if expert_cov < 0.90:
        quality["warnings"].append("expert coverage %.1f%% is below the 90%% finalization gate" % (expert_cov * 100))
    unresolved = sum(1 for t in teams_out for p in t["picks"] if p["provenance"] == "unresolved")
    if unresolved:
        quality["warnings"].append("%d picks have unresolved provenance" % unresolved)

    # ss12.7 superlatives, from explicit selectors over observed impact
    all_picks = [p for t in teams_out for p in t["picks"] if p["executionScore"] is not None]
    supers = []
    owner_of = {p["pickKey"]: t["teamName"] for t in teams_out for p in t["picks"]}

    def add(cat, label, sel, pick, note):
        if pick:
            supers.append({
                "category": cat, "label": label, "selector": sel,
                "winnerPickKey": pick["pickKey"], "team": owner_of.get(pick["pickKey"]),
                "player": pick["playerName"], "slot": pick["slot"],
                "displayWinner": "%s · %s" % (pick["playerName"], pick["slot"]),
                "note": note,
                "executionScore": pick["executionScore"], "impact": pick["impact"],
                "evidenceFactIds": ["pick:%s:%s:execution" % (DRAFT_ID, pick["pickNo"])],
            })

    def ranknote(p):
        bits = []
        if p["expertConsensusRank"]:
            bits.append("expert consensus rank %g" % p["expertConsensusRank"])
        if p["marketRookieRank"]:
            bits.append("market rookie rank %d" % p["marketRookieRank"])
        return "; ".join(bits) + ("; selected %d overall." % p["pickNo"] if bits else "")

    r1 = [p for p in all_picks if p["round"] == 1]
    late = [p for p in all_picks if p["round"] in (3, 4)]
    if r1:
        w = max(r1, key=lambda p: p["executionScore"])
        add("bestFirstRoundValue", "Best first-round value",
            "highest execution score in round 1", w, ranknote(w))
    if late:
        w = max(late, key=lambda p: p["impact"])
        add("bestLateValue", "Best late value",
            "highest positive impact in rounds 3-4", w, ranknote(w))
    conv = [p for p in all_picks if p["expertConsensusRank"] and p["marketRookieRank"]]
    if conv:
        w = max(conv, key=lambda p: abs(p["expertConsensusRank"] - p["marketRookieRank"]))
        add("largestConvictionBet", "Largest conviction bet",
            "largest expert-versus-market rank disagreement", w,
            "Expert rookie rank %g versus live-market rookie rank %d."
            % (w["expertConsensusRank"], w["marketRookieRank"]))
    top = max(all_picks, key=lambda p: p["impact"]) if all_picks else None
    if top:
        add("bestOverallValue", "Best value of the draft",
            "highest weighted impact across all rounds", top, ranknote(top))

    fc_stat = os.path.getmtime(os.path.join(RAW, "fantasycalc.json"))
    payload = {
        "schemaVersion": SCHEMA_VERSION,
        "modelVersion": MODEL_VERSION,
        "league": {
            "leagueId": LEAGUE_ID,
            "season": SEASON,
            "name": "Ape Invitational Dynasty",
            "formatLabel": "12-team · 1QB · half-PPR · no TE premium · 3 FLEX",
        },
        "draft": {
            "draftId": DRAFT_ID,
            "status": "complete" if complete else "incomplete",
            "isFinal": bool(complete and not quality["errors"]),
            "picksMade": total_picks,
            "totalPicks": TEAMS * ROUNDS,
            "snapshotAsOfUtc": datetime.now(timezone.utc).isoformat(),
        },
        "methodology": {
            "executionWeight": EXECUTION_WEIGHT,
            "capitalWeight": CAPITAL_WEIGHT,
            "fitWeight": FIT_WEIGHT,
            "expertWeight": EXPERT_WEIGHT,
            "marketWeight": MARKET_WEIGHT,
            "ratioCurve": "piecewise-linear-v1",
            "expertSources": list((expert.get("sources") or {}).keys()),
            "expertAsOfUtc": expert.get("generated_at"),
            "marketAsOfUtc": datetime.fromtimestamp(fc_stat, timezone.utc).isoformat(),
            "futurePickDiscountPerSeason": FUTURE_PICK_DISCOUNT,
            "capitalValuationView": "market_snapshot_value",
            "capitalValuationNote": (
                "Trade legs are valued at the market snapshot above, not at each "
                "transaction date. This is a retrospective view, not a claim that "
                "these values were known when the trades were made."
            ),
        },
        "quality": {
            "status": "failed" if quality["errors"] else ("passed_with_warnings" if quality["warnings"] else "passed"),
            "errors": quality["errors"],
            "warnings": quality["warnings"],
            "checks": quality["checks"],
        },
        "award": {
            "status": award_status,
            "winnerRosterIds": winners,
            "hallOfMacRecordId": "2026-draft",
            "note": "Model output only. Publication requires explicit approval (MASTER_PLAN ss8 decision 2).",
        },
        "superlatives": supers,
        "teams": sorted(teams_out, key=lambda t: (t["rank"] is None, t["rank"] or 0, t["rosterId"])),
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2)
    os.replace(tmp, OUT)  # ss16.3 atomic publish

    print("draft-recap.json written to %s" % OUT)
    print("  picks %d/%d  market coverage %.1f%%  expert coverage %.1f%%"
          % (total_picks, TEAMS * ROUNDS, market_cov * 100, expert_cov * 100))
    print("  trades with 2026 capital: %d" % len(tx_used))
    print("  quality: %s" % payload["quality"]["status"])
    for w in quality["warnings"]:
        print("    warn: %s" % w)
    for e in quality["errors"]:
        print("    ERROR: %s" % e)
    print("  award: %s -> rosters %s" % (award_status, winners))
    return 1 if quality["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
