# Operational Runbook: Apes Mac Salad League Almanac

This document outlines the standard operating procedures, maintenance cadences, on-call alert triage, and emergency recovery drills for the **Apes Mac Salad** fantasy sports analytics infrastructure.

---

## 1. Operating Cadence

### Daily Tasks (Automated via Cloud Scheduler)
- **Daily Raw Snapshot Ingestion**:
  - Cloud Scheduler triggers Cloud Run job `ams-capture-job` daily at `06:00 UTC`.
  - Captures live Sleeper rosters, metadata, and transaction states to `gs://apes-mac-salad-raw-prod/raw/...`.
  - Emits `.meta.json` sidecar with SHA-256 payload checksums.
- **Health Verification**:
  - Check GCP Cloud Run execution logs for `Exit Code 0`.

### Weekly In-Season Tasks (Tuesday 08:00 UTC)
1. **Scoring Reconciliation**:
   - Run `python sleeper_work/scoring_reconciliation.py` to audit finished week matchup points against official Sleeper totals.
2. **Lineup Lens & Timeline Generation**:
   - Run `python sleeper_work/lineup_optimizer.py` and `python sleeper_work/matchup_timeline.py` to generate hindsight-optimal lineups and decisive swing plays.
3. **Forecast Run & BigQuery Analytics Update**:
   - Run `python sleeper_work/monte_carlo_forecast.py` to generate updated weekly playoff odds and championship projections.
4. **Site Deployment**:
   - Git push updates to `main` triggering Netlify live deployment at [https://apesmacsalad.netlify.app](https://apesmacsalad.netlify.app).

### End-of-Season Tasks (Post-Week 17 / Championship)
1. **Hall of Mac Awards Finalization**:
   - Run `python sleeper_work/hall_of_mac_approval.py` to review and publish end-of-season awards.
2. **Season-Close Demotion Drill**:
   - Run `python sleeper_work/season_close_demotion_drill.py` to generate archival manifests and verify Coldline transition.

---

## 2. On-Call Incident Response & Triage

### Scenario A: Missed Daily Capture
- **Symptom**: Cloud Scheduler job reports non-zero exit code or timeout.
- **Procedure**:
  1. Inspect Cloud Run job logs in Google Cloud Console.
  2. Verify Sleeper API availability via curl:
     ```bash
     curl -s https://api.sleeper.app/v1/league/1312209616372772864
     ```
  3. Re-run manual capture locally or via gcloud CLI:
     ```bash
     python sleeper_work/capture_sleeper_data.py --league_id 1312209616372772864 --upload_gcs
     ```

### Scenario B: Data Corruption or Broken Canonical Layer
- **Symptom**: Checksum mismatch or corrupted BigQuery table state.
- **Procedure**:
  1. Execute Gate P3 Rebuild Drill to reconstruct canonical layer from raw immutable snapshots:
     ```bash
     python sleeper_work/rebuild_drill.py
     ```
  2. Verify all 12 rosters and 48 draft picks match expected checksums.

---

## 3. Disaster Recovery & Coldline Restoration

To restore historical data from GCS Coldline:
```bash
gsutil -m cp -r gs://apes-mac-salad-raw-prod/raw/season=2026/ ./sleeper_work/raw/
python sleeper_work/build_canonical_layer.py
```
All canonical entities and point-in-time feature stores will be reconstructed without data loss.
