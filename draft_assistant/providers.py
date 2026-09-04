from __future__ import annotations

import gzip
import hashlib
import json
import re
import urllib.error
import urllib.request
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import DATA_DIR, settings
from .db import save_snapshot

USER_AGENT = "MooseysMommyDraftAssistant/0.1 (private fantasy draft tool)"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _fetch(url: str, headers: dict[str, str] | None = None, timeout: int = 20) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def _capture(provider: str, content: bytes, public_allowed: bool, detail: str, extension: str = "json") -> dict[str, Any]:
    fetched_at = utc_now()
    checksum = hashlib.sha256(content).hexdigest()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    directory = DATA_DIR / "raw" / f"publication={settings.publication_id}" / f"source={provider}" / f"date={stamp[:8]}"
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"as_of={stamp}.{extension}.gz"
    path.write_bytes(gzip.compress(content))
    metadata = {
        "snapshotId": str(uuid.uuid4()),
        "publicationId": settings.publication_id,
        "provider": provider,
        "fetchedAt": fetched_at,
        "checksum": checksum,
        "publicAllowed": public_allowed,
        "status": "fresh",
        "detail": detail,
        "localPath": str(path),
    }
    path.with_suffix(path.suffix + ".meta.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    save_snapshot(metadata)
    return metadata


def _degraded(provider: str, detail: str, public_allowed: bool) -> dict[str, Any]:
    snapshot = {
        "snapshotId": str(uuid.uuid4()),
        "publicationId": settings.publication_id,
        "provider": provider,
        "fetchedAt": utc_now(),
        "checksum": "",
        "publicAllowed": public_allowed,
        "status": "degraded",
        "detail": detail[:300],
        "localPath": None,
    }
    save_snapshot(snapshot)
    return snapshot


def refresh_fantasycalc(num_teams: int = 12, ppr: float = 0.5) -> dict[str, Any]:
    url = f"https://api.fantasycalc.com/values/current?isDynasty=false&numQbs=1&numTeams={num_teams}&ppr={ppr}"
    try:
        payload = _fetch(url)
        parsed = json.loads(payload)
        return _capture("fantasycalc-redraft", payload, False, f"{len(parsed)} market-value records; public rights pending review")
    except Exception as exc:
        return _degraded("fantasycalc-redraft", str(exc), False)


def refresh_ffc(num_teams: int = 12, scoring: str = "half-ppr") -> dict[str, Any]:
    scoring_slug = {"ppr": "ppr", "standard": "standard", "half-ppr": "half-ppr"}.get(scoring, "half-ppr")
    url = f"https://fantasyfootballcalculator.com/api/v1/adp/{scoring_slug}?teams={num_teams}&year={settings.season}"
    try:
        payload = _fetch(url)
        parsed = json.loads(payload)
        count = len(parsed.get("players", [])) if isinstance(parsed, dict) else len(parsed)
        return _capture("fantasy-football-calculator-adp", payload, True, f"{count} ADP records")
    except Exception as exc:
        return _degraded("fantasy-football-calculator-adp", str(exc), True)


def _rss_items(payload: bytes) -> list[dict[str, Any]]:
    root = ET.fromstring(payload)
    items: list[dict[str, Any]] = []
    for item in root.findall(".//item")[:100]:
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        published = (item.findtext("pubDate") or "").strip()
        creator = ""
        for child in item:
            if child.tag.endswith("creator"):
                creator = (child.text or "").strip()
        items.append({"headline": title, "sourceUrl": link, "publishedAt": published, "reporter": creator or None})
    return items


def refresh_rotowire() -> dict[str, Any]:
    url = "https://www.rotowire.com/rss/news.php?sport=NFL"
    try:
        payload = _fetch(url)
        items = _rss_items(payload)
        sanitized = json.dumps({"items": items}, ensure_ascii=False).encode("utf-8")
        return _capture("rotowire-nfl-rss", sanitized, True, f"{len(items)} headline/link records; no article bodies")
    except Exception as exc:
        return _degraded("rotowire-nfl-rss", str(exc), True)


def refresh_nflverse() -> dict[str, Any]:
    url = "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv"
    try:
        payload = _fetch(url, timeout=30)
        count = max(0, payload.count(b"\n") - 1)
        return _capture("nflverse-players", payload, True, f"{count} player identity records", extension="csv")
    except Exception as exc:
        return _degraded("nflverse-players", str(exc), True)


def refresh_fantasypros_status(configured: bool) -> dict[str, Any]:
    detail = "Credential present; set FANTASYPROS_PROJECTIONS_URL to enable the licensed prototype feed" if configured else "Optional free prototype credential not configured"
    return _degraded("fantasypros-private", detail, False)


def refresh_all(num_teams: int, scoring: str, fantasypros_configured: bool) -> list[dict[str, Any]]:
    ppr = 1.0 if scoring == "ppr" else 0.0 if scoring == "standard" else 0.5
    return [
        refresh_fantasycalc(num_teams, ppr),
        refresh_ffc(num_teams, scoring),
        refresh_rotowire(),
        refresh_nflverse(),
        refresh_fantasypros_status(fantasypros_configured),
    ]


def latest_rotowire_items() -> list[dict[str, Any]]:
    candidates = sorted((DATA_DIR / "raw" / f"publication={settings.publication_id}" / "source=rotowire-nfl-rss").glob("**/*.json.gz"))
    if not candidates:
        return []
    try:
        return json.loads(gzip.decompress(candidates[-1].read_bytes()).decode("utf-8")).get("items", [])
    except Exception:
        return []
