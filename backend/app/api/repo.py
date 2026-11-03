"""Repository + active-tenant dependencies for the ticket API.

In this build the API runs against the interim SQLite database (per the user's
direction) with a single seeded tenant (PLAN.md §1a). Each request gets a
SQLAlchemy-backed repository bound to a fresh session that commits on success.
When Supabase Postgres is wired, the session becomes the RLS-bound
`tenant_session` and this provider is the only thing that changes.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

from fastapi import Depends

from app.api.deps import CurrentMember
from app.db.engine import get_sessionmaker
from app.tickets.repository import SqlTicketRepository
from app.tickets.service import TicketService


async def get_repository() -> AsyncIterator[SqlTicketRepository]:
    """Yield a repository bound to a session; commit on success, rollback on error."""
    async with get_sessionmaker()() as session:
        try:
            yield SqlTicketRepository(session)
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_ticket_service(
    repo: Annotated[SqlTicketRepository, Depends(get_repository)],
) -> TicketService:
    """Dependency providing the TicketService business layer."""
    return TicketService(repo)


def get_active_tenant_id(member: CurrentMember) -> UUID:
    """The tenant the request operates on, taken from the signed-in member."""
    return UUID(member.tenant_id)


Repository = Annotated[SqlTicketRepository, Depends(get_repository)]
Service = Annotated[TicketService, Depends(get_ticket_service)]
ActiveTenant = Annotated[UUID, Depends(get_active_tenant_id)]
