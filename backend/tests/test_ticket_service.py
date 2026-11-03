"""Unit tests for the TicketService business layer."""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.tickets.domain import Ticket
from app.tickets.schemas import DebrisClass, TicketStatus
from app.tickets.service import TicketService


@pytest.mark.asyncio
async def test_ticket_service_delegates_to_repository() -> None:
    repo = MagicMock()
    tenant_id = uuid4()
    event_id = uuid4()

    mock_ticket = Ticket(
        tenant_id=tenant_id,
        event_id=event_id,
        debris_class=DebrisClass.VEGETATIVE,
        certified_cubic_yards=Decimal("20.00"),
        rate_per_cy=Decimal("12.00"),
        est_fill_pct=Decimal("75.00"),
        est_cubic_yards=Decimal("15.00"),
        est_dollar_value=Decimal("180.00"),
        truck_id="TRK-101",
        status=TicketStatus.DRAFT,
    )

    repo.get_ticket = AsyncMock(return_value=mock_ticket)
    repo.list_anomalies_for_ticket = AsyncMock(return_value=[])
    repo.set_status = AsyncMock(return_value=mock_ticket)

    service = TicketService(repo)
    ticket_id = mock_ticket.id

    out = await service.get_ticket(tenant_id, ticket_id)
    assert out.id == ticket_id
    assert out.truck_id == "TRK-101"
    repo.get_ticket.assert_awaited_once_with(tenant_id, ticket_id)

    status_out = await service.set_ticket_status(tenant_id, ticket_id, TicketStatus.CONFIRMED)
    assert status_out.id == ticket_id
    repo.set_status.assert_awaited_once_with(tenant_id, ticket_id, TicketStatus.CONFIRMED)
