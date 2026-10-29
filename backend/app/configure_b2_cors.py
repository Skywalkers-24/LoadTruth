"""Inspect/add the exact browser origins used by direct B2 uploads.

python -m app.configure_b2_cors --apply
Preserves other S3 CORS rules and never changes bucket visibility.
"""

from __future__ import annotations

import argparse
from contextlib import closing

from botocore.exceptions import ClientError  # type: ignore[import-untyped]

from app.config import get_settings
from app.pipeline import b2_store


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    b2_store.require_configured()
    s = get_settings()
    origins = list(
        dict.fromkeys(
            [
                *s.allowed_origins,
                "http://localhost:3000",
                "https://loadtruth.tiwabhay800.workers.dev",
            ]
        )
    )
    rule = {
        "ID": "loadtruth-direct-uploads",
        "AllowedOrigins": origins,
        "AllowedMethods": ["GET", "HEAD", "PUT"],
        "AllowedHeaders": ["content-type", "range", "x-amz-*"],
        "ExposeHeaders": ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
        "MaxAgeSeconds": 3600,
    }
    with closing(b2_store.client()) as client:
        try:
            rules = client.get_bucket_cors(Bucket=s.b2_bucket_name).get("CORSRules", [])
        except ClientError as exc:
            if exc.response["Error"]["Code"] not in (
                "NoSuchCORSConfiguration",
                "NoSuchCorsConfiguration",
            ):
                raise
            rules = []
        retained = [item for item in rules if item.get("ID") != rule["ID"]]
        print(f"Existing S3 rules: {len(rules)}. Other rules retained: {len(retained)}.")
        if args.apply:
            client.put_bucket_cors(
                Bucket=s.b2_bucket_name, CORSConfiguration={"CORSRules": [*retained, rule]}
            )
            print("Direct-upload rule saved for exact origins: " + ", ".join(origins))
        else:
            print("Read only; use --apply to add the direct-upload rule.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        code = (
            exc.response.get("Error", {}).get("Code")
            if isinstance(exc, ClientError)
            else type(exc).__name__
        )
        raise SystemExit(f"B2 CORS check failed: {code}. Credentials were not printed.") from None
