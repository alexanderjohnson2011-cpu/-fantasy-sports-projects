#!/usr/bin/env python3
"""Render the website-ready JSON as a punchy league draft-grades report."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


GRADE_ORDER = {
    "A+": 0,
    "A": 1,
    "A-": 2,
    "B+": 3,
    "B": 4,
    "B-": 5,
    "C+": 6,
    "C": 7,
    "C-": 8,
    "D+": 9,
    "D": 10,
    "F": 11,
    "Incomplete": 99,
}


def percent(value: Any) -> str:
    return f"{100 * float(value):.1f}%" if value not in (None, "") else "—"


def rank(value: Any) -> str:
    if value in (None, ""):
        return "—"
    number = float(value)
    return f"{number:.1f}" if not number.is_integer() else str(int(number))


def build_report(data: dict[str, Any]) -> str:
    league = data["league"]
    draft = data["draft"]
    teams = data["teams"]
    for team in teams:
        editorial = team.get("editorial") or {}
        team["display_grade"] = editorial.get("editorial_grade") or (
            (team.get("draft_grade") or {}).get("execution_grade") or "Incomplete"
        )
    teams.sort(
        key=lambda team: (
            GRADE_ORDER.get(team["display_grade"], 50),
            -float((team.get("draft_grade") or {}).get("league_adjusted_capture") or 0),
        )
    )

    lines = [
        f"# {league['name']}: 2026 Rookie Draft Grades",
        "",
        f"**A league-specific, team-by-team report card**  ",
        f"Snapshot: {draft['picks_made']} of {draft['total_picks']} picks complete. "
        + ("Grades are provisional while the slow draft remains live." if data.get("provisional") else "The draft is complete."),
        "",
        "This is an editorial draft-grades package in the spirit of a major-sports-site report card: a grade, a headline, the best pick, the biggest question, and a verdict for every roster. The writing is original; the underlying rankings and market signals are attributed below.",
        "",
        "## The rules that change the grades",
        "",
        "| League rule | Grading consequence |",
        "|---|---|",
        "| 12 teams, 1QB | Quarterbacks receive a major discount from superflex boards. |",
        "| Four-point passing TDs | Rushing QBs retain an edge; pocket-QB stashes lose a little more value. |",
        "| Half-PPR, no TE premium | WRs remain strong FLEX assets, but tight ends get no scoring subsidy. |",
        "| 2 RB, 2 WR, 1 TE, 3 FLEX | RB/WR depth matters more than in a shallow two-FLEX league. |",
        "| 14 bench, 2 rookie-only taxi slots, 5 IR | Developmental third- and fourth-round bets are more rosterable. |",
        "| Kicker and team defense starters | Elite defenses matter to roster power, but they do not affect rookie-pick value. |",
        "| Four rookie rounds; pick trading enabled | Grades measure value at the picks actually used, not how much capital a manager owned. |",
        "",
        "## How the grade is built",
        "",
        "- **55% expert consensus:** median available 1QB rookie rank from FantasyPros ECR, RotoBaller, Justin Boone's 1QB trade-value order, and DraftSharks.",
        "- **45% live market:** FantasyCalc values derived from current 12-team, 1QB, half-PPR dynasty trades.",
        "- **Small league-fit adjustment:** pre-draft positional need, with RB/WR emphasized for three FLEX slots, QB discounted for 1QB, and no TE-premium bonus.",
        "- **Editorial overlay:** roster direction, opportunity cost, portfolio construction, and disagreement between the market and expert boards.",
        "",
        "## League report card",
        "",
        "| Grade | Team | Model | Expert capture | Market capture | Headline |",
        "|:---:|---|:---:|---:|---:|---|",
    ]
    for team in teams:
        grade = team.get("draft_grade") or {}
        editorial = team.get("editorial") or {}
        model_grade = grade.get("execution_grade") or "—"
        lines.append(
            f"| **{team['display_grade']}** | {team['team']} | {model_grade} | "
            f"{percent(grade.get('expert_value_capture'))} | {percent(grade.get('market_value_capture'))} | "
            f"{editorial.get('headline', 'Awaiting a complete draft')} |"
        )

    lines.extend(
        [
            "",
            "## League-wide superlatives",
            "",
            "- **Best first-round value:** Makai Lemon at 1.06. All four source boards placed him third or fourth, while the live market ranked him fifth.",
            "- **Best foundational pick:** Carnell Tate at 1.03. The expert and market boards agreed he was the second-best rookie, and he went to the league's weakest roster.",
            "- **Best third-round value:** Ted Hurst at 3.06. The expert median ranked him 19th; he lasted to pick 30.",
            "- **Best fourth-round value:** Oscar Delp at 4.06. His expert median was 30th; he went 42nd and can use a rookie-only taxi slot.",
            "- **Largest conviction bet:** Cyrus Allen at 2.03. The expert median placed him around 40th, although the live trade market was far more aggressive at roughly 17th.",
            "- **Best draft-to-roster fit:** 2 Dagos and A Dream. Every pick attacked a room ranked 11th before the draft.",
            "",
            "## Expert notebook",
            "",
            "- FantasyPros' current 1QB ECR is a 16-expert consensus, which makes it the broadest opinion input in the model. [FantasyPros ECR](https://www.fantasypros.com/nfl/rankings/dynasty-rookies-overall.php)",
            "- DraftSharks' projection-driven board was especially positive on Makai Lemon and Jadarian Price, citing Lemon's formation versatility and Price's immediate Seattle opportunity. [DraftSharks rookie rankings](https://www.draftsharks.com/dynasty-rankings/rookies)",
            "- Mike Washington is the clearest experts-versus-market disagreement in Alex's class. FantasyPros describes the size/speed profile as capable of three-down work if called upon, while his immediate role remains behind Ashton Jeanty. [FantasyPros player outlook](https://www.fantasypros.com/nfl/players/mike-washington-jr.php)",
            "- Ted Hurst's expert case is stronger than his draft slot: Fantasy Life called him a reasonable second-round dynasty target, and FantasyPros has highlighted his strong camp. [Fantasy Life](https://www.fantasylife.com/articles/fantasy/ted-hurst-fantasy-football-outlook-with-the-tampa-bay-buccaneers), [FantasyPros](https://www.fantasypros.com/nfl/players/ted-hurst.php)",
            "- Oscar Delp combines third-round NFL capital with elite testing, but his Year 1 path is blocked. FantasyPros sees a plausible 2027 starting window; that is exactly the type of profile a one-year rookie taxi slot can monetize. [FantasyPros player outlook](https://www.fantasypros.com/nfl/players/oscar-delp.php)",
            "",
        ]
    )

    for index, team in enumerate(teams, start=1):
        editorial = team.get("editorial") or {}
        grade = team.get("draft_grade") or {}
        lines.extend(
            [
                f"## {index}. {team['team']} — {team['display_grade']}",
                "",
                f"*{editorial.get('headline', 'Grade pending')}*",
                "",
            ]
        )
        if team.get("draft_picks"):
            lines.extend(
                [
                    "| Pick | Player | Pos. | Expert rank | Market rank | Pre-draft room |",
                    "|---:|---|:---:|---:|---:|---:|",
                ]
            )
            for pick in team["draft_picks"]:
                lines.append(
                    f"| {pick['pick']} | {pick['player']} | {pick['position']} | "
                    f"{rank(pick.get('expert_consensus_rank'))} | {rank(pick.get('market_rookie_rank'))} | "
                    f"#{pick.get('pre_draft_position_room_rank') or '—'} {pick['position']} |"
                )
        else:
            lines.append("*No selection has been made through the current snapshot.*")
        lines.extend(
            [
                "",
                f"**Best pick:** {editorial.get('best_pick', 'Pending')}  ",
                f"**Biggest question:** {editorial.get('biggest_question', 'Pending')}",
                "",
                editorial.get("summary", "Grade pending."),
                "",
                f"**Roster fit:** {editorial.get('fit_note', 'Pending.')}",
                "",
                f"**Verdict:** {editorial.get('verdict', 'Pending.')}",
                "",
            ]
        )
        editorial_model = editorial.get("model_grade")
        if editorial_model or (grade and team["display_grade"] != grade.get("execution_grade")):
            lines.extend(
                [
                    f"*Model grade: {grade.get('execution_grade', editorial_model or '—')}; editorial grade: {team['display_grade']}. "
                    "The difference reflects judgment about opportunity cost and league-specific roster construction.*",
                    "",
                ]
            )

    lines.extend(
        [
            "## Source ledger",
            "",
            "- [Sleeper API](https://docs.sleeper.com/) — live league settings, rosters, users, draft, and picks.",
            "- [FantasyCalc](https://fantasycalc.com/) — current 12-team, 1QB, half-PPR dynasty trade values.",
            "- [FantasyPros 2026 Dynasty Rookie ECR](https://www.fantasypros.com/nfl/rankings/dynasty-rookies-overall.php) — updated August 19, 2026.",
            "- [RotoBaller 2026 rookie rankings](https://www.rotoballer.com/updated-fantasy-football-rookie-rankings-rb-wr-te-qb-2026/1903558) — updated August 5, 2026.",
            "- [Justin Boone's rookie trade values](https://sports.yahoo.com/fantasy/article/fantasy-football-dynasty-rankings-2026-trade-value-charts-justin-boone-rookies-162819768.html) — published August 5, 2026; model uses the 1QB value column.",
            "- [DraftSharks 2026 rookie rankings](https://www.draftsharks.com/dynasty-rankings/rookies) — projection-driven board updated August 19, 2026.",
            "",
            "### Important limitation",
            "",
            "These are process grades, not declarations of who will have the best NFL career. The expert boards and trade market measure current information; late injuries, depth-chart movement, and the final four selections can change the result.",
        ]
    )
    return "\n".join(lines) + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", default="output/website_data.json")
    parser.add_argument("--output", default="output/ape_invitational_editorial_draft_grades.md")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    data = json.loads(Path(args.data).read_text(encoding="utf-8"))
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(build_report(data), encoding="utf-8")
    print(f"wrote {output.resolve()}")
