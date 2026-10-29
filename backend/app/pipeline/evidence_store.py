"""B2-only evidence storage. No local persistent copy or fallback."""

from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass

from app.pipeline import b2_store

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
    object_key: str
    mime: str
    fps: float | None
    size_bytes: int = 0
    object_version: str | None = None


async def save(content_hash: str, data: bytes, *, mime: str, fps: float | None = None) -> None:
    if not data or not _SAFE_KEY.fullmatch(content_hash):
        raise ValueError("Invalid evidence content or key.")
    b2_store.require_configured()
    try:
        exists = await asyncio.to_thread(b2_store.head_key, b2_store.object_key(content_hash))
    except Exception as exc:
        raise b2_store.StorageUnavailableError("B2 could not verify evidence storage.") from exc
    if exists is not None:
        return
    try:
        await asyncio.to_thread(b2_store.put, content_hash, data, mime, fps)
    except Exception as exc:
        raise b2_store.StorageUnavailableError("B2 could not save the evidence.") from exc


async def load(content_hash: str) -> StoredMedia | None:
    if not _SAFE_KEY.fullmatch(content_hash):
        return None
    key = b2_store.object_key(content_hash)
    try:
        head = await asyncio.to_thread(b2_store.head_key, key)
    except Exception as exc:
        raise b2_store.StorageUnavailableError("B2 evidence metadata is unavailable.") from exc
    if head is None:
        return None
    fps = head.get("Metadata", {}).get("fps")
    return StoredMedia(
        key,
        head.get("ContentType") or "video/mp4",
        float(fps) if fps else None,
        int(head.get("ContentLength") or 0),
        str(head["VersionId"]) if head.get("VersionId") else None,
    )


async def media_url(content_hash: str) -> str:
    if not _SAFE_KEY.fullmatch(content_hash):
        raise ValueError("Invalid evidence key.")
    try:
        return await asyncio.to_thread(b2_store.signed_url, b2_store.object_key(content_hash))
    except Exception as exc:
        raise b2_store.StorageUnavailableError("B2 playback is unavailable.") from exc


def extension(mime: str) -> str:
    return _EXT.get(mime, "bin")
