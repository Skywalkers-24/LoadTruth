# ruff: noqa: E501 — grounded seed summary strings read better unwrapped
"""Demo tenant seed — loaded from a single declarative `seed.json`.

One file (`backend/seed.json`) describes the whole demo: the tenant, the event
and its rate table, the certified-truck registry, connected sources, and a
spread of tickets (with anomalies) that exercise every surface — the dashboard
money frame, every review-console state, and the reports breakdowns. Editing the
data is a JSON change, not a code change.

Seeding is idempotent: the original demo seed is installed once, and the
separate read-only showcase bundle restores its preprocessed videos/results.
"""

from __future__ import annotations

import json
from datetime import datetime
from decimal import Decimal
from functools import lru_cache
from pathlib import Path
from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import models
from app.log import get_logger
from app.tickets.domain import new_ticket
from app.tickets.schemas import DebrisClass

_SEED_PATH = Path(__file__).resolve().parents[2] / "seed.json"
_SHOWCASE_PATH = Path(__file__).resolve().parents[2] / "showcase" / "benchmark.json"
_SHOWCASE_MEDIA_DIR = _SHOWCASE_PATH.parent / "media"


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
_LEGACY_DEMO_TENANT_ID = UUID("11111111-1111-1111-1111-111111111111")


def _stage_rows(
    tenant_id: UUID, row: models.Ticket, had_monitor: bool
) -> list[models.PipelineStageRow]:
    """A plausible AI pipeline trace for a seeded ticket, from its real fields.

    Seeded tickets did not run the live pipeline, but the demo should still show
    how each would have been produced. We reconstruct the stage trace from the
    stored ticket fields so the AI analysis panel is populated everywhere.
    """
    debris = row.debris_class.replace("_", " ")
    truck = row.truck_id or "unidentified"
    readable = (
        bool(row.truck_id) and "??" not in (row.truck_id or "") and row.truck_id != "FL-DT-0000"
    )
    stages = [
        (
            "sam_track",
            "Track and segment",
            "sam-3.1",
            "ok",
            "Tracked truck, bed, and debris across the clip.",
            0.0,
        ),
        (
            "spark_ocr",
            "Read placard",
            "muse-spark-1.3",
            "ok" if readable else "flagged",
            f"Read truck placard {truck}."
            if readable
            else "Could not read the placard confidently.",
            0.97 if readable else 0.3,
        ),
        (
            "capacity",
            "Capacity lookup",
            "registry",
            "ok" if readable else "flagged",
            f"Matched certified capacity {row.certified_cubic_yards} CY."
            if readable
            else "Truck not found in the certified registry.",
            None,
        ),
        (
            "geometry",
            "Measure fill",
            "geometry",
            "ok",
            f"Muse Spark's visual fill estimate is {row.est_fill_pct}%; review the footage to confirm.",
            0.9,
        ),
        (
            "spark_classify",
            "Classify debris",
            "muse-spark-1.3",
            "ok",
            f"Classified the load as {debris}.",
            0.93,
        ),
        (
            "dollar_math",
            "Value the load",
            "deterministic",
            "ok",
            f"Valued the load at {row.est_dollar_value} ({row.est_fill_pct}% of {row.certified_cubic_yards} CY).",
            None,
        ),
    ]
    out: list[models.PipelineStageRow] = []
    for i, (key, label, model, st, summary, conf) in enumerate(stages):
        out.append(
            models.PipelineStageRow(
                tenant_id=tenant_id,
                ticket_id=row.id,
                position=i,
                stage_key=key,
                label=label,
                model=model,
                status=st,
                summary=summary,
                confidence=conf,
                duration_ms=0.0,
            )
        )
    return out


def _build_ticket_rows(
    tenant_id: UUID, event_id: UUID, specs: list[dict[str, Any]]
) -> tuple[list[models.Ticket], list[models.Anomaly], list[models.PipelineStageRow]]:
    """Materialize ticket + anomaly + pipeline-stage rows from an event's specs."""
    tickets: list[models.Ticket] = []
    anomalies: list[models.Anomaly] = []
    stages: list[models.PipelineStageRow] = []
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

        # A reconstructed AI stage trace for this seeded ticket.
        ticket_stages = _stage_rows(
            tenant_id, row, had_monitor=spec.get("monitor_fill_pct") is not None
        )
        if flag is not None:
            ticket_stages.append(
                models.PipelineStageRow(
                    tenant_id=tenant_id,
                    ticket_id=row.id,
                    position=len(ticket_stages),
                    stage_key="anomalies",
                    label="Flag anomalies",
                    model="muse-spark-1.3",
                    status="flagged",
                    summary="Flagged 1 anomaly for review.",
                    confidence=None,
                    duration_ms=0.0,
                )
            )
        else:
            ticket_stages.append(
                models.PipelineStageRow(
                    tenant_id=tenant_id,
                    ticket_id=row.id,
                    position=len(ticket_stages),
                    stage_key="anomalies",
                    label="Flag anomalies",
                    model="muse-spark-1.3",
                    status="ok",
                    summary="No anomalies flagged.",
                    confidence=None,
                    duration_ms=0.0,
                )
            )
        stages.extend(ticket_stages)
    return tickets, anomalies, stages


@lru_cache
def _showcase_data() -> dict[str, Any]:
    """Preprocessed real-video output; loading it never calls an AI service."""
    data = json.loads(_SHOWCASE_PATH.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("Showcase data must be an object")
    return data


def _decimal(value: object) -> Decimal | None:
    return Decimal(str(value)) if value is not None else None


async def _seed_showcase(session: AsyncSession, tenant_id: UUID) -> None:
    """Install the immutable, precomputed Meta showcase event and its media."""
    from app.pipeline import evidence_store

    data = _showcase_data()
    event = data["event"]
    event_id = UUID(str(event["id"]))
    existing_event = (
        await session.execute(select(models.Event).where(models.Event.id == event_id))
    ).scalar_one_or_none()
    if existing_event is None:
        session.add(
            models.Event(
                id=event_id,
                tenant_id=tenant_id,
                name=event["name"],
                location=event["location"],
                status=event["status"],
                rate_table=dict(event["rate_table"]),
                tags=list(event["tags"]),
            )
        )
    else:
        existing_event.name = event["name"]
        existing_event.location = event["location"]
        existing_event.tags = list(event["tags"])

    # Store the packaged source clips under their content hashes. The endpoint
    # serves these files on review; it never needs to call Meta to reconstruct
    # the recorded analysis.
    for index, media in enumerate(data["media"]):
        source = _SHOWCASE_MEDIA_DIR / media["filename"]
        if not source.is_file():
            continue
        try:
            await evidence_store.save(
                media["content_hash"],
                source.read_bytes(),
                mime=media["mime"],
                fps=float(media["fps"]) if media.get("fps") is not None else None,
            )
            stored = await evidence_store.load(media["content_hash"])
        except RuntimeError:
            # The app must still start so an admin can diagnose unavailable B2.
            # No local file is exposed as fallback media.
            get_logger("seed").warning("showcase_b2_unavailable", clip=index + 1)
            continue
        if stored is not None and stored.object_version:
            video_id = uuid5(NAMESPACE_URL, f"loadtruth-demo:{tenant_id}:{media['content_hash']}")
            existing = await session.get(models.DemoVideo, video_id)
            if existing is None:
                sample: dict[str, object] = next(
                    (
                        item
                        for item in data["tickets"]
                        if item["content_hash"] == media["content_hash"]
                    ),
                    {},
                )
                label = str(sample.get("debris_class") or "truck load").replace("_", " ").title()
                session.add(
                    models.DemoVideo(
                        id=video_id,
                        tenant_id=tenant_id,
                        title=f"Showcase {index + 1} · {label}",
                        filename=f"showcase-{index + 1}.mp4",
                        mime=stored.mime,
                        size_bytes=stored.size_bytes,
                        object_key=stored.object_key,
                        object_version=stored.object_version,
                        status="ready",
                        notes="Packaged Meta-processed showcase clip. No independently measured reference fill.",
                    )
                )

    for item in data["tickets"]:
        ticket_id = UUID(str(item["id"]))
        found = await session.scalar(select(models.Ticket.id).where(models.Ticket.id == ticket_id))
        if found is not None:
            continue
        session.add(
            models.Ticket(
                id=ticket_id,
                tenant_id=tenant_id,
                event_id=event_id,
                clip_id=None,
                truck_id=item["truck_id"],
                certified_cubic_yards=Decimal(item["certified_cubic_yards"]),
                debris_class=item["debris_class"],
                rate_per_cy=Decimal(item["rate_per_cy"]),
                est_fill_pct=Decimal(item["est_fill_pct"]),
                est_cubic_yards=Decimal(item["est_cubic_yards"]),
                est_dollar_value=Decimal(item["est_dollar_value"]),
                monitor_call_fill_pct=_decimal(item.get("monitor_call_fill_pct")),
                monitor_cubic_yards=_decimal(item.get("monitor_cubic_yards")),
                monitor_dollar_value=_decimal(item.get("monitor_dollar_value")),
                delta_cubic_yards=_decimal(item.get("delta_cubic_yards")),
                delta_dollar_value=_decimal(item.get("delta_dollar_value")),
                status="draft",
                confirmed_fill_pct=None,
                evidence_frames=list(item.get("evidence_frames", [])),
                created_at=datetime.fromisoformat(item["created_at"]),
            )
        )
        for anomaly in item.get("anomalies", []):
            session.add(
                models.Anomaly(
                    tenant_id=tenant_id,
                    ticket_id=ticket_id,
                    type=anomaly["type"],
                    severity=anomaly["severity"],
                    explanation=anomaly.get("explanation"),
                    evidence_frame=anomaly.get("evidence_frame"),
                )
            )
        session.add(
            models.TicketEvidence(
                tenant_id=tenant_id,
                ticket_id=ticket_id,
                content_hash=item["content_hash"],
                media_kind=item["media_kind"],
                mime=item["mime"],
                fps=_decimal(item.get("fps")),
                segments=dict(item.get("segments", {})),
            )
        )
        for stage in item.get("stages", []):
            session.add(
                models.PipelineStageRow(
                    tenant_id=tenant_id,
                    ticket_id=ticket_id,
                    position=stage["position"],
                    stage_key=stage["stage_key"],
                    label=stage["label"],
                    model=stage["model"],
                    status=stage["status"],
                    summary=stage["summary"],
                    confidence=_decimal(stage.get("confidence")),
                    duration_ms=_decimal(stage.get("duration_ms")) or Decimal(0),
                    details=list(stage.get("details", [])),
                    analysis=stage.get("analysis"),
                )
            )
    await session.flush()


async def _migrate_legacy_demo_tenant(session: AsyncSession) -> None:
    """Move the original placeholder demo tenant to the current seeded tenant."""
    source_tenant = _LEGACY_DEMO_TENANT_ID
    target_tenant = DEMO_TENANT_ID
    if source_tenant == target_tenant:
        return

    showcase_video_ids = {
        uuid5(NAMESPACE_URL, f"loadtruth-demo:{source_tenant}:{media['content_hash']}")
        for media in _showcase_data().get("media", [])
    }
    movable_videos = list(
        (
            await session.scalars(
                select(models.DemoVideo.id)
                .where(models.DemoVideo.tenant_id == source_tenant)
                .where(models.DemoVideo.id.not_in(showcase_video_ids))
            )
        ).all()
    )

    for model in (
        models.Event,
        models.Source,
        models.Truck,
        models.Ticket,
        models.User,
        models.Anomaly,
        models.PipelineStageRow,
        models.AIStageResult,
        models.TicketEvidence,
    ):
        await session.execute(
            update(model)
            .where(model.tenant_id == source_tenant)
            .values(tenant_id=target_tenant)
        )

    if movable_videos:
        await session.execute(
            update(models.DemoVideo)
            .where(models.DemoVideo.tenant_id == source_tenant)
            .where(models.DemoVideo.id.in_(movable_videos))
            .values(tenant_id=target_tenant)
        )
        await session.execute(
            update(models.AnalysisJob)
            .where(models.AnalysisJob.tenant_id == source_tenant)
            .where(models.AnalysisJob.video_id.in_(movable_videos))
            .values(tenant_id=target_tenant)
        )

    get_logger("seed").info(
        "legacy_demo_tenant_migrated",
        source_tenant=str(source_tenant),
        target_tenant=str(target_tenant),
    )


async def seed_demo(session: AsyncSession) -> None:
    """Idempotently seed the demo tenant from `seed.json`. Safe on every startup.

    Seeds the tenant-level truck registry and members once, then every event
    (with its own rate table, sources, and tickets). Existing installations
    still receive the separately packaged showcase event and media.
    """
    data = _seed_data()
    tenant_id = DEMO_TENANT_ID
    events = _events()

    # Accuracy is now computed from real monitor calls vs. machine estimates
    # (see repository._compute_accuracy_within_10pct), so no seeded figure is
    # registered here anymore.

    existing = (
        await session.execute(select(models.Event).where(models.Event.id == DEMO_EVENT_ID))
    ).scalar_one_or_none()
    if existing is not None and existing.tenant_id == _LEGACY_DEMO_TENANT_ID:
        await _migrate_legacy_demo_tenant(session)
        existing.tenant_id = tenant_id
        await session.flush()
    if existing is not None:
        await _seed_showcase(session, tenant_id)
        await session.commit()
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
                tags=list(ev.get("tags", [])),
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
        tickets, anomalies, stages = _build_ticket_rows(
            tenant_id, event_id, list(ev.get("tickets", []))
        )
        session.add_all(tickets)
        session.add_all(anomalies)
        session.add_all(stages)

    await _seed_showcase(session, tenant_id)

    await session.commit()
