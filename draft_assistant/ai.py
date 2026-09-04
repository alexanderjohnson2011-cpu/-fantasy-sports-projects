from __future__ import annotations

import json
import os
import re
from hashlib import sha256
from pathlib import Path
from typing import Any

from .config import settings
from .db import ai_usage, record_ai_usage


_player_take_cache: dict[str, dict[str, Any]] = {}


def vertex_available() -> bool:
    """Check only the local user-ADC file so an unavailable model never delays a pick."""
    appdata = os.getenv("APPDATA")
    candidates = [Path.home() / ".config" / "gcloud" / "application_default_credentials.json"]
    if appdata:
        candidates.append(Path(appdata) / "gcloud" / "application_default_credentials.json")
    return any(path.is_file() for path in candidates)


def fallback_commentary(recommendation: dict[str, Any] | None, question: str = "", sleeper_radar: list[dict[str, Any]] | None = None) -> str:
    if "sleep" in question.lower() and sleeper_radar:
        sleeper = sleeper_radar[0]
        reasons = "; ".join(sleeper.get("qualitative", {}).get("reasons", [])[:2])
        return (
            f"The current Sleeper Radar starts with {sleeper['name']} ({sleeper['position']}, {sleeper['team']}): {reasons}. "
            "That is a price-and-momentum signal, not a claimed depth-chart change; check the linked reporter headline before treating it as a role bet."
        )
    if not recommendation:
        return "The board needs at least one available player before I can make a recommendation."
    survival = recommendation.get("survival") or []
    next_pick = survival[0] if survival else None
    wait = f" His survival chance to pick {next_pick['pick']} is {round(next_pick['probability'] * 100)}%." if next_pick else ""
    need = " He also fills an open starter need." if recommendation.get("rosterNeed") else ""
    prefix = "For that question, " if question else ""
    return (
        f"{prefix}{recommendation['name']} is the best current value: {recommendation['vorp']:+.1f} points "
        f"over positional replacement with a {recommendation['utility']:.1f} roster-utility score.{need}{wait}"
    )


def fallback_player_take(player: dict[str, Any]) -> str:
    """A short, source-bound board summary when Vertex is unavailable."""
    qualitative = player.get("qualitative") or {}
    positive: list[str] = []
    risks: list[str] = []
    if player.get("rosterNeed"):
        recommendation = "Recommendation: a roster-fit option now because the position is still an open starter need."
    elif float(player.get("incrementalValue") or 0) > 0:
        recommendation = "Recommendation: a viable current pick, but compare it with the nearby alternatives before committing."
    else:
        recommendation = "Recommendation: a situational option rather than a clear separation from the next alternative."
    if float(qualitative.get("adpGap") or 0) >= 8:
        positive.append("the market price is lower than the current draft cost")
    if float(qualitative.get("trend30Day") or 0) >= 100:
        positive.append("recent market movement is positive")
    if float(player.get("samePositionDropoff") or 0) >= 8:
        positive.append("the next same-position tier falls away")
    if not positive:
        positive.append("the current roster-utility and positional context support the case")
    if player.get("newsRisk") != "clear":
        risks.append("there is a current RSS headline to review")
    if float(player.get("uncertainty") or 0) >= 0.25:
        risks.append("the model has a wider range of outcomes")
    if not risks:
        risks.append("there is no matched RSS alert, but the decision still depends on the next-pick opportunity cost")
    return f"{recommendation} Upside: {' and '.join(positive)}. Risk: {' and '.join(risks)}."


def player_take(session_id: str, player: dict[str, Any]) -> dict[str, Any]:
    """Generate one cached, evidence-only Vertex explanation for a board row."""
    fields = {
        key: player.get(key) for key in (
            "playerId", "name", "position", "team", "adp", "marketRank", "vorp", "utility",
            "incrementalValue", "rosterNeed", "samePositionDropoff", "uncertainty", "newsRisk", "news",
            "qualitative", "survival",
        )
    }
    cache_key = sha256(json.dumps(fields, sort_keys=True, separators=(",", ":"), default=str).encode()).hexdigest()
    if cache_key in _player_take_cache:
        return {**_player_take_cache[cache_key], "cached": True}
    fallback = {"summary": fallback_player_take(player), "provider": "deterministic", "reason": None, "cached": False}
    usage = ai_usage(session_id)
    if usage.get("request_count", 0) >= settings.gemini_request_limit:
        return {**fallback, "reason": "session request cap reached"}
    prompt = (
        "You are a concise fantasy-football draft-room editor. Use only the supplied player facts. "
        "Return JSON with one field, summary. The summary must have exactly three short labeled sentences: "
        "Recommendation, Upside, and Risk. Do not use any numbers. Do not invent injuries, role changes, or expert opinions.\n"
        + json.dumps(fields, separators=(",", ":"), ensure_ascii=False)
    )
    estimated_input = max(1, len(prompt) // 4)
    if usage.get("input_tokens", 0) + estimated_input > settings.gemini_input_token_limit:
        return {**fallback, "reason": "session token cap reached"}
    if not vertex_available():
        return {**fallback, "reason": "Vertex AI user Application Default Credentials are not available"}
    try:
        from google import genai
        from google.genai import types
        client = genai.Client(
            vertexai=True,
            project=settings.gcp_project,
            location=settings.gcp_location,
            http_options=types.HttpOptions(timeout=5000),
        )
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.15,
                max_output_tokens=130,
                response_mime_type="application/json",
                response_schema={"type": "OBJECT", "properties": {"summary": {"type": "STRING"}}, "required": ["summary"]},
            ),
        )
        summary = str(json.loads(response.text or "{}").get("summary") or "").strip()
        if not summary or re.search(r"\d", summary):
            raise RuntimeError("Gemini returned an empty or unsupported player take")
        estimated_output = max(1, len(summary) // 4)
        record_ai_usage(session_id, estimated_input, estimated_output)
        result = {"summary": summary, "provider": settings.gemini_model, "reason": None, "cached": False}
        _player_take_cache[cache_key] = result
        return result
    except Exception as exc:
        return {**fallback, "reason": str(exc)[:160]}


def comment(session_id: str, recommendation: dict[str, Any] | None, question: str = "", sleeper_radar: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    usage = ai_usage(session_id)
    if usage.get("request_count", 0) >= settings.gemini_request_limit:
        return {"reply": fallback_commentary(recommendation, question, sleeper_radar), "provider": "deterministic", "reason": "session request cap reached"}
    prompt_payload = {"question": question[:600], "recommendation": recommendation, "sleeperRadar": sleeper_radar or []}
    prompt = (
        "You are a concise fantasy football draft-room editor. Explain only the supplied facts. "
        "Do not add statistics, injuries, or news. Keep the response under 80 words.\n" +
        json.dumps(prompt_payload, separators=(",", ":"), ensure_ascii=False)
    )
    estimated_input = max(1, len(prompt) // 4)
    if usage.get("input_tokens", 0) + estimated_input > settings.gemini_input_token_limit:
        return {"reply": fallback_commentary(recommendation, question, sleeper_radar), "provider": "deterministic", "reason": "session token cap reached"}
    try:
        from google import genai
        from google.genai import types
        client = genai.Client(
            vertexai=True,
            project=settings.gcp_project,
            location=settings.gcp_location,
            http_options=types.HttpOptions(timeout=5000),
        )
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.2,
                max_output_tokens=180,
                response_mime_type="application/json",
                response_schema={"type": "OBJECT", "properties": {"reply": {"type": "STRING"}}, "required": ["reply"]},
            ),
        )
        parsed = json.loads(response.text or "{}")
        reply = str(parsed.get("reply") or "").strip()
        if not reply:
            raise RuntimeError("Gemini returned no text")
        estimated_output = max(1, len(reply) // 4)
        record_ai_usage(session_id, estimated_input, estimated_output)
        allowed = set(re.findall(r"\d+(?:\.\d+)?", json.dumps(prompt_payload)))
        if recommendation:
            allowed.update(str(round(point["probability"] * 100)) for point in recommendation.get("survival", []))
        unsupported = [number for number in re.findall(r"\d+(?:\.\d+)?", reply) if number not in allowed]
        if unsupported:
            return {"reply": fallback_commentary(recommendation, question, sleeper_radar), "provider": "deterministic", "reason": "AI response contained an unsupported number"}
        return {"reply": reply, "provider": settings.gemini_model, "reason": None}
    except Exception as exc:
        return {"reply": fallback_commentary(recommendation, question, sleeper_radar), "provider": "deterministic", "reason": str(exc)[:160]}
