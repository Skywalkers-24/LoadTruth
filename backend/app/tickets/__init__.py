"""Ticket domain: the load ticket, its money math, and schemas.

Layered architecture:
- Service: app.tickets.service.TicketService
- Repository: app.tickets.repository.SqlTicketRepository
- Model: app.tickets.models (Ticket, Event, Truck, Anomaly, AIStageResult)
- Schema: app.tickets.schemas (TicketOut, EventOut, DashboardOut, etc.)

All volume/dollar math lives in `money.py` as pure, deterministic functions.
"""

from __future__ import annotations

from app.tickets import models, schemas
from app.tickets.money import cubic_yards, dollar_value, value_ticket
from app.tickets.repository import SqlTicketRepository
from app.tickets.service import TicketService

__all__ = [
    "SqlTicketRepository",
    "TicketService",
    "cubic_yards",
    "dollar_value",
    "models",
    "schemas",
    "value_ticket",
]
