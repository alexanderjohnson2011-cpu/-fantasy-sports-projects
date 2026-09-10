# Draft and publication contracts

All timestamps are ISO 8601 UTC. IDs are opaque strings. Every calculated recommendation is reproducible from its event ledger, strategy, and simulation seed.

## LeagueConfig

`publicationId`, `displayName`, `platform`, `externalLeagueKey`, `season`, `userTeamKey`, `userSlot`, `numTeams`, `rounds`, `scoring`, `rosterSlots`, `settingsHash`, `privacyPolicy`, and `providerBindings`.

`externalLeagueKey`, `userTeamKey`, and `userSlot` are local/private until a platform authorization and privacy review permit a sanitized transform. They are never required for a public release.

## ProviderSnapshot

`snapshotId`, `publicationId` (nullable only for a shared/global capture), `scope` (`global` or `publication`), `provider`, `fetchedAt`, `checksum`, `publicAllowed`, `publicUseClass`, `attribution`, `parserVersion`, `sourceUri`, `status`, and `detail`. Raw content is immutable; a sidecar carries the same identity and rights metadata. Secrets, manager identities, and private chat are not snapshots.

## ProjectionRecord

`canonicalPlayerId`, `publicationId`, `provider`, `asOf`, `statLine`, `leaguePoints`, `rank`, `tier`, `uncertainty`, `sourceSnapshotId`. Rankings, ADP, market values, and numeric projections remain distinct signal types. Shared ADP and market values use `MarketSignal`, not this contract, so no league-specific Yahoo score is reused by Ape's Mac Salad.

## MarketSignal

`canonicalPlayerId`, optional `publicationId`, `scope`, `provider`, `signalType` (`adp`, `marketValue`, `marketRank`, or `trend`), `asOf`, `value`, `rank`, `trend30Day`, and `sourceSnapshotId`.

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
