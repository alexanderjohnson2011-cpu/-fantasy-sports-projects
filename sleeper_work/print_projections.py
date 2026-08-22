"""
print_projections.py
Prints live season projections from BigQuery dataset `apes-mac-salad.analytics`.
"""

import os
from google.cloud import bigquery

KEY_PATH = r"C:\Users\alexa\Documents\Codex\Apes Mac Salad\apes-mac-salad-0d52b5a00417.json"
PROJECT_ID = "apes-mac-salad"

os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = KEY_PATH

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
