# Season Forecasting Roadmap

> **Reference document — not the plan of record.** [MASTER_PLAN.md](MASTER_PLAN.md) governs. The model design here remains the specification for phase P8; the architecture advice (GitHub Actions before GCP) is superseded by the corpus-first decision.

## Recommended approach

Build a transparent **simulation-based playoff forecast**, not a black-box “final standings” prediction. The first model should answer four useful questions for every manager:

- What is the expected win total and expected regular-season finish?
- What is the chance to make the playoffs, earn a bye, reach the final, and win the title?
- How much of last week was team strength versus opponent luck?
- Did this team's odds rise or fall since the prior Tuesday, and why?

The correct progression is descriptive statistics first, calibrated forecasting second, and narrative third.

## Phase 1 — weekly recap foundation

Run after final Monday scoring, ideally Tuesday morning Pacific.

For each week, pull Sleeper matchups, rosters, transactions, and playoff settings. Publish:

- actual score, opponent score, margin, win/loss, and current record;
- league median and all-play record (how often the score would beat every other team that week);
- points for, points against, potential points, optimal-lineup miss, bench points left behind, and schedule luck;
- roster changes and notable injuries/news inputs once a reliable injury source is selected;
- a human-confirmed **Ape's Mac Salad** winner and rationale.

This layer provides the data needed to evaluate whether forecasts are actually good.

## Phase 2 — a defensible weekly strength model

Estimate each team's weekly score as a distribution, not a single number.

```text
team-week mean = weighted roster prior + recent scored performance + lineup availability adjustment
team-week variance = baseline league variance + team historical variance + availability / concentration penalty
```

Suggested early-season weighting:

| Weeks complete | Roster/market prior | Actual scoring |
|---:|---:|---:|
| 0 | 100% | 0% |
| 1–2 | 65% | 35% |
| 3–5 | 45% | 55% |
| 6+ | 25% | 75% |

Use the market-implied lineup score only as an initial prior. After real games accumulate, replace it with actual median score, opponent-adjusted scoring, and potential points. Regularize extreme one-week scores toward the league mean so an outlier does not dominate the forecast.

### Volatility / fragility features

- historical standard deviation of weekly scores;
- share of projected score concentrated in the top 2–3 starters;
- number of viable lineup alternatives at each required position and FLEX;
- injury / bye / suspension availability flags;
- positional fragility, especially thin RB and QB rooms;
- boom/bust player mix, when a permissible projection source provides range or volatility data.

## Phase 3 — Monte Carlo season simulation

For each forecast refresh:

1. Create 10,000 simulated completions of the remaining Sleeper schedule.
2. Draw each team's weekly score from its current distribution; preserve team-specific mean and variance.
3. Apply the league's actual matchup, playoff, division, and tiebreaker rules from Sleeper settings.
4. Record final wins, standings, playoff seed, championship appearance, and title outcome.
5. Display median finish, 20th–80th percentile finish range, playoff / bye / title probability, and deltas versus the prior Tuesday.

Do **not** pretend each draw is independent if a single player's absence affects several teams or positions. Version 1 may use independent draws, but label it as such. Version 2 should add scenario shocks for high-impact quarterbacks, star running backs, and team-level availability.

## Evaluation and calibration

Track forecasts each week. A model that generates attractive numbers but cannot be evaluated will lose credibility.

- **Brier score:** calibration of playoff and title probabilities.
- **Log loss:** probability assigned to actual game and playoff outcomes.
- **MAE / RMSE:** predicted versus actual weekly team score.
- **Calibration chart:** e.g., teams at 60% playoff odds should make playoffs about 60% of the time over many seasons.
- **Backtest:** replay the 2025 season using only data available as of each historical week. Never leak end-of-season results into past forecasts.

Show an explicit `Model version`, `as-of date`, `data through Week N`, and a plain-language “why odds moved” explanation in the app.

## Practical architecture

Start simple:

```text
GitHub Actions schedule (Tuesday) → Python refresh job → versioned JSON in repo → Netlify deploy
```

Move to Google Cloud only when history, model runs, and data volume make git-hosted snapshots cumbersome:

```text
Cloud Scheduler → Cloud Run Job → Cloud Storage raw snapshots + BigQuery canonical/analytics tables → public JSON → Netlify
```

BigQuery is useful for multi-season matchup history and backtesting. It is not necessary to launch the first weekly recap.

## Data additions needed before a true forecast

| Need | Recommended source | Why |
|---|---|---|
| Weekly league outcomes | Sleeper matchups endpoint | Ground truth for score, record, schedule and evaluation |
| Current rosters / transactions | Sleeper | Captures real availability and manager behavior |
| Player projections | One licensed / permitted provider chosen deliberately | Needed for a genuine preseason/current-week scoring prior |
| NFL availability | Reliable injury/status feed | Needed for line-up mean and variance adjustments |
| Historical player and team outcomes | Sleeper league history plus a lawful NFL data source | Required for backtests and calibration |

Until a projection provider is chosen, label all current-year score outputs as **market-implied lineup strength**, not projected fantasy points.
