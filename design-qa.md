# Design QA — Ape Invitational Draft Almanac

## Comparison target

- Source visual truth: `/workspace/scratch/a3bc64eb5450/generated_images/exec-64cc2067-1876-4029-b696-b5f874c44ec7.png`
- Browser-rendered home screenshot: `/workspace/scratch/a3bc64eb5450/ape-invitational-almanac/implementation-home-final.jpg`
- Browser-rendered team-detail screenshot: `/workspace/scratch/a3bc64eb5450/ape-invitational-almanac/implementation-detail-scaled.jpg`
- Full-view comparison: `/workspace/scratch/a3bc64eb5450/ape-invitational-almanac/qa-comparison-home-final.jpg`
- Viewport/state: iPhone runtime, home screen at scroll position 0, light theme, 44 of 48 picks, Aug. 20 edition.

## Dimensions and normalization

- Source pixels: 852 × 1844. Intended source viewport: 390 × 844.
- Mobile runtime geometry: 393 × 852 CSS px, device pixel ratio 1.
- Cloud-browser stage capture: the protected phone runtime was visibly scaled to 361 × 782 CSS px to fit the available 1363 × 936 browser viewport.
- Implementation crop: 361 × 782 pixels.
- Density normalization: the source was downsampled to 361 × 782 and placed to the left of the unmodified browser crop in `qa-comparison-home-final.jpg`.
- The runtime-owned iOS status bar, Dynamic Island, bezel, and home indicator are expected differences from the frameless source mock. App-owned content was compared inside those constraints.

## Full-view comparison evidence

The final side-by-side comparison shows the same warm bone canvas, forest-green editorial ink, rust grading accent, serif-led hierarchy, league masthead, issue rule, lead-team anatomy, three-part grade score rule, board rows, hairline separators, and four-tab bottom navigation. The app deliberately uses the current permanent draft-cycle scores and commentary rather than the illustrative numbers in the visual mock.

Focused region comparison was not required: the selected source contains no photography, illustrations, dense chart axes, or complex image masking, and the masthead, lead story, scoring rule, board row, and navigation remain legible in the normalized full-view comparison. The league seal was also inspected independently at `public/assets/app/league-seal.png`.

## Required fidelity surfaces

- Fonts and typography: Cormorant Garamond recreates the high-contrast editorial serif; IBM Plex Sans Condensed carries labels, metrics, and navigation. Display scale, line height, italic commentary, condensed metadata, and text wrapping track the reference hierarchy.
- Spacing and layout rhythm: 24 px page gutters, sharp hairline sections, flat rows, restrained vertical rhythm, and fixed bottom navigation match the source. Content includes enough bottom padding to scroll clear of the overlaid footer on iPhone and Pixel 10.
- Colors and visual tokens: paper `#f6f2e9`, ink `#0b3329`, rust `#c44322`, sage `#dfe5d5`, and quiet translucent hairlines closely match the reference. No gradients or glass effects were introduced.
- Image quality and asset fidelity: the league seal is an exact raster crop from the selected visual target, recropped after the first comparison so the circular mark fills its intended slot. All UI icons come from Phosphor Icons; there are no handcrafted SVGs, emoji stand-ins, or placeholder art.
- Copy and content: the report uses the league's actual settings, permanent draft-cycle grades, pick provenance, expert/market capture, trade-capital outcomes, roster windows, and team-specific verdicts. Future Matchups and Forecast screens are clearly labeled as upcoming rather than presenting invented live results.

## Interaction and browser verification

- Opened the local preview in the Work Mode cloud browser.
- Tested the methodology screen and back navigation.
- Opened Final Boss from the lead story.
- Switched value-capture data from Expert board to Live market and verified the updated 118.5% result.
- Opened the Teams power board and then Bronco Stampede's incomplete dossier.
- Switched among Matchups, Forecast, and Almanac tabs.
- Verified the app visually on both iPhone and Pixel 10 runtime presets.
- Checked browser logs. No app-origin console errors were present; repeated metadata errors came only from the cloud-browser extension.
- `npm run check:runtime`, `npm run build`, and `npm run test:sites` passed.

## Comparison history

### Iteration 1

- [P2] Above-the-fold density was too loose: the initial implementation added an unrequested eyebrow and used an oversized lead-story block, leaving no team row visible above the fixed navigation.
- [P2] The league seal appeared undersized because the first raster crop included too much surrounding paper.
- Fixes: removed the extra eyebrow, tightened the lead-story grid, reduced lead typography and score padding, shortened the featured copy, reduced board-row height, and recropped the seal to its visible circular bounds.

### Iteration 2

- Post-fix evidence: `qa-comparison-home-final.jpg`.
- The first board row is now visible above the fixed navigation, the lead-story proportions track the reference, and the seal fills the masthead slot.
- No actionable P0, P1, or P2 issues remain.

## Follow-up polish

- [P3] The runtime-owned iOS status bar reduces the number of visible board rows compared with the frameless mock. This is an expected mobile-runtime difference; the full board remains reachable by scrolling.
- [P3] A future pass can add team marks or player imagery if the league supplies original brand assets, but the current design intentionally stays typographic.

## Implementation checklist

- [x] Faithful home screen
- [x] Working team dossiers for all 12 teams
- [x] Expert/market metric toggle
- [x] Grade-component charts
- [x] Pick provenance and capital context
- [x] League power board
- [x] Future Matchups and Forecast states
- [x] iPhone and Pixel 10 verification
- [x] Runtime, build, and hosting tests

final result: passed

---

# Design QA — Johnny’s Jerks Redraft Almanac

## Comparison target

- Source visual truth: live Ape’s Mac Salad power, power-detail, matchup-hub, and matchup-detail screens at `http://127.0.0.1:5176/`.
- Browser-rendered implementation: live Johnny’s Jerks screens at `http://127.0.0.1:5175/`.
- Viewport/state: desktop, light theme, generated 2026 Johnny’s Jerks data, Week 1.
- Evidence note: source and implementation full-page captures were emitted together in the Codex browser QA session. The in-app browser did not expose stable local screenshot paths, so the audited route URLs are recorded here.

## Re-evaluation findings

- [P1] Power-ranking rows mixed market-value inputs with 0–100 scores, producing unreadable five-digit values.
- [P1] Clicking a power row routed by ordinal rank into the draft-grade dossier, sometimes opening a completely different team.
- [P1] Matchup cards did not open previews and there was no TV schedule.
- [P1] The displayed “10,000-run Monte Carlo” forecast was a deterministic transform and showed hard-coded validation metrics.
- [P2] Matchup commentary repeated one generic Capri Sun template and selected a draft-value pick rather than the strongest projected starter.
- [P2] Power grades in the table defaulted to `B` because draft-grade fields were absent from power-ranking rows.

## Implemented corrections

- Split draft evaluation from current-season power. The power score is now 50% projected lineup, 25% usable depth, 15% top-five VORP ceiling, and 10% positional balance.
- Rebuilt the power board as card-based current-season profiles with meaningful 0–100 grades, lineup/depth ranks, volatility, weekly projection, simulation outlook, and roster-ID routing.
- Added dedicated power deep dives with component evidence, room ranks, strength/pressure commentary, health flags, concentration metrics, and a projected scoring spine.
- Added clickable matchup cards and dedicated previews with win odds, tactical variables, positional edges, projected starters, and chronological broadcast windows.
- Mapped TV windows to the official 2026 NFL Week 1 schedule and called out local-market limits for Sunday afternoon coverage.
- Replaced the forecast transform with a seeded 10,000-run weekly-score simulation, six-team playoff bracket, explicit schedule basis, and per-team forecast drill-downs.
- Replaced repeated matchup copy with matchup-specific commentary driven by spread, projected stars, positional edges, roster strengths, injuries, and the highest-leverage TV window.

## Browser and data verification

- Compared Ape’s Mac Salad and Johnny’s Jerks power hubs in one browser QA view.
- Compared both power-team deep dives in one browser QA view.
- Compared both matchup hubs in one browser QA view.
- Opened Johnny’s Jerks power rank #1 and confirmed the route remained on the same roster rather than opening a draft-ranked team.
- Opened the marquee matchup and confirmed all four sections rendered: tale of the tape, tactical swing factors, chronological TV guide, and projected starters.
- Opened a forecast team and confirmed the probability drill-down and schedule qualification rendered.
- Browser console: no warnings or errors.
- Generated-data integrity: 12 unique power teams, 6 matchups covering 12 unique rosters, 12 forecast teams, all 6 TV schedules chronological, 600.0 total playoff probability points, 100.1 title probability points, and 99.9 last-place probability points after one-decimal rounding.
- `python -m py_compile sleeper_work\\build_redraft_recap_payload.py` passed.
- `npm run build:johnny` passed.
- `npm run check:runtime` passed.

## Remaining notes

- The forecast now uses all 14 exact regular-season pairing weeks captured from Sleeper; the former balanced-rotation fallback has been removed.
- [P2] Live team scores refresh from Sleeper every 60 seconds while the page is open. Opening win odds and editorial analysis do not move in-game yet because that requires a remaining-player projection model.
- [P3] Sunday afternoon TV networks are shown as the scheduled carrier plus “local market” because actual availability depends on viewer location.

final result: passed
