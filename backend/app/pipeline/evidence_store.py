"""Processed evidence media: private Backblaze backup with a local working copy.

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
import tempfile
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


def _write(
    content_hash: str, data: bytes, mime: str, fps: float | None, replace_existing: bool = False
) -> bool:
    paths = _paths(content_hash)
    if paths is None:
        return False
    media, meta = paths
    if meta.exists() and media.exists() and not replace_existing:
        return False  # already stored (content-addressed)
    media.parent.mkdir(parents=True, exist_ok=True)
    # Distinct temporary files avoid collisions between parallel calls.
    with tempfile.NamedTemporaryFile(dir=media.parent, delete=False) as handle:
        tmp = Path(handle.name)
        handle.write(data)
    try:
        tmp.replace(media)
        with tempfile.NamedTemporaryFile(dir=meta.parent, mode="w", delete=False) as handle:
            metadata_tmp = Path(handle.name)
            json.dump({"mime": mime, "fps": fps, "bytes": len(data)}, handle)
        try:
            metadata_tmp.replace(meta)
        finally:
            metadata_tmp.unlink(missing_ok=True)
    finally:
        tmp.unlink(missing_ok=True)
    return True


def _uses_b2() -> bool:
    s = get_settings()
    if s.evidence_storage == "local":
        return False
    if s.evidence_storage == "b2" and not s.b2_configured:
        raise ValueError("B2 evidence storage is selected but its configuration is incomplete.")
    return s.b2_configured


async def save(content_hash: str, data: bytes, *, mime: str, fps: float | None = None) -> None:
    """Keep a local working copy and replicate it to B2 when configured.

    Cloud failures preserve local evidence when fallback is enabled. If an exact
    processed clip already exists locally, upload that copy rather than replacing
    it with the original input sent by a later ingest persistence step.
    """
    if not data or _paths(content_hash) is None:
        return
    try:
        if await asyncio.to_thread(_write, content_hash, data, mime, fps):
            log.info("evidence_media_saved", bytes=len(data), mime=mime, fps=fps)
        stored = await asyncio.to_thread(_read, content_hash)
        if stored is not None:
            data = await asyncio.to_thread(stored.path.read_bytes)
            mime, fps = stored.mime, stored.fps
    except (OSError, ValueError):
        log.warning("evidence_media_save_failed")
    if _uses_b2():
        from app.pipeline import b2_store

        try:
            await asyncio.to_thread(b2_store.put, content_hash, data, mime, fps)
        except Exception:  # noqa: BLE001 — cloud outages must allow configured local fallback
            log.warning("b2_evidence_upload_failed", content_hash=content_hash)
            if not get_settings().evidence_local_fallback:
                raise


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
    """Read the local cache, or restore missing evidence from private B2."""
    if _paths(content_hash) is None:
        return None
    try:
        stored = await asyncio.to_thread(_read, content_hash)
        if stored is not None:
            return stored
    except (OSError, ValueError):
        log.warning("evidence_media_read_failed")
    if _uses_b2():
        from app.pipeline import b2_store

        try:
            recovered = await asyncio.to_thread(b2_store.get, content_hash)
            if recovered is not None:
                data, mime, fps = recovered
                await asyncio.to_thread(_write, content_hash, data, mime, fps, True)
                return await asyncio.to_thread(_read, content_hash)
        except Exception:  # noqa: BLE001 — inaccessible remote evidence is an observable miss
            log.warning("b2_evidence_download_failed", content_hash=content_hash)
            if not get_settings().evidence_local_fallback:
                raise
    return None


def extension(mime: str) -> str:
    return _EXT.get(mime, "bin")
