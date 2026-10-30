"""Event access rules shared by mutation endpoints."""

from uuid import UUID

from fastapi import HTTPException

from app.auth.roles import can_review_tickets, is_super_admin
from app.tickets.repository import SqlTicketRepository


async def require_event_write(
    repo: SqlTicketRepository, tenant: UUID, event_id: UUID, role: str, *, review: bool = False
) -> None:
    event = await repo.get_event(tenant, event_id)
    if event is None:
        raise HTTPException(404, "event not found")
    if "read-only" in event.tags:
        raise HTTPException(409, "This event is read-only.")
    if "admin-only" in event.tags and not is_super_admin(role):
        raise HTTPException(403, "Only the Administrator login can change this live demo event.")
    if review and "playground" not in event.tags and not can_review_tickets(role):
        raise HTTPException(403, "You do not have permission to review tickets.")
