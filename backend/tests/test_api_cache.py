"""Unit tests for the Enterprise Generational API Response Cache."""

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.api.cache import (
    cached_api,
    clear_local_cache,
    get_cached_json,
    get_tag_version,
    invalidate_cache_tags,
    set_cached_json,
)
from app.config import get_settings


@pytest.fixture(autouse=True)
def reset_cache_state():
    clear_local_cache()
    yield
    clear_local_cache()


@pytest.mark.asyncio
async def test_tag_version_increments_on_invalidation():
    v1 = await get_tag_version("event:test-event-1")
    assert v1 == 1

    await invalidate_cache_tags("event:test-event-1")
    v2 = await get_tag_version("event:test-event-1")
    assert v2 == 2

    await invalidate_cache_tags("event:test-event-1", "tenant:test-tenant:events")
    v3 = await get_tag_version("event:test-event-1")
    assert v3 == 3
    t_v = await get_tag_version("tenant:test-tenant:events")
    assert t_v == 2


@pytest.mark.asyncio
async def test_get_or_compute_caches_and_invalidates():
    call_count = 0

    async def compute_dashboard():
        nonlocal call_count
        call_count += 1
        return {"ticket_count": 42, "status": "reviewed"}

    # 1. Initial compute
    res1 = await cached_api(
        tags=["event:ev-123"],
        key="dashboard:t-1:ev-123",
        compute=compute_dashboard,
        to_dict=lambda d: d,
        from_dict=lambda d: d,
    )
    assert res1 == {"ticket_count": 42, "status": "reviewed"}
    assert call_count == 1

    # 2. Second read -> Cache hit
    res2 = await cached_api(
        tags=["event:ev-123"],
        key="dashboard:t-1:ev-123",
        compute=compute_dashboard,
        to_dict=lambda d: d,
        from_dict=lambda d: d,
    )
    assert res2 == {"ticket_count": 42, "status": "reviewed"}
    assert call_count == 1  # Not recomputed!

    # 3. Invalidate tag -> Cache miss on next read
    await invalidate_cache_tags("event:ev-123")

    res3 = await cached_api(
        tags=["event:ev-123"],
        key="dashboard:t-1:ev-123",
        compute=compute_dashboard,
        to_dict=lambda d: d,
        from_dict=lambda d: d,
    )
    assert res3 == {"ticket_count": 42, "status": "reviewed"}
    assert call_count == 2  # Recomputed!


@pytest.mark.asyncio
async def test_multi_tag_invalidation():
    call_count = 0

    async def compute_billing():
        nonlocal call_count
        call_count += 1
        return {"amount": 1000}

    # Depends on both event and tenant billing
    await cached_api(
        tags=["event:ev-1", "tenant:t-1:billing"],
        key="billing:t-1:ev-1",
        compute=compute_billing,
        to_dict=lambda d: d,
        from_dict=lambda d: d,
    )
    assert call_count == 1

    # Invalidate second tag
    await invalidate_cache_tags("tenant:t-1:billing")

    # Should trigger recomputation
    await cached_api(
        tags=["event:ev-1", "tenant:t-1:billing"],
        key="billing:t-1:ev-1",
        compute=compute_billing,
        to_dict=lambda d: d,
        from_dict=lambda d: d,
    )
    assert call_count == 2


@pytest.mark.asyncio
async def test_cache_disabled_bypasses_cache(monkeypatch):
    monkeypatch.setattr(get_settings(), "api_cache_enabled", False)

    call_count = 0

    async def compute():
        nonlocal call_count
        call_count += 1
        return {"x": 1}

    await cached_api(
        tags=["event:ev-1"],
        key="key1",
        compute=compute,
        to_dict=lambda d: d,
        from_dict=lambda d: d,
    )
    assert call_count == 1

    await cached_api(
        tags=["event:ev-1"],
        key="key1",
        compute=compute,
        to_dict=lambda d: d,
        from_dict=lambda d: d,
    )
    assert call_count == 2  # Bypassed cache because disabled


@pytest.mark.asyncio
async def test_redis_pipeline_mock_integration(monkeypatch):
    mock_redis = MagicMock()
    mock_pipe = MagicMock()
    mock_pipe.execute = AsyncMock(return_value=[1, True])
    mock_pipe.incr = MagicMock(return_value=mock_pipe)
    mock_pipe.expire = MagicMock(return_value=mock_pipe)
    mock_redis.pipeline.return_value = mock_pipe
    mock_redis.get = AsyncMock(return_value=b"5")
    mock_redis.set = AsyncMock(return_value=True)

    monkeypatch.setattr("app.api.cache.get_redis_client", lambda: mock_redis)

    # get_tag_version should read from mock redis
    ver = await get_tag_version("event:ev-999")
    assert ver == 5
    mock_redis.get.assert_awaited_with("lt:tag:ver:event:ev-999")

    # invalidate_cache_tags should execute pipeline
    await invalidate_cache_tags("event:ev-999")
    mock_pipe.incr.assert_called_with("lt:tag:ver:event:ev-999")
    mock_pipe.expire.assert_called_with("lt:tag:ver:event:ev-999", 30 * 86400)
    mock_pipe.execute.assert_awaited_once()

