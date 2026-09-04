from __future__ import annotations

import re
from typing import Any


def _key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


ALIASES = {
    "passingyards": "passing_yards",
    "passingtouchdowns": "passing_tds",
    "interceptions": "passing_interceptions",
    "rushingyards": "rushing_yards",
    "rushingtouchdowns": "rushing_tds",
    "receptions": "receptions",
    "receivingyards": "receiving_yards",
    "receivingtouchdowns": "receiving_tds",
    "fumbleslost": "fumbles_lost",
    "twopointconversions": "two_point_conversions",
    "2pointconversions": "two_point_conversions",
    "returnyards": "return_yards",
    "returntouchdowns": "return_touchdowns",
    "offensivefumblereturntd": "offensive_fumble_return_tds",
    "offensivefumblereturntouchdown": "offensive_fumble_return_tds",
    "rushing1stdowns": "rushing_first_downs",
    "rushingfirstdowns": "rushing_first_downs",
    "fieldgoals019yards": "field_goals_0_19",
    "fieldgoals2029yards": "field_goals_20_29",
    "fieldgoals3039yards": "field_goals_30_39",
    "fieldgoals4049yards": "field_goals_40_49",
    "fieldgoals50": "field_goals_50_plus",
    "fieldgoals50yards": "field_goals_50_plus",
    "pointafterattemptmade": "extra_points_made",
    "sack": "defensive_sacks",
    "interception": "defensive_interceptions",
    "fumblerecovery": "defensive_fumble_recoveries",
    "touchdown": "defensive_touchdowns",
    "safety": "defensive_safeties",
    "blockkick": "blocked_kicks",
    "kickoffandpuntreturntouchdowns": "defensive_return_touchdowns",
    "pointsallowed0points": "points_allowed_0",
    "pointsallowed16points": "points_allowed_1_6",
    "pointsallowed713points": "points_allowed_7_13",
    "pointsallowed1420points": "points_allowed_14_20",
    "pointsallowed2127points": "points_allowed_21_27",
    "pointsallowed2834points": "points_allowed_28_34",
    "pointsallowed35": "points_allowed_35_plus",
    "pointsallowed35points": "points_allowed_35_plus",
    "threeandoutsforced": "three_and_outs_forced",
    "extrapointreturned": "extra_points_returned",
}


def score_stat_line(stat_line: dict[str, float], yahoo_rules: list[dict[str, Any]]) -> float:
    """Score a provider stat line with imported Yahoo modifiers.

    A rule may carry Yahoo's display name as ``name``/``display_name`` and its
    multiplier as ``value``. Unknown categories are ignored rather than guessed.
    """
    total = 0.0
    for rule in yahoo_rules:
        label = str(rule.get("name") or rule.get("display_name") or rule.get("stat_name") or "")
        stat_key = ALIASES.get(_key(label))
        if not stat_key:
            continue
        try:
            total += float(stat_line.get(stat_key, 0)) * float(rule.get("value", 0))
        except (TypeError, ValueError):
            continue
    return round(total, 3)
