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


# Demo convenience: a filename prefixed "scenario__…" forces a specific mock
# scenario so positive/negative paths can be shown on demand (e.g.
# "no-truck__clip.mp4", "over-capacity__clip.mp4"). The prefix must match a
# fixture key; otherwise it's ignored and the real content hash is used. This
# only affects MOCK_AI mode — the live pipeline keys off the true hash.
_SCENARIO_SEP = "__"


def scenario_override(filename: str) -> str | None:
    """Return the fixture key encoded in a `scenario__name.ext` filename, if any."""
    from app.ai.mock import fixture_keys  # local import avoids a cycle

    base = filename.rsplit("/", 1)[-1]
    if _SCENARIO_SEP not in base:
        return None
    candidate = base.split(_SCENARIO_SEP, 1)[0].strip().lower()
    return candidate if candidate in fixture_keys() else None


def ingest_upload(
    filename: str,
    data: bytes,
    *,
    source_kind: str = "upload",
    allow_scenario_override: bool = True,
) -> IngestedArtifact:
    """Stage 0+1 for a direct upload: normalize + hash. Raises on empty input.

    If the filename carries a `scenario__…` prefix matching a known mock fixture
    (and ``allow_scenario_override`` is set, as it is under MOCK_AI), the content
    hash is set to that key so the mock replays that exact scenario. The live
    pipeline passes ``allow_scenario_override=False`` so results are always
    keyed by the true SHA-256 of the bytes.
    """
    if not data:
        raise ValueError("empty upload")
    override = scenario_override(filename) if allow_scenario_override else None
    return IngestedArtifact(
        filename=filename,
        media_kind=_guess_media_kind(filename),
        content_hash=override or content_hash(data),
        size_bytes=len(data),
        source_kind=source_kind,
    )
