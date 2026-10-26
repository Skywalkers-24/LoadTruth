"""Unit tests for the source adapter layer (factory + validation + fetch).

No network I/O: ``validate_config`` is pure key-presence checking, ``upload``
fetch reuses the ingest hash path, and every other kind's fetch raises
``SourceFetchNotImplementedError``.
"""

from __future__ import annotations

import pytest

from app.pipeline.ingest import IngestedArtifact
from app.pipeline.sources import (
    SourceFetchNotImplementedError,
    UnknownSourceKindError,
    UploadAdapter,
    get_adapter,
)
from app.tickets.schemas import SourceKind


def test_factory_returns_adapter_for_every_kind() -> None:
    for kind in SourceKind:
        adapter = get_adapter(kind)
        assert adapter.kind is kind


def test_factory_accepts_string_kind() -> None:
    adapter = get_adapter("rtsp", {"url": "rtsp://a/b"})
    assert adapter.kind is SourceKind.RTSP


def test_factory_rejects_unknown_kind() -> None:
    with pytest.raises(UnknownSourceKindError):
        get_adapter("carrier-pigeon")


def test_upload_validate_ok_without_config() -> None:
    result = get_adapter(SourceKind.UPLOAD).validate_config()
    assert result.ok is True


@pytest.mark.parametrize(
    ("kind", "config"),
    [
        (SourceKind.RTSP, {"url": "rtsp://a/b"}),
        (SourceKind.HLS, {"url": "https://x/s.m3u8"}),
        (SourceKind.S3, {"bucket": "b", "region": "us-east-1"}),
        (SourceKind.GCS, {"bucket": "b"}),
        (SourceKind.AZURE_BLOB, {"account": "a", "container": "c"}),
        (SourceKind.GOOGLE_DRIVE, {"folder_id": "f"}),
        (SourceKind.DROPBOX, {"path": "/clips"}),
        (SourceKind.WEBHOOK, {"endpoint": "https://hook/x"}),
    ],
)
def test_validate_ok_with_required_keys(kind: SourceKind, config: dict[str, object]) -> None:
    assert get_adapter(kind, config).validate_config().ok is True


@pytest.mark.parametrize(
    ("kind", "config", "missing"),
    [
        (SourceKind.RTSP, {}, "url"),
        (SourceKind.HLS, {"url": ""}, "url"),  # empty value counts as missing
        (SourceKind.S3, {"bucket": "b"}, "region"),
        (SourceKind.AZURE_BLOB, {"account": "a"}, "container"),
        (SourceKind.WEBHOOK, {}, "endpoint"),
        (SourceKind.DROPBOX, {"path": None}, "path"),
    ],
)
def test_validate_not_ok_when_required_key_missing(
    kind: SourceKind, config: dict[str, object], missing: str
) -> None:
    result = get_adapter(kind, config).validate_config()
    assert result.ok is False
    assert missing in result.detail


def test_upload_fetch_reuses_ingest() -> None:
    adapter = get_adapter(SourceKind.UPLOAD)
    assert isinstance(adapter, UploadAdapter)
    artifact = adapter.fetch(filename="haul.mp4", data=b"bytes")
    assert isinstance(artifact, IngestedArtifact)
    assert artifact.source_kind == "upload"
    assert artifact.media_kind == "video"


def test_upload_fetch_requires_filename_and_bytes() -> None:
    with pytest.raises(ValueError, match="requires filename"):
        get_adapter(SourceKind.UPLOAD).fetch(filename=123, data=b"x")


@pytest.mark.parametrize(
    "kind",
    [
        SourceKind.RTSP,
        SourceKind.HLS,
        SourceKind.S3,
        SourceKind.GCS,
        SourceKind.AZURE_BLOB,
        SourceKind.GOOGLE_DRIVE,
        SourceKind.DROPBOX,
        SourceKind.WEBHOOK,
    ],
)
def test_unwired_fetch_raises(kind: SourceKind) -> None:
    with pytest.raises(SourceFetchNotImplementedError):
        get_adapter(kind).fetch()
