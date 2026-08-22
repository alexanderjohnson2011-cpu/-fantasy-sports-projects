# Data Provenance and Pipeline

> **Reference document — not the plan of record.** [MASTER_PLAN.md](MASTER_PLAN.md) governs. The source ledger and limitations here remain accurate; the snapshot layout is superseded by MASTER_PLAN.md §5.2.

## Correction: no Fantrax API was used

The existing code and retained data use **Sleeper**, not Fantrax. A full workspace search found no Fantrax client, endpoint, export, credential, or data file. If the league is later moved to Fantrax, build a separate adapter and do not label the current historical analysis as Fantrax-derived.

## Source ledger

| Layer | Source | Use | Existing implementation |
|---|---|---|---|
| League truth | Sleeper public API | league settings, users, rosters, drafts, picks, traded picks, prior-season record and brackets | `sleeper_work/sleeper_league_analyzer.py`, `scripts/build-league-insights.mjs` |
| Player identity | Sleeper player map | player ID, name, position and NFL team | `/v1/players/nfl`, cached for 24 hours |
| Current market | FantasyCalc API | 12-team, 1QB, half-PPR dynasty values; redraft values; player trend fields | `https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=1&numTeams=12&ppr=0.5`, cached for 12 hours |
| Rookie expert consensus | FantasyPros ECR | broad 1QB dynasty rookie consensus | parsed/cached ranking snapshot |
| Rookie expert board | RotoBaller | independent staff rookie rankings | parsed/cached ranking snapshot |
| Rookie trade-value board | Justin Boone / Yahoo Sports | 1QB rookie trade-value ordering | parsed/cached ranking snapshot |
| Rookie projection board | DraftSharks | projection-driven dynasty rookie ranking | parsed/cached ranking snapshot |
| Sanity check | FantasyPros rookie ADP | external market reasonableness check | cited in reports, not the main composite |

## Sleeper access pattern

The current pipeline is read-only and needs no Sleeper API key. It resolves the league through the user/league list or the explicit league ID, then reads:

```text
/v1/user/{username}
/v1/user/{user_id}/leagues/nfl/{season}
/v1/league/{league_id}
/v1/league/{league_id}/users
/v1/league/{league_id}/rosters
/v1/league/{league_id}/drafts
/v1/league/{league_id}/traded_picks
/v1/draft/{draft_id}/picks
/v1/players/nfl
```

For the prior season, the frontend build script follows `previous_league_id` from the current league, then pulls the prior league, rosters, winner bracket, and loser bracket. It derives regular-season wins/losses, points for, potential points, and bracket placement from those responses.

Important limitation: the public Sleeper draft-picks feed does **not** expose an individual timestamp for every historical pick. Earlier pick-time analysis could calculate only aggregate active-clock pace from draft-level timestamps and the known overnight pause—not a defensible fastest manager or longest historical pick.

## Transformation and scoring

1. **Identity enrichment** — roster player IDs are joined to Sleeper's player map and FantasyCalc by Sleeper ID, with normalized-name fallback.
2. **Power / roster profile** — the current analyzer values a 1QB/2RB/2WR/1TE/3FLEX optimal skill-position lineup, plus weighted room depth. Its current power composite is 45% dynasty starting core, 35% current-year market-implied lineup, and 20% dynasty depth.
3. **Draft execution** — each rookie's expert and market values are compared with the value expected at the actual draft slot, rather than simply comparing ordinal ranks. The original analyzer blended 55% expert consensus and 45% FantasyCalc market signal, then applied a small format-aware roster-fit adjustment.
4. **Draft-cycle accounting** — later project work added full 2026-pick provenance and trade accounting. This is the source of the 60/30/10 cycle-grade product described in `PROJECT_CONTEXT.md`.
5. **Editorial layer** — original prose summarizes the model's transparent evidence; it should be refreshed when inputs change, not treated as timeless fact.

## What the sources are—and are not

- Sleeper is the source of league transactions and scored matchup results.
- FantasyCalc is a market signal, **not** a weekly points projection system.
- Expert ranking sources are current-information inputs, not guaranteed outcomes.
- The original reports mix snapshot dates. Preserve timestamps on every refresh and never compare a current player value with an unlabelled historical value.
- Cached research HTML is present only to make the earlier rank snapshot reproducible. Do not republish long-form source content; retain only derived ranks, metadata, and links.

## Recommended weekly snapshot contract

Persist an immutable payload for every refresh:

```text
raw/{season}/{timestamp}/
  sleeper_league.json
  sleeper_rosters.json
  sleeper_matchups_week_{week}.json
  sleeper_transactions_week_{week}.json
  fantasycalc_values.json
canonical/{season}/week_{week}.json
analytics/{season}/week_{week}.json
presentation/{season}/week_{week}.json
```

Each file should include `as_of_utc`, source URL/endpoints, model version, league ID, scoring settings hash, and input snapshot checksum. This will make Tuesday stories, correction runs, and week-over-week charts auditable.
