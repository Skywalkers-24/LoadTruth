"""init_db adds new nullable columns to tables created by an older build."""

from __future__ import annotations

import pytest
from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import create_async_engine

from app.db import models  # noqa: F401  (register models)
from app.db.base import Base
from app.db.engine import _add_missing_columns


@pytest.mark.asyncio
async def test_missing_nullable_column_is_added() -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Simulate a database from before `pipeline_stages.details` existed.
        await conn.execute(text("ALTER TABLE pipeline_stages DROP COLUMN details"))
        await conn.run_sync(_add_missing_columns)
        cols = await conn.run_sync(
            lambda c: {col["name"] for col in inspect(c).get_columns("pipeline_stages")}
        )
        # Running it again is a no-op.
        await conn.run_sync(_add_missing_columns)
    await engine.dispose()
    assert "details" in cols
