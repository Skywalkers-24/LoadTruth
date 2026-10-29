"""Private S3-compatible evidence objects; clients never receive bucket credentials."""

from __future__ import annotations

import hashlib
from contextlib import closing
from typing import Any

import boto3  # type: ignore[import-untyped]
from botocore.config import Config  # type: ignore[import-untyped]
from botocore.exceptions import ClientError  # type: ignore[import-untyped]

from app.config import get_settings


def client() -> Any:
    s = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=s.b2_s3_endpoint,
        region_name=s.b2_region,
        aws_access_key_id=s.b2_key_id,
        aws_secret_access_key=s.b2_application_key,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
            connect_timeout=5,
            read_timeout=30,
            retries={"max_attempts": 1},
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
        ),
    )


def object_key(content_hash: str) -> str:
    prefix = get_settings().b2_key_prefix.strip("/")
    return f"{prefix}/{content_hash}" if prefix else content_hash


def put(content_hash: str, data: bytes, mime: str, fps: float | None) -> None:
    s = get_settings()
    key = object_key(content_hash)
    digest = hashlib.sha256(data).hexdigest()
    with closing(client()) as s3:
        try:
            head = s3.head_object(Bucket=s.b2_bucket_name, Key=key)
            if head.get("Metadata", {}).get("sha256") == digest:
                return
        except ClientError as exc:
            if str(exc.response["Error"]["Code"]) not in ("404", "NoSuchKey", "NotFound"):
                raise
        s3.put_object(
            Bucket=s.b2_bucket_name,
            Key=key,
            Body=data,
            ContentType=mime,
            Metadata={"sha256": digest, "fps": str(fps) if fps is not None else ""},
        )


def get(content_hash: str) -> tuple[bytes, str, float | None] | None:
    s = get_settings()
    with closing(client()) as s3:
        try:
            response = s3.get_object(Bucket=s.b2_bucket_name, Key=object_key(content_hash))
        except ClientError as exc:
            if str(exc.response["Error"]["Code"]) in ("404", "NoSuchKey", "NotFound"):
                return None
            raise
        body = response["Body"]
        try:
            data = body.read()
        finally:
            body.close()
        metadata = response.get("Metadata", {})
        expected = metadata.get("sha256")
        if not expected or hashlib.sha256(data).hexdigest() != expected:
            raise ValueError("Evidence object checksum did not match.")
        fps = metadata.get("fps")
        return data, response.get("ContentType") or "video/mp4", float(fps) if fps else None
