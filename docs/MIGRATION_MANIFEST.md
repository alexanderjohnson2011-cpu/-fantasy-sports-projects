# Codex Migration Manifest

> **Reference document — not the plan of record.** [MASTER_PLAN.md](MASTER_PLAN.md) governs. The essential-paths table remains accurate; the restore sequence describes the pre-GCP local workflow.

## What to port

Port the `ape-invitational-almanac/` project and the adjacent `sleeper_work/` analytics pipeline together. The frontend alone can render the current static snapshot, but cannot regenerate grades, power profiles, prior-season history, or new weekly data without `sleeper_work/`.

## Essential paths

| Path | Purpose |
|---|---|
| `ape-invitational-almanac/src/Prototype.tsx` | primary product UI and routes |
| `ape-invitational-almanac/src/prototype.css` | product styling |
| `ape-invitational-almanac/src/generated/league-insights.json` | frontend-ready data bridge |
| `ape-invitational-almanac/scripts/build-league-insights.mjs` | enriches the current snapshot with historical season / redraft data |
| `ape-invitational-almanac/docs/` | project context, data provenance, forecasting plan, and this manifest |
| `sleeper_work/sleeper_league_analyzer.py` | Sleeper + FantasyCalc roster and draft analytics |
| `sleeper_work/expert_rankings.py` | public rookie-ranking normalization |
| `sleeper_work/build_editorial_report.py` | editorial Markdown generator |
| `sleeper_work/expert_rankings_2026.json` | retained rank snapshot |
| `sleeper_work/editorial_2026.json` | structured editorial overlay, if present |
| `sleeper_work/raw/` | cached Sleeper / FantasyCalc snapshots needed for reproducibility |
| `sleeper_work/output_latest/` | last normalized analytical output |

## Markdown analysis retained in the archive

- `sleeper_work/output_latest/ape_invitational_report.md` — comprehensive original league, roster, and draft snapshot.
- `library_latest/ape_invitational_editorial_draft_grades.md` — CBS-style draft report card.
- `library_latest/ape_invitational_report.md` — trade-aware analysis version.
- `ape-invitational-almanac/design-qa.md` — product QA notes.
- `ape-invitational-almanac/AGENTS.md` — durable implementation and content rules (including a few legacy runtime notes that should be reconciled before broad refactoring).

## Restore / run sequence

```bash
cd sleeper_work
python3 expert_rankings.py --refresh
python3 sleeper_league_analyzer.py --refresh --output-dir output_latest
python3 build_editorial_report.py --data output_latest/website_data.json --output output_latest/ape_invitational_editorial_draft_grades.md

cd ../ape-invitational-almanac
npm install
node scripts/build-league-insights.mjs
npm run build
```

The current app is static-first. It reads generated JSON rather than making live browser-side API calls. Preserve that separation: it avoids exposing data-fetching complexity to league visitors and makes snapshots reproducible.
