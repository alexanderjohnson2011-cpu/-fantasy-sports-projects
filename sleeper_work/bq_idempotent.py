"""
bq_idempotent.py — content-hash idempotent loads for the canonical layer
(MASTER_PLAN P1-7, P3-3, and the section 7 invariant "no UPDATE in canonical").

The first loader used ``insert_rows_json`` directly, which is an unconditional
streaming append: every re-run added the whole row set again. That is how
``canonical.draft_picks`` came to hold 144 rows for 48 distinct picks. A backfill
or a retried job silently multiplied the corpus.

This module replaces that with a load-then-MERGE:

    1. write the batch into a scratch table with a load job (not the streaming
       API, so there is no streaming buffer to fight);
    2. MERGE into the target on ``content_hash``, inserting only what is absent;
    3. drop the scratch table.

Because ``content_hash`` is per entity, an unchanged entity produces the same
hash and is skipped, while a genuine change inserts a new row and leaves the
prior observation intact. That is append-only and bitemporally correct: history
accumulates, nothing is overwritten, and re-running a load is a no-op.
"""

import uuid

try:
    from google.cloud import bigquery
except ImportError:  # allows import in environments without the SDK
    bigquery = None


def _scratch_name(table_id):
    return "%s_stg_%s" % (table_id, uuid.uuid4().hex[:8])


def merge_rows(client, dataset, table, rows, key_field="content_hash"):
    """Insert only rows whose key is not already present. Returns (inserted, skipped).

    ``rows`` is a list of dicts matching the target schema. The target must
    already exist; its schema is reused for the scratch table so a column
    mismatch fails loudly here rather than corrupting the target.
    """
    if not rows:
        return 0, 0
    if bigquery is None:
        raise RuntimeError("google-cloud-bigquery is not installed")

    target_id = "%s.%s.%s" % (client.project, dataset, table)
    target = client.get_table(target_id)

    present_keys = {f.name for f in target.schema}
    if key_field not in present_keys:
        raise ValueError(
            "%s has no %s column; refusing to load without a dedup key"
            % (target_id, key_field))

    missing = [k for k in rows[0].keys() if k not in present_keys]
    if missing:
        raise ValueError("rows carry columns absent from %s: %s" % (target_id, missing))

    scratch_id = "%s.%s.%s" % (client.project, dataset, _scratch_name(table))
    job_config = bigquery.LoadJobConfig(
        schema=target.schema,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
    )

    before = client.get_table(target_id).num_rows
    try:
        client.load_table_from_json(rows, scratch_id, job_config=job_config).result()

        cols = ", ".join("`%s`" % f.name for f in target.schema)
        vals = ", ".join("S.`%s`" % f.name for f in target.schema)
        client.query(
            """
            MERGE `{target}` T
            USING (
              SELECT * EXCEPT(rn) FROM (
                SELECT *, ROW_NUMBER() OVER (PARTITION BY `{key}`) rn FROM `{scratch}`
              ) WHERE rn = 1
            ) S
            ON T.`{key}` = S.`{key}`
            WHEN NOT MATCHED THEN INSERT ({cols}) VALUES ({vals})
            """.format(target=target_id, scratch=scratch_id, key=key_field,
                       cols=cols, vals=vals)
        ).result()
    finally:
        client.delete_table(scratch_id, not_found_ok=True)

    after = client.get_table(target_id).num_rows
    inserted = after - before
    return inserted, len(rows) - inserted


def dedupe_existing(client, dataset, table, key_field="content_hash", dry_run=True):
    """Collapse an already-duplicated table to one row per key.

    Keeps the earliest ``observed_at_utc`` for each key when that column exists,
    so the original observation time survives rather than a re-run's timestamp.
    Returns (total_before, distinct_keys).
    """
    if bigquery is None:
        raise RuntimeError("google-cloud-bigquery is not installed")

    target_id = "%s.%s.%s" % (client.project, dataset, table)
    schema = {f.name for f in client.get_table(target_id).schema}
    if key_field not in schema:
        return None, None

    row = list(client.query(
        "SELECT COUNT(*) t, COUNT(DISTINCT `%s`) d FROM `%s`" % (key_field, target_id)
    ).result())[0]
    total, distinct = row.t, row.d
    if dry_run or total == distinct:
        return total, distinct

    order = "observed_at_utc" if "observed_at_utc" in schema else key_field

    # CREATE OR REPLACE drops partitioning and clustering unless they are
    # restated, and BigQuery rejects a replace that changes the spec. Rebuild
    # the clauses from the live table so the rewrite is spec-preserving.
    tbl = client.get_table(target_id)
    clauses = []
    tp = tbl.time_partitioning
    if tp and tp.field:
        field_type = next(
            (f.field_type for f in tbl.schema if f.name == tp.field), "TIMESTAMP")
        expr = tp.field if field_type == "DATE" else "DATE(`%s`)" % tp.field
        clauses.append("PARTITION BY %s" % expr)
    elif tp:
        clauses.append("PARTITION BY DATE(_PARTITIONTIME)")
    if tbl.clustering_fields:
        clauses.append("CLUSTER BY %s"
                       % ", ".join("`%s`" % c for c in tbl.clustering_fields))
    if tbl.require_partition_filter:
        clauses.append("OPTIONS(require_partition_filter=true)")

    client.query(
        """
        CREATE OR REPLACE TABLE `{t}`
        {clauses}
        AS
        SELECT * EXCEPT(rn) FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY `{k}` ORDER BY `{o}`) rn
          FROM `{t}`
        ) WHERE rn = 1
        """.format(t=target_id, k=key_field, o=order, clauses="\n        ".join(clauses))
    ).result()
    return total, distinct
