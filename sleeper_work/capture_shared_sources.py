"""Capture shared football inputs for Ape's Mac Salad and Moosey's Mommy.

This job deliberately has no Yahoo or FantasyPros implementation. Yahoo needs
local OAuth discovery and FantasyPros needs an explicitly licensed endpoint.
RotoWire is parsed before storage so RSS article text never enters a snapshot.

Examples:
  python sleeper_work/capture_shared_sources.py --season 2026
  python sleeper_work/capture_shared_sources.py --replay --output-dir C:\\temp\\shared-inputs
  python sleeper_work/capture_shared_sources.py --gcs-bucket apes-mac-salad-raw
"""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import io
import json
import os
import urllib.request
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from google.cloud import storage
except ImportError:  # Local dry-runs and non-GCP development still work.
    storage = None


HERE = Path(__file__).resolve().parent
DEFAULT_OUTPUT = HERE
REGISTRY_PATH = HERE / "provider_registry.json"
USER_AGENT = "ApesMacSaladSharedSources/1.0 (private fantasy analysis)"


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def fetch(url: str, timeout: int = 30) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def provider_policies() -> dict[str, dict[str, Any]]:
    return {item["id"]: item for item in json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))["providers"]}


def rotowire_metadata(payload: bytes) -> bytes:
    """Keep only the RSS fields specifically permitted by source policy."""
    root = ET.fromstring(payload)
    items = []
    for item in root.findall(".//item")[:100]:
        reporter = next((
            (child.text or "").strip()
            for child in item
            if child.tag.endswith("creator") and (child.text or "").strip()
        ), None)
        items.append({
            "headline": (item.findtext("title") or "").strip(),
            "publishedAt": (item.findtext("pubDate") or "").strip(),
            "sourceUrl": (item.findtext("link") or "").strip(),
            "reporter": reporter,
        })
    return json.dumps({"items": items}, ensure_ascii=False).encode("utf-8")


def source_definitions(season: int, teams: int, scoring: str) -> list[dict[str, Any]]:
    scoring_slug = {"ppr": "ppr", "standard": "standard", "half-ppr": "half-ppr"}.get(scoring, "half-ppr")
    return [
        {
            "provider": "fantasycalc-redraft",
            "endpoint": f"https://api.fantasycalc.com/values/current?isDynasty=false&numQbs=1&numTeams={teams}&ppr={1 if scoring == 'ppr' else 0 if scoring == 'standard' else 0.5}",
            "extension": "json",
            "replay": b"[]",
        },
        {
            "provider": "fantasy-football-calculator-adp",
            "endpoint": f"https://fantasyfootballcalculator.com/api/v1/adp/{scoring_slug}?teams={teams}&year={season}",
            "extension": "json",
            "replay": b'{"players": []}',
        },
        {
            "provider": "nflverse-players",
            "endpoint": "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv",
            "extension": "csv",
            "replay": b"display_name,gsis_id\n",
        },
        {
            "provider": "rotowire-nfl-rss",
            "endpoint": "https://www.rotowire.com/rss/news.php?sport=NFL",
            "extension": "json",
            "transform": rotowire_metadata,
            "replay": b'{"items": []}',
        },
    ]


def record_count(payload: bytes, extension: str) -> int:
    if extension == "csv":
        return max(0, sum(1 for _ in csv.DictReader(io.StringIO(payload.decode("utf-8")))))
    parsed = json.loads(payload.decode("utf-8"))
    if isinstance(parsed, list):
        return len(parsed)
    if isinstance(parsed, dict):
        for key in ("items", "players"):
            if isinstance(parsed.get(key), list):
                return len(parsed[key])
        return len(parsed)
    return 0


def save_capture(output_dir: Path, bucket: str | None, policy: dict[str, Any], source: dict[str, Any],
                 payload: bytes, season: int, fetched_at: datetime) -> dict[str, Any]:
    provider = policy["id"]
    stamp = fetched_at.strftime("%Y%m%dT%H%M%SZ")
    date = fetched_at.strftime("%Y-%m-%d")
    extension = source["extension"]
    relative_dir = Path("raw") / "global" / f"provider={provider}" / f"season={season}" / f"date={date}" / f"as_of={stamp}"
    local_dir = output_dir / relative_dir
    local_dir.mkdir(parents=True, exist_ok=True)
    payload_name = f"payload.{extension}.gz"
    packed = gzip.compress(payload)
    payload_path = local_dir / payload_name
    payload_path.write_bytes(packed)

    metadata = {
        "schemaVersion": "2.1.0",
        "snapshotId": str(uuid.uuid4()),
        "publicationId": None,
        "scope": "global",
        "provider": provider,
        "fetchedAt": fetched_at.isoformat(),
        "checksum": hashlib.sha256(payload).hexdigest(),
        "sourceUri": source["endpoint"],
        "parserVersion": "v1.0",
        "publicAllowed": policy["publicAllowed"],
        "publicUseClass": policy["rawScope"],
        "attributionRequired": bool(policy.get("attributionRequired")),
        "recordCount": record_count(payload, extension),
    }
    metadata_bytes = json.dumps(metadata, indent=2).encode("utf-8")
    metadata_path = local_dir / f"{payload_name}.meta.json"
    metadata_path.write_bytes(metadata_bytes)

    if bucket:
        if storage is None:
            raise RuntimeError("google-cloud-storage is required for --gcs-bucket")
        prefix = "/".join(relative_dir.parts[1:])
        bucket_ref = storage.Client().bucket(bucket)
        bucket_ref.blob(f"{prefix}/{payload_name}").upload_from_string(packed, content_type="application/gzip")
        bucket_ref.blob(f"{prefix}/{payload_name}.meta.json").upload_from_string(metadata_bytes, content_type="application/json")
    return metadata


def main() -> int:
    parser = argparse.ArgumentParser(description="Capture shared governed football sources.")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--gcs-bucket")
    parser.add_argument("--season", type=int, default=2026)
    parser.add_argument("--teams", type=int, default=14)
    parser.add_argument("--scoring", choices=("standard", "half-ppr", "ppr"), default="half-ppr")
    parser.add_argument("--replay", action="store_true", help="Write valid empty captures without network access.")
    args = parser.parse_args()

    policies = provider_policies()
    fetched_at = now_utc()
    failures = 0
    for source in source_definitions(args.season, args.teams, args.scoring):
        policy = policies[source["provider"]]
        try:
            payload = source["replay"] if args.replay else fetch(source["endpoint"])
            if not args.replay and source.get("transform"):
                payload = source["transform"](payload)
            metadata = save_capture(args.output_dir, args.gcs_bucket, policy, source, payload, args.season, fetched_at)
            print(f"captured {source['provider']}: {metadata['recordCount']} records")
        except Exception as exc:
            failures += 1
            print(f"[degraded] {source['provider']}: {str(exc)[:200]}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
