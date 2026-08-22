# Sleeper League Analyzer

This project connects the Sleeper account `mannyrsox24` to the **Ape Invitational Dynasty** league, pulls every roster and rookie-draft selection, and produces league power rankings plus league-aware editorial draft grades.

Sleeper's API is public, read-only, and does not require an API token. The grading layer combines FantasyCalc's current 12-team, 1QB, half-PPR dynasty feed with FantasyPros ECR, RotoBaller, Justin Boone's 1QB trade values, and DraftSharks.

## Run it

```bash
python3 expert_rankings.py --refresh
python3 sleeper_league_analyzer.py --refresh
python3 build_editorial_report.py
```

The default output directory is `output/`. It contains:

- `ape_invitational_report.md` — readable league analysis and draft grades
- `league_summary.csv` — one row per team with power, window, position-room, age, and future-pick metrics
- `rosters.csv` — every player on every roster with status and live market values
- `draft_picks.csv` — every pick with rookie market rank, value capture, and reach/value label
- `draft_grades.csv` — one execution grade per team
- `website_data.json` — normalized settings, sources, rosters, picks, component scores, and editorial content for a future frontend
- `ape_invitational_editorial_draft_grades.md` — punchy team-by-team report cards
- `snapshot_metadata.json` — league, draft, and refresh metadata

## Useful options

```bash
# Refresh after the last rookie pick
python3 sleeper_league_analyzer.py --refresh

# Write to a dated folder
python3 sleeper_league_analyzer.py --refresh --output-dir output/2026-08-19

# Override league selection explicitly
python3 sleeper_league_analyzer.py --league-id 1312209616372772864 --refresh
```

The large Sleeper player-ID map is cached for 24 hours, consistent with Sleeper's guidance. FantasyCalc values are cached for 12 hours unless `--refresh` is passed.

## Grading model

- **Roster power:** 45% dynasty starting-core percentile, 35% current-season lineup percentile, and 20% dynasty depth percentile.
- **Draft execution:** 55% multi-source expert consensus and 45% live market value, compared with the value normally available at those exact draft slots.
- **League fit:** a deliberately small adjustment for pre-draft need and the actual 1QB, half-PPR, no-TE-premium, three-FLEX structure.
- **Rank surplus:** pick number minus current 1QB rookie market rank. Positive is value; negative is a reach.
- **Total haul value:** reported separately so teams are not rewarded in the execution grade simply for owning more picks.

The model is decision support, not a projection guarantee. Current-season performance, injuries, depth-chart changes, and market sentiment will move the output whenever the script is refreshed.

## Sources

- [Sleeper API documentation](https://docs.sleeper.com/)
- [FantasyCalc](https://fantasycalc.com/) and [methodology FAQ](https://fantasycalc.com/frequently-asked-questions)
- [FantasyPros rookie ADP](https://www.fantasypros.com/nfl/adp/rookies.php) for an external market check
- [FantasyPros Dynasty Rookie ECR](https://www.fantasypros.com/nfl/rankings/dynasty-rookies-overall.php)
- [RotoBaller rookie rankings](https://www.rotoballer.com/updated-fantasy-football-rookie-rankings-rb-wr-te-qb-2026/1903558)
- [Justin Boone's rookie trade values](https://sports.yahoo.com/fantasy/article/fantasy-football-dynasty-rankings-2026-trade-value-charts-justin-boone-rookies-162819768.html)
- [DraftSharks rookie rankings](https://www.draftsharks.com/dynasty-rankings/rookies)
