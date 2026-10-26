"""Demo tenant seed — the §5b labeled scenarios, written into the database.

One tenant, one event, a certified-truck registry, and a spread of tickets that
exercise every review-console state (clean confirmable, low-confidence review,
anomaly flags, and the over-call that produces the money frame). Seeding is
idempotent: it no-ops if the demo event already exists. Clearly-labeled sample
data, not real haul records.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import models
from app.tickets.domain import new_ticket
from app.tickets.repository import set_seed_accuracy
from app.tickets.schemas import DebrisClass, SourceKind, SourceStatus, TicketStatus

DEMO_TENANT_ID = UUID("11111111-1111-1111-1111-111111111111")
DEMO_EVENT_ID = UUID("22222222-2222-2222-2222-222222222222")

_RATE_TABLE = {
    DebrisClass.VEGETATIVE.value: 8.0,
    DebrisClass.CONSTRUCTION_DEMOLITION.value: 12.0,
    DebrisClass.WHITE_GOODS.value: 20.0,
    DebrisClass.HAZARDOUS.value: 45.0,
    DebrisClass.OTHER.value: 6.0,
}

_TRUCKS = [
    ("FL-DT-3391", "tandem", Decimal(20)),
    ("FL-DT-1182", "tandem", Decimal(30)),
    ("FL-DT-2204", "tandem", Decimal(25)),
    ("FL-DT-4417", "walking-floor", Decimal(30)),
    ("FL-DT-5590", "roll-off", Decimal(15)),
]


@dataclass(frozen=True, slots=True)
class _TicketSpec:
    debris_class: DebrisClass
    cert: int
    rate: int
    est: int
    mon: int | None
    truck: str
    frames: list[str]
    status: TicketStatus


_SPECS: list[_TicketSpec] = [
    # 🚩 money frame: monitor over-called 80% vs LoadTruth 62% -> $43.20.
    _TicketSpec(
        DebrisClass.CONSTRUCTION_DEMOLITION,
        20,
        12,
        62,
        80,
        "FL-DT-3391",
        ["frame_0042.jpg", "frame_0051.jpg"],
        TicketStatus.DRAFT,
    ),
    # ✅ clean full load, monitor agrees.
    _TicketSpec(
        DebrisClass.VEGETATIVE,
        30,
        8,
        90,
        90,
        "FL-DT-1182",
        ["frame_0110.jpg"],
        TicketStatus.CONFIRMED,
    ),
    # ✅ clean partial load, monitor agrees.
    _TicketSpec(
        DebrisClass.VEGETATIVE,
        25,
        8,
        40,
        40,
        "FL-DT-2204",
        ["frame_0205.jpg"],
        TicketStatus.CONFIRMED,
    ),
    # ⚠️ low-confidence placard, still a draft, no monitor call.
    _TicketSpec(
        DebrisClass.CONSTRUCTION_DEMOLITION,
        18,
        12,
        55,
        None,
        "FL-DT-07??",
        ["frame_0303.jpg"],
        TicketStatus.DRAFT,
    ),
    # 🚩 hollow/fluffed load.
    _TicketSpec(
        DebrisClass.VEGETATIVE,
        30,
        8,
        35,
        75,
        "FL-DT-4417",
        ["frame_0410.jpg", "frame_0418.jpg"],
        TicketStatus.DRAFT,
    ),
    # 🚩 white goods, capacity mismatch, monitor over-called.
    _TicketSpec(
        DebrisClass.WHITE_GOODS,
        15,
        20,
        70,
        100,
        "FL-DT-5590",
        ["frame_0512.jpg"],
        TicketStatus.DRAFT,
    ),
]


def _seed_tickets() -> list[models.Ticket]:
    t, e = DEMO_TENANT_ID, DEMO_EVENT_ID
    rows: list[models.Ticket] = []
    for s in _SPECS:
        dom = new_ticket(
            tenant_id=t,
            event_id=e,
            debris_class=s.debris_class,
            certified_cubic_yards=s.cert,
            rate_per_cy=s.rate,
            est_fill_pct=s.est,
            monitor_call_fill_pct=s.mon,
            truck_id=s.truck,
            evidence_frames=s.frames,
        )
        confirmed = dom.monitor_call_fill_pct if s.status is TicketStatus.CONFIRMED else None
        rows.append(
            models.Ticket(
                id=dom.id,
                tenant_id=t,
                event_id=e,
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
                status=s.status.value,
                confirmed_fill_pct=confirmed,
                evidence_frames=list(dom.evidence_frames),
            )
        )
    return rows


def _seed_anomalies(tickets: list[models.Ticket]) -> list[models.Anomaly]:
    """One illustrative flag each on the anomaly-bearing seed tickets."""
    by_truck = {tk.truck_id: tk for tk in tickets}
    specs = [
        (
            "FL-DT-3391",
            "capacity_exceeded",
            "high",
            "Monitor call implies volume above certified capacity.",
        ),
        ("FL-DT-07??", "identity_unreadable", "warn", "Placard could not be read confidently."),
        (
            "FL-DT-4417",
            "hollow_load",
            "warn",
            "High bed coverage with low credited fill — possible fluffed load.",
        ),
        (
            "FL-DT-5590",
            "capacity_exceeded",
            "high",
            "Measured load approaches/exceeds certified capacity.",
        ),
    ]
    out: list[models.Anomaly] = []
    for truck, kind, sev, text in specs:
        tk = by_truck.get(truck)
        if tk is None:
            continue
        out.append(
            models.Anomaly(
                tenant_id=DEMO_TENANT_ID,
                ticket_id=tk.id,
                type=kind,
                severity=sev,
                explanation=text,
                evidence_frame=tk.evidence_frames[0] if tk.evidence_frames else None,
            )
        )
    return out


def _seed_sources() -> list[models.Source]:
    """Two demo evidence sources: the live upload lane + an example RTSP feed."""
    return [
        models.Source(
            tenant_id=DEMO_TENANT_ID,
            event_id=DEMO_EVENT_ID,
            kind=SourceKind.UPLOAD.value,
            name="Monitor uploads",
            config={},
            status=SourceStatus.ACTIVE.value,
        ),
        models.Source(
            tenant_id=DEMO_TENANT_ID,
            event_id=DEMO_EVENT_ID,
            kind=SourceKind.RTSP.value,
            name="Gate camera (RTSP)",
            config={"url": "rtsp://demo.local/gate-cam"},
            status=SourceStatus.PAUSED.value,
        ),
    ]


async def seed_demo(session: AsyncSession) -> None:
    """Idempotently seed the demo tenant. Safe to call on every startup."""
    existing = (
        await session.execute(select(models.Event).where(models.Event.id == DEMO_EVENT_ID))
    ).scalar_one_or_none()
    set_seed_accuracy(DEMO_EVENT_ID, 0.92)
    if existing is not None:
        return

    session.add(
        models.Event(
            id=DEMO_EVENT_ID,
            tenant_id=DEMO_TENANT_ID,
            name="Hurricane Season 2026 — Pinellas County",
            location="Pinellas County, FL",
            status="active",
            rate_table=_RATE_TABLE,
        )
    )
    for number, body, cap in _TRUCKS:
        session.add(
            models.Truck(
                tenant_id=DEMO_TENANT_ID,
                truck_number=number,
                body_type=body,
                certified_cubic_yards=cap,
                registry_source="seed",
            )
        )
    session.add_all(_seed_sources())
    tickets = _seed_tickets()
    session.add_all(tickets)
    session.add_all(_seed_anomalies(tickets))
    await session.commit()
