"""
raw_source.py — read raw captures from local disk or Cloud Storage

The loaders originally walked the local raw/ tree, which works on the machine
that ran the capture and nowhere else. Cloud Storage is the store of record, so
anything that reads raw must be able to read it from there -- otherwise the
pipeline can only ever be run by hand, from one laptop.

Both backends yield the same (payload, sidecar, identifier) shape, so callers do
not branch on which one is in use.
"""

import gzip
import json
import os


def _pairs_local(root, source):
    base = os.path.join(root, "source=%s" % source)
    if not os.path.isdir(base):
        return
    for dirpath, _dirs, files in os.walk(base):
        for name in sorted(files):
            if name.endswith(".json.gz"):
                yield os.path.join(dirpath, name)


def _read_local(path):
    with gzip.open(path, "rb") as fh:
        payload = json.loads(fh.read().decode("utf-8"))
    with open(path + ".meta.json", encoding="utf-8") as fh:
        sidecar = json.load(fh)
    return payload, sidecar


def _pairs_gcs(client, bucket, source):
    prefix = "raw/source=%s/" % source
    for blob in client.list_blobs(bucket, prefix=prefix):
        if blob.name.endswith(".json.gz"):
            yield blob


def _read_gcs(client, bucket, blob):
    payload = json.loads(gzip.decompress(blob.download_as_bytes()).decode("utf-8"))
    meta_blob = client.bucket(bucket).blob(blob.name + ".meta.json")
    sidecar = json.loads(meta_blob.download_as_bytes().decode("utf-8"))
    return payload, sidecar


def iter_captures(source, local_root=None, bucket=None):
    """Yield (payload, sidecar, identifier) for every capture of a source.

    Prefers GCS when a bucket is given. A capture whose sidecar is missing or
    unreadable is skipped rather than guessed at -- an object with no provenance
    is not something to load into a corpus that exists to be auditable.
    """
    if bucket:
        from google.cloud import storage
        client = storage.Client()
        for blob in _pairs_gcs(client, bucket, source):
            try:
                payload, sidecar = _read_gcs(client, bucket, blob)
            except Exception as e:
                print("  [skip] gs://%s/%s (%s)" % (bucket, blob.name, str(e)[:70]))
                continue
            yield payload, sidecar, "gs://%s/%s" % (bucket, blob.name)
        return

    root = local_root or os.path.join(os.path.dirname(os.path.abspath(__file__)), "raw")
    for path in _pairs_local(root, source):
        if not os.path.exists(path + ".meta.json"):
            continue
        try:
            payload, sidecar = _read_local(path)
        except Exception as e:
            print("  [skip] %s (%s)" % (os.path.basename(path), str(e)[:70]))
            continue
        yield payload, sidecar, path


def newest_capture(source, entity, local_root=None, bucket=None):
    """Most recent capture of one entity, by sidecar retrieval time."""
    best = None
    for payload, sidecar, ident in iter_captures(source, local_root, bucket):
        if entity and entity not in ident:
            continue
        stamp = sidecar.get("retrieval_utc") or ""
        if best is None or stamp > best[0]:
            best = (stamp, payload, sidecar)
    return (best[1], best[2]) if best else (None, None)
