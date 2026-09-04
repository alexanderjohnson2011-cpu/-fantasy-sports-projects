from __future__ import annotations

import gzip
import csv
import io
import json
import math
import random
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from .config import DATA_DIR, ROOT, settings
from .db import snake_slot


POSITIONS = {"QB", "RB", "WR", "TE", "K", "DEF", "DST"}
REPLACEMENT_MULTIPLIERS = {"QB": 1.0, "RB": 2.5, "WR": 3.0, "TE": 1.0, "K": 1.0, "DST": 1.0}


def _latest_fantasycalc() -> Path:
    candidates = list((ROOT / "sleeper_work" / "raw").glob("source=fantasycalc_redraft/**/*.json.gz"))
    candidates.extend((DATA_DIR / "raw" / f"publication={settings.publication_id}" / "source=fantasycalc-redraft").glob("**/*.json.gz"))
    candidates = sorted(candidates, key=lambda path: path.stat().st_mtime)
    if not candidates:
        raise FileNotFoundError("No local FantasyCalc redraft snapshot is available")
    return candidates[-1]


def _latest_capture(source: str, suffix: str = "json.gz") -> bytes | None:
    candidates = sorted((DATA_DIR / "raw" / f"publication={settings.publication_id}" / f"source={source}").glob(f"**/*.{suffix}"), key=lambda path: path.stat().st_mtime)
    if not candidates:
        return None
    return gzip.decompress(candidates[-1].read_bytes())


def _latest_json(source: str) -> Any:
    payload = _latest_capture(source)
    return json.loads(payload.decode("utf-8")) if payload else None


def _normalize(name: str) -> str:
    parts = re.findall(r"[a-z0-9]+", name.lower())
    if parts and parts[-1] in {"jr", "sr", "ii", "iii", "iv"}:
        parts.pop()
    return "".join(parts)


def qualitative_profile(player: dict[str, Any]) -> dict[str, Any]:
    """Evidence-first color that never claims an unsupplied role or depth-chart fact."""
    adp_gap = round(float(player.get("adp") or 0) - float(player.get("marketRank") or 0), 1)
    trend = round(float(player.get("trend30Day") or 0), 1)
    reasons: list[str] = []
    if adp_gap >= 8:
        reasons.append(f"market rank #{player['marketRank']} versus ADP {player['adp']:.1f} creates a {adp_gap:.1f}-pick price gap")
    elif adp_gap <= -8:
        reasons.append(f"ADP {player['adp']:.1f} is {abs(adp_gap):.1f} picks earlier than market rank #{player['marketRank']}")
    else:
        reasons.append("market rank and ADP are broadly aligned")
    if trend >= 100:
        reasons.append(f"30-day market value is up {trend:+.0f}")
    elif trend <= -100:
        reasons.append(f"30-day market value is down {trend:+.0f}")
    if player.get("newsRisk") != "clear":
        reasons.append(f"monitor the current headline: {player.get('news')}")
    else:
        reasons.append("no current RSS headline is matched to this player")
    if player.get("position") in {"RB", "WR", "TE"}:
        reasons.append("starter value also depends on league-specific positional scarcity")
    label = "market-discount" if adp_gap >= 8 else "riser" if trend >= 100 else "monitor"
    return {
        "label": label,
        "adpGap": adp_gap,
        "trend30Day": trend,
        "reasons": reasons,
        "teamSituation": "Not asserted without a licensed depth-chart or beat-report source.",
    }


@lru_cache(maxsize=1)
def load_board() -> list[dict[str, Any]]:
    players_path = ROOT / "sleeper_work" / "raw" / "players.json"
    sleeper = json.loads(players_path.read_text(encoding="utf-8")) if players_path.exists() else {}
    with gzip.open(_latest_fantasycalc(), "rt", encoding="utf-8") as handle:
        fantasycalc = json.load(handle)
    ffc_payload = _latest_json("fantasy-football-calculator-adp") or {}
    ffc_rows = ffc_payload.get("players", []) if isinstance(ffc_payload, dict) else ffc_payload
    ffc_by_name = {_normalize(row.get("name", "")): row for row in ffc_rows}
    rotowire_payload = _latest_json("rotowire-nfl-rss") or {}
    news_by_name = {}
    for item in rotowire_payload.get("items", []):
        player_name = (item.get("headline") or "").split(":", 1)[0]
        news_by_name[_normalize(player_name)] = item
    nflverse_payload = _latest_capture("nflverse-players", "csv.gz")
    nflverse_by_name = {}
    if nflverse_payload:
        for row in csv.DictReader(io.StringIO(nflverse_payload.decode("utf-8"))):
            nflverse_by_name[_normalize(row.get("display_name") or "")] = row
    by_sleeper = {str(key): value for key, value in sleeper.items()}
    board: list[dict[str, Any]] = []
    for row in fantasycalc:
        player = row.get("player", row)
        position = str(player.get("position") or "").upper().replace("D/ST", "DST")
        if position not in POSITIONS:
            continue
        sleeper_id = str(player.get("sleeperId") or "")
        identity = by_sleeper.get(sleeper_id, {})
        ffc = ffc_by_name.get(_normalize(player.get("name") or ""), {})
        news_item = news_by_name.get(_normalize(player.get("name") or ""))
        nflverse = nflverse_by_name.get(_normalize(player.get("name") or ""), {})
        rank = int(row.get("overallRank") or player.get("overallRank") or len(board) + 1)
        redraft_value = float(row.get("redraftValue") or row.get("value") or player.get("redraftValue") or player.get("value") or 0)
        projected = round(70 + 215 * (max(redraft_value, 1) / 11000) ** 0.58, 1)
        uncertainty = min(0.36, 0.08 + rank / 900 + (0.05 if position == "RB" else 0))
        board.append({
            "playerId": sleeper_id or f"fc-{player.get('id')}",
            "yahooId": identity.get("yahoo_id"),
            "gsisId": str(nflverse.get("gsis_id") or identity.get("gsis_id") or "").strip() or None,
            "fantasyCalcId": str(player.get("id") or ""),
            "rotowireId": identity.get("rotowire_id"),
            "name": player.get("name") or identity.get("full_name") or "Unknown player",
            "position": "DST" if position == "DEF" else position,
            "team": player.get("maybeTeam") or identity.get("team") or identity.get("team_abbr") or "FA",
            "bye": ffc.get("bye"),
            "adp": float(ffc.get("adp") or row.get("maybeAdp") or player.get("maybeAdp") or rank),
            "marketRank": rank,
            "marketValue": redraft_value,
            "projectedPoints": projected,
            "projectionSources": 0,
            "tier": int(row.get("maybeTier") or player.get("maybeTier") or max(1, math.ceil(rank / 24))),
            "trend30Day": float(row.get("trend30Day") or player.get("trend30Day") or 0),
            "uncertainty": round(uncertainty, 3),
            "newsRisk": "watch" if identity.get("injury_status") or news_item else "clear",
            "news": (news_item or {}).get("headline") or identity.get("injury_notes") or "No active injury flag in the current local source set.",
            "newsUrl": (news_item or {}).get("sourceUrl"),
            "newsReporter": (news_item or {}).get("reporter"),
            "newsPublishedAt": (news_item or {}).get("publishedAt"),
            "sourceLabel": "Internal baseline + FantasyCalc/FFC market signals",
        })
    board = sorted(board, key=lambda item: item["marketRank"])
    for player in board:
        player["qualitative"] = qualitative_profile(player)
    return board


def sleeper_radar(available: list[dict[str, Any]], current_pick: int) -> list[dict[str, Any]]:
    """Find later-priced players with current, attributable market and news signals."""
    radar: list[dict[str, Any]] = []
    for player in available:
        if player["position"] not in {"QB", "RB", "WR", "TE"} or player["adp"] < max(30, current_pick + 6):
            continue
        qualitative = player.get("qualitative") or qualitative_profile(player)
        discount = max(0.0, float(qualitative["adpGap"]))
        momentum = max(0.0, float(qualitative["trend30Day"]) / 100)
        upside = max(0.0, float(player["marketValue"]) / 2000)
        risk = 1.8 if player.get("newsRisk") != "clear" else 0.0
        score = discount * 1.4 + momentum + upside - risk
        if score <= 4:
            continue
        radar.append({
            "name": player["name"], "position": player["position"], "team": player["team"],
            "adp": player["adp"], "marketRank": player["marketRank"], "newsRisk": player["newsRisk"],
            "news": player["news"], "score": round(score, 1), "qualitative": qualitative,
        })
    return sorted(radar, key=lambda item: (-item["score"], item["adp"]))[:8]


def player_dossier(player: dict[str, Any]) -> dict[str, Any]:
    """Turn only captured/derived evidence into an actionable player brief."""
    qualitative = player.get("qualitative") or qualitative_profile(player)
    positives: list[str] = []
    cautions: list[str] = []
    if player.get("vorp", 0) > 0:
        positives.append(f"{player['vorp']:+.1f} value over positional replacement on this league board.")
    if qualitative["adpGap"] >= 8:
        positives.append(f"Market rank #{player['marketRank']} is available at ADP {player['adp']:.1f}, a {qualitative['adpGap']:.1f}-pick price discount.")
    elif qualitative["adpGap"] <= -8:
        cautions.append(f"ADP {player['adp']:.1f} asks you to pay {abs(qualitative['adpGap']):.1f} picks ahead of market rank #{player['marketRank']}.")
    if qualitative["trend30Day"] >= 100:
        positives.append(f"Market value is up {qualitative['trend30Day']:+.0f} over 30 days.")
    elif qualitative["trend30Day"] <= -100:
        cautions.append(f"Market value is down {qualitative['trend30Day']:+.0f} over 30 days.")
    if player.get("rosterNeed"):
        positives.append("Fills an open starter need on the configured roster.")
    if player.get("samePositionDropoff", 0) >= 8:
        positives.append(f"There is a {player['samePositionDropoff']:+.1f}-point same-position drop after this tier.")
    survival = (player.get("survival") or [{}])[0]
    if survival and survival.get("probability", 1) < 0.25:
        cautions.append(f"Only {round(survival['probability'] * 100)}% likely to survive to pick {survival.get('pick')}; waiting is a real cost.")
    if player.get("newsRisk") != "clear":
        cautions.append(f"Current headline to monitor: {player.get('news')}")
    if player.get("uncertainty", 0) >= 0.25:
        cautions.append("Higher modeled uncertainty means a wider range of outcomes.")
    cautions.append("No depth-chart or beat-report role change is asserted unless it is linked as an attributable headline.")
    if not positives:
        positives.append("Still viable only if this position and roster fit match your build; there is no strong captured value signal.")
    if qualitative["adpGap"] >= 8 and qualitative["trend30Day"] >= 100:
        market_synthesis = (
            f"Across the live market inputs, {player['name']} reads as a rising value bet: FantasyCalc places the player at market rank "
            f"#{player['marketRank']}, while Fantasy Football Calculator drafters are waiting until ADP {player['adp']:.1f}. "
            f"The {qualitative['trend30Day']:+.0f} 30-day move suggests the market is getting more interested even before the typical draft room pays full price."
        )
    elif qualitative["adpGap"] >= 8:
        market_synthesis = (
            f"The live market is more favorable than the draft-room price on {player['name']}: market rank #{player['marketRank']} versus ADP {player['adp']:.1f}. "
            "That is the profile of a value or contingency target rather than a consensus must-draft; the stronger upside thesis still needs attributable role evidence."
        )
    elif qualitative["adpGap"] <= -8 or qualitative["trend30Day"] <= -100:
        market_synthesis = (
            f"The current market is more cautious than the draft cost on {player['name']}. ADP {player['adp']:.1f}, market rank "
            f"#{player['marketRank']}, and the {qualitative['trend30Day']:+.0f} 30-day move indicate that the room may be paying ahead of the market. "
            "That does not make the player a fade, but it raises the bar for a roster-fit or role-based argument."
        )
    else:
        market_synthesis = (
            f"The available market inputs are broadly aligned on {player['name']}: market rank #{player['marketRank']} and ADP {player['adp']:.1f} are close. "
            "The draft decision is therefore more about your roster need, positional tier, and willingness to accept the modeled range of outcomes than a clear market disagreement."
        )
    if player.get("newsUrl"):
        commentary_coverage = (
            f"The current attributable written signal is the linked {player.get('newsReporter') or 'RotoWire'} headline: “{player['news']}.” "
            "Open it for its full source context; this assistant retains only the permitted metadata, not article text."
        )
    else:
        commentary_coverage = (
            "No player-specific expert article or beat-report note is currently attached to this dossier. The narrative above is an aggregation of the live market signals, not a claim that experts independently agree on a team-situation change."
        )
    draft_takeaway = (
        f"Draft {player['name']} when you want {player['position']} value at this cost and can accept the listed uncertainty. "
        f"The strongest evidence is {'; '.join(qualitative['reasons'][:2])}."
    )
    return {
        "player": player,
        "positiveCase": positives[:4],
        "cautions": cautions[:4],
        "marketSynthesis": market_synthesis,
        "commentaryCoverage": commentary_coverage,
        "draftTakeaway": draft_takeaway,
        "sourceBoundary": "This dossier is derived from the current local board, ADP, market movement, and permitted news metadata. It does not reproduce article text or invent team-situation facts.",
    }


def next_user_picks(current_pick: int, num_teams: int, user_slot: int, count: int = 3) -> list[int]:
    picks: list[int] = []
    candidate = max(1, current_pick)
    while len(picks) < count and candidate <= num_teams * 30:
        round_no = ((candidate - 1) // num_teams) + 1
        within = ((candidate - 1) % num_teams) + 1
        slot = within if round_no % 2 else num_teams - within + 1
        if slot == user_slot:
            picks.append(candidate)
        candidate += 1
    return picks


def _replacement_values(available: list[dict[str, Any]], num_teams: int, targets: dict[str, int] | None = None) -> dict[str, float]:
    values: dict[str, float] = {}
    targets = targets or {position: max(1, int(multiplier)) for position, multiplier in REPLACEMENT_MULTIPLIERS.items()}
    for position, multiplier in REPLACEMENT_MULTIPLIERS.items():
        pool = sorted((p["projectedPoints"] for p in available if p["position"] == position), reverse=True)
        demand = max(float(targets.get(position, 1)), multiplier)
        index = min(len(pool) - 1, max(0, int(num_teams * demand) - 1)) if pool else 0
        values[position] = pool[index] if pool else 0
    return values


def _roster_targets(session: dict[str, Any]) -> dict[str, int]:
    targets = {"QB": 1, "RB": 2, "WR": 3, "TE": 1, "K": 1, "DST": 1}
    slots = session.get("roster_slots_json") or []
    imported: dict[str, int] = {}
    flex_count = 0
    for slot in slots if isinstance(slots, list) else []:
        position = str(slot.get("position") or slot.get("name") or "").upper().replace("DEF", "DST")
        try:
            count = int(slot.get("count") or slot.get("value") or 1)
        except (TypeError, ValueError):
            count = 1
        if position in targets:
            imported[position] = imported.get(position, 0) + count
        elif "FLEX" in position or position == "W/R/T":
            flex_count += count
    if imported:
        targets.update(imported)
        targets["WR"] += math.ceil(flex_count / 2)
        targets["RB"] += flex_count // 2
    return targets


def recommend(session: dict[str, Any], events: list[dict[str, Any]], strategy: str | None = None) -> dict[str, Any]:
    strategy = strategy or session.get("strategy") or "balanced"
    drafted = {str(event["player_id"]) for event in events}
    available = [dict(player) for player in load_board() if str(player["playerId"]) not in drafted]
    current_pick = max((int(event["pick_no"]) for event in events), default=0) + 1
    num_teams = int(session["num_teams"])
    user_slot = int(session["user_slot"])
    league_settings = session.get("league_settings_json") or {}
    slot_confirmed = bool(league_settings.get("userSlotConfirmed", True))
    future = next_user_picks(current_pick + 1, num_teams, user_slot, 3) if slot_confirmed else []
    own_counts: dict[str, int] = {}
    if slot_confirmed:
        for event in events:
            if int(event["team_slot"]) == user_slot:
                own_counts[event["position"]] = own_counts.get(event["position"], 0) + 1
    position_targets = _roster_targets(session)
    replacement = _replacement_values(available, num_teams, position_targets)
    seed = current_pick * 104729 + len(events) * 8191
    simulations = max(500, min(settings.simulations, 5000))
    rng = random.Random(seed)
    survival_samples: dict[str, list[float]] = {}
    top_for_sim = available[:120]
    recent_positions = [event["position"] for event in events[-6:]]
    team_counts: dict[int, dict[str, int]] = {}
    for event in events:
        slot_counts = team_counts.setdefault(int(event["team_slot"]), {})
        slot_counts[event["position"]] = slot_counts.get(event["position"], 0) + 1
    for player in top_for_sim:
        position = player["position"]
        needy_teams = sum(1 for slot in range(1, num_teams + 1) if team_counts.get(slot, {}).get(position, 0) < position_targets.get(position, 0))
        run_pressure = max(0, recent_positions.count(position) - 1) * 0.8
        need_pressure = (needy_teams / num_teams) * 3.0
        selection_mean = max(current_pick, player["adp"] - run_pressure - need_pressure)
        selections = [max(current_pick, int(round(rng.gauss(selection_mean, max(4.0, player["adp"] * 0.18))))) for _ in range(simulations)]
        survival_samples[player["playerId"]] = [round(sum(1 for slot in selections if slot >= target) / simulations, 3) for target in future]
    weights = {"floor": (1.0, 0.35, 1.5), "upside": (0.85, 1.05, 0.55), "balanced": (1.0, 0.7, 0.9)}
    base_weight, upside_weight, risk_weight = weights.get(strategy, weights["balanced"])
    candidates: list[dict[str, Any]] = []
    for available_index, player in enumerate(available):
        position = player["position"]
        vorp = player["projectedPoints"] - replacement.get(position, 0)
        need_gap = max(0, position_targets.get(position, 0) - own_counts.get(position, 0))
        need_bonus = need_gap * (8.0 if position in {"RB", "WR"} else 5.0)
        upside = max(0.0, player["marketValue"] / 500.0) + max(0.0, player["trend30Day"] / 180.0)
        risk = player["uncertainty"] * 35 + (7 if player["newsRisk"] != "clear" else 0)
        utility = vorp * base_weight + need_bonus + upside * upside_weight - risk * risk_weight
        survival = survival_samples.get(player["playerId"], [0.0 for _ in future])
        wait_cost = (1 - (survival[0] if survival else 0)) * max(0, vorp)
        score = utility + wait_cost * 0.35
        next_same_position = next((other for other in available[available_index + 1:] if other["position"] == position), None)
        position_dropoff = player["projectedPoints"] - (next_same_position["projectedPoints"] if next_same_position else replacement.get(position, 0))
        candidates.append({
            **player,
            "vorp": round(vorp, 1),
            "utility": round(score, 2),
            "survival": [{"pick": pick, "probability": probability} for pick, probability in zip(future, survival)],
            "rosterNeed": need_gap > 0,
            "samePositionDropoff": round(position_dropoff, 1),
            "evidenceIds": [f"fantasycalc:{player['fantasyCalcId']}", f"baseline:{player['playerId']}"],
        })
    candidates.sort(key=lambda player: (-player["utility"], player["marketRank"]))
    for index, candidate in enumerate(candidates):
        comparison = candidates[index + 1]["utility"] if index + 1 < len(candidates) else candidate["utility"]
        candidate["incrementalValue"] = round(candidate["utility"] - comparison, 2)
    return {
        "generatedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "currentPick": current_pick,
        "currentRound": ((current_pick - 1) // num_teams) + 1,
        "onClockSlot": snake_slot(current_pick, num_teams),
        "nextUserPicks": future,
        "strategy": strategy,
        "simulations": simulations,
        "projectionLabel": (
            "Internal baseline + FantasyCalc/FFC market signals; custom Yahoo rules are saved, but exact stat-line rescoring awaits a projection feed"
            if session.get("scoring_json") else "Internal baseline + FantasyCalc/FFC market signals"
        ),
        "recommendations": candidates[:4],
        "available": candidates,
        "rosterCounts": own_counts,
        "sleeperRadar": sleeper_radar(available, current_pick),
        "qualitativeMethod": "Sleeper Radar uses ADP-versus-market price gaps, 30-day market movement, current RSS headline flags, and positional scarcity. It does not claim depth-chart or beat-report facts without an attributable source.",
    }
