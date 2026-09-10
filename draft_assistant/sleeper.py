from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

SLEEPER_BASE = "https://api.sleeper.app/v1"
USER_AGENT = "MooseysMommyDraftAssistant/1.0 (+https://sleeper.app)"


def _fetch(url: str, timeout: int = 15) -> Any:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_league(league_id: str) -> dict[str, Any]:
    league_id = str(league_id).strip()
    data = _fetch(f"{SLEEPER_BASE}/league/{league_id}")
    if not data or not isinstance(data, dict):
        raise ValueError(f"Invalid Sleeper league ID: {league_id}")
    return data


def fetch_league_users(league_id: str) -> list[dict[str, Any]]:
    league_id = str(league_id).strip()
    data = _fetch(f"{SLEEPER_BASE}/league/{league_id}/users")
    return data if isinstance(data, list) else []


def fetch_league_rosters(league_id: str) -> list[dict[str, Any]]:
    league_id = str(league_id).strip()
    data = _fetch(f"{SLEEPER_BASE}/league/{league_id}/rosters")
    return data if isinstance(data, list) else []


def fetch_draft(draft_id: str) -> dict[str, Any]:
    draft_id = str(draft_id).strip()
    data = _fetch(f"{SLEEPER_BASE}/draft/{draft_id}")
    if not data or not isinstance(data, dict):
        raise ValueError(f"Invalid Sleeper draft ID: {draft_id}")
    return data


def fetch_picks(draft_id: str) -> list[dict[str, Any]]:
    draft_id = str(draft_id).strip()
    data = _fetch(f"{SLEEPER_BASE}/draft/{draft_id}/picks")
    return data if isinstance(data, list) else []


def fetch_trending(direction: str = "down", lookback_hours: int = 48, limit: int = 50) -> list[dict[str, Any]]:
    endpoint = f"{SLEEPER_BASE}/players/nfl/trending/{direction}?lookback_hours={lookback_hours}&limit={limit}"
    try:
        data = _fetch(endpoint, timeout=10)
        return data if isinstance(data, list) else []
    except Exception:
        return []


def parse_sleeper_roster_slots(positions: list[str]) -> list[dict[str, Any]]:
    """Convert Sleeper position array (e.g. ['QB', 'RB', 'RB', 'BN']) into slot counts."""
    counts: dict[str, int] = {}
    for pos in positions:
        pos_clean = str(pos).upper().strip()
        if pos_clean in {"BN", "IR"}:
            continue
        counts[pos_clean] = counts.get(pos_clean, 0) + 1
    return [{"position": pos, "count": count} for pos, count in counts.items()]


def parse_sleeper_scoring(scoring_settings: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    """Derive scoring format name ('ppr', 'half-ppr', 'standard') and category list."""
    rec_points = float(scoring_settings.get("rec", 0.0) or 0.0)
    if rec_points >= 1.0:
        scoring_format = "ppr"
    elif rec_points >= 0.5:
        scoring_format = "half-ppr"
    else:
        scoring_format = "standard"

    rules = [
        {"name": "Passing Yards", "value": float(scoring_settings.get("pass_yd", 0.04) or 0.04)},
        {"name": "Passing Touchdowns", "value": float(scoring_settings.get("pass_td", 4.0) or 4.0)},
        {"name": "Passing Interceptions", "value": float(scoring_settings.get("pass_int", -2.0) or -2.0)},
        {"name": "Rushing Yards", "value": float(scoring_settings.get("rush_yd", 0.1) or 0.1)},
        {"name": "Rushing Touchdowns", "value": float(scoring_settings.get("rush_td", 6.0) or 6.0)},
        {"name": "Receptions", "value": rec_points},
        {"name": "Receiving Yards", "value": float(scoring_settings.get("rec_yd", 0.1) or 0.1)},
        {"name": "Receiving Touchdowns", "value": float(scoring_settings.get("rec_td", 6.0) or 6.0)},
    ]
    return scoring_format, rules


def inspect_sleeper_league_or_draft(target_id: str) -> dict[str, Any]:
    """Inspect either a Sleeper league_id or draft_id and resolve the full configuration."""
    target_id = str(target_id).strip()
    league: dict[str, Any] | None = None
    draft: dict[str, Any] | None = None

    # First try fetching as a league
    try:
        league = fetch_league(target_id)
        draft_id = str(league.get("draft_id") or "")
        if draft_id:
            draft = fetch_draft(draft_id)
    except Exception:
        pass

    # If not a league, try fetching as a draft
    if not league or not draft:
        try:
            draft = fetch_draft(target_id)
            league_id = str(draft.get("league_id") or "")
            if league_id:
                league = fetch_league(league_id)
        except Exception as exc:
            if not league and not draft:
                raise ValueError(f"Could not find Sleeper league or draft with ID {target_id}: {exc}")

    league_name = (league or {}).get("name") or "Sleeper League"
    num_teams = int((draft or {}).get("teams") or (league or {}).get("total_rosters") or 12)
    rounds = int(((draft or {}).get("settings") or {}).get("rounds") or 16)
    draft_id = str((draft or {}).get("draft_id") or "")
    league_id = str((league or {}).get("league_id") or (draft or {}).get("league_id") or "")

    # Roster slots
    positions = (league or {}).get("roster_positions") or (draft or {}).get("roster_positions") or ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF", "BN"]
    roster_slots = parse_sleeper_roster_slots(positions)

    # Scoring
    scoring_settings = (league or {}).get("scoring_settings") or {}
    scoring_format, scoring_rules = parse_sleeper_scoring(scoring_settings)

    # Users / team slots
    users = fetch_league_users(league_id) if league_id else []
    draft_order = (draft or {}).get("draft_order") or {}
    user_options = []
    user_by_id = {str(u.get("user_id")): u for u in users}

    for user_id, slot in draft_order.items():
        u = user_by_id.get(str(user_id), {})
        display_name = u.get("display_name") or u.get("metadata", {}).get("team_name") or f"Team {slot}"
        user_options.append({
            "slot": int(slot),
            "userId": str(user_id),
            "displayName": display_name,
            "teamName": u.get("metadata", {}).get("team_name") or display_name,
        })
    user_options.sort(key=lambda x: x["slot"])

    return {
        "leagueId": league_id,
        "draftId": draft_id,
        "leagueName": league_name,
        "numTeams": num_teams,
        "rounds": rounds,
        "draftStatus": (draft or {}).get("status") or "pre_draft",
        "draftType": (draft or {}).get("type") or "snake",
        "scoringFormat": scoring_format,
        "scoringRules": scoring_rules,
        "rosterSlots": roster_slots,
        "userOptions": user_options,
    }
