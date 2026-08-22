-- as_of_functions.sql — Point-in-Time AS OF Table Functions for Canonical Layer (Phase P3)
-- Project: apes-mac-salad | Dataset: canonical

-- 1. AS OF Roster State
CREATE OR REPLACE TABLE FUNCTION `apes-mac-salad.canonical.as_of_roster_state`(as_of_time TIMESTAMP) AS
SELECT * FROM `apes-mac-salad.canonical.roster_states`
WHERE observed_at_utc <= as_of_time
QUALIFY ROW_NUMBER() OVER (
  PARTITION BY league_id, roster_id 
  ORDER BY observed_at_utc DESC
) = 1;

-- 2. AS OF Player Status
CREATE OR REPLACE TABLE FUNCTION `apes-mac-salad.canonical.as_of_player`(as_of_time TIMESTAMP) AS
SELECT * FROM `apes-mac-salad.canonical.players`
WHERE observed_at_utc <= as_of_time
QUALIFY ROW_NUMBER() OVER (
  PARTITION BY player_id 
  ORDER BY observed_at_utc DESC
) = 1;

-- 3. AS OF Market Value (FantasyCalc)
CREATE OR REPLACE TABLE FUNCTION `apes-mac-salad.canonical.as_of_market_value`(as_of_time TIMESTAMP, is_dynasty_val BOOL) AS
SELECT * FROM `apes-mac-salad.canonical.market_values`
WHERE observed_at_utc <= as_of_time
  AND is_dynasty = is_dynasty_val
QUALIFY ROW_NUMBER() OVER (
  PARTITION BY player_id, is_dynasty 
  ORDER BY observed_at_utc DESC
) = 1;

-- 4. AS OF Expert Rankings
CREATE OR REPLACE TABLE FUNCTION `apes-mac-salad.canonical.as_of_expert_ranking`(as_of_time TIMESTAMP) AS
SELECT * FROM `apes-mac-salad.canonical.expert_rankings`
WHERE observed_at_utc <= as_of_time
QUALIFY ROW_NUMBER() OVER (
  PARTITION BY player_name, position 
  ORDER BY observed_at_utc DESC
) = 1;
