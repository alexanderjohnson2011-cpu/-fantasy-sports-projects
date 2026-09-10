"""
print_projections.py
Prints live season projections from BigQuery dataset `apes-mac-salad.analytics`.
"""

import os
from google.cloud import bigquery

PROJECT_ID = os.environ.get("GCP_PROJECT", "apes-mac-salad")
SLEEPER_WORK_DIR = os.path.dirname(__file__)

if "GOOGLE_APPLICATION_CREDENTIALS" not in os.environ:
    candidate_keys = [
        os.path.join(os.path.dirname(SLEEPER_WORK_DIR), "ams-pipeline-key.json"),
        os.path.join(os.path.dirname(SLEEPER_WORK_DIR), "apes-mac-salad-0d52b5a00417.json"),
    ]
    for ck in candidate_keys:
        if os.path.exists(ck):
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = ck
            break

def main():
    client = bigquery.Client(project=PROJECT_ID)
    query = """
    SELECT team_name, expected_wins, playoff_probability, championship_probability, projected_median_seed
    FROM `apes-mac-salad.analytics.season_projections`
    ORDER BY championship_probability DESC
    LIMIT 6
    """
    results = list(client.query(query).result())
    print("\n--- BigQuery 2026 Monte Carlo Season Projections ---")
    for r in results:
        print(f"{r.team_name}: Exp Wins={r.expected_wins}, Playoff Odds={r.playoff_probability}%, Title Odds={r.championship_probability}%, Median Seed={r.projected_median_seed}")

if __name__ == "__main__":
    main()
