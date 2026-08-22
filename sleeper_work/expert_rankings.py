#!/usr/bin/env python3
"""Build a normalized 2026 rookie ranking snapshot from public expert sources.

The output contains ranks, tiers, trade-value signals, and source metadata only.
It intentionally does not reproduce paywalled or long-form source analysis.
"""

from __future__ import annotations

import argparse
import csv
import html as html_lib
import json
import re
import time
import unicodedata
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any


USER_AGENT = "ApeInvitationalAnalyzer/1.1"
SOURCES = {
    "fantasypros_ecr": {
        "name": "FantasyPros Expert Consensus Rankings",
        "url": "https://www.fantasypros.com/nfl/rankings/dynasty-rookies-overall.php",
        "as_of": "2026-08-19",
        "signal": "16-expert 1QB dynasty rookie consensus",
    },
    "rotoballer": {
        "name": "RotoBaller Staff Rookie Rankings",
        "url": "https://www.rotoballer.com/updated-fantasy-football-rookie-rankings-rb-wr-te-qb-2026/1903558",
        "as_of": "2026-08-05",
        "signal": "staff dynasty rookie board",
    },
    "boone_1qb": {
        "name": "Justin Boone Rookie Trade Values",
        "url": "https://sports.yahoo.com/fantasy/article/fantasy-football-dynasty-rankings-2026-trade-value-charts-justin-boone-rookies-162819768.html",
        "as_of": "2026-08-05",
        "signal": "1QB rookie trade-value ordering",
    },
    "draftsharks": {
        "name": "DraftSharks Dynasty 3D+ Rookie Rankings",
        "url": "https://www.draftsharks.com/dynasty-rankings/rookies",
        "as_of": "2026-08-19",
        "signal": "projection-driven dynasty rookie board",
    },
}


def normalize_name(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "")
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.replace("’", "'").replace(".", "").replace(" III", "").replace(" Jr", "")
    return " ".join(value.lower().split())


def fetch(url: str, path: Path, refresh: bool) -> str:
    if path.exists() and not refresh:
        return path.read_text(encoding="utf-8", errors="ignore")
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                content = response.read().decode("utf-8", errors="ignore")
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
            return content
        except Exception as exc:  # network errors differ across Python builds
            last_error = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Unable to fetch {url}: {last_error}")


class TablesAndScripts(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tables: list[list[list[str]]] = []
        self._table: list[list[str]] | None = None
        self._row: list[str] | None = None
        self._cell: list[str] | None = None
        self._cell_depth = 0
        self._script: list[str] | None = None
        self.ld_json: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "table":
            self._table = []
        elif tag == "tr" and self._table is not None:
            self._row = []
        elif tag in {"td", "th"} and self._row is not None:
            self._cell = []
            self._cell_depth = 1
        elif self._cell is not None:
            self._cell_depth += 1
        if tag == "script" and attributes.get("type") == "application/ld+json":
            self._script = []

    def handle_endtag(self, tag: str) -> None:
        if self._cell is not None:
            if tag in {"td", "th"} and self._cell_depth == 1:
                self._row.append(" ".join("".join(self._cell).split()))
                self._cell = None
                self._cell_depth = 0
            else:
                self._cell_depth = max(1, self._cell_depth - 1)
        if tag == "tr" and self._row is not None and self._table is not None:
            if self._row:
                self._table.append(self._row)
            self._row = None
        elif tag == "table" and self._table is not None:
            self.tables.append(self._table)
            self._table = None
        if tag == "script" and self._script is not None:
            self.ld_json.append("".join(self._script))
            self._script = None

    def handle_data(self, data: str) -> None:
        if self._cell is not None:
            self._cell.append(data)
        if self._script is not None:
            self._script.append(data)


def extract_json_array(page: str, marker: str) -> list[dict[str, Any]]:
    marker_index = page.find(marker)
    if marker_index < 0:
        raise ValueError(f"Marker not found: {marker}")
    start = page.find("[", marker_index + len(marker))
    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(page)):
        char = page[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                return json.loads(page[start : index + 1])
    raise ValueError("Unclosed JSON array")


def parse_fantasypros(page: str) -> list[dict[str, Any]]:
    players = extract_json_array(page, '"players":')
    return [
        {
            "name": item["player_name"],
            "position": item.get("player_position_id"),
            "team": item.get("player_team_id"),
            "rank": int(item["rank_ecr"]),
            "average_rank": float(item.get("rank_ave") or item["rank_ecr"]),
            "best_rank": int(item.get("rank_min") or item["rank_ecr"]),
            "worst_rank": int(item.get("rank_max") or item["rank_ecr"]),
            "std_dev": float(item.get("rank_std") or 0),
            "tier": int(item.get("tier") or 0),
        }
        for item in players
    ]


def parse_tables(page: str) -> TablesAndScripts:
    parser = TablesAndScripts()
    parser.feed(page)
    return parser


def parse_rotoballer(page: str) -> list[dict[str, Any]]:
    parsed = parse_tables(page)
    table = next(
        table
        for table in parsed.tables
        if table and table[0][:4] == ["Tier", "Rank", "Player Name", "Pos"]
    )
    result = []
    for row in table[1:]:
        if len(row) >= 4 and row[1].isdigit():
            result.append(
                {
                    "name": row[2],
                    "position": row[3],
                    "rank": int(row[1]),
                    "tier": int(row[0]) if row[0].isdigit() else None,
                }
            )
    return result


def parse_boone(page: str) -> list[dict[str, Any]]:
    parsed = parse_tables(page)
    table = next(
        table
        for table in parsed.tables
        if table and table[0][:5] == ["Rank", "Player", "Pos.", "1QB", "2QB"]
    )
    values = []
    for original_order, row in enumerate(table[1:], start=1):
        if len(row) >= 5 and row[0].isdigit() and row[3].isdigit():
            values.append(
                {
                    "name": row[1],
                    "position": re.sub(r"\d+$", "", row[2]),
                    "one_qb_value": int(row[3]),
                    "two_qb_value": int(row[4]),
                    "original_order": original_order,
                }
            )
    values.sort(key=lambda item: (-item["one_qb_value"], item["original_order"]))
    for rank, item in enumerate(values, start=1):
        item["rank"] = rank
        item.pop("original_order", None)
    return values


def parse_draftsharks(page: str) -> list[dict[str, Any]]:
    parsed = parse_tables(page)
    item_list: dict[str, Any] | None = None
    for raw in parsed.ld_json:
        try:
            document = json.loads(html_lib.unescape(raw))
        except json.JSONDecodeError:
            continue
        for node in document.get("@graph", []) if isinstance(document, dict) else []:
            if node.get("@type") == "ItemList" and node.get("itemListElement"):
                item_list = node
                break
    if not item_list:
        raise ValueError("DraftSharks ItemList not found")
    result = []
    for list_item in item_list["itemListElement"]:
        item = list_item.get("item") or {}
        position = {
            "Running Back": "RB",
            "Wide Receiver": "WR",
            "Quarterback": "QB",
            "Tight End": "TE",
        }.get(item.get("jobTitle"), item.get("jobTitle"))
        if position not in {"QB", "RB", "WR", "TE"}:
            continue
        result.append(
            {
                "name": item.get("name"),
                "position": position,
                "rank": int(list_item.get("position")),
            }
        )
    # Add the visible 3D value without carrying over long-form copyrighted analysis.
    ranking_table = next((table for table in parsed.tables if table and table[0] and table[0][0] == "RK"), [])
    values_by_rank = {}
    for row in ranking_table:
        if row and row[0].isdigit() and row[-1].replace(".", "", 1).isdigit():
            values_by_rank[int(row[0])] = float(row[-1])
    for item in result:
        item["three_d_value"] = values_by_rank.get(item["rank"])
    return result


def merge_sources(source_rows: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    players: dict[str, dict[str, Any]] = {}
    for source_id, rows in source_rows.items():
        for row in rows:
            key = normalize_name(row.get("name") or "")
            if not key:
                continue
            record = players.setdefault(
                key,
                {
                    "name": row.get("name"),
                    "position": row.get("position"),
                    "team": row.get("team"),
                    "source_ranks": {},
                    "source_details": {},
                },
            )
            record["source_ranks"][source_id] = row.get("rank")
            record["source_details"][source_id] = {
                field: value for field, value in row.items() if field not in {"name", "position", "team", "rank"}
            }
            record["team"] = record.get("team") or row.get("team")
            record["position"] = record.get("position") or row.get("position")
    for record in players.values():
        ranks = [float(value) for value in record["source_ranks"].values() if value]
        ranks.sort()
        if ranks:
            middle = len(ranks) // 2
            median = ranks[middle] if len(ranks) % 2 else (ranks[middle - 1] + ranks[middle]) / 2
            record["consensus_rank"] = round(median, 2)
            record["rank_low"] = int(min(ranks))
            record["rank_high"] = int(max(ranks))
            record["rank_range"] = int(max(ranks) - min(ranks))
            record["sources_count"] = len(ranks)
    return dict(sorted(players.items(), key=lambda item: item[1].get("consensus_rank", 999)))


def build_snapshot(html_dir: Path, refresh: bool) -> dict[str, Any]:
    pages = {}
    filenames = {
        "fantasypros_ecr": "fantasypros_ecr.html",
        "rotoballer": "rotoballer.html",
        "boone_1qb": "yahoo_boone.html",
        "draftsharks": "draftsharks.html",
    }
    for source_id, metadata in SOURCES.items():
        pages[source_id] = fetch(metadata["url"], html_dir / filenames[source_id], refresh)
    source_rows = {
        "fantasypros_ecr": parse_fantasypros(pages["fantasypros_ecr"]),
        "rotoballer": parse_rotoballer(pages["rotoballer"]),
        "boone_1qb": parse_boone(pages["boone_1qb"]),
        "draftsharks": parse_draftsharks(pages["draftsharks"]),
    }
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "format": "12-team, 1QB dynasty; non-TE-premium baseline",
        "sources": SOURCES,
        "source_counts": {source_id: len(rows) for source_id, rows in source_rows.items()},
        "players": merge_sources(source_rows),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--html-dir", default="research", help="Cached source HTML directory")
    parser.add_argument("--output", default="expert_rankings_2026.json", help="Output JSON path")
    parser.add_argument("--csv", default="output/expert_consensus_board.csv", help="Optional flat CSV output")
    parser.add_argument("--refresh", action="store_true", help="Refresh all source pages")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    snapshot = build_snapshot(Path(args.html_dir), args.refresh)
    output = Path(args.output)
    output.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if args.csv:
        csv_path = Path(args.csv)
        csv_path.parent.mkdir(parents=True, exist_ok=True)
        fields = [
            "consensus_rank",
            "player",
            "position",
            "team",
            "sources_count",
            "rank_low",
            "rank_high",
            "rank_range",
            "fantasypros_ecr_rank",
            "rotoballer_rank",
            "boone_1qb_rank",
            "draftsharks_rank",
        ]
        with csv_path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            for player in snapshot["players"].values():
                source_ranks = player.get("source_ranks") or {}
                writer.writerow(
                    {
                        "consensus_rank": player.get("consensus_rank"),
                        "player": player.get("name"),
                        "position": player.get("position"),
                        "team": player.get("team"),
                        "sources_count": player.get("sources_count"),
                        "rank_low": player.get("rank_low"),
                        "rank_high": player.get("rank_high"),
                        "rank_range": player.get("rank_range"),
                        "fantasypros_ecr_rank": source_ranks.get("fantasypros_ecr"),
                        "rotoballer_rank": source_ranks.get("rotoballer"),
                        "boone_1qb_rank": source_ranks.get("boone_1qb"),
                        "draftsharks_rank": source_ranks.get("draftsharks"),
                    }
                )
    print(f"wrote {output.resolve()} ({len(snapshot['players'])} players)")
