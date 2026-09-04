from __future__ import annotations

import os

SERVICE = "mooseys-mommy-draft-assistant"
_memory: dict[str, str] = {}


def _keyring():
    try:
        import keyring
        return keyring
    except ImportError:
        return None


def get_secret(name: str) -> str | None:
    env_name = name.upper()
    if os.getenv(env_name):
        return os.getenv(env_name)
    kr = _keyring()
    if kr:
        try:
            return kr.get_password(SERVICE, name)
        except Exception:
            pass
    return _memory.get(name)


def set_secret(name: str, value: str) -> str:
    kr = _keyring()
    if kr:
        try:
            kr.set_password(SERVICE, name, value)
            return "windows-credential-manager"
        except Exception:
            pass
    _memory[name] = value
    return "process-memory"


def secret_status() -> dict[str, bool]:
    return {
        "yahooClientId": bool(get_secret("yahoo_client_id")),
        "yahooClientSecret": bool(get_secret("yahoo_client_secret")),
        "yahooRefreshToken": bool(get_secret("yahoo_refresh_token")),
        "fantasyProsKey": bool(get_secret("fantasypros_key")),
    }
