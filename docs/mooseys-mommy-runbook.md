# Moosey's Mommy operating runbook

This runbook separates the private draft-room runtime from the public league publication. The draft room binds to `127.0.0.1`, stores picks in a local ignored SQLite database, and never submits a selection to Yahoo.

## One-time setup

### 1. Install the local dependencies

From the repository directory:

```powershell
python -m pip install -r requirements-draft.txt
```

The added packages provide Windows Credential Manager integration and the Vertex AI Gemini client. The app still runs without either package: credentials remain in process memory and commentary falls back to deterministic text.

### 2. Create the Yahoo application

1. Open the Yahoo Developer Network dashboard and create an application.
2. Choose an installed/local application where that option is shown.
3. Request read-only Fantasy Sports access. Do not grant write access.
4. Use `oob` as the redirect URI for the verification-code flow.
5. Copy the client ID and client secret into the draft room's private setup panel.
6. Select **Save & open Yahoo**, approve access in Yahoo, paste the returned verification code, and select tonight's league.
7. Confirm the number of teams, draft rounds, and your snake-draft slot. Yahoo settings are inspected automatically; the slot stays explicit because it must be correct even when a pre-draft response omits the order.

The OAuth secret and rotating refresh token are written to Windows Credential Manager when `keyring` is installed. They are never written to `.env`, SQLite, the source tree, or a browser bundle.

### 3. Optional FantasyPros prototype feed

Request a free personal prototype key from FantasyPros and paste it into the private setup panel. The key is recorded separately from public releases. The current adapter deliberately reports a configuration warning until a licensed projections endpoint is supplied as `FANTASYPROS_PROJECTIONS_URL`; it does not guess an endpoint or redistribute the data.

### 4. Enable Gemini with existing GCP credits

The Google Cloud CLI is not currently installed on this laptop. Install it, then run:

```powershell
gcloud auth application-default login
gcloud services enable aiplatform.googleapis.com --project apes-mac-salad
```

Grant the signed-in user `Vertex AI User` on `apes-mac-salad`. Do not point this application at the Terraform administrator service-account JSON. Configure a small service spend cap where the billing account supports it, plus a budget alert. The application independently enforces 100 calls, 300,000 input tokens, and 30,000 output tokens per session.

## Start and stop

Start the room:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-draft-room.ps1
```

The script checks the protected site runtime, starts the API and web app in hidden background processes, verifies health, records only those process IDs, and opens `http://127.0.0.1:4173/#draft-room`.

Stop only those recorded processes:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/stop-draft-room.ps1
```

## T-minus rehearsal

1. Open the setup panel and finish Yahoo authorization and league selection.
2. Select **Refresh sources**. A failure degrades only that source; it does not block the draft.
3. Confirm the header shows the correct league, team count, user slot, and scoring format.
4. Use **Run 6-pick rehearsal**; verify that roster counts, recommendations, and survival probabilities change, then select **Clear rehearsal**.
5. Enter a pick number in **Correct pick**, select a replacement player, and then undo that test correction.
6. Select **Sync Yahoo**. If the API exposes the draft-results resource and stays within ten seconds of Yahoo, keep Yahoo mode. Otherwise use manual safe mode from pick one.
7. Select **Export backup** and open the resulting HTML board once.
8. Ask one chat question. A `gemini-3.1-flash-lite` answer confirms Vertex access; a clearly labeled deterministic answer remains safe for the draft.
9. Keep the laptop powered and disable sleep. Keep Yahoo in a separate browser tab.

## During the draft

- In manual mode, press **Record** for every player immediately after Yahoo announces the pick. The correct snake team slot is calculated from the pick number.
- In Yahoo mode, the browser checks local state every four seconds. Use **Sync Yahoo** if the status becomes stale; the API backs off rather than hammering Yahoo.
- A Yahoo/local conflict leaves the local ledger in manual mode and displays the mismatch. Correct the conflicting pick before trusting the next recommendation.
- **Undo last** reverses only the latest active event. The audit record remains in SQLite as a superseded event.
- Every manual pick, correction, undo, Yahoo-confirmed pick, and source refresh overwrites `draft_assistant/data/exports/mooseys-mommy-chatgpt-current.md` and its matching JSON. Upload the Markdown file to ChatGPT or press **Export ChatGPT packet** to refresh it on demand. The packet includes only draft settings, team slots, picks, roster state, source health, and the available/recommended board; it excludes secrets, Yahoo IDs, local paths, and chat history.
- The main card is the highest expected incremental roster value. “There at” percentages estimate survival to later user picks; they are not guarantees.
- If either app fails, open the timestamped emergency HTML file under `draft_assistant/data/exports`.

## API reference

- `GET /api/health` — process health and publication version.
- `GET /api/setup/status` — credential/dependency readiness without secret values.
- `POST /api/setup/credentials` — local secret storage.
- `GET /auth/yahoo/start`, `POST /auth/yahoo/exchange` — read-only OAuth flow.
- `GET /api/leagues`, `GET /api/leagues/{leagueKey}/inspect` — league discovery.
- `POST /api/setup/session` — league shape, draft slot, and strategy.
- `GET /api/draft/state` — ledger, recommendations, sources, and RSS news metadata.
- `POST /api/draft/manual-picks`, `/api/draft/correct`, `/api/draft/undo` — local event ledger.
- `POST /api/yahoo/sync` — import and reconcile Yahoo draft results.
- `POST /api/sources/refresh` — immutable provider captures and sidecars.
- `POST /api/analysis/export` — stable Markdown and JSON packet for private ChatGPT analysis.
- `POST /api/chat`, `/api/chat/stream` — capped commentary with deterministic fallback.
- `POST /api/offline/export` — timestamped JSON and standalone HTML boards.

## Post-draft public release

1. Reconcile the final Yahoo ledger and export a canonical input payload.
2. Add only approved team names. Do not add manager/account names.
3. Run `sleeper_work/build_public_release.py` with publication ID `mooseys-mommy` and output directory `public/data/mooseys-mommy`. Its recursive privacy gate removes manager/Yahoo/OAuth/chat fields and excludes sources without `publicAllowed: true`. The five public destinations consume the resulting `release.json` without a code change.
4. Build with `VITE_PUBLICATION_ID=mooseys-mommy`. Until verified league data is present, every public section remains in an explicit awaiting-import state and the Hall of Callers stays empty.
5. Create a separate Netlify site, use `npm run build` and `dist/client`, and make a preview deploy first.
6. Validate Draft Analysis, Power Rankings, Matchups, Forecast, Hall of Callers, mobile layout, checksums, and the absence of private fields.
7. Promote the same preview artifact to production. Retain the prior deploy for rollback.

The weekly award copy is **Gets to Call Moosey's Mommy**. Approved winners are appended to the **Hall of Callers**; they are never inferred or fabricated.
