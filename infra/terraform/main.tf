# main.tf — GCP Terraform IaC Footprint for Ape's Mac Salad Corpus (P0-1, P0-2, P0-3, P1-1)

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

variable "project_id" {
  type        = string
  default     = "apes-mac-salad"
  description = "GCP Project ID"
}

variable "region" {
  type        = string
  default     = "us-west1"
  description = "GCP Primary Region"
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# 1. Enable Required GCP Services (P0-1)
resource "google_project_service" "enabled_services" {
  for_each = toset([
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
    "storage.googleapis.com",
    "run.googleapis.com",
    "cloudscheduler.googleapis.com",
    "artifactregistry.googleapis.com",
    # Cloud Build builds the capture image server-side; there is no Docker
    # daemon on the operator machine. Its dependencies are enabled with it.
    "cloudbuild.googleapis.com",
    "containerregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "bigquery.googleapis.com",
    "workflows.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com"
  ])

  service            = each.key
  disable_on_destroy = false
}

# 2. Raw Production Storage Bucket (P0-2)
resource "google_storage_bucket" "raw_prod" {
  name                        = "${var.project_id}-raw-prod"
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  soft_delete_policy {
    retention_duration_seconds = 2592000 # 30 days
  }

  lifecycle_rule {
    action {
      type          = "SetStorageClass"
      storage_class = "COLDLINE"
    }
    condition {
      age = 365 # Demote to Coldline at season-close
    }
  }

  depends_on = [google_project_service.enabled_services]
}

# 3. Capture Service Account (P0-3)
resource "google_service_account" "ams_capture" {
  account_id   = "ams-capture"
  display_name = "Apes Mac Salad Data Capture Agent"
}

# Scoped IAM Grant: objectCreator on raw-prod bucket ONLY
resource "google_storage_bucket_iam_member" "capture_object_creator" {
  bucket = google_storage_bucket.raw_prod.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.ams_capture.email}"
}

# The capture job must also READ the bucket, or its idempotency check cannot
# work: blob.exists() returns 403, the job concludes nothing was captured, and
# re-uploads every source. Beyond wasting Sleeper calls, that overwrites the
# earlier observation at the same window path -- silently discarding history in
# a store whose whole guarantee is that raw is append-only.
#
# objectViewer is read-only and still cannot delete or overwrite, so the job
# keeps the narrow write surface it had.
resource "google_storage_bucket_iam_member" "capture_object_viewer" {
  bucket = google_storage_bucket.raw_prod.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.ams_capture.email}"
}

# 4. BigQuery Datasets (P1-4, P3-1, P4-1)
resource "google_bigquery_dataset" "control" {
  dataset_id  = "control"
  description = "Operational lineage, coverage catalog, and quality results"
  location    = var.region
}

resource "google_bigquery_dataset" "canonical" {
  dataset_id  = "canonical"
  description = "Bitemporal deduplicated canonical layer"
  location    = var.region
}

resource "google_bigquery_dataset" "features" {
  dataset_id  = "features"
  description = "Point-in-time feature store"
  location    = var.region
}

resource "google_bigquery_dataset" "analytics" {
  dataset_id  = "analytics"
  description = "Model outputs, forecasts, and story facts"
  location    = var.region
}

# 5. Artifact Registry Docker Repository
resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = "ams-capture-repo"
  description   = "Docker container images for ams capture jobs"
  format        = "DOCKER"
}

# 6. Cloud Run Job (P0-6)
resource "google_cloud_run_v2_job" "capture_job" {
  name     = "ams-capture-job"
  location = var.region

  template {
    template {
      service_account = google_service_account.ams_capture.email
      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.repo.repository_id}/capture:latest"
        env {
          name  = "OUTPUT_BUCKET"
          value = google_storage_bucket.raw_prod.name
        }
      }
    }
  }
}

# 7. Cloud Scheduler Entry (P0-7): Daily 06:00 America/Los_Angeles
resource "google_cloud_scheduler_job" "daily_capture" {
  name        = "ams-daily-capture"
  description = "Triggers daily data capture job at 06:00 PT"
  schedule    = "0 6 * * *"
  time_zone   = "America/Los_Angeles"

  http_target {
    http_method = "POST"
    uri         = "https://${var.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${var.project_id}/jobs/${google_cloud_run_v2_job.capture_job.name}:run"
    oauth_token {
      service_account_email = google_service_account.ams_capture.email
    }
  }
}

# ---------------------------------------------------------------------------
# Alerting (MASTER_PLAN P9-5)
#
# Capture running unattended is only worth having if a silent failure surfaces.
# Without this, a job that starts failing on a Tuesday is invisible until
# someone happens to look at the bucket -- by which time the perishable data for
# those days is gone for good.
# ---------------------------------------------------------------------------

variable "alert_email" {
  type        = string
  description = "Address for capture-failure alerts"
}

resource "google_monitoring_notification_channel" "ops_email" {
  display_name = "Ape's Mac Salad ops"
  type         = "email"
  labels       = { email_address = var.alert_email }
}

# Counts Cloud Run Job executions that finished unsuccessfully.
resource "google_logging_metric" "capture_job_failed" {
  name   = "ams_capture_job_failed"
  filter = <<-EOT
    resource.type="cloud_run_job"
    resource.labels.job_name="ams-capture-job"
    severity>=ERROR
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }

  depends_on = [google_project_service.enabled_services]
}

resource "google_monitoring_alert_policy" "capture_failed" {
  display_name = "Capture job failed"
  combiner     = "OR"

  conditions {
    display_name = "capture job logged an error"
    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.capture_job_failed.name}\" AND resource.type=\"cloud_run_job\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_SUM"
      }
    }
  }

  # A missed run is as bad as a failed one, but absence of logs cannot trigger a
  # threshold. The 25h window means a skipped daily run closes the incident only
  # once a later run succeeds.
  alert_strategy {
    auto_close = "90000s"
  }

  notification_channels = [google_monitoring_notification_channel.ops_email.id]

  documentation {
    content = join("\n", [
      "The daily capture job failed. Perishable sources (FantasyCalc values,",
      "injury status, rosters before a trade) cannot be recovered for the days",
      "it stays broken, so treat this as time-sensitive.",
      "",
      "Check:  control.capture_run for the last successful run",
      "        control.coverage for sources marked degraded",
      "Re-run: gcloud run jobs execute ams-capture-job --region us-west1",
    ])
  }

  depends_on = [google_project_service.enabled_services]
}

# ---------------------------------------------------------------------------
# CI pipeline identity
#
# The scheduled refresh needs to read raw from the bucket and write the derived
# layers in BigQuery. It does not need to create infrastructure, manage IAM, or
# delete anything -- so it must not run as terraform-admin. A key for that
# identity sitting in a GitHub secret would be a project-wide credential in a
# place many people can trigger.
#
# This identity can read raw and write derived data, and nothing else.
# ---------------------------------------------------------------------------

resource "google_service_account" "ams_pipeline" {
  account_id   = "ams-pipeline"
  display_name = "Apes Mac Salad scheduled refresh (CI)"
}

# Read raw. Explicitly not objectCreator: the refresh consumes captures, it does
# not produce them, and capture stays the only writer to the store of record.
resource "google_storage_bucket_iam_member" "pipeline_raw_reader" {
  bucket = google_storage_bucket.raw_prod.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.ams_pipeline.email}"
}

# Write the derived layers only. canonical, features, analytics and control are
# all rebuildable from raw, so a mistake here is recoverable.
resource "google_bigquery_dataset_iam_member" "pipeline_dataset_editor" {
  for_each = toset([
    google_bigquery_dataset.canonical.dataset_id,
    google_bigquery_dataset.features.dataset_id,
    google_bigquery_dataset.analytics.dataset_id,
    google_bigquery_dataset.control.dataset_id,
  ])

  dataset_id = each.key
  role       = "roles/bigquery.dataEditor"
  member     = "serviceAccount:${google_service_account.ams_pipeline.email}"
}

# Running a query bills against the project, which is a project-level right
# rather than a dataset-level one.
resource "google_project_iam_member" "pipeline_job_user" {
  project = var.project_id
  role    = "roles/bigquery.jobUser"
  member  = "serviceAccount:${google_service_account.ams_pipeline.email}"
}

output "ci_service_account" {
  value       = google_service_account.ams_pipeline.email
  description = "Create a key for this account and store it as the GCP_SA_KEY repository secret"
}
