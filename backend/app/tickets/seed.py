"""Demo tenant seed — loaded from a single declarative `seed.json`.

One file (`backend/seed.json`) describes the whole demo: the tenant, the event
and its rate table, the certified-truck registry, connected sources, and a
spread of tickets (with anomalies) that exercise every surface — the dashboard
money frame, every review-console state, and the reports breakdowns. Editing the
data is a JSON change, not a code change.

Seeding is idempotent: it no-ops if the demo event already exists. Clearly-
labeled sample data, not real haul records.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import models
from app.tickets.domain import new_ticket
from app.tickets.repository import set_seed_accuracy
from app.tickets.schemas import DebrisClass

_SEED_PATH = Path(__file__).resolve().parents[2] / "seed.json"


@lru_cache
def _seed_data() -> dict[str, Any]:
    raw: dict[str, Any] = json.loads(_SEED_PATH.read_text(encoding="utf-8"))
    return {k: v for k, v in raw.items() if not k.startswith("_")}


def _events() -> list[dict[str, Any]]:
    """The seeded events. Supports both an `events` list and a legacy single `event`."""
    data = _seed_data()
    if "events" in data:
        return list(data["events"])
    if "event" in data:
        # Legacy shape: a single top-level event plus top-level tickets.
        ev = dict(data["event"])
        ev.setdefault("tickets", data.get("tickets", []))
        ev.setdefault("sources", data.get("sources", []))
        ev.setdefault(
            "benchmark_accuracy_within_10pct", data.get("benchmark_accuracy_within_10pct", 0.0)
        )
        return [ev]
    return []


# Stable ids the frontend and tests reference directly (single seeded tenant).
DEMO_TENANT_ID = UUID(str(_seed_data()["tenant_id"]))
DEMO_EVENT_ID = UUID(str(_events()[0]["id"]))


def _build_ticket_rows(
    tenant_id: UUID, event_id: UUID, specs: list[dict[str, Any]]
) -> tuple[list[models.Ticket], list[models.Anomaly]]:
    """Materialize ticket + anomaly ORM rows from an event's JSON ticket specs."""
    tickets: list[models.Ticket] = []
    anomalies: list[models.Anomaly] = []
    for spec in specs:
        dom = new_ticket(
            tenant_id=tenant_id,
            event_id=event_id,
            debris_class=DebrisClass(spec["debris_class"]),
            certified_cubic_yards=spec["certified_cubic_yards"],
            rate_per_cy=spec["rate_per_cy"],
            est_fill_pct=spec["est_fill_pct"],
            monitor_call_fill_pct=spec.get("monitor_fill_pct"),
            truck_id=spec.get("truck_id"),
            evidence_frames=list(spec.get("evidence_frames", [])),
        )
        status = spec.get("status", "draft")
        confirmed = dom.monitor_call_fill_pct if status in ("confirmed", "overridden") else None
        row = models.Ticket(
            id=dom.id,
            tenant_id=tenant_id,
            event_id=event_id,
            truck_id=dom.truck_id,
            certified_cubic_yards=dom.certified_cubic_yards,
            debris_class=dom.debris_class.value,
            rate_per_cy=dom.rate_per_cy,
            est_fill_pct=dom.est_fill_pct,
            est_cubic_yards=dom.est_cubic_yards,
            est_dollar_value=dom.est_dollar_value,
            monitor_call_fill_pct=dom.monitor_call_fill_pct,
            monitor_cubic_yards=dom.monitor_cubic_yards,
            monitor_dollar_value=dom.monitor_dollar_value,
            delta_cubic_yards=dom.delta_cubic_yards,
            delta_dollar_value=dom.delta_dollar_value,
            status=status,
            confirmed_fill_pct=confirmed,
            evidence_frames=list(dom.evidence_frames),
        )
        tickets.append(row)

        flag = spec.get("anomaly")
        if flag is not None:
            anomalies.append(
                models.Anomaly(
                    tenant_id=tenant_id,
                    ticket_id=row.id,
                    type=flag["type"],
                    severity=flag.get("severity", "info"),
                    explanation=flag.get("explanation"),
                    evidence_frame=row.evidence_frames[0] if row.evidence_frames else None,
                )
            )
    return tickets, anomalies


async def seed_demo(session: AsyncSession) -> None:
    """Idempotently seed the demo tenant from `seed.json`. Safe on every startup.

    Seeds the tenant-level truck registry and members once, then every event
    (with its own rate table, sources, and tickets). No-ops if the first event
    already exists.
    """
    data = _seed_data()
    tenant_id = DEMO_TENANT_ID
    events = _events()

    for ev in events:
        set_seed_accuracy(
            UUID(str(ev["id"])), float(ev.get("benchmark_accuracy_within_10pct", 0.0))
        )

    existing = (
        await session.execute(select(models.Event).where(models.Event.id == DEMO_EVENT_ID))
    ).scalar_one_or_none()
    if existing is not None:
        return

    # Tenant-level registry + members (shared across events).
    for t in data.get("trucks", []):
        session.add(
            models.Truck(
                tenant_id=tenant_id,
                truck_number=t["truck_number"],
                body_type=t.get("body_type"),
                certified_cubic_yards=t["certified_cubic_yards"],
                registry_source="seed",
            )
        )
    for u in data.get("users", []):
        session.add(
            models.User(
                tenant_id=tenant_id,
                email=u["email"],
                full_name=u.get("full_name"),
                role=u.get("role", "monitor"),
                status=u.get("status", "active"),
            )
        )

    # Per-event: the event row, its sources, and its tickets/anomalies.
    for ev in events:
        event_id = UUID(str(ev["id"]))
        session.add(
            models.Event(
                id=event_id,
                tenant_id=tenant_id,
                name=ev["name"],
                location=ev.get("location"),
                status=ev.get("status", "active"),
                rate_table=dict(ev.get("rate_table", {})),
            )
        )
        for s in ev.get("sources", []):
            session.add(
                models.Source(
                    tenant_id=tenant_id,
                    event_id=event_id,
                    kind=s["kind"],
                    name=s["name"],
                    config=dict(s.get("config", {})),
                    status=s.get("status", "active"),
                )
            )
        tickets, anomalies = _build_ticket_rows(tenant_id, event_id, list(ev.get("tickets", [])))
        session.add_all(tickets)
        session.add_all(anomalies)

    await session.commit()
