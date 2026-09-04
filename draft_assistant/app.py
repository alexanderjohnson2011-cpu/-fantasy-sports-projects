from __future__ import annotations

import importlib.util
import hashlib
import json
import re
import time
import threading
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from . import __version__
from .ai import comment, player_take, vertex_available
from .board import load_board, player_dossier, recommend
from .config import settings
from .db import add_event, clear_events_by_source, get_session, initialize, latest_snapshots, list_events, snake_slot, undo_last, update_session, utc_now
from .offline import export_board, export_chatgpt_packet
from .providers import latest_rotowire_items, refresh_all
from .secrets import secret_status, set_secret
from . import yahoo


class CredentialsBody(BaseModel):
    yahooClientId: str | None = None
    yahooClientSecret: str | None = None
    fantasyProsKey: str | None = None


class SessionBody(BaseModel):
    leagueKey: str | None = None
    leagueName: str | None = None
    userTeamKey: str | None = None
    userSlot: int | None = Field(None, ge=1, le=32)
    numTeams: int | None = Field(None, ge=4, le=32)
    rounds: int | None = Field(None, ge=1, le=40)
    scoringFormat: Literal["standard", "half-ppr", "ppr"] | None = None
    strategy: Literal["floor", "balanced", "upside"] | None = None
    scoring: list[dict[str, Any]] | None = None
    rosterSlots: list[dict[str, Any]] | None = None
    leagueSettings: dict[str, Any] | None = None


class PickBody(BaseModel):
    playerId: str
    teamSlot: int | None = Field(None, ge=1, le=32)
    pickNo: int | None = Field(None, ge=1)


class CorrectBody(BaseModel):
    pickNo: int = Field(ge=1)
    playerId: str
    teamSlot: int | None = Field(None, ge=1, le=32)


class OAuthCodeBody(BaseModel):
    code: str
    state: str | None = None


class ChatBody(BaseModel):
    question: str = Field(default="", max_length=600)


app = FastAPI(title="Moosey's Mommy Draft Assistant", version=__version__)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:4173", "http://localhost:4173", "http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
_state_cache: dict[str, tuple[tuple[Any, ...], dict[str, Any]]] = {}
_poller_started = False


@app.on_event("startup")
def startup() -> None:
    global _poller_started
    initialize()
    _draft_state()
    if not _poller_started:
        threading.Thread(target=_yahoo_poll_loop, name="yahoo-draft-poller", daemon=True).start()
        _poller_started = True


def _yahoo_poll_loop() -> None:
    while True:
        time.sleep(4)
        try:
            session = get_session()
            if session.get("sync_mode") == "yahoo" and session.get("league_key"):
                _sync_yahoo_once()
        except Exception as exc:
            update_session(sync_message=f"Yahoo poll delayed: {str(exc)[:120]}")


def _player(player_id: str) -> dict[str, Any]:
    for player in load_board():
        if str(player["playerId"]) == str(player_id):
            return player
    raise HTTPException(status_code=404, detail="Player is not on the current board")


def _draft_state(session_id: str = "tonight") -> dict[str, Any]:
    session = get_session(session_id)
    events = list_events(session_id)
    cache_key = (
        len(events), events[-1]["event_id"] if events else 0, session["strategy"],
        session["num_teams"], session["user_slot"], session.get("rounds"), session.get("settings_hash"),
    )
    cached = _state_cache.get(session_id)
    if cached and cached[0] == cache_key:
        calculation = cached[1]
    else:
        started = time.perf_counter()
        calculation = recommend(session, events)
        calculation["calculationMs"] = round((time.perf_counter() - started) * 1000, 1)
        _state_cache[session_id] = (cache_key, calculation)
    return {
        "session": session,
        "events": events,
        "draft": calculation,
        "sources": latest_snapshots(settings.publication_id),
        "news": latest_rotowire_items()[:12],
    }


def _write_chatgpt_packet() -> dict[str, str]:
    return export_chatgpt_packet(_draft_state())


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"ok": True, "version": __version__, "publicationId": settings.publication_id, "time": utc_now()}


@app.get("/api/setup/status")
def setup_status() -> dict[str, Any]:
    deps = {name: bool(importlib.util.find_spec(name)) for name in ("keyring", "google.genai")}
    return {
        "credentials": secret_status(),
        "dependencies": deps,
        "yahooConnected": secret_status()["yahooRefreshToken"],
        "geminiSdkInstalled": deps["google.genai"],
        "geminiReady": deps["google.genai"] and vertex_available(),
        "session": get_session(),
        "security": "Secrets use Windows Credential Manager when keyring is installed; otherwise they remain in this process only.",
    }


@app.post("/api/setup/credentials")
def save_credentials(body: CredentialsBody) -> dict[str, Any]:
    stored: dict[str, str] = {}
    for field, secret_name in ((body.yahooClientId, "yahoo_client_id"), (body.yahooClientSecret, "yahoo_client_secret"), (body.fantasyProsKey, "fantasypros_key")):
        if field:
            stored[secret_name] = set_secret(secret_name, field)
    return {"stored": stored, "status": secret_status()}


@app.post("/api/setup/session")
def configure_session(body: SessionBody) -> dict[str, Any]:
    settings_payload = {
        "scoring": body.scoring or [], "rosterSlots": body.rosterSlots or [],
        "leagueSettings": body.leagueSettings or {},
    }
    values = {
        "league_key": body.leagueKey,
        "league_name": body.leagueName,
        "user_team_key": body.userTeamKey,
        "user_slot": body.userSlot,
        "num_teams": body.numTeams,
        "rounds": body.rounds,
        "scoring_format": body.scoringFormat,
        "strategy": body.strategy,
        "scoring_json": body.scoring if body.scoring else None,
        "roster_slots_json": body.rosterSlots if body.rosterSlots else None,
        "league_settings_json": body.leagueSettings if body.leagueSettings else None,
        "settings_hash": hashlib.sha256(json.dumps(settings_payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest() if any(settings_payload.values()) else None,
    }
    _state_cache.clear()
    return update_session(**values)


@app.post("/api/draft/manual-safe-mode")
def activate_manual_safe_mode(body: SessionBody) -> dict[str, Any]:
    """Configure the local-only fallback without requiring a Yahoo connection."""
    configure_session(body)
    _state_cache.clear()
    session = update_session(
        sync_mode="manual",
        sync_message="Manual Safe Mode is active. Record each announced pick; the team slot is calculated automatically.",
        status="pre_draft",
    )
    return {"session": session, "analysisExport": _write_chatgpt_packet()}


@app.get("/api/board")
def board() -> dict[str, Any]:
    players = load_board()
    return {"players": players, "count": len(players), "label": "Internal baseline + market signals"}


@app.get("/api/players/{player_id}/dossier")
def dossier(player_id: str) -> dict[str, Any]:
    state = _draft_state()
    player = next((candidate for candidate in state["draft"].get("available", []) if str(candidate["playerId"]) == str(player_id)), None)
    if not player:
        raise HTTPException(status_code=404, detail="Player is not available on the current board")
    return player_dossier(player)


@app.post("/api/players/{player_id}/ai-take")
def ai_take(player_id: str) -> dict[str, Any]:
    state = _draft_state()
    player = next((candidate for candidate in state["draft"].get("available", []) if str(candidate["playerId"]) == str(player_id)), None)
    if not player:
        raise HTTPException(status_code=404, detail="Player is not available on the current board")
    return player_take("tonight", player)


@app.get("/api/draft/state")
def draft_state() -> dict[str, Any]:
    return _draft_state()


@app.post("/api/draft/manual-picks")
def manual_pick(body: PickBody) -> dict[str, Any]:
    event = add_event("tonight", _player(body.playerId), body.teamSlot, "manual", body.pickNo)
    _state_cache.clear()
    state = _draft_state()
    return {"event": event, "state": state, "analysisExport": export_chatgpt_packet(state)}


@app.post("/api/draft/undo")
def undo() -> dict[str, Any]:
    undone = undo_last()
    _state_cache.clear()
    state = _draft_state()
    return {"undone": undone, "state": state, "analysisExport": export_chatgpt_packet(state)}


@app.post("/api/draft/correct")
def correct(body: CorrectBody) -> dict[str, Any]:
    event = add_event("tonight", _player(body.playerId), body.teamSlot, "correction", body.pickNo)
    _state_cache.clear()
    state = _draft_state()
    return {"event": event, "state": state, "analysisExport": export_chatgpt_packet(state)}


@app.post("/api/draft/rehearsal")
def run_manual_rehearsal() -> dict[str, Any]:
    """Record six clearly-labelled simulated picks on an empty manual ledger."""
    existing = list_events("tonight")
    if existing:
        raise HTTPException(status_code=409, detail="Clear the current ledger before starting a rehearsal.")
    session = get_session("tonight")
    for pick_no, player in enumerate(load_board()[:6], start=1):
        add_event("tonight", player, snake_slot(pick_no, int(session["num_teams"])), "rehearsal", pick_no)
    _state_cache.clear()
    state = _draft_state()
    return {"recorded": 6, "state": state, "analysisExport": export_chatgpt_packet(state)}


@app.post("/api/draft/rehearsal/reset")
def reset_manual_rehearsal() -> dict[str, Any]:
    events = list_events("tonight")
    if any(event["source"] != "rehearsal" for event in events):
        raise HTTPException(status_code=409, detail="Only an all-rehearsal ledger can be cleared automatically.")
    cleared = clear_events_by_source("tonight", "rehearsal")
    _state_cache.clear()
    state = _draft_state()
    return {"cleared": cleared, "state": state, "analysisExport": export_chatgpt_packet(state)}


@app.post("/api/sources/refresh")
def refresh_sources() -> dict[str, Any]:
    session = get_session()
    snapshots = refresh_all(int(session["num_teams"]), session["scoring_format"], secret_status()["fantasyProsKey"])
    load_board.cache_clear()
    _state_cache.clear()
    return {"snapshots": snapshots, "analysisExport": _write_chatgpt_packet()}


@app.post("/api/analysis/export")
def export_analysis() -> dict[str, str]:
    return _write_chatgpt_packet()


@app.get("/auth/yahoo/start")
def yahoo_start() -> dict[str, str]:
    try:
        return yahoo.authorization_url()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/auth/yahoo/exchange")
def yahoo_exchange(body: OAuthCodeBody) -> dict[str, Any]:
    try:
        return yahoo.exchange_code(body.code, body.state)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/leagues")
def yahoo_leagues() -> dict[str, Any]:
    try:
        return {"leagues": yahoo.leagues()}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/leagues/{league_key}/inspect")
def inspect_yahoo_league(league_key: str) -> dict[str, Any]:
    try:
        return yahoo.league_context(league_key)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/yahoo/sync")
def yahoo_sync() -> dict[str, Any]:
    try:
        result = _sync_yahoo_once()
        return {**result, "state": _draft_state()}
    except HTTPException:
        raise
    except Exception as exc:
        update_session(sync_mode="manual", sync_message=f"Yahoo unavailable: {str(exc)[:140]}")
        raise HTTPException(status_code=502, detail=str(exc)) from exc


def _sync_yahoo_once() -> dict[str, Any]:
    session = get_session()
    league_key = session.get("league_key")
    if not league_key:
        raise HTTPException(status_code=400, detail="Select a Yahoo league first")
    try:
        remote = yahoo.draft_results(league_key)
        local_board = load_board()
        board_by_yahoo = {str(player.get("yahooId")): player for player in local_board if player.get("yahooId")}
        normalize = lambda value: re.sub(r"[^a-z0-9]", "", (value or "").lower())
        board_by_name = {normalize(player["name"]): player for player in local_board}
        unmatched_keys = [pick["playerKey"] for pick in remote if pick["playerKey"].split(".")[-1] not in board_by_yahoo]
        yahoo_players = yahoo.players_by_keys(unmatched_keys)
        existing = {event["pick_no"]: event for event in list_events()}
        mismatches: list[dict[str, Any]] = []
        imported = 0
        changed = False
        for pick in remote:
            yahoo_id = pick["playerKey"].split(".")[-1]
            player = board_by_yahoo.get(yahoo_id)
            if not player:
                player = board_by_name.get(normalize(yahoo_players.get(pick["playerKey"], {}).get("name")))
            if not player:
                mismatches.append({"pickNo": pick["pickNo"], "reason": f"Unmatched Yahoo player {yahoo_id}"})
                continue
            previous = existing.get(pick["pickNo"])
            if previous and str(previous["player_id"]) != str(player["playerId"]):
                mismatches.append({"pickNo": pick["pickNo"], "reason": "Yahoo conflicts with the local pick"})
                continue
            if previous and previous.get("source") == "yahoo":
                continue
            add_event("tonight", player, snake_slot(pick["pickNo"], int(session["num_teams"])), "yahoo", pick["pickNo"], pick["playerKey"])
            imported += 1
            changed = True
        mode = "manual" if mismatches else "yahoo"
        message = f"Yahoo synchronized {imported} picks" if not mismatches else "Yahoo mismatch detected; manual mode retained"
        update_session(sync_mode=mode, sync_message=message, last_yahoo_sync=utc_now())
        _state_cache.clear()
        if changed:
            _write_chatgpt_packet()
        return {"imported": imported, "mismatches": mismatches}
    except Exception:
        raise


@app.post("/api/chat")
def chat(body: ChatBody) -> dict[str, Any]:
    state = _draft_state()
    recommendation = (state["draft"].get("recommendations") or [None])[0]
    return comment("tonight", recommendation, body.question, state["draft"].get("sleeperRadar") or [])


@app.post("/api/chat/stream")
def chat_stream(body: ChatBody) -> StreamingResponse:
    response = chat(body)
    def events():
        yield f"data: {json.dumps(response, ensure_ascii=False)}\n\n"
    return StreamingResponse(events(), media_type="text/event-stream")


@app.post("/api/offline/export")
def offline_export() -> dict[str, str]:
    return export_board(_draft_state()["draft"])
