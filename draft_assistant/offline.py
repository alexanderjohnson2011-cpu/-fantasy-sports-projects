from __future__ import annotations

import html
import json
from datetime import datetime, timezone

from .config import DATA_DIR


def export_board(payload: dict) -> dict[str, str]:
    directory = DATA_DIR / "exports"
    directory.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    json_path = directory / f"mooseys-mommy-board-{stamp}.json"
    html_path = directory / f"mooseys-mommy-board-{stamp}.html"
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    rows = "".join(
        f"<tr><td>{index}</td><td>{html.escape(player['name'])}</td><td>{player['position']}</td>"
        f"<td>{player['team']}</td><td>{player['marketRank']}</td><td>{player['vorp']:+.1f}</td></tr>"
        for index, player in enumerate(payload.get("available", [])[:120], 1)
    )
    page = f"""<!doctype html><html><head><meta charset='utf-8'><title>Moosey's Mommy Emergency Board</title>
    <style>body{{font:16px system-ui;margin:30px;background:#f6f2e9;color:#173a32}}table{{border-collapse:collapse;width:100%}}td,th{{padding:8px;border-bottom:1px solid #aaa;text-align:left}}th{{position:sticky;top:0;background:#173a32;color:white}}</style></head>
    <body><h1>Moosey's Mommy Emergency Board</h1><p>Generated {stamp}. Internal baseline plus market signals.</p>
    <table><thead><tr><th>#</th><th>Player</th><th>Pos</th><th>Team</th><th>Market</th><th>VORP</th></tr></thead><tbody>{rows}</tbody></table></body></html>"""
    html_path.write_text(page, encoding="utf-8")
    return {"jsonPath": str(json_path), "htmlPath": str(html_path)}


def _candidate(player: dict) -> dict:
    return {
        "name": player.get("name"),
        "position": player.get("position"),
        "team": player.get("team"),
        "tier": player.get("tier"),
        "projectedPoints": player.get("projectedPoints"),
        "vorp": player.get("vorp"),
        "utility": player.get("utility"),
        "incrementalValue": player.get("incrementalValue"),
        "adp": player.get("adp"),
        "samePositionDropoff": player.get("samePositionDropoff"),
        "survival": player.get("survival", []),
        "newsRisk": player.get("newsRisk"),
        "news": player.get("news"),
        "sourceLabel": player.get("sourceLabel"),
        "qualitative": player.get("qualitative"),
    }


def export_chatgpt_packet(state: dict) -> dict[str, str]:
    """Write a stable, upload-ready packet with no credentials or platform IDs."""
    directory = DATA_DIR / "exports"
    directory.mkdir(parents=True, exist_ok=True)
    session = state.get("session", {})
    league_settings = session.get("league_settings_json") or {}
    slot_confirmed = bool(league_settings.get("userSlotConfirmed", True))
    rounds_confirmed = bool(league_settings.get("roundsConfirmed", True))
    draft = state.get("draft", {})
    events = state.get("events", [])
    recommendations = draft.get("recommendations", [])
    packet = {
        "schemaVersion": "1.0",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "purpose": "Private ChatGPT draft analysis. Contains no OAuth secrets, Yahoo IDs, local paths, or manager names.",
        "league": {
            "name": session.get("league_name"),
            "teams": session.get("num_teams"),
            "rounds": session.get("rounds") if rounds_confirmed else None,
            "roundsConfirmed": rounds_confirmed,
            "yourDraftSlot": session.get("user_slot") if slot_confirmed else None,
            "yourDraftSlotConfirmed": slot_confirmed,
            "scoringFormat": session.get("scoring_format"),
            "scoringRules": session.get("scoring_json") or [],
            "rosterSlots": session.get("roster_slots_json") or [],
            "draftClockSeconds": league_settings.get("draftClockSeconds"),
            "keeperManagementEnabled": league_settings.get("keeperManagementEnabled"),
            "strategy": session.get("strategy"),
            "synchronization": session.get("sync_mode"),
        },
        "draft": {
            "currentPick": draft.get("currentPick"),
            "currentRound": draft.get("currentRound"),
            "onClockTeamSlot": draft.get("onClockSlot"),
            "nextYourPicks": draft.get("nextUserPicks", []),
            "simulations": draft.get("simulations"),
            "projectionLabel": draft.get("projectionLabel"),
            "rosterCounts": draft.get("rosterCounts", {}),
        },
        "picks": [
            {
                "pick": event.get("pick_no"),
                "round": event.get("round_no"),
                "teamSlot": event.get("team_slot"),
                "player": event.get("player_name"),
                "position": event.get("position"),
                "entryMethod": event.get("source"),
            }
            for event in events
        ],
        "recommendation": _candidate(recommendations[0]) if recommendations else None,
        "alternatives": [_candidate(player) for player in recommendations[1:4]],
        "availableBoard": [_candidate(player) for player in draft.get("available", [])[:50]],
        "sleeperRadar": draft.get("sleeperRadar", [])[:8],
        "qualitativeMethod": draft.get("qualitativeMethod"),
        "sourceHealth": [
            {key: source.get(key) for key in ("provider", "fetched_at", "status", "detail", "publicAllowed")}
            for source in state.get("sources", [])
        ],
        "newsMetadata": [
            {key: item.get(key) for key in ("headline", "publishedAt", "reporter", "sourceUrl")}
            for item in state.get("news", [])[:8]
        ],
        "analysisPrompt": (
            "Act as a fantasy-football draft analyst. Use only the supplied packet; do not invent projections, "
            "injury news, league settings, or draft picks. Assess the current recommendation against the three "
            "alternatives, explain positional scarcity and next-pick risk, and state the strongest counterargument."
        ),
    }
    json_path = directory / "mooseys-mommy-chatgpt-current.json"
    markdown_path = directory / "mooseys-mommy-chatgpt-current.md"
    json_path.write_text(json.dumps(packet, indent=2), encoding="utf-8")
    recommendation = packet["recommendation"] or {}
    picks = packet["picks"]
    pick_lines = "\n".join(
        f"- {pick['pick']}. {pick['player']} ({pick['position']}) — team slot {pick['teamSlot']}"
        for pick in picks
    ) or "- No picks recorded yet."
    alternatives = "\n".join(
        f"- {player['name']} ({player['position']}, {player['team']}): VORP {player['vorp']}, utility {player['utility']}"
        for player in packet["alternatives"]
    ) or "- No alternatives available."
    sleepers = "\n".join(
        f"- {player['name']} ({player['position']}, {player['team']}): " + "; ".join(player.get("qualitative", {}).get("reasons", [])[:2])
        for player in packet["sleeperRadar"][:5]
    ) or "- No market-discount sleeper signals are currently available."
    markdown = f"""# Moosey's Mommy — live draft analysis packet

Generated: {packet['generatedAt']}

## ChatGPT prompt

{packet['analysisPrompt']}

## Draft state

- Pick {packet['draft']['currentPick']}, round {packet['draft']['currentRound']}; team slot {packet['draft']['onClockTeamSlot']} is on the clock.
- My next picks: {', '.join(str(pick) for pick in packet['draft']['nextYourPicks']) if packet['league']['yourDraftSlotConfirmed'] else 'pending draft-slot confirmation'}.
- My roster: {', '.join(f"{position} {count}" for position, count in packet['draft']['rosterCounts'].items()) or 'empty'}.
- Projection label: {packet['draft']['projectionLabel']}.

## Current recommendation

- {recommendation.get('name', 'No recommendation')} ({recommendation.get('position', '')}, {recommendation.get('team', '')}): utility {recommendation.get('utility', '—')}, VORP {recommendation.get('vorp', '—')}, incremental value {recommendation.get('incrementalValue', '—')}.

## Alternatives

{alternatives}

## Sleeper Radar

{sleepers}

Method: {packet['qualitativeMethod'] or 'No qualitative method available.'}

## Draft picks recorded

{pick_lines}

The complete structured data is in the matching JSON file.
"""
    markdown_path.write_text(markdown, encoding="utf-8")
    return {"jsonPath": str(json_path), "markdownPath": str(markdown_path)}
