"""Content-hash result cache (PLAN.md §5, LESSONS cost rule).

"No uncached model call on a path that runs more than once." The pipeline keys
every result by the clip's content hash, so re-running a clip (and the demo's
live path) is free. This module is the store behind that guarantee.

The store sits behind a tiny :class:`ResultCache` protocol so the in-memory
implementation here can later be swapped for Redis without touching callers. It
is async-safe: a lock guards the dict so concurrent workers deduped by content
hash never race (agent protocol §4b).

The cache is generic over the stored value and injected into the orchestrator —
omit it and nothing caches, so existing call sites and tests are unaffected.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Protocol

# A zero-argument async factory that produces the value to cache on a miss.
type Compute[T] = Callable[[], Awaitable[T]]


@dataclass(frozen=True, slots=True)
class CacheOutcome[T]:
    """The result of a :meth:`InMemoryResultCache.get_or_compute` call."""

    value: T
    cached: bool


class ResultCache[T](Protocol):
    """A content-hash keyed store for pipeline results (in-memory now, Redis later)."""

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
