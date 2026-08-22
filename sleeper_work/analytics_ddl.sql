-- analytics_ddl.sql — BigQuery DDL for Analytics Layer (Phase P8)
-- Project: apes-mac-salad | Dataset: analytics

-- 1. Forecast Runs Metadata
CREATE TABLE IF NOT EXISTS `apes-mac-salad.analytics.forecast_runs` (
  forecast_run_id STRING NOT NULL,
  season STRING NOT NULL,
  as_of_week INT64 NOT NULL,
  observed_at_utc TIMESTAMP NOT NULL,
  input_cutoff_utc TIMESTAMP NOT NULL,
  simulations_count INT64 NOT NULL,
  random_seed INT64 NOT NULL,
  model_version STRING NOT NULL,
  convergence_status STRING NOT NULL,
  brier_score FLOAT64,
  log_loss FLOAT64
)
PARTITION BY DATE(observed_at_utc)
CLUSTER BY season, as_of_week, forecast_run_id;

-- 2. Season Projections
CREATE TABLE IF NOT EXISTS `apes-mac-salad.analytics.season_projections` (
  forecast_run_id STRING NOT NULL,
  league_id STRING NOT NULL,
  season STRING NOT NULL,
  roster_id INT64 NOT NULL,
  team_name STRING,
  manager_name STRING,
  expected_wins FLOAT64 NOT NULL,
  expected_losses FLOAT64 NOT NULL,
  expected_points_for FLOAT64 NOT NULL,
  playoff_probability FLOAT64 NOT NULL,
  bye_probability FLOAT64 NOT NULL,
  championship_probability FLOAT64 NOT NULL,
  last_place_probability FLOAT64 NOT NULL,
  projected_median_seed INT64 NOT NULL,
  observed_at_utc TIMESTAMP NOT NULL
)
PARTITION BY DATE(observed_at_utc)
CLUSTER BY season, roster_id, forecast_run_id;

-- 3. Calibration Reliability Records
CREATE TABLE IF NOT EXISTS `apes-mac-salad.analytics.calibration_metrics` (
  forecast_run_id STRING NOT NULL,
  target_event STRING NOT NULL, -- e.g. 'make_playoffs', 'win_title', 'win_matchup'
  probability_bin FLOAT64 NOT NULL,
  predicted_prob_mean FLOAT64 NOT NULL,
  observed_frequency FLOAT64 NOT NULL,
  sample_count INT64 NOT NULL,
  brier_score_contribution FLOAT64 NOT NULL,
  observed_at_utc TIMESTAMP NOT NULL
)
PARTITION BY DATE(observed_at_utc)
CLUSTER BY target_event;
