-- features_ddl.sql — BigQuery DDL for Point-in-Time Feature Store (Phase P4)
-- Project: apes-mac-salad | Dataset: features

-- 1. Team Weekly Features
CREATE TABLE IF NOT EXISTS `apes-mac-salad.features.team_weekly_features` (
  league_id STRING NOT NULL,
  season STRING NOT NULL,
  week INT64 NOT NULL,
  roster_id INT64 NOT NULL,
  observed_at_utc TIMESTAMP NOT NULL,
  input_cutoff_utc TIMESTAMP NOT NULL,
  dynasty_total_value FLOAT64,
  redraft_lineup_value FLOAT64,
  depth_value FLOAT64,
  youth_value_share FLOAT64,
  future_firsts_count INT64,
  future_picks_3yr_count INT64,
  qb_room_score FLOAT64,
  rb_room_score FLOAT64,
  wr_room_score FLOAT64,
  te_room_score FLOAT64,
  lineup_efficiency_pct FLOAT64,
  bench_points FLOAT64,
  optimal_miss_points FLOAT64,
  feature_version STRING NOT NULL
)
PARTITION BY DATE(input_cutoff_utc)
CLUSTER BY league_id, season, week, roster_id;

-- 2. Player Weekly Features
CREATE TABLE IF NOT EXISTS `apes-mac-salad.features.player_weekly_features` (
  player_id STRING NOT NULL,
  season STRING NOT NULL,
  week INT64 NOT NULL,
  observed_at_utc TIMESTAMP NOT NULL,
  input_cutoff_utc TIMESTAMP NOT NULL,
  position STRING NOT NULL,
  nfl_team STRING,
  dynasty_value FLOAT64,
  redraft_value FLOAT64,
  trend_30_day FLOAT64,
  consensus_expert_rank INT64,
  expert_tier INT64,
  is_starter BOOL,
  roster_status STRING,
  feature_version STRING NOT NULL
)
PARTITION BY DATE(input_cutoff_utc)
CLUSTER BY position, player_id;
