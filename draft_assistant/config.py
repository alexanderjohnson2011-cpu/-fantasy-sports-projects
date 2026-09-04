from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.getenv("DRAFT_ASSISTANT_DATA_DIR", ROOT / "draft_assistant" / "data"))


@dataclass(frozen=True)
class Settings:
    host: str = os.getenv("DRAFT_ASSISTANT_HOST", "127.0.0.1")
    port: int = int(os.getenv("DRAFT_ASSISTANT_PORT", "8787"))
    database_path: Path = Path(os.getenv("DRAFT_ASSISTANT_DB", DATA_DIR / "draft.sqlite3"))
    publication_id: str = os.getenv("PUBLICATION_ID", "mooseys-mommy")
    season: int = int(os.getenv("NFL_SEASON", "2026"))
    yahoo_redirect_uri: str = os.getenv("YAHOO_REDIRECT_URI", "oob")
    gcp_project: str = os.getenv("GOOGLE_CLOUD_PROJECT", "apes-mac-salad")
    gcp_location: str = os.getenv("GOOGLE_CLOUD_LOCATION", "global")
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
    gemini_request_limit: int = int(os.getenv("GEMINI_REQUEST_LIMIT", "100"))
    gemini_input_token_limit: int = int(os.getenv("GEMINI_INPUT_TOKEN_LIMIT", "300000"))
    gemini_output_token_limit: int = int(os.getenv("GEMINI_OUTPUT_TOKEN_LIMIT", "30000"))
    simulations: int = int(os.getenv("DRAFT_SIMULATIONS", "2000"))
    api_base_url: str = os.getenv("DRAFT_API_BASE_URL", "http://127.0.0.1:8787")


settings = Settings()
