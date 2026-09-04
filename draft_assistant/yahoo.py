from __future__ import annotations

import base64
import json
import secrets
import time
import urllib.parse
import urllib.error
import urllib.request
from typing import Any

from .config import settings
from .secrets import get_secret, set_secret

AUTH_URL = "https://api.login.yahoo.com/oauth2/request_auth"
TOKEN_URL = "https://api.login.yahoo.com/oauth2/get_token"
FANTASY_BASE = "https://fantasysports.yahooapis.com/fantasy/v2"
_oauth_states: dict[str, float] = {}
_access_token: tuple[str, float] | None = None


def authorization_url() -> dict[str, str]:
    client_id = get_secret("yahoo_client_id")
    if not client_id:
        raise RuntimeError("Yahoo client ID is not configured")
    state = secrets.token_urlsafe(24)
    _oauth_states[state] = time.time() + 600
    query = urllib.parse.urlencode({
        "client_id": client_id,
        "redirect_uri": settings.yahoo_redirect_uri,
        "response_type": "code",
        "language": "en-us",
        "state": state,
    })
    return {"authorizationUrl": f"{AUTH_URL}?{query}", "state": state, "redirectUri": settings.yahoo_redirect_uri}


def _basic_auth() -> str:
    client_id = get_secret("yahoo_client_id")
    client_secret = get_secret("yahoo_client_secret")
    if not client_id or not client_secret:
        raise RuntimeError("Yahoo OAuth credentials are not configured")
    return base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()


def _token_request(values: dict[str, str]) -> dict[str, Any]:
    request = urllib.request.Request(
        TOKEN_URL,
        data=urllib.parse.urlencode(values).encode(),
        headers={"Authorization": f"Basic {_basic_auth()}", "Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read())


def exchange_code(code: str, state: str | None = None) -> dict[str, Any]:
    global _access_token
    if not state:
        raise RuntimeError("Yahoo authorization state is required")
    expiry = _oauth_states.pop(state, 0)
    if expiry < time.time():
        raise RuntimeError("Yahoo authorization state is invalid or expired")
    payload = _token_request({
        "grant_type": "authorization_code",
        "redirect_uri": settings.yahoo_redirect_uri,
        "code": code,
    })
    if payload.get("refresh_token"):
        set_secret("yahoo_refresh_token", payload["refresh_token"])
    _access_token = (payload["access_token"], time.time() + int(payload.get("expires_in", 3600)) - 60)
    return {"connected": True, "expiresIn": payload.get("expires_in", 3600)}


def access_token() -> str:
    global _access_token
    if _access_token and _access_token[1] > time.time():
        return _access_token[0]
    refresh = get_secret("yahoo_refresh_token")
    if not refresh:
        raise RuntimeError("Yahoo authorization has not been completed")
    payload = _token_request({"grant_type": "refresh_token", "redirect_uri": settings.yahoo_redirect_uri, "refresh_token": refresh})
    if payload.get("refresh_token"):
        set_secret("yahoo_refresh_token", payload["refresh_token"])
    _access_token = (payload["access_token"], time.time() + int(payload.get("expires_in", 3600)) - 60)
    return _access_token[0]


def get(resource: str) -> dict[str, Any]:
    url = f"{FANTASY_BASE}/{resource.lstrip('/')}" + ("&format=json" if "?" in resource else "?format=json")
    for attempt in range(3):
        request = urllib.request.Request(
            url,
            headers={"Authorization": f"Bearer {access_token()}", "User-Agent": "MooseysMommyDraftAssistant/0.1"},
        )
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as exc:
            if exc.code != 429 and exc.code < 500:
                raise
            if attempt == 2:
                raise
            retry_after = exc.headers.get("Retry-After")
            time.sleep(min(8.0, float(retry_after) if retry_after else 2 ** attempt))
    raise RuntimeError("Yahoo request failed")


def _walk(value: Any):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from _walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk(child)


def leagues() -> list[dict[str, Any]]:
    payload = get("users;use_login=1/games;game_codes=nfl/leagues")
    found: dict[str, dict[str, Any]] = {}
    for node in _walk(payload):
        key = node.get("league_key")
        if key:
            found[str(key)] = {"leagueKey": str(key), "name": node.get("name") or str(key), "season": node.get("season")}
    return list(found.values())


def draft_results(league_key: str) -> list[dict[str, Any]]:
    payload = get(f"league/{league_key}/draftresults")
    results: list[dict[str, Any]] = []
    for node in _walk(payload):
        candidate = node.get("draft_result") if isinstance(node.get("draft_result"), dict) else node
        if not isinstance(candidate, dict) or "pick" not in candidate:
            continue
        results.append({
            "pickNo": int(candidate["pick"]),
            "round": int(candidate.get("round") or 0),
            "teamKey": str(candidate.get("team_key") or ""),
            "playerKey": str(candidate.get("player_key") or ""),
        })
    return sorted({item["pickNo"]: item for item in results}.values(), key=lambda item: item["pickNo"])


def players_by_keys(player_keys: list[str]) -> dict[str, dict[str, Any]]:
    if not player_keys:
        return {}
    payload = get("players;player_keys=" + ",".join(player_keys))
    found: dict[str, dict[str, Any]] = {}
    for node in _walk(payload):
        key = node.get("player_key")
        if not key:
            continue
        name = node.get("name")
        if isinstance(name, dict):
            full_name = name.get("full") or " ".join(filter(None, (name.get("first"), name.get("last"))))
        else:
            full_name = name
        found[str(key)] = {
            "playerKey": str(key),
            "name": full_name or str(key),
            "position": node.get("display_position") or node.get("primary_position") or "NA",
            "team": node.get("editorial_team_abbr") or "FA",
        }
    return found


def league_settings(league_key: str) -> dict[str, Any]:
    return get(f"league/{league_key}/settings")


def league_context(league_key: str) -> dict[str, Any]:
    payload = get(f"league/{league_key};out=settings,teams")
    league_name = league_key
    num_teams = 12
    teams: dict[str, dict[str, Any]] = {}
    scoring: list[dict[str, Any]] = []
    roster_slots: list[dict[str, Any]] = []
    for node in _walk(payload):
        if node.get("league_key") == league_key:
            league_name = node.get("name") or league_name
        if "num_teams" in node:
            try:
                num_teams = int(node["num_teams"])
            except (TypeError, ValueError):
                pass
        team_key = node.get("team_key")
        if team_key:
            teams[str(team_key)] = {"teamKey": str(team_key), "name": node.get("name") or str(team_key)}
        if "roster_position" in node and isinstance(node["roster_position"], dict):
            roster_slots.append(node["roster_position"])
        if "stat" in node and isinstance(node["stat"], dict) and "value" in node["stat"]:
            scoring.append(node["stat"])
    return {"leagueKey": league_key, "name": league_name, "numTeams": num_teams,
            "teams": list(teams.values()), "rosterSlots": roster_slots, "scoring": scoring}
