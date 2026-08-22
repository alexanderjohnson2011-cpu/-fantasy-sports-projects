"""
apply_bigquery_ddl.py
Applies canonical_ddl.sql and as_of_functions.sql to dataset `apes-mac-salad.canonical` in BigQuery.
"""

import os
from google.cloud import bigquery

KEY_PATH = r"C:\Users\alexa\Documents\Codex\Apes Mac Salad\apes-mac-salad-0d52b5a00417.json"
PROJECT_ID = "apes-mac-salad"

os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = KEY_PATH

def execute_sql_file(client, file_path):
    print(f"Applying SQL from {os.path.basename(file_path)}...")
    with open(file_path, "r", encoding="utf-8") as f:
        sql_content = f.read()
        
    # Split queries by semicolon if needed or run script
    job = client.query(sql_content)
    job.result()
    print(f"  -> Successfully applied {os.path.basename(file_path)}")

def main():
    print("=== Applying Canonical BigQuery DDL & AS OF Functions ===")
    client = bigquery.Client(project=PROJECT_ID)
    
    script_dir = os.path.dirname(__file__)
    ddl_path = os.path.join(script_dir, "canonical_ddl.sql")
    fn_path = os.path.join(script_dir, "as_of_functions.sql")
    
    execute_sql_file(client, ddl_path)
    execute_sql_file(client, fn_path)
    
    # List created tables
    tables = list(client.list_tables("canonical"))
    print(f"\nCanonical dataset now contains {len(tables)} tables/views/functions:")
    for t in tables:
        print(f"  - {t.table_id} ({t.table_type})")
        
    print("\n=== BigQuery DDL Application Complete ===")

if __name__ == "__main__":
    main()
