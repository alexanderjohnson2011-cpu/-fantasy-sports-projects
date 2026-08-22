"""
lineup_optimizer.py
Implements P7-2 and P7-3:
- Derives legal lineup slots dynamically from league roster_positions (1QB, 2RB, 2WR, 1TE, 3FLEX, 1K, 1DEF)
- Computes actual starting points vs hindsight-optimal starting lineup
- Measures bench points, lineup efficiency %, and optimal miss margin
"""

import os
import json

SLEEPER_WORK_DIR = os.path.dirname(__file__)
FIXTURES_DIR = os.path.join(SLEEPER_WORK_DIR, "fixtures")

# Default roster requirements if not parsed from settings
DEFAULT_ROSTER_POSITIONS = [
    "QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX", "FLEX", "K", "DEF"
]

def optimize_lineup(players_with_scores, roster_positions=None):
    """
    Given a list of player dicts [{name, position, points}],
    calculates the highest legal scoring lineup satisfying roster constraints.
    """
    positions = roster_positions or DEFAULT_ROSTER_POSITIONS
    
    # Sort all available players descending by score
    sorted_players = sorted(players_with_scores, key=lambda p: p["points"], reverse=True)
    
    lineup = []
    used_indices = set()
    
    # 1. Fill Primary Slots (QB, RB, WR, TE, K, DEF)
    for slot in positions:
        if slot == "FLEX" or slot == "SUPER_FLEX":
            continue
        for idx, p in enumerate(sorted_players):
            if idx not in used_indices and p["position"] == slot:
                lineup.append({**p, "slot": slot})
                used_indices.add(idx)
                break
                
    # 2. Fill FLEX Slots (RB / WR / TE)
    for slot in positions:
        if slot == "FLEX":
            for idx, p in enumerate(sorted_players):
                if idx not in used_indices and p["position"] in ["RB", "WR", "TE"]:
                    lineup.append({**p, "slot": "FLEX"})
                    used_indices.add(idx)
                    break

    optimal_points = sum(p["points"] for p in lineup)
    bench_players = [p for idx, p in enumerate(sorted_players) if idx not in used_indices]
    bench_points = sum(p["points"] for p in bench_players)
    
    return {
        "starters": lineup,
        "optimal_points": round(optimal_points, 2),
        "bench": bench_players,
        "bench_points": round(bench_points, 2)
    }

def evaluate_team_week(actual_starters, all_roster_players, roster_positions=None):
    """
    Compares actual lineup vs hindsight-optimal lineup.
    """
    actual_points = sum(p["points"] for p in actual_starters)
    opt = optimize_lineup(all_roster_players, roster_positions)
    
    optimal_points = opt["optimal_points"]
    optimal_miss = round(max(0.0, optimal_points - actual_points), 2)
    efficiency = round((actual_points / optimal_points * 100.0), 1) if optimal_points > 0 else 100.0
    
    return {
        "actual_points": round(actual_points, 2),
        "optimal_points": optimal_points,
        "optimal_miss": optimal_miss,
        "efficiency_pct": efficiency,
        "bench_points": opt["bench_points"],
        "optimal_starters": opt["starters"]
    }

def test_lineup_optimizer():
    print("=== Phase P7-2 & P7-3: Lineup Optimizer & Hindsight Lens Test ===")
    
    # 3-FLEX Golden Test Roster
    roster_players = [
        {"name": "QB1", "position": "QB", "points": 24.5},
        {"name": "QB2", "position": "QB", "points": 18.0},
        {"name": "RB1", "position": "RB", "points": 22.0},
        {"name": "RB2", "position": "RB", "points": 15.5},
        {"name": "RB3", "position": "RB", "points": 14.0}, # Flex candidate
        {"name": "WR1", "position": "WR", "points": 20.0},
        {"name": "WR2", "position": "WR", "points": 17.5},
        {"name": "WR3", "position": "WR", "points": 16.0}, # Flex candidate
        {"name": "WR4", "position": "WR", "points": 13.0}, # Flex candidate
        {"name": "WR5", "position": "WR", "points": 8.0},  # Bench
        {"name": "TE1", "position": "TE", "points": 12.0},
        {"name": "TE2", "position": "TE", "points": 6.0},
        {"name": "K1", "position": "K", "points": 9.0},
        {"name": "DEF1", "position": "DEF", "points": 7.0},
    ]
    
    # User played sub-optimal lineup (started WR5 instead of WR3)
    actual_starters = [
        {"name": "QB1", "position": "QB", "points": 24.5},
        {"name": "RB1", "position": "RB", "points": 22.0},
        {"name": "RB2", "position": "RB", "points": 15.5},
        {"name": "WR1", "position": "WR", "points": 20.0},
        {"name": "WR2", "position": "WR", "points": 17.5},
        {"name": "TE1", "position": "TE", "points": 12.0},
        {"name": "RB3", "position": "RB", "points": 14.0}, # Flex 1
        {"name": "WR4", "position": "WR", "points": 13.0}, # Flex 2
        {"name": "WR5", "position": "WR", "points": 8.0},  # Flex 3 (Suboptimal)
        {"name": "K1", "position": "K", "points": 9.0},
        {"name": "DEF1", "position": "DEF", "points": 7.0},
    ]
    
    eval_result = evaluate_team_week(actual_starters, roster_players)
    print(f"Actual Points: {eval_result['actual_points']}")
    print(f"Optimal Points: {eval_result['optimal_points']}")
    print(f"Optimal Miss Margin: {eval_result['optimal_miss']} pts")
    print(f"Lineup Efficiency: {eval_result['efficiency_pct']}%")
    print(f"Bench Points: {eval_result['bench_points']}")
    
    assert eval_result["optimal_points"] == 170.5
    assert eval_result["actual_points"] == 162.5
    assert eval_result["optimal_miss"] == 8.0
    
    print("\n=======================================================")
    print("  SUCCESS: P7-2 & P7-3 LINEUP OPTIMIZER PASSED 100%!")
    print("=======================================================")

if __name__ == "__main__":
    test_lineup_optimizer()
