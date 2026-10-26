"""Tests for the content-hash result cache (app.pipeline.cache)."""

import asyncio

import pytest

from app.pipeline.cache import CacheOutcome, InMemoryResultCache


@pytest.mark.asyncio
async def test_get_miss_then_set_hit() -> None:
    cache: InMemoryResultCache[int] = InMemoryResultCache()
    assert await cache.get("h1") is None
    await cache.set("h1", 42)
    assert await cache.get("h1") == 42
    assert len(cache) == 1


@pytest.mark.asyncio
async def test_get_or_compute_computes_on_miss_then_caches() -> None:
    cache: InMemoryResultCache[str] = InMemoryResultCache()
    calls = 0

    async def compute() -> str:
        nonlocal calls
        calls += 1
        return "value"

    first = await cache.get_or_compute("h", compute)
    assert first == CacheOutcome(value="value", cached=False)

    second = await cache.get_or_compute("h", compute)
    assert second == CacheOutcome(value="value", cached=True)
    assert calls == 1  # compute ran once; the second call was a hit


@pytest.mark.asyncio
async def test_concurrent_access_is_safe() -> None:
    cache: InMemoryResultCache[int] = InMemoryResultCache()

    async def writer(i: int) -> None:
        await cache.set(f"h{i}", i)

    await asyncio.gather(*(writer(i) for i in range(50)))
    assert len(cache) == 50
    assert await cache.get("h25") == 25
