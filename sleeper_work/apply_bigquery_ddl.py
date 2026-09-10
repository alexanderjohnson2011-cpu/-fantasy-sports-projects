"""Apply the shared BigQuery schema using Application Default Credentials.

Never point this script at a checked-in or administrator service-account key.
Use ``gcloud auth application-default login`` for local work, or a managed
runtime identity in GCP. The optional project override is ``GOOGLE_CLOUD_PROJECT``.
"""

import os
from pathlib import Path

from google.cloud import bigquery


PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "apes-mac-salad")

# The initial multi-league DDL can have been applied before a later contract
# revision. CREATE TABLE IF NOT EXISTS intentionally preserves those tables,
# so reconcile additive/relaxing changes explicitly after the DDL script.
MULTILEAGUE_SCHEMA_UPDATES = {
    "canonical.provider_snapshots": {
        "relax": ["publication_id"],
        "add": {"scope": "STRING"},
    },
    "canonical.market_signals": {
        "relax": ["publication_id"],
        "add": {"scope": "STRING"},
    },
    "canonical.news_items": {
        "relax": ["publication_id"],
        "add": {"scope": "STRING"},
    },
}

def execute_sql_file(client, file_path):
    print(f"Applying SQL from {os.path.basename(file_path)}...")
    with open(file_path, "r", encoding="utf-8") as f:
        sql_content = f.read()
        
    # Split queries by semicolon if needed or run script
    job = client.query(sql_content)
    job.result()
    print(f"  -> Successfully applied {os.path.basename(file_path)}")


def reconcile_multileague_schema(client):
    """Make contract additions idempotent without rewriting existing tables."""
    for dataset_table, update in MULTILEAGUE_SCHEMA_UPDATES.items():
        table_id = f"{PROJECT_ID}.{dataset_table}"
        table = client.get_table(table_id)
        fields = {field.name: field for field in table.schema}
        for field_name in update["relax"]:
            field = fields.get(field_name)
            if field and field.mode == "REQUIRED":
                client.query(
                    f"ALTER TABLE `{table_id}` ALTER COLUMN `{field_name}` DROP NOT NULL"
                ).result()
                print(f"  -> Relaxed {dataset_table}.{field_name}")
        for field_name, field_type in update["add"].items():
            if field_name not in fields:
                client.query(
                    f"ALTER TABLE `{table_id}` ADD COLUMN `{field_name}` {field_type}"
                ).result()
                print(f"  -> Added {dataset_table}.{field_name}")

def main():
    print("=== Applying shared BigQuery DDL & AS OF Functions ===")
    client = bigquery.Client(project=PROJECT_ID)
    script_dir = Path(__file__).parent
    for file_name in ("canonical_ddl.sql", "canonical_multileague_ddl.sql", "as_of_functions.sql"):
        execute_sql_file(client, script_dir / file_name)
    reconcile_multileague_schema(client)
    
    # List created tables
    tables = list(client.list_tables(f"{PROJECT_ID}.canonical"))
    print(f"\nCanonical dataset now contains {len(tables)} tables/views/functions:")
    for t in tables:
        print(f"  - {t.table_id} ({t.table_type})")
        
    print("\n=== BigQuery DDL Application Complete ===")

if __name__ == "__main__":
    main()
