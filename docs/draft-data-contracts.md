# Draft and publication contracts

All timestamps are ISO 8601 UTC. IDs are opaque strings. Every calculated recommendation is reproducible from its event ledger, strategy, and simulation seed.

## LeagueConfig

`publicationId`, `displayName`, `platform`, `externalLeagueKey`, `season`, `userTeamKey`, `userSlot`, `numTeams`, `rounds`, `scoring`, `rosterSlots`, `settingsHash`, `privacyPolicy`.

## ProviderSnapshot

`snapshotId`, `publicationId`, `provider`, `fetchedAt`, `checksum`, `publicAllowed`, `status`, `detail`, `localPath`. Raw content is immutable; a sidecar carries the same identity and rights metadata.

## ProjectionRecord

`canonicalPlayerId`, `provider`, `asOf`, `statLine`, `leaguePoints`, `rank`, `tier`, `uncertainty`, `sourceSnapshotId`. Rankings, ADP, market values, and numeric projections remain distinct signal types.

## DraftState and DraftEvent

Draft state contains the session, next overall pick, round, snake slot on the clock, user slot, synchronization mode, freshness, active events, and source states. An event contains `pickNo`, `round`, `teamSlot`, canonical/local player ID, source, provider event ID, observation time, and optional supersession time.

The `(sessionId, pickNo)` key is unique. Yahoo-confirmed picks replace a matching manual observation. A conflicting player stops automatic synchronization and requires correction.

## Recommendation

`candidate`, `utility`, `incrementalValue`, `vorp`, `futureAvailability`, `rosterNeed`, `uncertainty`, `evidenceIds`, `strategy`, `simulations`, `calculationMs`, `generatedAt`.

The numerical engine owns all fields. AI output may paraphrase these fields but cannot alter them.

## NewsItem

`canonicalPlayerId`, `headline`, `publishedAt`, `provider`, `sourceUrl`, and optional `reporter`. Article bodies and subscriber analysis are not part of this contract.

## PublicRelease

`schemaVersion`, `releaseId`, `publicationId`, `generatedAt`, `data`, plus a separate checksum manifest. The sanitizer rejects or removes manager identity, platform IDs, OAuth fields, secrets, chat history, and restricted providers.
