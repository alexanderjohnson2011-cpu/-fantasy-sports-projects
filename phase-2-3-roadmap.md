# Ape's Mac Salad — Phase 2 & 3 Roadmap

Phase 1 is the correctness pass: one ranking authority, derived draft ordering, draft-award gating, and factual copy cleanup. This document intentionally defers the richer weekly data and simulation system so those features are built on a trustworthy base.

## Phase 2 — Weekly data foundation and scoring integrity

### Goal
Build a repeatable weekly data pipeline that knows **what was knowable at each lineup decision point**, not just what the final box score says.

### 1. Canonical weekly snapshots
Capture immutable league snapshots at every meaningful NFL lineup window:

- Thursday kickoff window.
- Sunday early window (~1:00 ET).
- Sunday late window (~4:00/4:25 ET).
- Sunday night.
- Monday night and any other standalone games.
- Additional snapshot immediately before a player's kickoff when practical.

Each snapshot should retain:

- Sleeper roster and starter/bench state.
- Matchup score and projected score at that moment.
- Player game start time and whether the player is locked.
- Injury/status designation and timestamp of the latest status change.
- Available free agents / waiver context where useful.
- Projection source, projection timestamp, and source version.

This enables conclusions such as: “Player X was ruled out 15 minutes before kickoff, and the manager changed the lineup after the news” rather than treating the final lineup as if it had existed all week.

### 2. Source stack

**League truth**
- Sleeper API: league settings, rosters, starters, matchups, transactions, draft history, traded picks, playoff brackets, and prior-season results.

**NFL schedule / game state**
- Authoritative game schedule with kickoff timestamps, status, and final scores.
- Game summaries / play-by-play source capable of identifying late scoring swings and decisive real-world plays.

**Player availability**
- Injury reports and game-status updates with timestamps.
- Inactive lists and late pregame announcements.
- Role/depth-chart news when it materially changes expected workload.

**Projection / expert layer**
- At least one machine-readable weekly projection source for every fantasy-relevant player.
- Consensus/expert rankings where licensing and access permit.
- Preserve source timestamp so the model never uses information published after a lineup decision.

**Market / dynasty layer**
- FantasyCalc or the current market-value source for dynasty context.
- Dynasty values should inform roster strength and trade analysis, not directly substitute for weekly point projections.

### 3. Normalized data model
Suggested core entities:

- `league_snapshot`
- `matchup_snapshot`
- `roster_snapshot`
- `lineup_slot_snapshot`
- `player_week_snapshot`
- `nfl_game`
- `player_status_event`
- `projection_snapshot`
- `transaction_event`
- `fantasy_scoring_event`
- `source_provenance`

Every derived metric should be reproducible from stored inputs.

### 4. Lineup-decision model
For each starter/bench decision, calculate the best **legal and knowable** alternative at that time.

Do not penalize a manager for:

- News that broke after the relevant player locked.
- A replacement who had already started.
- A player who was not actually available in the league.
- A hindsight outcome that projections did not reasonably support.

Track separately:

- `actual_points`
- `optimal_hindsight_points`
- `optimal_decision_time_expected_points`
- `avoidable_expected_points_lost`
- `unavoidable_points_lost`

The weekly recap should emphasize decision quality rather than pure hindsight.

### 5. Validation and provenance
Before generated commentary can cite a fact:

1. The underlying entity IDs must resolve.
2. Game and player timestamps must be internally consistent.
3. Fantasy scoring must reconcile to Sleeper within an agreed tolerance.
4. Injury/status claims must include an observed timestamp and source.
5. Projection comparisons must use only projections available before the decision point.

If validation fails, omit the claim instead of allowing the narrative layer to guess.

### 6. Phase 2 outputs

- Reliable weekly matchup dataset.
- Time-aware lineup history.
- Player availability timeline.
- Expected-vs-actual scoring decomposition.
- Strength-of-schedule inputs.
- Data-quality report for every weekly run.
- Source freshness/provenance metadata available to the UI and narrative system.

### Phase 2 acceptance criteria

- A Week 1 matchup can be reconstructed from Thursday through Monday without relying on the final lineup alone.
- A late inactive announcement can be associated with the correct pre-kickoff decision window.
- Sleeper final scores reconcile with the stored player scoring inputs.
- The system can distinguish a bad lineup decision from an unlucky but defensible decision.
- No generated recap claim is published without validated structured evidence.

---

## Phase 3 — Simulation, weekly storytelling, and dynamic forecasts

### Goal
Turn the Phase 2 data into a league-specific forecasting and editorial engine that feels aware of how the fantasy week actually unfolded.

### 1. Weekly Monte Carlo simulation
Simulate every remaining fantasy matchup using player-level outcome distributions rather than static team totals.

Inputs should include:

- Current expected starters by kickoff window.
- Weekly player projections.
- Injury / availability probabilities.
- Role and workload uncertainty.
- NFL opponent and game environment.
- Bye weeks.
- League scoring settings.
- Three-FLEX roster construction.
- Correlation where it materially matters (QB/pass catcher, opposing shootout environments, etc.).

Outputs:

- Matchup win probability.
- Projected team score distribution.
- Expected record.
- Playoff probability.
- Bye probability if applicable.
- Championship probability.
- Median / percentile finish.
- Remaining schedule difficulty.

### 2. Ideal-but-realistic roster management in simulations
The simulation should not assume managers leave obviously inactive players in lineups forever, but it also should not grant perfect hindsight.

At each kickoff window:

- Re-evaluate only unlocked slots.
- Use information available at that timestamp.
- Optimize expected points subject to Sleeper lineup rules.
- Incorporate late injury announcements and replacement availability.

Maintain both:

- **Expected-management simulation:** reasonable lineup optimization.
- **Actual-manager simulation:** uses observed manager behavior once a lineup decision has occurred.

This allows the forecast to learn from the real week as games lock.

### 3. Event-aware weekly recap engine
Build the recap from structured “story candidates,” then let the language model write from those facts.

Candidate story events include:

- Lead changes by kickoff window.
- Win probability swings.
- Monday-night comebacks.
- Last-minute NFL scoring plays that flip a fantasy matchup.
- Upsets versus pre-week expectation.
- Huge bench decisions.
- Late inactive substitutions.
- Boom/bust performances.
- Narrow losses despite strong decision quality.
- Lucky wins despite poor lineup efficiency.

Example target behavior:

> A team entering Monday night down 17 with two 49ers left should be described as mounting a Monday-night comeback. If the winning fantasy points arrive on a late fourth-quarter 49ers play and the final margin is one point, the recap should explicitly recognize the dramatic timing and clutch finish.

The narrative model should never infer this from the final score alone; it should receive the timeline and validated swing events.

### 4. Weekly awards
Formalize the Ape's Mac Salad selection as a scored award rather than “highest points wins.”

Candidate components:

- Performance versus projection.
- Opponent strength.
- Upset magnitude.
- Lineup decision quality.
- Win-probability swing / comeback difficulty.
- Margin and drama bonus.
- Penalty for winning primarily because the opponent made an avoidable lineup mistake.

Persist every winner to Hall of Mac only after the week is final and validation passes.

The **Kong Mac Salad Award** remains the annual count of earned servings.

### 5. Power-ranking evolution
Power rankings should become a weekly model output with one canonical stored rank.

Track:

- Current rank.
- Previous-week rank.
- Rank delta.
- Current-year strength.
- Rest-of-season strength.
- Dynasty / three-year strength as a separate axis.
- Key reason for movement.

Do not allow the UI to independently recompute a second ordering.

### 6. AI / Gemini AISQL role
Use Gemini/AISQL for interpretation and structured analytical queries where it adds value, not for facts that can be deterministically calculated in SQL/code.

Good uses:

- Selecting the most interesting validated story angles.
- Summarizing why a ranking moved.
- Converting structured matchup events into readable recaps.
- Ad-hoc natural-language analysis over the normalized warehouse.

Keep deterministic:

- Fantasy scoring.
- Standings.
- Lineup legality.
- Projection math.
- Monte Carlo aggregation.
- Award component scores.
- Rank ordering.

### 7. Cost controls
Design for free/low-cost operation first:

- Cache external API responses.
- Store snapshots instead of repeatedly re-fetching historical data.
- Run expensive simulation only when inputs materially change or on scheduled checkpoints.
- Precompute structured facts before sending anything to an LLM.
- Send compact JSON evidence to the narrative model rather than full raw datasets.
- Use cheaper model calls for routine weekly copy and reserve stronger reasoning calls for exceptions / audits.

### 8. Observability
Every weekly run should record:

- Data sources successfully refreshed.
- Missing/stale sources.
- Snapshot timestamps.
- Simulation version and seed policy.
- Projection version.
- Number of simulations.
- Validation failures.
- Narrative claims suppressed because evidence was insufficient.

### Phase 3 acceptance criteria

- Forecast probabilities update coherently as Thursday/Sunday/Monday games lock.
- A late injury can change both the optimized lineup and simulated matchup odds without rewriting already-locked decisions.
- A one-point Monday-night comeback can be reconstructed and narrated from the actual event timeline.
- Weekly awards are reproducible from stored component scores.
- Power-rank changes have a single canonical rank and a traceable reason.
- Re-running a finalized week with the same stored inputs produces materially identical structured results.

---

## Recommended implementation order when resuming

1. Phase 2 schema + source provenance.
2. Sleeper weekly snapshot collector.
3. NFL schedule/game-time normalization.
4. Projection and injury/status snapshot collectors.
5. Decision-time lineup optimizer and validation suite.
6. Phase 3 player outcome distributions + Monte Carlo engine.
7. Progressive in-week simulation updates.
8. Structured story-event detector.
9. Weekly recap + Mac Salad award writer.
10. Weekly power-rank deltas and season forecast UI.

## Explicitly out of scope until Phase 2/3

- Polishing recap prose before event evidence exists.
- Using an LLM to calculate fantasy scores or standings.
- Treating final lineups as proof of what a manager knew earlier in the week.
- Building a sophisticated simulation on top of unversioned projections.
- Adding more ranking formulas in the browser.
