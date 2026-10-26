"""Stages 0-1 — ingest an artifact and derive its content hash (PLAN.md §5).

Stage 0 normalizes any source into bytes + metadata (here: a direct upload).
Stage 1 content-hashes those bytes; the hash is the cache key for every
downstream AI call, so re-running a clip (or the demo's live path) costs $0.

Real frame decoding/sampling (ffmpeg/PyAV at 2-4 fps) attaches at Stage 1 when
media handling lands; the hash and provenance are what the rest of the pipeline
actually depends on, and they are deterministic and testable now.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class IngestedArtifact:
    """A normalized, hashed piece of evidence ready for the pipeline."""

    filename: str
    media_kind: str  # "video" | "image"
    content_hash: str
    size_bytes: int
    source_kind: str = "upload"


def _guess_media_kind(filename: str) -> str:
    lower = filename.lower()
    if lower.endswith((".jpg", ".jpeg", ".png", ".webp", ".gif")):
        return "image"
    return "video"


def content_hash(data: bytes) -> str:
    """Stable SHA-256 content hash (the pipeline cache key)."""
    return hashlib.sha256(data).hexdigest()


def ingest_upload(filename: str, data: bytes, *, source_kind: str = "upload") -> IngestedArtifact:
    """Stage 0+1 for a direct upload: normalize + hash. Raises on empty input."""
    if not data:
        raise ValueError("empty upload")
    return IngestedArtifact(
        filename=filename,
        media_kind=_guess_media_kind(filename),
        content_hash=content_hash(data),
        size_bytes=len(data),
        source_kind=source_kind,
    )
