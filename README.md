# Ape's Mac Salad — Draft Analysis

A responsive React editorial app for the Ape Invitational Dynasty league. The current release combines 2026 draft-cycle grades, complete pick commentary, league power rankings, prior-season results, and the recurring **Ape's Mac Salad** award.

## What is built

- Permanent draft-cycle grades for all 12 teams
- Separate pick and full-cycle grades
- Expert-board and live-market value capture
- Original-versus-acquired pick accounting
- Trade-capital outcomes and roster context
- Team-specific headlines, verdicts, best picks, and biggest questions
- CBS-style commentary on every recorded pick
- Ape's Mac Salad draft winner and planned weekly award
- 2026 power rankings with dynasty, current-lineup, depth, and three-year views
- Market-implied redraft slots for every rostered QB, RB, WR, and TE
- 2025 records, points, playoff finish, and defending-champion context from Sleeper
- Working future-state screens for Tuesday matchup stories and season forecasts
- Full-viewport responsive layouts for phone, tablet, and desktop

## Run locally

```bash
npm ci
npm run dev
```

Build checks:

```bash
npm run check:runtime
npm run build
npm run test:sites
```

Refresh the generated roster, redraft, and prior-season snapshot after running the Sleeper analyzer:

```bash
node scripts/build-league-insights.mjs
```

## Publish with GitHub Pages

The repository includes `.github/workflows/deploy-pages.yml`. It builds a static artifact and rewrites runtime asset paths so the app works from a GitHub project URL.

1. Push the project to a GitHub repository with `main` as the default branch.
2. In **Settings → Pages**, choose **GitHub Actions** as the source.
3. Run the **Deploy to GitHub Pages** workflow or push to `main`.

The workflow follows GitHub's custom Pages deployment pattern and publishes `dist/client`.

## Recommended data architecture

### Phase 1 — static-first

Keep GitHub Pages as the presentation layer. A scheduled GitHub Actions job should:

1. Pull public Sleeper league, roster, draft, transaction, matchup, and player data.
2. Preserve immutable raw snapshots by season and week.
3. Normalize teams, players, picks, trades, settings, and matchups.
4. Run the Python grading and analytics pipeline.
5. Write sanitized, versioned JSON under `public/data/`.
6. Rebuild and publish the React app.

This is the right starting point because Sleeper's public league endpoints do not require a browser session, the site has no write transactions, and weekly processing is small. Store any paid-source keys in GitHub Actions secrets; never expose them in client-side JavaScript.

### Phase 2 — scheduled production pipeline

When Tuesday stories and the forecast model become production features:

- **Cloud Scheduler** triggers a Tuesday job.
- **Cloud Run Job** executes ingestion, validation, feature engineering, simulation, and story generation.
- **BigQuery** stores raw snapshots, canonical weekly facts, model features, predictions, and historical trends.
- **Cloud Storage** publishes only the compact JSON files needed by the public app.
- GitHub Pages remains the inexpensive static frontend.

Recommended logical layers:

- `raw`: untouched source snapshots with retrieval timestamps
- `canonical`: teams, players, rosters, picks, trades, matchups, settings
- `analytics`: grades, lineup efficiency, luck, roster strength, projections
- `narratives`: structured claims, evidence, source links, generated commentary
- `presentation`: versioned JSON optimized for the React app

## Forecast model roadmap

The first useful model should be a weekly Monte Carlo season simulation using:

- Actual record and points
- Remaining schedule
- Projected starting-lineup strength
- Player availability and role uncertainty
- Team-level scoring variance

Publish playoff odds, expected final record, median finish, finish-position distribution, and the change in each metric from the prior week. Preserve every weekly prediction so the app can show whether each team's outlook is rising or falling over time.

## Current data note

Draft editorial and trade-adjusted grades remain in `src/Prototype.tsx`. Generated roster metrics, full redraft boards, draft status, and the linked 2025 league results live in `src/generated/league-insights.json`. The next engineering pass should merge both into a single versioned pipeline artifact so Tuesday refreshes require no hand-edited frontend data.
