from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from .config import settings


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def connection(path: Path | None = None) -> Iterator[sqlite3.Connection]:
    db_path = path or settings.database_path
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, timeout=5)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def initialize() -> None:
    with connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS draft_sessions (
              session_id TEXT PRIMARY KEY,
              publication_id TEXT NOT NULL,
              league_key TEXT,
              league_name TEXT NOT NULL,
              user_team_key TEXT,
              user_slot INTEGER NOT NULL,
              num_teams INTEGER NOT NULL,
              rounds INTEGER NOT NULL,
              scoring_format TEXT NOT NULL,
              scoring_json TEXT,
              roster_slots_json TEXT,
              league_settings_json TEXT,
              settings_hash TEXT,
              strategy TEXT NOT NULL,
              status TEXT NOT NULL,
              sync_mode TEXT NOT NULL,
              sync_message TEXT,
              last_yahoo_sync TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS draft_events (
              event_id INTEGER PRIMARY KEY AUTOINCREMENT,
              session_id TEXT NOT NULL,
              pick_no INTEGER NOT NULL,
              round_no INTEGER NOT NULL,
              team_slot INTEGER NOT NULL,
              player_id TEXT NOT NULL,
              player_name TEXT NOT NULL,
              position TEXT NOT NULL,
              source TEXT NOT NULL,
              provider_event_id TEXT,
              observed_at TEXT NOT NULL,
              superseded_at TEXT,
              UNIQUE(session_id, pick_no),
              FOREIGN KEY(session_id) REFERENCES draft_sessions(session_id)
            );
            CREATE INDEX IF NOT EXISTS idx_draft_events_session_active
              ON draft_events(session_id, pick_no) WHERE superseded_at IS NULL;
            CREATE TABLE IF NOT EXISTS provider_snapshots (
              snapshot_id TEXT PRIMARY KEY,
              publication_id TEXT NOT NULL,
              provider TEXT NOT NULL,
              fetched_at TEXT NOT NULL,
              checksum TEXT NOT NULL,
              public_allowed INTEGER NOT NULL,
              status TEXT NOT NULL,
              detail TEXT,
              local_path TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_provider_snapshots_publication_provider
              ON provider_snapshots(publication_id, provider, fetched_at DESC);
            CREATE TABLE IF NOT EXISTS ai_usage (
              session_id TEXT PRIMARY KEY,
              request_count INTEGER NOT NULL DEFAULT 0,
              input_tokens INTEGER NOT NULL DEFAULT 0,
              output_tokens INTEGER NOT NULL DEFAULT 0,
              updated_at TEXT NOT NULL,
              FOREIGN KEY(session_id) REFERENCES draft_sessions(session_id)
            );
            """
        )
        columns = {row[1] for row in conn.execute("PRAGMA table_info(draft_sessions)")}
        for name in ("scoring_json", "roster_slots_json", "league_settings_json", "settings_hash"):
            if name not in columns:
                conn.execute(f"ALTER TABLE draft_sessions ADD COLUMN {name} TEXT")
        conn.execute("PRAGMA optimize")
        ensure_session(conn)


def ensure_session(conn: sqlite3.Connection, session_id: str = "tonight") -> None:
    now = utc_now()
    conn.execute(
        """
        INSERT OR IGNORE INTO draft_sessions (
          session_id, publication_id, league_name, user_slot, num_teams, rounds,
          scoring_format, strategy, status, sync_mode, sync_message, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (session_id, settings.publication_id, "Moosey's Mommy", 1, 12, 16,
         "half-ppr", "balanced", "pre_draft", "manual",
         "Manual mode is ready. Connect Yahoo when credentials are available.", now, now),
    )
    conn.execute(
        "INSERT OR IGNORE INTO ai_usage(session_id, updated_at) VALUES (?, ?)",
        (session_id, now),
    )


def get_session(session_id: str = "tonight") -> dict[str, Any]:
    with connection() as conn:
        ensure_session(conn, session_id)
        row = conn.execute("SELECT * FROM draft_sessions WHERE session_id = ?", (session_id,)).fetchone()
        result = dict(row) if row else {}
        for key in ("scoring_json", "roster_slots_json", "league_settings_json"):
            if result.get(key):
                try:
                    result[key] = json.loads(result[key])
                except json.JSONDecodeError:
                    result[key] = None
        return result


def update_session(session_id: str = "tonight", **values: Any) -> dict[str, Any]:
    allowed = {"league_key", "league_name", "user_team_key", "user_slot", "num_teams", "rounds",
               "scoring_format", "scoring_json", "roster_slots_json", "league_settings_json", "settings_hash",
               "strategy", "status", "sync_mode", "sync_message", "last_yahoo_sync"}
    changes = {key: value for key, value in values.items() if key in allowed and value is not None}
    for key in ("scoring_json", "roster_slots_json", "league_settings_json"):
        if key in changes and not isinstance(changes[key], str):
            changes[key] = json.dumps(changes[key], sort_keys=True, separators=(",", ":"))
    if not changes:
        return get_session(session_id)
    changes["updated_at"] = utc_now()
    with connection() as conn:
        ensure_session(conn, session_id)
        clause = ", ".join(f"{key} = ?" for key in changes)
        conn.execute(f"UPDATE draft_sessions SET {clause} WHERE session_id = ?", (*changes.values(), session_id))
    return get_session(session_id)


def snake_slot(pick_no: int, num_teams: int) -> int:
    round_no = ((pick_no - 1) // num_teams) + 1
    within = ((pick_no - 1) % num_teams) + 1
    return within if round_no % 2 else num_teams - within + 1


def list_events(session_id: str = "tonight") -> list[dict[str, Any]]:
    with connection() as conn:
        rows = conn.execute(
            "SELECT * FROM draft_events WHERE session_id = ? AND superseded_at IS NULL ORDER BY pick_no",
            (session_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def add_event(session_id: str, player: dict[str, Any], team_slot: int | None, source: str = "manual",
              pick_no: int | None = None, provider_event_id: str | None = None) -> dict[str, Any]:
    session = get_session(session_id)
    events = list_events(session_id)
    pick_no = pick_no or (max((e["pick_no"] for e in events), default=0) + 1)
    team_slot = team_slot or snake_slot(pick_no, int(session["num_teams"]))
    round_no = ((pick_no - 1) // int(session["num_teams"])) + 1
    now = utc_now()
    with connection() as conn:
        conn.execute(
            """
            INSERT INTO draft_events(session_id, pick_no, round_no, team_slot, player_id,
              player_name, position, source, provider_event_id, observed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id, pick_no) DO UPDATE SET
              round_no=excluded.round_no, team_slot=excluded.team_slot, player_id=excluded.player_id,
              player_name=excluded.player_name, position=excluded.position, source=excluded.source,
              provider_event_id=excluded.provider_event_id, observed_at=excluded.observed_at,
              superseded_at=NULL
            """,
            (session_id, pick_no, round_no, team_slot, str(player["playerId"]), player["name"],
             player.get("position", "NA"), source, provider_event_id, now),
        )
    return list_events(session_id)[pick_no - 1]


def undo_last(session_id: str = "tonight") -> dict[str, Any] | None:
    events = list_events(session_id)
    if not events:
        return None
    last = events[-1]
    with connection() as conn:
        conn.execute(
            "UPDATE draft_events SET superseded_at = ? WHERE event_id = ?",
            (utc_now(), last["event_id"]),
        )
    return last


def clear_events_by_source(session_id: str, source: str) -> int:
    """Supersede a bounded set of non-production rehearsal events."""
    with connection() as conn:
        cursor = conn.execute(
            """
            UPDATE draft_events SET superseded_at = ?
            WHERE session_id = ? AND source = ? AND superseded_at IS NULL
            """,
            (utc_now(), session_id, source),
        )
    return int(cursor.rowcount)


def save_snapshot(snapshot: dict[str, Any]) -> None:
    with connection() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO provider_snapshots(
              snapshot_id, publication_id, provider, fetched_at, checksum,
              public_allowed, status, detail, local_path
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (snapshot["snapshotId"], snapshot["publicationId"], snapshot["provider"],
             snapshot["fetchedAt"], snapshot["checksum"], int(snapshot["publicAllowed"]),
             snapshot["status"], snapshot.get("detail"), snapshot.get("localPath")),
        )


def latest_snapshots(publication_id: str) -> list[dict[str, Any]]:
    with connection() as conn:
        attempts = conn.execute(
            """
            SELECT p.* FROM provider_snapshots p
            JOIN (
              SELECT provider, MAX(fetched_at) fetched_at FROM provider_snapshots
              WHERE publication_id = ? GROUP BY provider
            ) latest ON latest.provider=p.provider AND latest.fetched_at=p.fetched_at
            WHERE p.publication_id = ? ORDER BY p.provider
            """, (publication_id, publication_id),
        ).fetchall()
        rows: list[dict[str, Any]] = []
        for attempt in attempts:
            item = dict(attempt)
            if item["status"] != "fresh":
                last_success = conn.execute(
                    """
                    SELECT * FROM provider_snapshots
                    WHERE publication_id = ? AND provider = ?
                      AND status = 'fresh' AND local_path IS NOT NULL
                    ORDER BY fetched_at DESC LIMIT 1
                    """,
                    (publication_id, item["provider"]),
                ).fetchone()
                if last_success:
                    saved = dict(last_success)
                    saved["status"] = "stale"
                    saved["last_attempt_at"] = item["fetched_at"]
                    saved["detail"] = (
                        f"Latest refresh failed: {item.get('detail') or 'unknown error'}. "
                        f"Using saved snapshot from {saved['fetched_at']}: {saved.get('detail') or 'captured data'}"
                    )
                    item = saved
            rows.append(item)
    return [{**row, "publicAllowed": bool(row["public_allowed"])} for row in rows]


def ai_usage(session_id: str) -> dict[str, int]:
    with connection() as conn:
        ensure_session(conn, session_id)
        row = conn.execute("SELECT * FROM ai_usage WHERE session_id = ?", (session_id,)).fetchone()
    return dict(row) if row else {"request_count": 0, "input_tokens": 0, "output_tokens": 0}


def record_ai_usage(session_id: str, input_tokens: int, output_tokens: int) -> None:
    with connection() as conn:
        conn.execute(
            """
            UPDATE ai_usage SET request_count=request_count+1,
              input_tokens=input_tokens+?, output_tokens=output_tokens+?, updated_at=?
            WHERE session_id=?
            """, (input_tokens, output_tokens, utc_now(), session_id),
        )
