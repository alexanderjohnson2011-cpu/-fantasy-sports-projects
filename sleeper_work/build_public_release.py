"""Create a team-name-only static release and enforce provider rights."""
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
PROVIDER_REGISTRY_PATH = HERE / "provider_registry.json"
FORBIDDEN_KEYS = {
    "manager", "managername", "owner", "ownerid", "userid", "yahooid", "yahookey",
    "clientsecret", "refreshtoken", "accesstoken", "oauth", "chat", "chathistory",
    "leaguekey", "externalleaguekey", "playerkey", "teamkey", "providereventid",
    "localpath", "rawpath", "rawuri",
}


def _provider_registry() -> dict[str, dict[str, Any]]:
    """Index the versioned provider policy by ID and compatibility alias."""
    raw = json.loads(PROVIDER_REGISTRY_PATH.read_text(encoding="utf-8"))
    indexed: dict[str, dict[str, Any]] = {}
    for provider in raw["providers"]:
        indexed[provider["id"]] = provider
        for alias in provider.get("aliases", []):
            indexed[alias] = provider
    return indexed


def source_is_public(provider_id: str | None, publication_id: str | None = None) -> bool:
    """Return whether a provider is allowed in this publication's release.

    Input data cannot self-authorize with ``publicAllowed: true``. The
    repository policy is the release gate, and an unknown provider is private
    by default.
    """
    if not provider_id:
        return False
    policy = _provider_registry().get(provider_id)
    if not policy or policy.get("publicAllowed") is not True:
        return False
    scope = policy.get("publicationScope")
    consumers = policy.get("consumers", [])
    return scope == "shared" or publication_id is None or scope == publication_id or publication_id in consumers


def _sanitize_sources(items: list[Any], publication_id: str | None) -> list[Any]:
    return [
        sanitize(item, publication_id)
        for item in items
        if isinstance(item, dict)
        and item.get("publicAllowed") is not False
        and source_is_public(item.get("provider") or item.get("providerId"), publication_id)
    ]


def sanitize(value: Any, publication_id: str | None = None) -> Any:
    if isinstance(value, list):
        return [sanitize(item, publication_id) for item in value]
    if not isinstance(value, dict):
        return value
    result = {}
    for key, child in value.items():
        normalized = "".join(character for character in key.lower() if character.isalnum())
        if normalized in FORBIDDEN_KEYS:
            continue
        if key == "sources" and isinstance(child, list):
            result[key] = _sanitize_sources(child, publication_id)
            continue
        if key == "news" and isinstance(child, list):
            allowed = ("headline", "publishedAt", "sourceUrl", "reporter", "provider")
            result[key] = [{field: item[field] for field in allowed if field in item} for item in child]
            continue
        result[key] = sanitize(child, publication_id)
    return result


def assert_private_fields_absent(value: Any, path: str = "$") -> None:
    if isinstance(value, list):
        for index, item in enumerate(value):
            assert_private_fields_absent(item, f"{path}[{index}]")
    elif isinstance(value, dict):
        for key, child in value.items():
            normalized = "".join(character for character in key.lower() if character.isalnum())
            if normalized in FORBIDDEN_KEYS:
                raise ValueError(f"Private field {path}.{key} entered the release")
            assert_private_fields_absent(child, f"{path}.{key}")


def build(publication_id: str, input_path: Path, output_dir: Path) -> tuple[Path, Path]:
    if publication_id not in {"apes-mac-salad", "johnnys-jerks", "mooseys-mommy"}:
        raise ValueError("Unknown publication ID")
    source = json.loads(input_path.read_text(encoding="utf-8"))
    data = sanitize(source, publication_id)
    assert_private_fields_absent(data)
    generated_at = datetime.now(timezone.utc).isoformat()
    release_id = hashlib.sha256((publication_id + generated_at).encode()).hexdigest()[:12]
    release = {"schemaVersion": "2.0.0", "releaseId": release_id, "publicationId": publication_id,
               "generatedAt": generated_at, "data": data}
    encoded = json.dumps(release, indent=2, ensure_ascii=False).encode("utf-8")
    checksum = hashlib.sha256(encoded).hexdigest()
    output_dir.mkdir(parents=True, exist_ok=True)
    release_path = output_dir / "release.json"
    manifest_path = output_dir / "release-manifest.json"
    release_path.write_bytes(encoded)
    manifest_path.write_text(json.dumps({
        "schemaVersion": "2.0.0", "releaseId": release_id, "publicationId": publication_id,
        "generatedAt": generated_at, "files": [{"path": "release.json", "sha256": checksum}],
    }, indent=2), encoding="utf-8")
    return release_path, manifest_path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--publication-id", required=True)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    release, manifest = build(args.publication_id, args.input, args.output)
    print(release)
    print(manifest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
