# Ape's Mac Salad — Project Context

> **Reference document — not the plan of record.** [MASTER_PLAN.md](MASTER_PLAN.md) governs. The durable product decisions below remain binding; the “next recommended build sequence” is superseded by MASTER_PLAN.md §6.

## Product

**Ape's Mac Salad** is a responsive, editorial-style website for the 12-team **Ape Invitational Dynasty** fantasy-football league. It is meant to feel like a league magazine rather than an admin dashboard: readable on a phone, useful on desktop, opinionated, and grounded in transparent inputs.

The live product has four destinations:

1. **Draft Recap** — draft-cycle grades, pick-level commentary, capital accounting, and the inaugural draft recipient of Ape's Mac Salad.
2. **Power Rankings** — a separate 2026 roster-viability product: scoring outlook, lineup strength, depth, positional construction, volatility proxies, dynasty quality, and three-year runway. It must never duplicate the Draft Recap dossier.
3. **Matchups** — the eventual Tuesday weekly recap and the permanent Hall of Mac.
4. **Forecast** — the eventual season projection, probability, and trend product.

## Durable product decisions

- The website is a normal responsive site, never a phone mockup inside a browser or phone.
- Keep informative labels at **12 px or larger** and editorial copy at **14 px or larger**.
- League settings used in analysis: **12 teams, 1QB, half-PPR, no TE premium, 2 RB, 2 WR, 1 TE, 3 FLEX**, plus kicker and defense. Dynasty and current-year views should respect this format; QB receives a 1QB discount and RB/WR depth matters.
- Draft-cycle grades are computed from **60% pick execution, 30% capital management, and 10% roster fit**. Pick grades and the overall execution calculation must use the same nonlinear value-ratio logic.
- Power grades are roster grades, not a forced rank curve and not draft grades. They must be explainable from visible components.
- Ape's Mac Salad is a recurring award. The highest draft grade received the inaugural serving; future weekly servings are awarded after the Tuesday matchup review. Each confirmed serving counts once in the current season's Hall of Mac. The annual serving leader receives the **Kong Mac Salad Award**; unresolved ties remain co-leaders.
- The trophy is a genuinely transparent illustration of a clear plastic to-go container with pale, extra-creamy, mayo-forward elbow macaroni—no red or green ingredients.

## Existing implementation

- Frontend: React + TypeScript + Vite, in this directory.
- Hosting intent: Netlify from the GitHub repository `alexanderjohnson2011-cpu/-fantasy-sports-projects`; intended public site `https://apesmacsalad.netlify.app`.
- The local git repository currently has no configured remote. Confirm repository naming and deployment wiring before assuming that a local commit has reached Netlify.
- League analysis pipeline: sibling directory `../sleeper_work/`.
- Frontend bridge: `scripts/build-league-insights.mjs` reads the latest normalized analyst output and writes `src/generated/league-insights.json`.

## Last known analytical state

- The original draft snapshot was live/paused at 45 of 48 picks on 2026-08-20.
- The report's source data had Terry Tate's Pain Train (Alex) ranked #10 in roster power and graded A on pure pick execution. Subsequent in-app work made draft-cycle results trade-aware and separated them from Power Rankings.
- The current analysis report, editorial grades, grading caveats, and source record are retained under `docs/source-analysis/` in the project handoff archive.

## Next recommended build sequence

The live Netlify site remains the presentation layer. The GCP implementation and Netlify publication contract are specified in [WEEKLY_LEAGUE_INTELLIGENCE_GCP_PIPELINE_IMPLEMENTATION_PLAN.md](WEEKLY_LEAGUE_INTELLIGENCE_GCP_PIPELINE_IMPLEMENTATION_PLAN.md).

1. Establish the GCP control plane, immutable raw snapshots, and canonical Sleeper history.
2. Add the checksum-validated GCP-to-Netlify release bridge.
3. Ingest projections, NFL events, injuries, schedules, odds, and market context.
4. Ship reconciled weekly matchup timelines and descriptive recap drafts.
5. Add calibrated season simulation with displayed uncertainty and legal ideal lineups.
6. Establish Tuesday automation after Monday football is final.
7. Add weekly serving records to Hall of Mac only after the editorial winner is confirmed.

See [DATA_PROVENANCE.md](DATA_PROVENANCE.md) and [SEASON_FORECASTING_ROADMAP.md](SEASON_FORECASTING_ROADMAP.md).
