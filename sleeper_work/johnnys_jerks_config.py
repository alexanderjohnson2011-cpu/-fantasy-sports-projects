"""
johnnys_jerks_config.py — League and Pipeline Configuration for Johnny's Jerks

Central configuration for the Johnny's Jerks post-draft redraft experience.
Reads environment variables with sensible fallback defaults.
"""

import os
from pathlib import Path

# Paths: dynamically locate almanac app directory whether running from repo root or parent
BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
if (ROOT_DIR / "src").exists():
    ALMANAC_DIR = ROOT_DIR
elif (ROOT_DIR / "ape-invitational-almanac" / "src").exists():
    ALMANAC_DIR = ROOT_DIR / "ape-invitational-almanac"
else:
    ALMANAC_DIR = ROOT_DIR

GENERATED_DIR = ALMANAC_DIR / "src" / "generated"
JOHNNYS_GENERATED_DIR = GENERATED_DIR / "johnnys-jerks"

# League & Draft IDs
# Configured for the verified Sleeper Redraft league
LEAGUE_ID = os.getenv("SLEEPER_JJ_LEAGUE_ID", "1401673232670539776")
DRAFT_ID = os.getenv("SLEEPER_JJ_DRAFT_ID", "1401673234486714368")
SEASON = os.getenv("SLEEPER_JJ_SEASON", "2026")
LEAGUE_NAME = "Johnny’s Jerks"
TAGLINE = "Post-Draft Almanac & Season Outlook"
MOTTO = "Punched like a Capri Sun, Sweetened like a Life Saver"

# Redraft Settings
IS_DYNASTY = False
SCORING_TYPE = "half_ppr"
TEAMS = 12
ROUNDS = 16
BENCH_SLOTS = 6
STARTER_SLOTS = {
    "QB": 1,
    "RB": 2,
    "WR": 2,
    "TE": 1,
    "FLEX": 2,
    "K": 1,
    "DEF": 1,
}

# Redraft Fit Multipliers (Immediate Starter and Lineup Need)
FIT_MULTIPLIER = {
    "QB": 0.85,
    "RB": 1.25,
    "WR": 1.20,
    "TE": 0.90,
    "K": 0.30,
    "DEF": 0.40,
}

# Superlative Award Names
AWARDS = {
    "life_saver_pick": "Life Saver of the Draft (Best Value Steal)",
    "capri_sun_punt": "Capri Sun Pouch Punt (Wildest Reach)",
    "ice_cold_floor": "Frozen Pouch Award (Highest Floor Roster)",
    "sugar_rush_ceiling": "Sugar Rush Award (Highest Ceiling Roster)",
    "minty_fresh_depth": "Mint Condition (Deepest Bench)",
    "straw_snapper": "Straw Snapper (Highest Risk Roster)",
}
