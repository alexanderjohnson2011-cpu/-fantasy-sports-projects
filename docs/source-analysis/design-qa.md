# Design QA — Ape Invitational Draft Almanac

> **Historical.** QA performed against a mobile runtime the product decisions have since abandoned, citing scratch paths absent from this handoff. The palette and type tokens remain accurate product identity. [MASTER_PLAN.md](../MASTER_PLAN.md) governs.

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
