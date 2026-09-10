# Moosey's Mommy: Draft-Night Support Handoff

This document is for the next agent supporting the user during the live Yahoo draft. Be concise, decision-focused, and do not interrupt the user during a one-minute pick clock.

## Immediate live status

- Local room: `http://127.0.0.1:4173/#draft-room`
- API health: `http://127.0.0.1:8787/api/health`
- Current fallback: **Manual Safe Mode**. This is intentional because Yahoo OAuth/API approval is still pending.
- At the last verified screen check, the ledger was empty at Pick 1 / Round 1 and the room was configured for 14 teams and a 60-second clock.
- **Ask for or verify the user's draft slot and total rounds immediately.** They were still pending on the last screen check. Future-pick availability, turn-corner math, and roster simulations are not reliable until both are saved in **Open setup**.

Do not treat a displayed recommendation as a completed pick. The user must record only the player actually selected in Yahoo.

## League configuration

| Setting | Value |
|---|---|
| League | Wooglin's Warriors |
| Platform | Yahoo, private league |
| Teams | 14 |
| Draft | Live standard snake; 60 seconds per pick; keeper tools enabled |
| Scoring | Head-to-head; fractional and negative scoring; half PPR |
| Starters | QB, WR, WR, RB, RB, TE, W/R/T, K, DEF |
| Bench / IR | 6 bench, 2 IR |
| Passing | 1 pt / 25 yards; 4 per TD; -2 per interception |
| Rushing / receiving | 1 pt / 10 yards; 6 per TD; 0.5 per reception |
| League-specific scoring | 1 pt / 33.3 return yards; 6 return TD; 0.5 rushing first down; -2 lost fumble |
| Kicker scoring | 3/3/3/4/5 for 0–19/20–29/30–39/40–49/50+ yard FGs; 1 XP |
| Defense | 2 sacks, 2 interceptions, 2 fumble recoveries, 6 TD, 2 safety/block, 0.5 three-and-outs, points-allowed bands imported in setup |

The persisted setup contains the full custom scoring list. Do not replace it with generic half-PPR scoring.

## Draft-night operating procedure

1. Keep Yahoo and Moosey's Mommy side-by-side.
2. In Moosey's Mommy, use **Open setup** to verify: draft slot, rounds, 14 teams, scoring, roster slots, and Balanced/Floor/Upside strategy.
3. Click **Refresh sources** once before the opening pick if time permits. It refreshes local market/ADP/news/identity inputs; it does not interact with Yahoo.
4. As Yahoo announces each selection, search the player and press **Record**. The assistant calculates the current pick's snake slot automatically.
5. If a player was recorded incorrectly, use **Undo last** immediately. Use **Correct pick** only for a specific earlier pick; verify the pick number and player first.
6. Re-read the primary recommendation and the alternatives after every recorded pick. The deterministic engine owns the numerical recommendation; AI copy only explains it.
7. Use **Export backup** and **Export ChatGPT packet** periodically. The latter is a sanitized handoff packet for another ChatGPT/Codex agent.

Never automatically submit a Yahoo draft selection. This app is read-only with respect to Yahoo.

## What to recommend

Default strategy is **Balanced**. Explain recommendations in this order:

1. Expected final-roster gain versus the best alternative.
2. Position-specific drop-off and whether the player is likely to survive to the next user pick.
3. Roster need, positional runs, bench/upside weight, injury/news uncertainty, and only then bye concentration.
4. Qualitative context: aggregate market disagreement, attributable RSS headline metadata, uncertainty, and what is *not* known.

Do not present ADP, market values, rankings, or an RSS headline as a stat-line projection. Do not invent beat-reporter reports, depth-chart facts, injuries, or expert opinions that are not in the board/dossier.

The player dossier is opened by clicking a player. It provides positive case, cautions, market synthesis, source boundaries, and any permitted RotoWire RSS metadata. The **AI take** column uses Vertex only when configured; otherwise it returns deterministic fallback prose. It must never alter the underlying numeric recommendation.

## Sources and rights boundaries

| Source | Draft-room use | Public-site rule |
|---|---|---|
| Yahoo Fantasy Sports API | League truth only after OAuth approval | Team-name-only transform needs approval |
| Fantasy Football Calculator | ADP | Attribution required |
| FantasyCalc | Market value/rank/trend | Private unless redistribution rights are confirmed |
| nflverse | Player identity and permitted historical/model inputs | Attribution required |
| RotoWire RSS | Headline, timestamp, link, supplied reporter only | Never store/summarize article body or subscriber analysis |
| FantasyPros | Optional licensed/private projections or consensus | Never feed public release with a prototype key |
| Vertex Gemini | Explanation and private chat, not a sports-data source | Never publish private chat |

Do **not** scrape, automate, or use browser/cookie-based extraction from Yahoo's draft room. Yahoo synchronization must use the approved OAuth Fantasy Sports API; until then Manual Safe Mode is the sanctioned fallback.

## Yahoo API activation later

When Yahoo approval arrives:

1. Save client ID/secret only through the local setup flow; never paste them into source, logs, chat packets, GCS, BigQuery, or frontend assets.
2. Complete the local OAuth authorization-code flow.
3. Discover the league/team key through `/api/leagues` and inspect settings through `/api/leagues/{league_key}/inspect`.
4. Rehearse `/api/yahoo/sync`. The service reconciles matching manual picks with Yahoo picks. Any mismatch retains manual mode and requires an explicit correction.
5. Poll only through the authenticated API; do not create an unofficial Yahoo integration.

## Technical quick reference

| Need | Local endpoint / control |
|---|---|
| Health | `GET /api/health` |
| Current full state | `GET /api/draft/state` |
| Refresh local sources | `POST /api/sources/refresh` |
| Manual pick | `POST /api/draft/manual-picks` |
| Undo | `POST /api/draft/undo` |
| Correction | `POST /api/draft/correct` |
| Player dossier | `GET /api/players/{player_id}/dossier` |
| AI player take | `POST /api/players/{player_id}/ai-take` |
| Backup / ChatGPT packet | UI buttons or `POST /api/analysis/export` |

The room should already be running. If it is not, use `scripts/start-draft-room.ps1`; it starts the FastAPI service on `127.0.0.1:8787` and Vite on `127.0.0.1:4173`. Do not stop or restart the service mid-draft unless it is actually unavailable. Keep the laptop powered and sleep disabled.

## Guardrails for the support agent

- Do not record, undo, correct, or export picks without the user's explicit instruction or confirmation of the actual Yahoo selection.
- Do not deploy, upload to GCS, apply BigQuery DDL, or activate paid/credentialed providers during the live draft.
- Do not expose manager names, Yahoo IDs, tokens, client secrets, refresh tokens, local paths, or private chat in any public artifact.
- Do not modify the public Ape's Mac Salad experience while supporting the draft room.
- If the local service fails, use the most recent exported HTML/JSON emergency board and keep a manual ledger. Resume from the confirmed last pick; do not guess missing selections.

## After the draft

Preserve the event ledger and export a final ChatGPT packet. Wait for the user's approval before publishing any Moosey's Mommy data. The public site must contain team names only and must exclude Yahoo identifiers, manager names, credentials, restricted source fields, RotoWire article text, and private AI chat.
