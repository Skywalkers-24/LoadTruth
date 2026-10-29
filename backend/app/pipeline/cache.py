"""Scoped pipeline-result cache (PLAN.md §5, LESSONS cost rule).

"No uncached model call on a path that runs more than once." The pipeline keys
results by tenant, event, and clip content hash so repeat work in the same
workspace scope is free without sharing tenant-specific tickets.

The store sits behind a tiny :class:`ResultCache` protocol. Local development
uses an async-safe in-memory implementation; deployments can use the Redis
adapter below to share results through Render Key Value without changing callers.

The cache is generic over the stored value and injected into the orchestrator —
omit it and nothing caches, so existing call sites and tests are unaffected.
"""

from __future__ import annotations

import asyncio
import logging
import pickle
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Protocol

from redis.asyncio import Redis

# A zero-argument async factory that produces the value to cache on a miss.
type Compute[T] = Callable[[], Awaitable[T]]


@dataclass(frozen=True, slots=True)
class CacheOutcome[T]:
    """The result of a :meth:`InMemoryResultCache.get_or_compute` call."""

    value: T
    cached: bool


class ResultCache[T](Protocol):
    """A scoped content-keyed store for pipeline results."""

    async def get(self, content_hash: str) -> T | None:
        """Return the cached result for ``content_hash``, or ``None`` on a miss."""
        ...

    async def set(self, content_hash: str, value: T) -> None:
        """Store ``value`` under ``content_hash``."""
        ...


class InMemoryResultCache[T]:
    """Process-local, async-safe :class:`ResultCache`. Fine for the demo + tests."""

    def __init__(self) -> None:
        self._store: dict[str, T] = {}
        self._lock = asyncio.Lock()

    async def get(self, content_hash: str) -> T | None:
        async with self._lock:
            return self._store.get(content_hash)

    async def set(self, content_hash: str, value: T) -> None:
        async with self._lock:
            self._store[content_hash] = value

    async def get_or_compute(self, content_hash: str, compute: Compute[T]) -> CacheOutcome[T]:
        """Return the cached value if present, else compute, store, and return it.

        The returned :class:`CacheOutcome` says whether it was a hit, so the caller
        can record the cost-ledger row (a hit costs $0).
        """
        async with self._lock:
            hit = self._store.get(content_hash)
        if hit is not None:
            return CacheOutcome(value=hit, cached=True)
        value = await compute()
        async with self._lock:
            self._store[content_hash] = value
        return CacheOutcome(value=value, cached=False)

    def __len__(self) -> int:
        return len(self._store)


class RedisResultCache[T]:
    """Shared cache backed by Redis-compatible services such as Render Key Value.

    Values are pickled because the pipeline result is a nested graph of domain
    dataclasses, UUIDs, and Decimals. Keep this cache on Render's private
    network; never enable external connections for the Key Value instance.
    ``fallback`` keeps requests working if the optional cache is unavailable.
    """

    def __init__(
        self,
        client: Redis[bytes],
        *,
        fallback: InMemoryResultCache[T],
        namespace: str = "loadtruth:pipeline",
        ttl_seconds: int = 7 * 24 * 60 * 60,
    ) -> None:
        self._client = client
        self._fallback = fallback
        self._namespace = namespace
        self._ttl_seconds = ttl_seconds
        self._log = logging.getLogger(__name__)

    def _key(self, content_hash: str) -> str:
        return f"{self._namespace}:{content_hash}"

    async def get(self, content_hash: str) -> T | None:
        try:
            payload = await self._client.get(self._key(content_hash))
        except Exception:
            self._log.warning("redis_cache_read_failed; using local cache", exc_info=True)
            return await self._fallback.get(content_hash)
        if payload is None:
            return await self._fallback.get(content_hash)
        try:
            return pickle.loads(payload)  # noqa: S301 — private Render Key Value cache only
        except Exception:  # noqa: BLE001 — discard invalid cache data and recompute.
            self._log.warning("redis_cache_entry_invalid; deleting entry", exc_info=True)
            await self._client.delete(self._key(content_hash))
            return None

    async def set(self, content_hash: str, value: T) -> None:
        # PipelineResult.trace carries a request-local callback and is rebuilt
        # by the orchestrator on a cache hit, so it must not cross processes.
        from app.pipeline.orchestrator import PipelineResult

        cached_value = value
        if isinstance(value, PipelineResult):
            from dataclasses import replace

            cached_value = replace(value, trace=None)  # type: ignore[assignment]
        try:
            payload = pickle.dumps(cached_value, protocol=pickle.HIGHEST_PROTOCOL)
            await self._client.set(self._key(content_hash), payload, ex=self._ttl_seconds)
        except Exception:
            self._log.warning("redis_cache_write_failed; using local cache", exc_info=True)
            await self._fallback.set(content_hash, value)
