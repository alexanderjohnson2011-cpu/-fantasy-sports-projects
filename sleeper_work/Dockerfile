# Capture job image (MASTER_PLAN P0-6).
#
# The Cloud Run job has always referenced <region>-docker.pkg.dev/<project>/
# ams-capture-repo/capture:latest, but no Dockerfile existed, so the image was
# never built and the job could not start. This is that image.
#
# Deliberately minimal: the capture step only needs the standard library to talk
# to Sleeper and FantasyCalc, plus google-cloud-storage to write raw objects.
# Parsing, BigQuery loading and scoring are separate steps and are not installed
# here, which keeps the image small and the job's blast radius narrow.

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN pip install --no-cache-dir "google-cloud-storage>=2.14,<4"

# Only the capture entrypoint. Adding the rest of sleeper_work/ would pull in
# analysis code this job must never run.
COPY capture_sleeper_data.py /app/capture_sleeper_data.py
COPY source_registry.json /app/source_registry.json

# Cloud Run Jobs run as a non-root user by convention; raw output goes straight
# to GCS, so the container filesystem only needs a scratch directory.
RUN useradd --create-home --uid 1000 capture \
 && mkdir -p /tmp/capture \
 && chown -R capture:capture /app /tmp/capture
USER capture

# OUTPUT_BUCKET is injected by the job definition. Without it the run still
# succeeds locally but writes nothing durable, so it is required in production.
ENTRYPOINT ["python", "/app/capture_sleeper_data.py", "--output-dir", "/tmp/capture"]
