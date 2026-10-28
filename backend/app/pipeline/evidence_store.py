"""On-disk store for the processed evidence media (the clip the models saw).

Files are named by content hash, so identical bytes are stored once. Access is
always gated by a tenant-scoped ``ticket_evidence`` row; nothing here is served
without that check. Each media file has a small JSON sidecar with its MIME type
and, for a resampled video, its frame rate.

The directory is ``evidence_dir`` (``./media/evidence`` on the host, mounted into
the backend container).
"""

from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass
from pathlib import Path

from app.config import get_settings
from app.log import get_logger

log = get_logger("pipeline.evidence_store")

# SHA-256 hex, or a fixture scenario key: never a path.
_SAFE_KEY = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
_EXT = {
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
}


@dataclass(frozen=True, slots=True)
class StoredMedia:
    """A stored evidence file and its metadata."""

    path: Path
    mime: str
    fps: float | None


def _root() -> Path:
    return Path(get_settings().evidence_dir)


def _paths(content_hash: str) -> tuple[Path, Path] | None:
    if not _SAFE_KEY.match(content_hash):
        return None
    root = _root()
    return root / content_hash, root / f"{content_hash}.json"


def _write(content_hash: str, data: bytes, mime: str, fps: float | None) -> bool:
    paths = _paths(content_hash)
    if paths is None:
        return False
    media, meta = paths
    if meta.exists():
        return False  # already stored (content-addressed)
    media.parent.mkdir(parents=True, exist_ok=True)
    tmp = media.with_suffix(".part")
    tmp.write_bytes(data)
    tmp.replace(media)
    meta.write_text(json.dumps({"mime": mime, "fps": fps, "bytes": len(data)}))
    return True


async def save(content_hash: str, data: bytes, *, mime: str, fps: float | None = None) -> None:
    """Store media for a clip once. Best effort: a failure is logged, not raised."""
    if not data:
        return
    try:
        if await asyncio.to_thread(_write, content_hash, data, mime, fps):
            log.info("evidence_media_saved", bytes=len(data), mime=mime, fps=fps)
    except OSError:
        log.warning("evidence_media_save_failed", exc_info=True)


def _read(content_hash: str) -> StoredMedia | None:
    paths = _paths(content_hash)
    if paths is None:
        return None
    media, meta = paths
    if not media.is_file() or not meta.is_file():
        return None
    info = json.loads(meta.read_text())
    fps = info.get("fps")
    return StoredMedia(media, str(info.get("mime") or "video/mp4"), float(fps) if fps else None)


async def load(content_hash: str) -> StoredMedia | None:
    """The stored media for a clip, or None."""
    try:
        return await asyncio.to_thread(_read, content_hash)
    except (OSError, ValueError):
        log.warning("evidence_media_read_failed", exc_info=True)
        return None


def extension(mime: str) -> str:
    return _EXT.get(mime, "bin")
