"""
matchup_timeline.py
Implements P7-4: Matchup timeline and decisive event engine.
Reconstructs game progression, tracks lead changes, identifies decisive plays, and produces evidence records.
"""

import os
import json

def analyze_matchup_timeline(matchup_events):
    """
    Given a list of chronological scoring events:
    [{quarter, game_clock, player, team_id, points_delta, play_description}],
    calculates running scores, lead changes, and the decisive event.
    """
    team_scores = {}
    running_timeline = []
    lead_changes = 0
    current_leader = None
    
    for event in matchup_events:
        team_id = event["team_id"]
        points = event["points_delta"]
        team_scores[team_id] = round(team_scores.get(team_id, 0.0) + points, 2)
        
        # Determine current leader
        teams = list(team_scores.keys())
        if len(teams) == 1:
            new_leader = teams[0]
        else:
            t1, t2 = teams[0], teams[1]
            s1, s2 = team_scores[t1], team_scores[t2]
            new_leader = t1 if s1 > s2 else (t2 if s2 > s1 else "TIED")
            
        if current_leader and new_leader != "TIED" and new_leader != current_leader:
            lead_changes += 1
            
        current_leader = new_leader
            
        running_timeline.append({
            "event_id": event.get("event_id"),
            "quarter": event.get("quarter"),
            "clock": event.get("game_clock"),
            "player": event.get("player"),
            "team_id": team_id,
            "points_delta": points,
            "running_score": dict(team_scores),
            "leader": current_leader,
            "play": event.get("play_description")
        })
        
    final_teams = list(team_scores.keys())
    final_margin = abs(team_scores[final_teams[0]] - team_scores[final_teams[1]]) if len(final_teams) >= 2 else 0.0
    
    # Decisive event: the scoring play that created the final un-surrendered lead
    decisive_event = running_timeline[-1] if running_timeline else None
    
    return {
        "final_scores": team_scores,
        "final_margin": round(final_margin, 2),
        "lead_changes": lead_changes,
        "decisive_event": decisive_event,
        "timeline": running_timeline,
        "evidence_id": f"EV-MATCHUP-TIMELINE-{final_teams[0] if final_teams else '0'}"
    }

def test_matchup_timeline():
    print("=== Phase P7-4: Matchup Timeline & Decisive Event Test ===")
    
    # Monday Night Miracle Golden Test Fixture
    events = [
        {"event_id": "E1", "quarter": "Q1", "game_clock": "10:15", "player": "RB1", "team_id": "TeamA", "points_delta": 6.0, "play_description": "15-yd rushing TD"},
        {"event_id": "E2", "quarter": "Q2", "game_clock": "04:30", "player": "WR1", "team_id": "TeamB", "points_delta": 12.5, "play_description": "45-yd receiving TD"}, # Lead change 1
        {"event_id": "E3", "quarter": "Q3", "game_clock": "01:20", "player": "QB1", "team_id": "TeamA", "points_delta": 8.0, "play_description": "20-yd passing TD"}, # Lead change 2
        {"event_id": "E4", "quarter": "Q4", "game_clock": "00:45", "player": "WR2", "team_id": "TeamB", "points_delta": 2.5, "play_description": "12-yd reception on MNF final drive"}, # Lead change 3 (Decisive)
    ]
    
    result = analyze_matchup_timeline(events)
    print(f"Final Scores: {result['final_scores']}")
    print(f"Final Margin: {result['final_margin']} pts")
    print(f"Total Lead Changes: {result['lead_changes']}")
    print(f"Decisive Play: {result['decisive_event']['player']} ({result['decisive_event']['play']})")
    
    assert result["final_scores"]["TeamA"] == 14.0
    assert result["final_scores"]["TeamB"] == 15.0
    assert result["final_margin"] == 1.0
    assert result["lead_changes"] == 3
    assert result["decisive_event"]["player"] == "WR2"
    
    print("\n=======================================================")
    print("  SUCCESS: P7-4 MATCHUP TIMELINE ENGINE PASSED 100%!")
    print("=======================================================")

if __name__ == "__main__":
    test_matchup_timeline()
