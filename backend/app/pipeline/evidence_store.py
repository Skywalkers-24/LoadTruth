"""Persistent B2 evidence or bounded, temporary process-memory footage."""

from __future__ import annotations

import asyncio
import re
import time
from collections import OrderedDict
from contextlib import contextmanager
from contextvars import ContextVar
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


# Temporary replay data is never persisted to Redis or B2. Entries disappear
# after seven days, on eviction, or on restart. Ticket and analysis rows remain.
MEMORY_TTL_SECONDS = 7 * 24 * 60 * 60
MEMORY_MAX_BYTES = 128 * 1024 * 1024
_memory: OrderedDict[str, tuple[float, bytes, str, float | None]] = OrderedDict()
_persistent: ContextVar[bool] = ContextVar("persistent_footage", default=True)


@contextmanager
def storage_scope(persistent: bool):
    token = _persistent.set(persistent)
    try:
        yield
    finally:
        _persistent.reset(token)


def memory_entry(key: str) -> tuple[float, bytes, str, float | None] | None:
    now = time.monotonic()
    for expired in [k for k, v in _memory.items() if v[0] <= now]:
        _memory.pop(expired, None)
    return _memory.get(key)


def remember(key: str, data: bytes, mime: str, fps: float | None = None) -> None:
    memory_entry(key)
    if len(data) > MEMORY_MAX_BYTES:
        raise ValueError("Temporary footage exceeds the memory limit.")
    _memory.pop(key, None)
    while _memory and sum(len(v[1]) for v in _memory.values()) + len(data) > MEMORY_MAX_BYTES:
        _memory.popitem(last=False)
    _memory[key] = (time.monotonic() + MEMORY_TTL_SECONDS, data, mime, fps)


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
    if not _persistent.get():
        remember(content_hash, data, mime, fps)
        return
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


async def load(content_hash: str, *, storage: str | None = None) -> StoredMedia | None:
    if not _SAFE_KEY.fullmatch(content_hash):
        return None
    if storage == "memory" or (storage is None and not _persistent.get()):
        entry = memory_entry(content_hash)
        return StoredMedia(content_hash, entry[2], entry[3], len(entry[1])) if entry else None
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
