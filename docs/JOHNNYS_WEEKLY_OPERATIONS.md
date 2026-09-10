# Johnny's Jerks Weekly Operations

## What works now

Johnny's Jerks has one repeatable local refresh command:

```bash
cd /path/to/ape-invitational-almanac
npm run pipeline:johnny
```

That command:

1. Pulls the current league, draft, picks, rosters, and users from Sleeper.
2. Pulls and validates all 14 exact regular-season matchup weeks.
3. Regenerates power rankings, the current matchup previews, and the seeded 10,000-run season forecast.
4. Builds the Johnny's Jerks production site into `dist/johnnys-jerks/`.

Run it once each Tuesday after stat corrections and again after material injury, depth-chart, or projection changes. The command is read-only against Sleeper.

## During games

The Matchups screen calls Sleeper's current-week matchup endpoint when it opens, every 60 seconds while it remains open, and whenever the tab becomes visible again. The live number is the official Sleeper team score.

The following values are still pregame snapshots and intentionally do not change when the live score moves:

- opening win probability;
- projected final score;
- tactical commentary;
- projected starter list.

A defensible in-game probability needs each team's current score plus conditional remaining-player distributions, player game status, and correlations. The existing GCP implementation plan already specifies this richer live layer; do not relabel the opening model as live until it is implemented and calibrated.

## Schedule and TV data

- Sleeper is authoritative for fantasy pairings, current week, rosters, starters, and fantasy scoring.
- The full Weeks 1–14 fantasy schedule is captured in `sleeper_work/fixtures/sleeper_schedule_1401673232670539776_2026.json` one directory above this repository.
- Sleeper does not provide NFL broadcast networks. Week 1 currently uses a captured official NFL schedule.
- nflverse can automate NFL game teams and kickoff times, but its schedule file does not include the television-network field. Weekly broadcast automation therefore needs an approved official or commercial broadcast feed.

If no trusted NFL schedule fixture exists for the current week, the UI should show that the TV guide is pending instead of inventing networks or kickoff windows.

## Cloud automation status

The GCP/Netlify architecture and scheduled GitHub workflow have been diagnosed and repaired:

- **Cloud Scheduler & Cloud Run**: Diagnosed why scheduled runs failed in GCP with status code 7 (`PERMISSION_DENIED`). Added `roles/run.invoker` to `ams-capture` on `ams-capture-job` in Terraform and applied it. Successfully executed the Cloud Run job, verifying that it now runs unattended and writes raw capture runs to `gs://apes-mac-salad-raw-prod`.
- **Workload Identity Federation**: Configured GitHub-to-GCP Workload Identity Federation in GCP (`projects/1097821806660/locations/global/workloadIdentityPools/github-actions-pool/providers/github-actions-provider`), bound `roles/iam.workloadIdentityUser` to `ams-pipeline`, and enabled keyless authentication for GitHub Actions repo `alexanderjohnson2011-cpu/-fantasy-sports-projects`.
- **Repository Credential**: Generated a dedicated service account key for `ams-pipeline` (`ams-pipeline-key.json`) as a fallback for repository secret `GCP_SA_KEY`.
- **Pipeline Relocation**: Moved Johnny's capture adapter, recap builder, and full suite of fixtures directly under `sleeper_work/` inside the repository. Fixed relative paths and updated `package.json` to execute cleanly without `cd ..`.
- **Focused Tests**: Added `tests/test_johnnys_pipeline.py` verifying 14 regular-season weeks, 6 pairings/12 rosters per week, 192 draft picks, 4 output JSON artifacts, and TV schedule fallback contracts.
- **Dual-Auth GitHub Workflow**: Updated `.github/workflows/weekly-refresh.yml` with `id-token: write` permissions, dual WIF/Key authentication, and automated Johnny's Jerks capture and build steps.

## Weekly verification

After the command completes, verify:

```powershell
npm run check:runtime
npm run build:johnny
```

Data gates:

- 14 regular-season weeks;
- 6 pairings and 12 unique rosters in every week;
- current matchup artifact week equals Sleeper's current leg;
- forecast says `johnnys-forecast-v3` and names the exact Sleeper schedule basis;
- TV windows are either sourced for the current week or clearly marked pending;
- Matchups screen loads with no browser-console errors.
