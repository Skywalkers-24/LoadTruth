"""Migrate persisted demo data when the seeded tenant ID changes."""

from __future__ import annotations

from uuid import UUID

import pytest
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.base import Base
from app.db.models import Event, Ticket, User
from app.tickets.seed import DEMO_TENANT_ID, seed_demo

_LEGACY_TENANT_ID = UUID("11111111-1111-1111-1111-111111111111")


@pytest.mark.asyncio
async def test_seed_migrates_legacy_demo_tenant(
    sessionmaker: async_sessionmaker[AsyncSession],
) -> None:
    async with sessionmaker() as session:
        ticket_count = await session.scalar(select(func.count()).select_from(Ticket))
        for table in Base.metadata.sorted_tables:
            if "tenant_id" in table.c:
                await session.execute(
                    update(table)
                    .where(table.c.tenant_id == DEMO_TENANT_ID)
                    .values(tenant_id=_LEGACY_TENANT_ID)
                )
        session.add(
            User(
                tenant_id=DEMO_TENANT_ID,
                email="developer@loadtruth.io",
                full_name="Developer (SuperAdmin)",
                role="super_admin",
                status="active",
            )
        )
        await session.flush()

        await seed_demo(session)

        assert await session.scalar(
            select(func.count()).select_from(User).where(User.tenant_id == DEMO_TENANT_ID)
        ) == 6
        assert await session.scalar(
            select(func.count()).select_from(User).where(User.tenant_id == _LEGACY_TENANT_ID)
        ) == 0
        assert await session.scalar(
            select(func.count()).select_from(Event).where(Event.tenant_id == DEMO_TENANT_ID)
        ) >= 4
        assert await session.scalar(select(func.count()).select_from(Ticket)) == ticket_count
        assert await session.scalar(
            select(func.count())
            .select_from(User)
            .where(User.tenant_id == DEMO_TENANT_ID)
            .where(User.email == "developer@loadtruth.io")
        ) == 1
