"""Ticket domain ORM models layer.

Exposes the SQLAlchemy models for the ticket module:
Architecture pattern: Service -> Repository -> Model -> Schema
"""

from __future__ import annotations

from app.db.models import (
    AIStageResult,
    Anomaly,
    DemoVideo,
    Event,
    PipelineStageRow,
    Ticket,
    TicketEvidence,
    Truck,
)

__all__ = [
    "AIStageResult",
    "Anomaly",
    "DemoVideo",
    "Event",
    "PipelineStageRow",
    "Ticket",
    "TicketEvidence",
    "Truck",
]
