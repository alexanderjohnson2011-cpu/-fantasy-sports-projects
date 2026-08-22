-- canonical_ddl.sql — BigQuery DDL for Bitemporal Canonical Layer (Phase P3)
-- Project: apes-mac-salad | Dataset: canonical

-- 1. Player Master & Status Flags
CREATE TABLE IF NOT EXISTS `apes-mac-salad.canonical.players` (
  player_id STRING NOT NULL,
  first_name STRING,
  last_name STRING,
  full_name STRING,
  position STRING,
  nfl_team STRING,
  age INT64,
  status STRING,
  gsis_id STRING,
  fantasycalc_id STRING,
  observed_at_utc TIMESTAMP NOT NULL,
  valid_from_utc TIMESTAMP NOT NULL,
  valid_to_utc TIMESTAMP,
  content_hash STRING NOT NULL,
  source_snapshot_id STRING NOT NULL,
  parser_version STRING NOT NULL,
  ingest_run_id STRING NOT NULL
)
PARTITION BY DATE(observed_at_utc)
CLUSTER BY position, nfl_team, player_id;

-- 2. Roster States
CREATE TABLE IF NOT EXISTS `apes-mac-salad.canonical.roster_states` (
  league_id STRING NOT NULL,
  roster_id INT64 NOT NULL,
  owner_id STRING,
  starters ARRAY<STRING>,
  players ARRAY<STRING>,
  taxi ARRAY<STRING>,
  reserve ARRAY<STRING>,
  wins INT64,
  losses INT64,
  ties INT64,
  fpts FLOAT64,
  ppts FLOAT64,
  observed_at_utc TIMESTAMP NOT NULL,
  valid_from_utc TIMESTAMP NOT NULL,
  valid_to_utc TIMESTAMP,
  content_hash STRING NOT NULL,
  source_snapshot_id STRING NOT NULL,
  parser_version STRING NOT NULL,
  ingest_run_id STRING NOT NULL
)
PARTITION BY DATE(observed_at_utc)
CLUSTER BY league_id, roster_id;

-- 3. Matchup Results
CREATE TABLE IF NOT EXISTS `apes-mac-salad.canonical.matchup_results` (
  league_id STRING NOT NULL,
  season STRING NOT NULL,
  week INT64 NOT NULL,
  matchup_id INT64,
  roster_id INT64 NOT NULL,
  opponent_roster_id INT64,
  points FLOAT64,
  starters ARRAY<STRING>,
  starter_points ARRAY<FLOAT64>,
  players ARRAY<STRING>,
  custom_points FLOAT64,
  observed_at_utc TIMESTAMP NOT NULL,
  valid_from_utc TIMESTAMP NOT NULL,
  valid_to_utc TIMESTAMP,
  content_hash STRING NOT NULL,
  source_snapshot_id STRING NOT NULL,
  parser_version STRING NOT NULL,
  ingest_run_id STRING NOT NULL
)
PARTITION BY DATE(observed_at_utc)
CLUSTER BY league_id, season, week, roster_id;

-- 4. Transactions (Trades, Waivers, FAAB)
CREATE TABLE IF NOT EXISTS `apes-mac-salad.canonical.transactions` (
  transaction_id STRING NOT NULL,
  league_id STRING NOT NULL,
  status STRING NOT NULL,
  type STRING NOT NULL, -- trade, waiver, free_agent
  creator_id STRING,
  consenter_ids ARRAY<STRING>,
  adds JSON, -- map of player_id -> roster_id
  drops JSON, -- map of player_id -> roster_id
  draft_picks ARRAY<JSON>,
  waiver_budget ARRAY<JSON>,
  status_updated_at TIMESTAMP,
  observed_at_utc TIMESTAMP NOT NULL,
  valid_from_utc TIMESTAMP NOT NULL,
  valid_to_utc TIMESTAMP,
  content_hash STRING NOT NULL,
  source_snapshot_id STRING NOT NULL,
  parser_version STRING NOT NULL,
  ingest_run_id STRING NOT NULL
)
PARTITION BY DATE(observed_at_utc)
CLUSTER BY league_id, type, transaction_id;

-- 5. Draft Picks
CREATE TABLE IF NOT EXISTS `apes-mac-salad.canonical.draft_picks` (
  draft_id STRING NOT NULL,
  pick_no INT64 NOT NULL,
  round INT64 NOT NULL,
  draft_slot INT64 NOT NULL,
  roster_id INT64 NOT NULL,
  player_id STRING,
  picked_by STRING,
  is_keeper BOOL,
  metadata JSON,
  observed_at_utc TIMESTAMP NOT NULL,
  valid_from_utc TIMESTAMP NOT NULL,
  valid_to_utc TIMESTAMP,
  content_hash STRING NOT NULL,
  source_snapshot_id STRING NOT NULL,
  parser_version STRING NOT NULL,
  ingest_run_id STRING NOT NULL
)
PARTITION BY DATE(observed_at_utc)
CLUSTER BY draft_id, round, pick_no;

-- 6. Market Values (FantasyCalc)
CREATE TABLE IF NOT EXISTS `apes-mac-salad.canonical.market_values` (
  player_id STRING NOT NULL,
  player_name STRING NOT NULL,
  position STRING,
  is_dynasty BOOL NOT NULL,
  dynasty_value FLOAT64,
  redraft_value FLOAT64,
  overall_rank INT64,
  position_rank INT64,
  trend_30_day FLOAT64,
  observed_at_utc TIMESTAMP NOT NULL,
  valid_from_utc TIMESTAMP NOT NULL,
  valid_to_utc TIMESTAMP,
  content_hash STRING NOT NULL,
  source_snapshot_id STRING NOT NULL,
  parser_version STRING NOT NULL,
  ingest_run_id STRING NOT NULL
)
PARTITION BY DATE(observed_at_utc)
CLUSTER BY position, is_dynasty, player_id;

-- 7. Expert Rankings (Consensus)
CREATE TABLE IF NOT EXISTS `apes-mac-salad.canonical.expert_rankings` (
  player_name STRING NOT NULL,
  position STRING,
  consensus_rank INT64 NOT NULL,
  tier INT64,
  ecr_spread FLOAT64,
  sources_count INT64,
  observed_at_utc TIMESTAMP NOT NULL,
  valid_from_utc TIMESTAMP NOT NULL,
  valid_to_utc TIMESTAMP,
  content_hash STRING NOT NULL,
  source_snapshot_id STRING NOT NULL,
  parser_version STRING NOT NULL,
  ingest_run_id STRING NOT NULL
)
PARTITION BY DATE(observed_at_utc)
CLUSTER BY position, consensus_rank;

-- 8. Player Crosswalk Engine
CREATE TABLE IF NOT EXISTS `apes-mac-salad.canonical.player_crosswalk` (
  sleeper_id STRING NOT NULL,
  gsis_id STRING,
  fantasycalc_id STRING,
  fantasypros_id STRING,
  full_name STRING NOT NULL,
  position STRING NOT NULL,
  nfl_team STRING,
  last_updated_utc TIMESTAMP NOT NULL
)
CLUSTER BY sleeper_id, gsis_id;
