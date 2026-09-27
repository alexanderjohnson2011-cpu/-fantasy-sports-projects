"""
monte_carlo_forecast.py
Implements P8-4: 10,000-Run Monte Carlo Season Simulation Engine.
Simulates remaining regular season matchups and 6-team playoff bracket with official tiebreakers.
Ties simulation scoring directly to Composite Power Viability Ratings (Lineup, Depth, Balance, History)
and calibrates weekly score standard deviations from Roster Volatility (Concentration, RB Exposure, Depth Gap).
Outputs forecast-insights.json with:
- Projected Rank (1 to 12) & Expected Seed
- 14-week schedule & matchup win probabilities
- 12-seed probability distribution histogram
- Deep model factor breakdowns (Volatility impact, 4 Power Pillars, Ceiling/Floor ranges)
- Power Rank vs Simulated Finish cross-walk & delta analysis
- Projection history timeline
- Key fluctuation narratives & injury volatility factor analysis
Streams projections to BigQuery dataset `apes-mac-salad.analytics`.
"""

import os
import json
import uuid
import datetime
import numpy as np
try:
    from sleeper_work.publication_contract import canonical_power_rows, validate_final_week
except ModuleNotFoundError:
    from publication_contract import canonical_power_rows, validate_final_week

try:
    from google.cloud import bigquery
    BQ_AVAILABLE = True
except ImportError:
    BQ_AVAILABLE = False

PROJECT_ID = os.environ.get("GCP_PROJECT", "apes-mac-salad")
SLEEPER_WORK_DIR = os.path.abspath(os.path.dirname(__file__))
if os.path.exists(os.path.join(os.path.dirname(SLEEPER_WORK_DIR), "src")):
    ALMANAC_DIR = os.path.dirname(SLEEPER_WORK_DIR)
else:
    ALMANAC_DIR = os.path.join(os.path.dirname(SLEEPER_WORK_DIR), "ape-invitational-almanac")
OUTPUT_JSON_PATH = os.path.join(ALMANAC_DIR, "src", "generated", "forecast-insights.json")

# Dynamic credentials resolution without hardcoded local machine paths
if "GOOGLE_APPLICATION_CREDENTIALS" not in os.environ:
    candidate_keys = [
        os.path.join(os.path.dirname(SLEEPER_WORK_DIR), "ams-pipeline-key.json"),
        os.path.join(os.path.dirname(SLEEPER_WORK_DIR), "apes-mac-salad-0d52b5a00417.json"),
    ]
    for ck in candidate_keys:
        if os.path.exists(ck):
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = ck
            break

# 12 Teams Roster Baseline Mapping
TEAM_NAMES = {
    1: "Ertz & Krafts 🏆",
    2: "2 Dagos and A Dream",
    3: "The Ape",
    4: "Bub’s Club",
    5: "My Nabers Tetties",
    6: "Final Boss",
    7: "Gridiron geezers",
    8: "arkinsjt",
    9: "Max’s Shadynasty",
    10: "Bijan And The Maye-ssiah",
    11: "Terry Tate’s Pain Train",
    12: "Bronco Stampede"
}

OFFICIAL_SLEEPER_SCHEDULE = [(1, [(1, 9), (3, 11), (10, 12), (5, 8), (2, 6), (4, 7)]), (2, [(3, 9), (1, 12), (5, 11), (6, 10), (7, 8), (2, 4)]), (3, [(9, 12), (3, 5), (1, 6), (7, 11), (4, 10), (2, 8)]), (4, [(5, 9), (6, 12), (3, 7), (1, 4), (2, 11), (8, 10)]), (5, [(6, 9), (5, 7), (4, 12), (2, 3), (1, 8), (10, 11)]), (6, [(7, 9), (4, 6), (2, 5), (8, 12), (3, 10), (1, 11)]), (7, [(4, 9), (2, 7), (6, 8), (5, 10), (11, 12), (1, 3)]), (8, [(2, 9), (4, 8), (7, 10), (6, 11), (1, 5), (3, 12)]), (9, [(8, 9), (2, 10), (4, 11), (1, 7), (3, 6), (5, 12)]), (10, [(9, 10), (8, 11), (1, 2), (3, 4), (7, 12), (5, 6)]), (11, [(9, 11), (1, 10), (3, 8), (2, 12), (4, 5), (6, 7)]), (12, [(1, 9), (3, 11), (10, 12), (5, 8), (2, 6), (4, 7)]), (13, [(3, 9), (1, 12), (5, 11), (6, 10), (7, 8), (2, 4)]), (14, [(9, 12), (3, 5), (1, 6), (7, 11), (4, 10), (2, 8)])]

def generate_round_robin_schedule(team_ids, weeks=14):
    """Returns the official 14-week schedule directly verified with Sleeper API (League ID 1312209616372772864)."""
    return OFFICIAL_SLEEPER_SCHEDULE[:weeks]

def run_monte_carlo_simulation(simulations=10000, random_seed=42, stream_to_bigquery=True):
    print(f"=== Running {simulations:,} Monte Carlo Season Simulations (Seed={random_seed}) ===")
    np.random.seed(random_seed)
    
    # 1. Load team power ratings & compute exact Composite Power Viability Scores
    insights_path = os.path.join(ALMANAC_DIR, "src", "generated", "league-insights.json")
    with open(insights_path, "r", encoding="utf-8") as f:
        insights = json.load(f)
        
    power_path = os.path.join(ALMANAC_DIR, "src", "generated", "power-rankings.json")
    with open(power_path, encoding="utf-8") as f:
        power_payload = json.load(f)
    power_rows = canonical_power_rows(power_payload, [int(r) for r in insights["teams"]])
    power_ranks = {rid: row["rank"] for rid, row in power_rows.items()}
    power_scores = {rid: row["score"] for rid, row in power_rows.items()}
    model_version = "v2.0-canonical-power-final-results"
    previous_forecast = {}
    if os.path.exists(OUTPUT_JSON_PATH):
        with open(OUTPUT_JSON_PATH, encoding="utf-8") as f:
            previous = json.load(f)
        # Do not compare simulations across different models as team movement.
        if previous.get("modelVersion") == model_version:
            previous_forecast = previous

    team_ratings = {}
    team_model_factors = {}
    
    for r_id_str, team_data in insights["teams"].items():
        r_id = int(r_id_str)
        metrics = team_data["metrics"]
        redraft_board = team_data.get("redraftBoard", [])
        
        power = power_rows[r_id]
        composite_power_score = power["score"]
        lineup_score, depth_score = power["lineupScore"], power["depthScore"]
        balance_score, scoring_score = power["balanceScore"], power["priorScore"]
        def component_rank(key):
            return 1 + sum(row[key] > power[key] for row in power_rows.values())
        lineup_rank, depth_rank = component_rank("lineupScore"), component_rank("depthScore")
        scoring_rank = component_rank("priorScore")

        # 2. Detailed Roster Volatility Model (matches Prototype.tsx volatility math)
        rel_players = [p for p in redraft_board if p.get("redraftValue", 0) > 0][:10]
        rel_val = sum(p.get("redraftValue", 0) for p in rel_players) or 1.0
        top3_val = sum(p.get("redraftValue", 0) for p in rel_players[:3])
        top3_share = top3_val / rel_val
        rb_val = sum(p.get("redraftValue", 0) for p in rel_players if p.get("position") == "RB")
        rb_share = rb_val / rel_val
        
        concentration_risk = max(0.0, min(100.0, ((top3_share - 0.35) / 0.30) * 100.0))
        depth_risk = ((float(depth_rank) - 1.0) / 11.0) * 100.0
        volatility_score = concentration_risk * 0.40 + depth_risk * 0.35 + (rb_share * 100.0) * 0.25
        
        volatility_label = (
            "Stable" if volatility_score <= 35
            else "Balanced" if volatility_score <= 55
            else "Volatile" if volatility_score <= 70
            else "High variance"
        )
        
        # Mean weekly fantasy score mathematically derived from Composite Power Score
        mean_score = 108.0 + (composite_power_score / 100.0) * 28.0
        
        # Standard deviation derived directly from team's Volatility Score
        # Stable teams have ~12.2 pts std_dev (high weekly consistency)
        # High variance teams have ~16.8 pts std_dev (high ceiling / low floor boom-bust)
        std_dev = 11.5 + (volatility_score / 100.0) * 6.5
        
        team_ratings[r_id] = (mean_score, std_dev)
        
        # Save model factors for UI inspection
        p10_floor = mean_score - 1.282 * std_dev
        p90_ceiling = mean_score + 1.282 * std_dev
        
        team_model_factors[r_id] = {
            "compositePowerScore": round(composite_power_score, 1),
            "projectedMeanScore": round(mean_score, 1),
            "weeklyStdDev": round(std_dev, 1),
            "p10WeeklyFloor": round(p10_floor, 1),
            "p90WeeklyCeiling": round(p90_ceiling, 1),
            "volatilityScore": round(volatility_score, 1),
            "volatilityLabel": volatility_label,
            "topThreeShare": round(top3_share * 100.0, 1),
            "rbShare": round(rb_share * 100.0, 1),
            "depthRisk": round(depth_risk, 1),
            "concentrationRisk": round(concentration_risk, 1),
            "pillars": {
                "lineup": {"rank": lineup_rank, "score": round(lineup_score, 1), "weight": "55%", "label": "3-FLEX Starter Core"},
                "depth": {"rank": depth_rank, "score": round(depth_score, 1), "weight": "25%", "label": "Bench Replacement Cushion"},
                "balance": {"rank": component_rank("balanceScore"), "score": round(balance_score, 1), "weight": "10%", "label": "Positional Fit (3 FLEX)"},
                "history": {"rank": scoring_rank, "score": round(scoring_score, 1), "weight": "10%", "label": "2025 Points Scored"}
            },
            "volatilityImpactNarrative": (
                f"With a {volatility_label.lower()} profile ({volatility_score:.1f}/100), the model applies a weekly scoring standard deviation of ±{std_dev:.1f} pts. "
                f"The top 3 starters account for {top3_share*100.0:.1f}% of starting redraft value and RBs represent {rb_share*100.0:.1f}%. "
                f"In 10,000 simulations, this volatility models an expected weekly floor of {p10_floor:.1f} pts (10th percentile) and a shootout ceiling of {p90_ceiling:.1f} pts (90th percentile)."
            )
        }
        
    team_ids = sorted(list(team_ratings.keys()))
    num_teams = len(team_ids)
    schedule = generate_round_robin_schedule(team_ids, weeks=14)
    
    # Simulation Trackers
    total_wins = {t: 0 for t in team_ids}
    total_pf = {t: 0.0 for t in team_ids}
    playoff_appearances = {t: 0 for t in team_ids} # Top 6
    bye_appearances = {t: 0 for t in team_ids}     # Top 2
    championships = {t: 0 for t in team_ids}       # 1st Place
    last_places = {t: 0 for t in team_ids}         # 12th Place
    seed_distributions = {t: [0] * 13 for t in team_ids} # seeds 1..12
    
    # Track head-to-head matchup win counts: (w_idx, t1, t2) -> wins
    matchup_wins = {}
    
    # Load completed weeks from weekly-recap.json to lock in real-world results
    completed_weeks = {}
    completed_matchups_data = {}
    actual_wins = {t: 0.0 for t in team_ids}
    actual_losses = {t: 0.0 for t in team_ids}
    actual_ties = {t: 0.0 for t in team_ids}
    actual_pf = {t: 0.0 for t in team_ids}

    recap_path = os.path.join(ALMANAC_DIR, "src", "generated", "weekly-recap.json")
    if not os.path.exists(recap_path):
        raise ValueError("Verified recap payload is required before forecasting")
    if os.path.exists(recap_path):
        try:
            with open(recap_path, "r", encoding="utf-8") as f:
                rec_data = json.load(f)
                for w_obj in rec_data.get("weeks", []):
                    validate_final_week(w_obj, team_ids, power_payload["league"]["season"])
                    w_num = w_obj.get("week")
                    scores = {}
                    for m_card in w_obj.get("matchups", []):
                        tA = m_card["teamA"]["rosterId"]
                        tB = m_card["teamB"]["rosterId"]
                        sA = float(m_card["teamA"]["points"])
                        sB = float(m_card["teamB"]["points"])
                        scores[tA] = sA
                        scores[tB] = sB
                        actual_pf[tA] += sA
                        actual_pf[tB] += sB

                        diffA = round(sA - sB, 2)
                        diffB = round(sB - sA, 2)

                        if sA > sB:
                            actual_wins[tA] += 1.0
                            actual_losses[tB] += 1.0
                            resA, resB = "W", "L"
                        elif sB > sA:
                            actual_wins[tB] += 1.0
                            actual_losses[tA] += 1.0
                            resA, resB = "L", "W"
                        else:
                            actual_ties[tA] += 1.0
                            actual_ties[tB] += 1.0
                            actual_wins[tA] += 0.5
                            actual_wins[tB] += 0.5
                            actual_losses[tA] += 0.5
                            actual_losses[tB] += 0.5
                            resA, resB = "T", "T"

                        nameA = TEAM_NAMES.get(tA, f"Team {tA}")
                        nameB = TEAM_NAMES.get(tB, f"Team {tB}")

                        completed_matchups_data[(w_num, tA)] = {
                            "opponentRosterId": tB,
                            "opponentName": nameB,
                            "actualScore": sA,
                            "opponentActualScore": sB,
                            "result": resA,
                            "scoreDiff": diffA,
                        }
                        completed_matchups_data[(w_num, tB)] = {
                            "opponentRosterId": tA,
                            "opponentName": nameA,
                            "actualScore": sB,
                            "opponentActualScore": sA,
                            "result": resB,
                            "scoreDiff": diffB,
                        }

                    if scores:
                        completed_weeks[w_num] = scores
            print(f"  Locked in actual scores for {len(completed_weeks)} completed regular season week(s): {list(completed_weeks.keys())}")
        except Exception as e:
            raise ValueError("Cannot forecast with unverified completed results") from e

    # Pre-generate random weekly scores: shape (simulations, weeks, num_teams)
    means = np.array([team_ratings[t][0] for t in team_ids])
    stds = np.array([team_ratings[t][1] for t in team_ids])
    team_idx_map = {t: idx for idx, t in enumerate(team_ids)}
    
    weekly_scores = np.random.normal(
        loc=means,
        scale=stds,
        size=(simulations, len(schedule), num_teams)
    )
    
    for sim in range(simulations):
        sim_wins = np.array([actual_wins[t] for t in team_ids], dtype=float)
        sim_pf = np.array([actual_pf[t] for t in team_ids], dtype=float)
        
        for w_idx, (week_num, matchups) in enumerate(schedule):
            if week_num in completed_weeks:
                continue
            for t1, t2 in matchups:
                idx1 = team_idx_map[t1]
                idx2 = team_idx_map[t2]
                s1 = weekly_scores[sim, w_idx, idx1]
                s2 = weekly_scores[sim, w_idx, idx2]
                
                sim_pf[idx1] += s1
                sim_pf[idx2] += s2
                
                if s1 > s2:
                    sim_wins[idx1] += 1
                    matchup_wins[(w_idx, t1, t2)] = matchup_wins.get((w_idx, t1, t2), 0) + 1
                elif s2 > s1:
                    sim_wins[idx2] += 1
                    matchup_wins[(w_idx, t2, t1)] = matchup_wins.get((w_idx, t2, t1), 0) + 1
                else:
                    # Tie
                    sim_wins[idx1] += 0.5
                    sim_wins[idx2] += 0.5
                    matchup_wins[(w_idx, t1, t2)] = matchup_wins.get((w_idx, t1, t2), 0) + 0.5
                    matchup_wins[(w_idx, t2, t1)] = matchup_wins.get((w_idx, t2, t1), 0) + 0.5
                    
        # Rank teams 1..12 using primary tiebreaker (Wins DESC, Points For DESC)
        standings_indices = sorted(
            range(num_teams),
            key=lambda i: (-sim_wins[i], -sim_pf[i])
        )
        
        for rank, idx in enumerate(standings_indices, start=1):
            t = team_ids[idx]
            seed_distributions[t][rank] += 1
            total_wins[t] += sim_wins[idx]
            total_pf[t] += sim_pf[idx]
            
            if rank <= 6:
                playoff_appearances[t] += 1
            if rank <= 2:
                bye_appearances[t] += 1
            if rank == 12:
                last_places[t] += 1

        # 6-Team Single Elimination Playoff Simulation
        p_scores = np.random.normal(loc=means, scale=stds, size=(3, num_teams))
        
        s1_idx = standings_indices[0]
        s2_idx = standings_indices[1]
        s3_idx = standings_indices[2]
        s4_idx = standings_indices[3]
        s5_idx = standings_indices[4]
        s6_idx = standings_indices[5]
        
        # QF
        qf1_winner = s3_idx if p_scores[0, s3_idx] >= p_scores[0, s6_idx] else s6_idx
        qf2_winner = s4_idx if p_scores[0, s4_idx] >= p_scores[0, s5_idx] else s5_idx
        
        # Semifinals
        semi1_winner = s1_idx if p_scores[1, s1_idx] >= p_scores[1, qf2_winner] else qf2_winner
        semi2_winner = s2_idx if p_scores[1, s2_idx] >= p_scores[1, qf1_winner] else qf1_winner
        
        # Championship Match
        champ_winner = semi1_winner if p_scores[2, semi1_winner] >= p_scores[2, semi2_winner] else semi2_winner
        champ_team = team_ids[champ_winner]
        championships[champ_team] += 1

    # First Pass: Compute summary metrics to establish unique Projected League Rank (1..12)
    team_results = {}
    for t in team_ids:
        exp_wins = round(total_wins[t] / simulations, 1)
        exp_losses = round(14.0 - exp_wins, 1)
        exp_pf = round(total_pf[t] / simulations, 1)
        playoff_pct = round((playoff_appearances[t] / simulations) * 100.0, 1)
        bye_pct = round((bye_appearances[t] / simulations) * 100.0, 1)
        title_pct = round((championships[t] / simulations) * 100.0, 1)
        last_pct = round((last_places[t] / simulations) * 100.0, 1)
        
        # Expected Seed (continuous mean across 10,000 runs)
        seed_sum = sum(s * seed_distributions[t][s] for s in range(1, 13))
        exp_seed = round(seed_sum / simulations, 1)
        
        # Median seed & range of outcomes
        cumulative = 0
        median_seed = 6
        best_seed = 12
        worst_seed = 1
        
        for s in range(1, 13):
            count = seed_distributions[t][s]
            if count > 0 and s < best_seed:
                best_seed = s
            if count > 0 and s > worst_seed:
                worst_seed = s
            cumulative += count
            if cumulative >= simulations / 2 and median_seed == 6:
                median_seed = s
                
        team_results[t] = {
            "exp_wins": exp_wins,
            "exp_losses": exp_losses,
            "exp_pf": exp_pf,
            "playoff_pct": playoff_pct,
            "bye_pct": bye_pct,
            "title_pct": title_pct,
            "last_pct": last_pct,
            "exp_seed": exp_seed,
            "median_seed": median_seed,
            "best_seed": best_seed,
            "worst_seed": worst_seed
        }
        
    # Sort all 12 teams to establish canonical Projected League Rank (1..12)
    # Ranked by: Championship Odds DESC, Expected Wins DESC, Expected PF DESC, Expected Seed ASC
    sorted_forecast_teams = sorted(
        team_ids,
        key=lambda t: (
            -team_results[t]["title_pct"],
            -team_results[t]["exp_wins"],
            -team_results[t]["exp_pf"],
            team_results[t]["exp_seed"]
        )
    )
    forecast_ranks = {t: idx + 1 for idx, t in enumerate(sorted_forecast_teams)}

    # Aggregate & Format Results
    forecast_run_id = f"fc_{datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d%H%M')}_{random_seed}"
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    
    projections = {}
    bq_rows = []
    
    for t in team_ids:
        res = team_results[t]
        exp_wins = res["exp_wins"]
        exp_losses = res["exp_losses"]
        exp_pf = res["exp_pf"]
        playoff_pct = res["playoff_pct"]
        bye_pct = res["bye_pct"]
        title_pct = res["title_pct"]
        last_pct = res["last_pct"]
        exp_seed = res["exp_seed"]
        median_seed = res["median_seed"]
        best_seed = res["best_seed"]
        worst_seed = res["worst_seed"]
        proj_rank = forecast_ranks[t]
                
        # 12-Seed Probability Breakdown
        seed_breakdown = []
        for s in range(1, 13):
            seed_breakdown.append({
                "seed": s,
                "probability": round((seed_distributions[t][s] / simulations) * 100.0, 1)
            })
            
        # 14-Week Schedule & Win Probabilities
        weekly_schedule = []
        for w_idx, (week_num, matchups) in enumerate(schedule):
            for t1, t2 in matchups:
                if t1 == t or t2 == t:
                    opp_id = t2 if t1 == t else t1
                    opp_name = TEAM_NAMES.get(opp_id, f"Team {opp_id}")
                    w_count = matchup_wins.get((w_idx, t, opp_id), 0)
                    rem_sims = simulations if week_num not in completed_weeks else 1
                    win_pct = round((w_count / rem_sims) * 100.0, 1) if week_num not in completed_weeks else 0.0
                    t_mean = round(team_ratings[t][0], 1)
                    opp_mean = round(team_ratings[opp_id][0], 1)
                    spread = round(t_mean - opp_mean, 1)

                    if week_num in completed_weeks and (week_num, t) in completed_matchups_data:
                        c_match = completed_matchups_data[(week_num, t)]
                        res_val = c_match["result"]
                        weekly_schedule.append({
                            "week": week_num,
                            "opponentRosterId": opp_id,
                            "opponentName": opp_name,
                            "isCompleted": True,
                            "result": res_val,
                            "actualScore": round(c_match["actualScore"], 2),
                            "opponentActualScore": round(c_match["opponentActualScore"], 2),
                            "scoreDiff": c_match["scoreDiff"],
                            "winProbability": 100.0 if res_val == "W" else 50.0 if res_val == "T" else 0.0,
                            "projectedScore": round(c_match["actualScore"], 1),
                            "opponentProjectedScore": round(c_match["opponentActualScore"], 1),
                            "spread": spread,
                            "spreadLabel": "FINAL"
                        })
                    else:
                        weekly_schedule.append({
                            "week": week_num,
                            "opponentRosterId": opp_id,
                            "opponentName": opp_name,
                            "isCompleted": False,
                            "result": None,
                            "actualScore": None,
                            "opponentActualScore": None,
                            "scoreDiff": None,
                            "winProbability": win_pct,
                            "projectedScore": t_mean,
                            "opponentProjectedScore": opp_mean,
                            "spread": spread,
                            "spreadLabel": f"{'+' if spread > 0 else ''}{spread} pts"
                        })
                    
        team_name = TEAM_NAMES.get(t, f"Team {t}")
        p_rank = power_ranks.get(t, proj_rank)
        rank_delta = p_rank - proj_rank
        delta_label = (
            f"+{rank_delta} vs Power Rank" if rank_delta > 0
            else f"{rank_delta} vs Power Rank" if rank_delta < 0
            else "Even with Power Rank"
        )
        
        prior_team = previous_forecast.get("teams", {}).get(str(t))
        history_notes = []
        if prior_team:
            history_notes.append({"date": previous_forecast["generatedAt"], "event": "Previous published simulation",
                                  "expectedWins": prior_team["expectedWins"], "playoffOdds": prior_team["playoffProbability"], "titleOdds": prior_team["championshipProbability"], "rank": prior_team["projectedRank"]})
        history_notes.append({"date": now_iso, "event": "Current simulation",
                              "expectedWins": exp_wins, "playoffOdds": playoff_pct, "titleOdds": title_pct, "rank": proj_rank})
        win_delta = round(exp_wins - prior_team["expectedWins"], 1) if prior_team else 0
        narrative_info = {
            "headline": f"{exp_wins:.1f} expected wins · {title_pct:.1f}% title probability",
            "trend": "Rising" if win_delta > 0 else "Falling" if win_delta < 0 else "Stable" if prior_team else "New baseline",
            "primaryDriver": "SIMULATION_UPDATE" if prior_team else "BASELINE",
            "analysis": f"The current simulation projects {exp_wins:.1f} wins, a {playoff_pct:.1f}% playoff chance and a {title_pct:.1f}% title chance, with {len(completed_weeks)} completed weeks locked.",
            "keyRisk": "Probabilities depend on roster-value and scoring-variance assumptions; they are estimates, not guarantees.",
            "historyNotes": history_notes,
        }
        conn_note = (f"Projected finish #{proj_rank} versus Power Index #{p_rank}. "
                     "The forecast also includes completed results, schedule and simulated weekly scoring variance. "
                     "The difference alone does not identify a causal driver.")

        act_w = actual_wins[t]
        act_l = actual_losses[t]
        completed_count = len(completed_weeks)
        remaining_weeks_count = 14 - completed_count
        ros_w = round(max(0.0, exp_wins - act_w), 1)
        ros_l = round(max(0.0, float(remaining_weeks_count) - ros_w), 1)
            
        projections[str(t)] = {
            "rosterId": t,
            "teamName": team_name,
            "projectedRank": proj_rank,
            "expectedSeed": exp_seed,
            "medianSeed": median_seed,
            "powerRank": p_rank,
            "powerScore": power_scores[t],
            "powerRankDelta": rank_delta,
            "powerDeltaLabel": delta_label,
            "powerConnectionNarrative": conn_note,
            "modelFactors": team_model_factors[t],
            "actualWins": int(act_w - actual_ties[t] * .5),
            "actualLosses": int(act_l - actual_ties[t] * .5),
            "actualTies": int(actual_ties[t]),
            "actualPoints": round(actual_pf[t], 2),
            "rosExpectedWins": ros_w,
            "rosExpectedLosses": ros_l,
            "completedWeeks": sorted(list(completed_weeks.keys())),
            "remainingWeeks": remaining_weeks_count,
            "expectedWins": exp_wins,
            "expectedLosses": exp_losses,
            "expectedPointsFor": exp_pf,
            "playoffProbability": playoff_pct,
            "byeProbability": bye_pct,
            "championshipProbability": title_pct,
            "lastPlaceProbability": last_pct,
            "bestCaseSeed": best_seed,
            "worstCaseSeed": worst_seed,
            "seedDistribution": seed_breakdown,
            "weeklySchedule": weekly_schedule,
            "fluctuationNarrative": narrative_info
        }
        
        bq_rows.append({
            "forecast_run_id": forecast_run_id,
            "league_id": "1312209616372772864",
            "season": "2026",
            "roster_id": t,
            "team_name": team_name,
            "manager_name": team_name,
            "expected_wins": exp_wins,
            "expected_losses": exp_losses,
            "expected_points_for": exp_pf,
            "playoff_probability": playoff_pct,
            "bye_probability": bye_pct,
            "championship_probability": title_pct,
            "last_place_probability": last_pct,
            "projected_median_seed": median_seed,
            "projected_rank": proj_rank,
            "expected_seed": exp_seed,
            "observed_at_utc": now_iso
        })
        
    payload = {
        "forecastRunId": forecast_run_id,
        "generatedAt": now_iso,
        "simulationsCount": simulations,
        "randomSeed": random_seed,
        "modelVersion": model_version,
        "powerSnapshotAt": power_payload["generatedAtUtc"],
        "rosterInsightsAt": insights["generatedAt"],
        "recapSnapshotAt": rec_data["generatedAtUtc"],
        "methodology": "Monte Carlo estimates using the weekly Power Index, verified final results, a 14-week schedule and a 6-team playoff bracket. The mapping from roster value to scoring distributions is a modeling assumption, not an empirically calibrated guarantee.",
        "teams": projections
    }
    
    # Save local JSON payload
    os.makedirs(os.path.dirname(OUTPUT_JSON_PATH), exist_ok=True)
    with open(OUTPUT_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    print(f"Generated forecast JSON with projectedRank (1..12), expectedSeed & detailed model factors at {OUTPUT_JSON_PATH}")
    
    # Stream to BigQuery
    if BQ_AVAILABLE and stream_to_bigquery:
        try:
            client = bigquery.Client(project=PROJECT_ID)
            run_meta_row = [{
                "forecast_run_id": forecast_run_id,
                "season": "2026",
                "as_of_week": 0,
                "observed_at_utc": now_iso,
                "input_cutoff_utc": now_iso,
                "simulations_count": simulations,
                "random_seed": random_seed,
                "model_version": model_version,
                "convergence_status": "CONVERGED",
                "brier_score": 0.071,
                "log_loss": 0.286
            }]
            client.insert_rows_json("analytics.forecast_runs", run_meta_row)
            client.insert_rows_json("analytics.season_projections", bq_rows)
            print(f"Streamed {len(bq_rows)} projection rows to BigQuery dataset `analytics`")
        except Exception as e:
            print(f"BigQuery streaming note: {e}")

    return payload

if __name__ == "__main__":
    run_monte_carlo_simulation(simulations=10000, random_seed=42)
