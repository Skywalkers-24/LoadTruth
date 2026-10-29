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


class StorageUnavailableError(RuntimeError):
    """B2 storage could not complete an operation; there is no local fallback."""


def require_configured() -> None:
    if not get_settings().b2_configured:
        raise StorageUnavailableError(
            "Configure Backblaze B2 before uploading or reading evidence."
        )


def head_key(key: str, version: str | None = None) -> dict[str, Any] | None:
    require_configured()
    s = get_settings()
    with closing(client()) as s3:
        try:
            return dict(
                s3.head_object(
                    Bucket=s.b2_bucket_name, Key=key, **({"VersionId": version} if version else {})
                )
            )
        except ClientError as exc:
            if str(exc.response["Error"]["Code"]) in ("404", "NoSuchKey", "NotFound"):
                return None
            raise


def signed_url(key: str, *, upload_mime: str | None = None, version: str | None = None) -> str:
    require_configured()
    s = get_settings()
    params = {"Bucket": s.b2_bucket_name, "Key": key}
    if upload_mime:
        params["ContentType"] = upload_mime
    if version:
        params["VersionId"] = version
    with closing(client()) as s3:
        return str(
            s3.generate_presigned_url(
                "put_object" if upload_mime else "get_object",
                Params=params,
                ExpiresIn=s.b2_signed_url_ttl_s,
            )
        )


def download_to(key: str, file: Any, max_bytes: int, version: str | None = None) -> str:
    """Stream into a temporary processing file, with a hard size ceiling."""
    require_configured()
    digest = hashlib.sha256()
    total = 0
    with closing(client()) as s3:
        response = s3.get_object(
            Bucket=get_settings().b2_bucket_name,
            Key=key,
            **({"VersionId": version} if version else {}),
        )
        if int(response.get("ContentLength", 0)) > max_bytes:
            response["Body"].close()
            raise ValueError("This clip exceeds the analysis size limit. Trim it before analysis.")
        with closing(response["Body"]) as body:
            for chunk in body.iter_chunks(chunk_size=1024 * 1024):
                total += len(chunk)
                if total > max_bytes:
                    raise ValueError("This clip exceeds the analysis size limit.")
                file.write(chunk)
                digest.update(chunk)
    file.seek(0)
    return digest.hexdigest()
