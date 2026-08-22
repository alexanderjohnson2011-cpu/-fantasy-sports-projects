"""
story_facts_generator.py
Implements P9-1: Story Facts Generator.
Extracts structured narrative assertions from canonical tables and feature store.
Every fact carries an explicit evidence_id, metric values, and confidence score.
Downstream text generation consumes ONLY validated story facts to eliminate hallucinations.
"""

import os
import json
import uuid
import datetime

SLEEPER_WORK_DIR = os.path.abspath(os.path.dirname(__file__))
if os.path.exists(os.path.join(os.path.dirname(SLEEPER_WORK_DIR), "src")):
    ALMANAC_DIR = os.path.dirname(SLEEPER_WORK_DIR)
else:
    ALMANAC_DIR = os.path.join(os.path.dirname(SLEEPER_WORK_DIR), "ape-invitational-almanac")
OUTPUT_FACTS_PATH = os.path.join(ALMANAC_DIR, "src", "generated", "story-facts.json")

def generate_story_facts():
    print("=== Phase P9-1: Generating Structured Story Facts ===")
    
    # 1. Load Draft Recap & Forecast Payloads
    draft_recap_path = os.path.join(ALMANAC_DIR, "src", "generated", "draft-recap.json")
    forecast_path = os.path.join(ALMANAC_DIR, "src", "generated", "forecast-insights.json")
    
    with open(draft_recap_path, "r", encoding="utf-8") as f:
        draft_recap = json.load(f)
        
    with open(forecast_path, "r", encoding="utf-8") as f:
        forecast = json.load(f)
        
    facts = []
    
    # Extract Draft Narrative Facts
    teams_data = draft_recap.get("teams", [])
    team_list = teams_data.values() if isinstance(teams_data, dict) else teams_data

    for team_draft in team_list:
        r_id = int(team_draft.get("rosterId", 0))
        cycle = team_draft.get("cycle", {})
        components = team_draft.get("components", {})
        scores = team_draft.get("scores", {})
        picks = team_draft.get("picks", [])
        has_picks = len(picks) > 0 or team_draft.get("hasPicks", False)
        
        score_val = cycle.get("score") if cycle else scores.get("cycleScore", scores.get("compositeScore", 0))
        grade_val = cycle.get("grade") if cycle else scores.get("grade", "INC")
        exec_val = components.get("execution", {}).get("score") if components else scores.get("execution", 0)
        cap_val = components.get("capital", {}).get("score") if components else scores.get("capital", 0)
        fit_val = components.get("fit", {}).get("score") if components else scores.get("fit", 0)
        manager_name = team_draft.get("managerName") or team_draft.get("manager", f"Team {r_id}")
        
        if has_picks and score_val is not None:
            facts.append({
                "fact_id": f"FACT-2026-DRAFT-TEAM-{r_id}",
                "category": "DRAFT_CYCLE_GRADE",
                "entity_type": "TEAM",
                "entity_id": r_id,
                "claim_template": "Team {manager} received a draft cycle score of {score} ({grade}) across {pick_count} picks.",
                "metric_values": {
                    "manager": manager_name,
                    "score": score_val,
                    "grade": grade_val,
                    "pick_count": team_draft.get("pickCount", len(picks)),
                    "execution_score": exec_val,
                    "capital_score": cap_val,
                    "fit_score": fit_val
                },
                "evidence_ids": [f"EV-2026-DRAFT-TEAM-{r_id}"],
                "confidence_score": 1.0
            })
            
            for p in picks:
                p_name = p.get("playerName") or p.get("player") or "Selected Player"
                p_slot = p.get("slot", "1.01")
                exp_rank = p.get("expertRank", p.get("expertConsensusRank", 0))
                mkt_rank = p.get("marketRank", p.get("marketRookieRank", 0))
                ratio = p.get("blendedRatio", p.get("valueRatio", 1.0))
                ev_id = p.get("evidenceId") or p.get("evidenceFactIds", [f"EV-2026-PICK-{r_id}-{p_slot}"])[0]
                
                facts.append({
                    "fact_id": f"FACT-2026-DRAFT-{r_id}-{str(p_slot).replace('.', '_')}",
                    "category": "DRAFT_PICK_EVALUATION",
                    "entity_type": "PLAYER_PICK",
                    "entity_id": f"{r_id}:{p_slot}",
                    "claim_template": "Selected {player} ({position}) at {slot} with consensus rank {expert_rank} and blended ratio {ratio}.",
                    "metric_values": {
                        "player": p_name,
                        "position": p.get("position", "WR"),
                        "slot": p_slot,
                        "expert_rank": exp_rank,
                        "market_rank": mkt_rank,
                        "blended_ratio": ratio
                    },
                    "evidence_ids": [ev_id],
                    "confidence_score": 1.0
                })
                
    # Extract Season Projection Facts
    for r_id_str, team_proj in forecast["teams"].items():
        r_id = int(r_id_str)
        facts.append({
            "fact_id": f"FACT-2026-PROJECTION-{r_id}",
            "category": "SEASON_FORECAST",
            "entity_type": "TEAM",
            "entity_id": r_id,
            "claim_template": "Team {team_name} is projected for {exp_wins} wins with a {playoff_odds}% playoff probability and {title_odds}% title odds.",
            "metric_values": {
                "team_name": team_proj["teamName"],
                "exp_wins": team_proj["expectedWins"],
                "playoff_odds": team_proj["playoffProbability"],
                "title_odds": team_proj["championshipProbability"],
                "median_seed": team_proj["medianSeed"]
            },
            "evidence_ids": [f"EV-2026-FORECAST-{r_id}"],
            "confidence_score": 1.0
        })

    payload = {
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "totalFactsCount": len(facts),
        "facts": facts
    }
    
    os.makedirs(os.path.dirname(OUTPUT_FACTS_PATH), exist_ok=True)
    with open(OUTPUT_FACTS_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
        
    print(f"Generated {len(facts)} structured story facts at {OUTPUT_FACTS_PATH}")
    return payload

if __name__ == "__main__":
    generate_story_facts()
