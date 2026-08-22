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
    for r_id_str, team_draft in draft_recap["teams"].items():
        r_id = int(r_id_str)
        scores = team_draft["scores"]
        picks = team_draft["picks"]
        
        if team_draft["hasPicks"]:
            facts.append({
                "fact_id": f"FACT-2026-DRAFT-TEAM-{r_id}",
                "category": "DRAFT_CYCLE_GRADE",
                "entity_type": "TEAM",
                "entity_id": r_id,
                "claim_template": "Team {manager} received a draft cycle score of {score} ({grade}) across {pick_count} picks.",
                "metric_values": {
                    "manager": team_draft["manager"],
                    "score": scores["cycleScore"],
                    "grade": scores["grade"],
                    "pick_count": team_draft["pickCount"],
                    "execution_score": scores["execution"],
                    "capital_score": scores["capital"],
                    "fit_score": scores["fit"]
                },
                "evidence_ids": [f"EV-2026-DRAFT-TEAM-{r_id}"],
                "confidence_score": 1.0
            })
            
            for p in picks:
                facts.append({
                    "fact_id": f"FACT-2026-DRAFT-{r_id}-{p['slot'].replace('.', '_')}",
                    "category": "DRAFT_PICK_EVALUATION",
                    "entity_type": "PLAYER_PICK",
                    "entity_id": f"{r_id}:{p['slot']}",
                    "claim_template": "Selected {player} ({position}) at {slot} with consensus rank {expert_rank} and blended ratio {ratio}.",
                    "metric_values": {
                        "player": p["player"],
                        "position": p["position"],
                        "slot": p["slot"],
                        "expert_rank": p["expertRank"],
                        "market_rank": p["marketRank"],
                        "blended_ratio": p["blendedRatio"]
                    },
                    "evidence_ids": [p["evidenceId"]],
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
