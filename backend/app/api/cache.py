"""Enterprise Tag-Based Generational API Response Cache for LoadTruth.

Implements generational versioned keying (surrogate key / cache tagging) backed
by Redis (Render Key Value) with automatic fallback to an async-safe in-memory
cache during local development or network partitions.

Invalidation Strategy:
- Each resource domain possesses an atomic generational version counter (e.g. ``tag:ver:event:{id}``).
- API cache keys embed the current version of all dependent tags:
    ``lt:api:{route_key}:tag_{tag}_v{version}``
- Invalidation runs in $O(1)$ time by executing an atomic Redis ``INCR`` on the tag's version key.
  No blocking ``KEYS *`` or ``SCAN`` operations ever run against the Redis event loop.
- Stale version entries expire automatically via Redis ``allkeys-lru`` eviction and standard TTL.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

from redis.asyncio import Redis

from app.config import get_settings

log = logging.getLogger(__name__)

T = TypeVar("T")

_redis_client: Redis | None = None
_local_tag_versions: dict[str, int] = {}
_local_api_cache: dict[str, tuple[float, str]] = {}
_cache_lock = asyncio.Lock()


def get_redis_client() -> Redis | None:
    """Return the shared Redis connection pool, or None if unconfigured/disabled."""
    global _redis_client
    settings = get_settings()
    if settings.redis_url == "redis://localhost:6379/0":
        return None
    if _redis_client is None:
        try:
            _redis_client = Redis.from_url(
                settings.redis_url,
                socket_connect_timeout=3,
                socket_timeout=3,
                health_check_interval=30,
                decode_responses=False,
            )
        except Exception:
            log.warning("failed_to_initialize_redis_client", exc_info=True)
            _redis_client = None
    return _redis_client


async def close_redis_client() -> None:
    """Close the shared Redis client gracefully during shutdown."""
    global _redis_client
    if _redis_client is not None:
        try:
            await _redis_client.aclose()
        except Exception:
            log.warning("error_closing_redis_client", exc_info=True)
        finally:
            _redis_client = None


def clear_local_cache() -> None:
    """Clear in-memory cache and version state (used in unit tests)."""
    _local_tag_versions.clear()
    _local_api_cache.clear()


async def get_tag_version(tag: str) -> int:
    """Return the current generation version for a tag ($O(1)$ lookup)."""
    client = get_redis_client()
    if client is not None:
        try:
            val = await client.get(f"lt:tag:ver:{tag}")
            if val is not None:
                return int(val)
        except Exception:
            log.warning("redis_tag_version_read_failed; using local version", exc_info=True)

    async with _cache_lock:
        return _local_tag_versions.get(tag, 1)


async def invalidate_cache_tags(*tags: str) -> None:
    """Atomically invalidate one or more cache tags in $O(1)$ time.

    Bumps the generation counter for each tag. Subsequent reads see the new
    version and immediately bypass older cached payloads.
    """
    if not tags:
        return

    client = get_redis_client()
    if client is not None:
        try:
            pipe = client.pipeline(transaction=True)
            for tag in tags:
                key = f"lt:tag:ver:{tag}"
                pipe.incr(key)
                pipe.expire(key, 30 * 86400)  # Keep tag active for 30 days
            await pipe.execute()
        except Exception:
            log.warning("redis_tag_invalidation_failed; updating local version", exc_info=True)

    async with _cache_lock:
        for tag in tags:
            _local_tag_versions[tag] = _local_tag_versions.get(tag, 1) + 1


def _build_composite_key(key: str, tag_versions: list[tuple[str, int]]) -> str:
    """Construct a composite generational cache key."""
    suffix = ":".join(f"{t}_v{v}" for t, v in sorted(tag_versions))
    return f"lt:api:{key}:{suffix}"


async def get_cached_json(tags: list[str], key: str) -> Any | None:
    """Retrieve cached JSON payload if present and matching current tag generations."""
    if not get_settings().api_cache_enabled:
        return None

    tag_versions = [(tag, await get_tag_version(tag)) for tag in tags]
    composite_key = _build_composite_key(key, tag_versions)

    client = get_redis_client()
    if client is not None:
        try:
            raw = await client.get(composite_key)
            if raw is not None:
                return json.loads(raw.decode("utf-8"))
        except Exception:
            log.warning("redis_api_cache_read_failed", exc_info=True)

    async with _cache_lock:
        entry = _local_api_cache.get(composite_key)
        if entry is not None:
            expires_at, payload = entry
            if time.monotonic() < expires_at:
                return json.loads(payload)
            # Expired
            _local_api_cache.pop(composite_key, None)

    return None


async def set_cached_json(
    tags: list[str], key: str, value: Any, ttl_seconds: int = 3600
) -> None:
    """Store a JSON payload under the current tag generations with TTL."""
    if not get_settings().api_cache_enabled:
        return

    tag_versions = [(tag, await get_tag_version(tag)) for tag in tags]
    composite_key = _build_composite_key(key, tag_versions)
    serialized = json.dumps(value, separators=(",", ":"))

    client = get_redis_client()
    if client is not None:
        try:
            await client.set(composite_key, serialized.encode("utf-8"), ex=ttl_seconds)
        except Exception:
            log.warning("redis_api_cache_write_failed", exc_info=True)

    async with _cache_lock:
        _local_api_cache[composite_key] = (time.monotonic() + ttl_seconds, serialized)


async def cached_api(
    *,
    tags: list[str],
    key: str,
    compute: Callable[[], Awaitable[T]],
    to_dict: Callable[[T], Any],
    from_dict: Callable[[Any], T],
    ttl_seconds: int = 3600,
) -> T:
    """High-level caching helper for FastAPI endpoint handlers.

    Checks the generational cache first. On miss, awaits ``compute()``, caches
    its serialized representation, and returns the result.
    """
    cached_data = await get_cached_json(tags, key)
    if cached_data is not None:
        try:
            return from_dict(cached_data)
        except Exception:
            log.warning("cached_data_deserialization_failed; recomputing", exc_info=True)

    result = await compute()
    try:
        dict_data = to_dict(result)
        await set_cached_json(tags, key, dict_data, ttl_seconds=ttl_seconds)
    except Exception:
        log.warning("caching_serialized_result_failed", exc_info=True)

    return result

