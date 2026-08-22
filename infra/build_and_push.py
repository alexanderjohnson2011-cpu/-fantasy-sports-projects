"""
build_and_push.py — build the capture image with Cloud Build (MASTER_PLAN P0-6).

There is no Docker daemon on the operator machine, so the image is built
server-side: the build context is tarred, uploaded to GCS, and Cloud Build is
asked to build it and push to Artifact Registry.

Read-only until it is asked to build. Run with --dry-run to see what it would do.
"""

import argparse
import io
import os
import sys
import tarfile
import time

from google.cloud import storage
from google.cloud.devtools import cloudbuild_v1

HERE = os.path.dirname(os.path.abspath(__file__))
CONTEXT_DIR = os.path.join(os.path.dirname(HERE), "sleeper_work")

PROJECT = os.environ.get("GCP_PROJECT", "apes-mac-salad")
REGION = os.environ.get("GCP_REGION", "us-west1")
REPO = "ams-capture-repo"
IMAGE = "capture"
BUCKET = os.environ.get("OUTPUT_BUCKET", "apes-mac-salad-raw-prod")

# Only what the image needs. Shipping the whole directory would put analysis
# code and cached snapshots into the build context.
CONTEXT_FILES = ["Dockerfile", "capture_sleeper_data.py", "source_registry.json"]


def make_context_tar():
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for name in CONTEXT_FILES:
            path = os.path.join(CONTEXT_DIR, name)
            if not os.path.exists(path):
                raise FileNotFoundError("build context missing %s" % path)
            tar.add(path, arcname=name)
    return buf.getvalue()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", default="latest")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    image_uri = "%s-docker.pkg.dev/%s/%s/%s:%s" % (REGION, PROJECT, REPO, IMAGE, args.tag)
    blob_name = "_build/context-%s.tar.gz" % time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())

    tar_bytes = make_context_tar()
    print("build context : %s (%d bytes)" % (", ".join(CONTEXT_FILES), len(tar_bytes)))
    print("target image  : %s" % image_uri)
    print("context object: gs://%s/%s" % (BUCKET, blob_name))

    if args.dry_run:
        print("\ndry run - nothing uploaded or built")
        return 0

    storage.Client(project=PROJECT).bucket(BUCKET).blob(blob_name).upload_from_string(
        tar_bytes, content_type="application/gzip")
    print("\nuploaded context")

    client = cloudbuild_v1.CloudBuildClient()
    build = cloudbuild_v1.Build(
        source=cloudbuild_v1.Source(
            storage_source=cloudbuild_v1.StorageSource(bucket=BUCKET, object_=blob_name)
        ),
        steps=[
            cloudbuild_v1.BuildStep(
                name="gcr.io/cloud-builders/docker",
                args=["build", "-t", image_uri, "."],
            )
        ],
        images=[image_uri],
        timeout={"seconds": 1200},
    )

    op = client.create_build(project_id=PROJECT, build=build)
    meta = cloudbuild_v1.BuildOperationMetadata(op.metadata)
    print("build id      : %s" % meta.build.id)
    print("logs          : %s" % (meta.build.log_url or "(console)"))
    print("\nwaiting for the build to finish...")

    result = op.result(timeout=1800)
    status = cloudbuild_v1.Build.Status(result.status).name
    print("\nbuild status  : %s" % status)
    if status != "SUCCESS":
        print("failure detail: %s" % (result.status_detail or "(none)"))
        return 1
    for img in result.results.images:
        print("pushed        : %s@%s" % (img.name, img.digest))
    return 0


if __name__ == "__main__":
    sys.exit(main())
