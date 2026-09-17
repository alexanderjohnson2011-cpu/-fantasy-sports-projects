#!/usr/bin/env python3
"""refresh_all_weekly.py

Master weekly refresh runner for the Ape Invitational Almanac & Johnny's Jerks.
Automates end-to-end weekly data ingestion and analytics generation:
1. Ingests latest Sleeper NFL state and active week.
2. Refreshes Yahoo-style weekly recaps (with box scores, grades, deep dive stories, and timelines) for AMS and Johnny's Jerks.
3. Refreshes Waiver Wire ROI & Trade Evaluation Desk (with letter grades, forensic commentary, VORP, and dynasty trends) for both leagues.
4. Refreshes upcoming weekly matchups, television kickoff windows, and point projections.
5. Refreshes Johnny's Jerks redraft forecast and power rankings.

Usage:
  python sleeper_work/refresh_all_weekly.py
  python sleeper_work/refresh_all_weekly.py --week 2
"""

import argparse
import datetime
import json
import os
import subprocess
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(HERE, ".."))
AMS_LEAGUE_ID = "1312209616372772864"
JOHNNYS_LEAGUE_ID = "1401673232670539776"


def fetch_nfl_state():
    try:
        url = "https://api.sleeper.app/v1/state/nfl"
        req = urllib.request.Request(url, headers={"User-Agent": "AMS-Refresh-All/2.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"  Warning fetching NFL state: {e}")
        return {"week": 1, "season": "2026", "leg": 1}


def run_step(step_name, cmd_args):
    print(f"\n[{datetime.datetime.now().strftime('%H:%M:%S')}] >>> {step_name}...")
    sys.stdout.flush()
    try:
        res = subprocess.run(
            [sys.executable] + cmd_args,
            cwd=PROJECT_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        for line in res.stdout.splitlines():
            if line.strip():
                print(f"    {line}")
        print(f"  [OK] {step_name} completed.")
        return True
    except subprocess.CalledProcessError as e:
        print(f"  [ERROR] {step_name} failed with exit code {e.returncode}:")
        if e.stdout:
            print(f"    STDOUT:\n{e.stdout}")
        if e.stderr:
            print(f"    STDERR:\n{e.stderr}")
        return False


def refresh_all(week=None, season="2026"):
    start_time = datetime.datetime.now()
    nfl_state = fetch_nfl_state()
    active_week = int(week or nfl_state.get("week") or 1)
    detected_season = str(nfl_state.get("season") or season)

    print("=" * 70)
    print("  APE INVITATIONAL ALMANAC · MASTER WEEKLY REFRESH RUNNER")
    print(f"  Target NFL Week: {active_week} | Season: {detected_season}")
    print(f"  Started at: {start_time.strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print("=" * 70)

    steps = [
        (
            "NFL TV Broadcast Schedule & Kickoff Slate Verification",
            ["-m", "sleeper_work.nfl_schedule_provider"],
        ),
        (
            "Ape's Mac Salad: Weekly Matchup Recaps & Deep Dive Suite",
            ["-m", "sleeper_work.build_weekly_recap", "--league", AMS_LEAGUE_ID, "--season", detected_season],
        ),
        (
            "Johnny's Jerks: Weekly Matchup Recaps & Deep Dive Suite",
            ["-m", "sleeper_work.build_weekly_recap", "--league", JOHNNYS_LEAGUE_ID, "--season", detected_season],
        ),
        (
            "Ape's Mac Salad: Waiver Wire ROI & Trade Evaluation Desk",
            ["-m", "sleeper_work.build_waiver_roi", "--league", AMS_LEAGUE_ID, "--season", detected_season, "--week", str(active_week)],
        ),
        (
            "Johnny's Jerks: Waiver Wire ROI & Trade Evaluation Desk",
            ["-m", "sleeper_work.build_waiver_roi", "--league", JOHNNYS_LEAGUE_ID, "--season", detected_season, "--week", str(active_week)],
        ),
        (
            "Ape's Mac Salad: Upcoming Matchups & TV Kickoff Slate",
            ["-m", "sleeper_work.build_current_matchups"],
        ),
        (
            "Ape's Mac Salad: Bayesian Monte Carlo Season Forecast",
            ["-m", "sleeper_work.monte_carlo_forecast"],
        ),
    ]

    # If Johnny's redraft payload builder exists, refresh that too
    if os.path.exists(os.path.join(HERE, "build_redraft_recap_payload.py")):
        steps.append((
            "Johnny's Jerks: Redraft Matchup Forecast & Odds",
            ["-m", "sleeper_work.build_redraft_recap_payload"],
        ))

    successes = 0
    for name, cmd in steps:
        if run_step(name, cmd):
            successes += 1

    elapsed = (datetime.datetime.now() - start_time).total_seconds()
    print("\n" + "=" * 70)
    print(f"  WEEKLY REFRESH SUMMARY: {successes}/{len(steps)} pipeline steps succeeded in {elapsed:.1f}s")
    print("=" * 70)
    return successes == len(steps)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Master weekly refresh for all league analytics")
    parser.add_argument("--week", type=int, default=None, help="Explicit NFL week to evaluate (defaults to active week)")
    parser.add_argument("--season", default="2026", help="NFL season year")
    args = parser.parse_args()

    ok = refresh_all(week=args.week, season=args.season)
    sys.exit(0 if ok else 1)
