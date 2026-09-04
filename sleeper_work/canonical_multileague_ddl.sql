-- League/provider extensions for the shared canonical layer.
CREATE TABLE IF NOT EXISTS `apes-mac-salad.canonical.league_configs` (
  publication_id STRING NOT NULL,
  platform STRING NOT NULL,
  external_league_key STRING NOT NULL,
  season INT64 NOT NULL,
  league_name STRING,
  scoring JSON,
  roster_slots JSON,
  settings_hash STRING NOT NULL,
  privacy_policy STRING NOT NULL,
  observed_at_utc TIMESTAMP NOT NULL,
  source_snapshot_id STRING NOT NULL
)
PARTITION BY DATE(observed_at_utc)
CLUSTER BY publication_id, platform, season;

CREATE TABLE IF NOT EXISTS `apes-mac-salad.canonical.provider_snapshots` (
  snapshot_id STRING NOT NULL,
  publication_id STRING NOT NULL,
  provider STRING NOT NULL,
  fetched_at_utc TIMESTAMP NOT NULL,
  checksum STRING NOT NULL,
  public_allowed BOOL NOT NULL,
  attribution STRING,
  parser_version STRING NOT NULL,
  raw_uri STRING NOT NULL
)
PARTITION BY DATE(fetched_at_utc)
CLUSTER BY publication_id, provider;

CREATE TABLE IF NOT EXISTS `apes-mac-salad.canonical.player_crosswalk_v2` (
  canonical_player_id STRING NOT NULL,
  sleeper_id STRING,
  yahoo_id STRING,
  gsis_id STRING,
  fantasypros_id STRING,
  fantasycalc_id STRING,
  rotowire_id STRING,
  full_name STRING NOT NULL,
  position STRING NOT NULL,
  nfl_team STRING,
  match_method STRING NOT NULL,
  match_confidence FLOAT64 NOT NULL,
  quarantined BOOL NOT NULL,
  last_updated_utc TIMESTAMP NOT NULL
)
CLUSTER BY canonical_player_id, yahoo_id, gsis_id;

CREATE TABLE IF NOT EXISTS `apes-mac-salad.canonical.projections` (
  publication_id STRING NOT NULL,
  canonical_player_id STRING NOT NULL,
  provider STRING NOT NULL,
  as_of_utc TIMESTAMP NOT NULL,
  stat_line JSON,
  league_points FLOAT64,
  rank INT64,
  tier INT64,
  uncertainty FLOAT64,
  source_snapshot_id STRING NOT NULL
)
PARTITION BY DATE(as_of_utc)
CLUSTER BY publication_id, provider, canonical_player_id;

CREATE TABLE IF NOT EXISTS `apes-mac-salad.analytics.draft_recommendation_runs` (
  run_id STRING NOT NULL,
  publication_id STRING NOT NULL,
  session_id STRING NOT NULL,
  pick_no INT64 NOT NULL,
  generated_at_utc TIMESTAMP NOT NULL,
  strategy STRING NOT NULL,
  simulations INT64 NOT NULL,
  calculation_ms FLOAT64 NOT NULL,
  recommendation JSON NOT NULL,
  evidence_ids ARRAY<STRING>
)
PARTITION BY DATE(generated_at_utc)
CLUSTER BY publication_id, session_id, pick_no;
