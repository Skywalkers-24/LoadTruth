"""Ticket/event repository — SQLAlchemy-backed, tenant-scoped.

Runs on the interim SQLite DB today and on Supabase Postgres once wired (same
code; only the engine URL changes). Every method filters by ``tenant_id`` in the
query (defense in depth; RLS is the Postgres backstop). Returns the domain
dataclasses from `app.tickets.domain`, so the API/serializers are unchanged.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import UnaryExpression

from app.config import get_settings
from app.db import models
from app.pipeline.registry import CertifiedTruck, TruckRegistry
from app.tickets.domain import Event, Ticket
from app.tickets.money import value_ticket
from app.tickets.schemas import DebrisClass, SortOrder, TicketSort, TicketStatus

# Which Ticket column each ledger sort maps to.
_SORT_COLUMN = {
    TicketSort.CREATED: models.Ticket.created_at,
    TicketSort.DELTA: models.Ticket.delta_dollar_value,
    TicketSort.MEASURED: models.Ticket.est_cubic_yards,
    TicketSort.VALUE: models.Ticket.est_dollar_value,
}


def _order_by(sort: TicketSort, order: SortOrder) -> list[UnaryExpression[Any]]:
    """ORDER BY clause for a ledger page: chosen column, nulls last, id tiebreak.

    Nulls are forced to the end in both directions so uncalled tickets (no
    delta) never read as extreme values. ``id`` is the stable tiebreaker so
    paging never drops or repeats a row across pages.
    """
    col = _SORT_COLUMN[sort]
    direction = col.asc() if order is SortOrder.ASC else col.desc()
    return [direction.nulls_last(), models.Ticket.id.desc()]


class TicketNotFoundError(Exception):
    """Raised when a ticket id is absent (or belongs to another tenant)."""


class TruckNotFoundError(Exception):
    """Raised when a truck id is absent (or belongs to another tenant)."""


class DuplicateTruckError(Exception):
    """Raised when a truck_number already exists for the tenant."""


class EventNotFoundError(Exception):
    """Raised when an event id is absent (or belongs to another tenant)."""


class SourceNotFoundError(Exception):
    """Raised when a source id is absent (or belongs to another tenant)."""


class UserNotFoundError(Exception):
    """Raised when a user id is absent (or belongs to another tenant)."""


class DuplicateUserError(Exception):
    """Raised when an email already exists for the tenant."""


class DashboardSummary:
    """Event-level roll-up for the dashboard (PLAN.md §3.4, §7a roll-up)."""

    __slots__ = (
        "accuracy_within_10pct",
        "anomaly_count",
        "event_id",
        "overbill_ticket_count",
        "reviewed_count",
        "ticket_count",
        "total_delta_cubic_yards",
        "total_delta_dollar_value",
    )

    def __init__(
        self,
        *,
        event_id: UUID,
        ticket_count: int,
        reviewed_count: int,
        anomaly_count: int,
        overbill_ticket_count: int,
        total_delta_cubic_yards: Decimal,
        total_delta_dollar_value: Decimal,
        accuracy_within_10pct: float | None,
    ) -> None:
        self.event_id = event_id
        self.ticket_count = ticket_count
        self.reviewed_count = reviewed_count
        self.anomaly_count = anomaly_count
        self.overbill_ticket_count = overbill_ticket_count
        self.total_delta_cubic_yards = total_delta_cubic_yards
        self.total_delta_dollar_value = total_delta_dollar_value
        self.accuracy_within_10pct = accuracy_within_10pct


class ReportsSummaryData:
    """Event-level reporting roll-up (data for the reports page).

    Counts tickets by status and by debris class, sums the estimated and delta
    dollars, isolates the overbilled subset, counts anomalies by severity,
    tracks review progress, and carries the benchmark accuracy fraction.
    """

    __slots__ = (
        "accuracy_within_10pct",
        "anomaly_counts_by_severity",
        "benchmarked_count",
        "counts_by_debris_class",
        "counts_by_status",
        "event_id",
        "overbill_dollar_value",
        "overbill_ticket_count",
        "pending_count",
        "reviewed_count",
        "ticket_count",
        "total_delta_dollar_value",
        "total_est_dollar_value",
    )

    def __init__(
        self,
        *,
        event_id: UUID,
        ticket_count: int,
        counts_by_status: dict[str, int],
        counts_by_debris_class: dict[str, int],
        total_est_dollar_value: Decimal,
        total_delta_dollar_value: Decimal,
        overbill_ticket_count: int,
        overbill_dollar_value: Decimal,
        anomaly_counts_by_severity: dict[str, int],
        reviewed_count: int,
        pending_count: int,
        accuracy_within_10pct: float | None,
        benchmarked_count: int,
    ) -> None:
        self.event_id = event_id
        self.ticket_count = ticket_count
        self.counts_by_status = counts_by_status
        self.counts_by_debris_class = counts_by_debris_class
        self.total_est_dollar_value = total_est_dollar_value
        self.total_delta_dollar_value = total_delta_dollar_value
        self.overbill_ticket_count = overbill_ticket_count
        self.overbill_dollar_value = overbill_dollar_value
        self.anomaly_counts_by_severity = anomaly_counts_by_severity
        self.reviewed_count = reviewed_count
        self.pending_count = pending_count
        self.accuracy_within_10pct = accuracy_within_10pct
        # Denominator behind the accuracy fraction — the number of tickets with a
        # monitor call. Lets the "All events" view weight combined accuracy exactly.
        self.benchmarked_count = benchmarked_count


@dataclass(frozen=True, slots=True)
class ReverifyResult:
    """Outcome of replaying a ticket's measurement from its stored evidence.

    ``reproducible`` is True when the fill % recomputed from stored Muse estimates
    or legacy SAM masks
    equals the ticket's stored fill %. ``receipt_hash`` is the SHA-256 fingerprint
    of every pinned input; ``receipt_inputs`` is the canonical input record behind
    that hash (shown to an auditor and encoded in the ticket/packet QR).
    """

    reproducible: bool
    reason: str
    stored_fill_pct: Decimal
    recomputed_fill_pct: Decimal | None
    receipt_hash: str | None
    receipt_inputs: dict[str, object]


def _to_event(row: models.Event) -> Event:
    return Event(
        tenant_id=row.tenant_id,
        name=row.name,
        location=row.location,
        status=row.status,
        rate_table=dict(row.rate_table or {}),
        tags=list(row.tags or []),
        id=row.id,
        created_at=row.created_at,
    )


def _to_ticket(row: models.Ticket, anomaly_count: int) -> Ticket:
    return Ticket(
        tenant_id=row.tenant_id,
        event_id=row.event_id,
        debris_class=DebrisClass(row.debris_class),
        certified_cubic_yards=row.certified_cubic_yards,
        rate_per_cy=row.rate_per_cy,
        est_fill_pct=row.est_fill_pct,
        est_cubic_yards=row.est_cubic_yards,
        est_dollar_value=row.est_dollar_value,
        truck_id=row.truck_id,
        clip_id=row.clip_id,
        monitor_call_fill_pct=row.monitor_call_fill_pct,
        monitor_cubic_yards=row.monitor_cubic_yards,
        monitor_dollar_value=row.monitor_dollar_value,
        delta_cubic_yards=row.delta_cubic_yards,
        delta_dollar_value=row.delta_dollar_value,
        status=TicketStatus(row.status),
        confirmed_fill_pct=row.confirmed_fill_pct,
        evidence_frames=list(row.evidence_frames or []),
        anomaly_count=anomaly_count,
        id=row.id,
        created_at=row.created_at,
    )


class SqlTicketRepository:
    """Async SQLAlchemy repository. One per request, bound to a session."""

    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    @property
    def session(self) -> AsyncSession:
        """Request-scoped session for adjacent tenant-scoped library operations."""
        return self._s

    async def _anomaly_counts(self, tenant_id: UUID, ticket_ids: list[UUID]) -> dict[UUID, int]:
        if not ticket_ids:
            return {}
        rows = await self._s.execute(
            select(models.Anomaly.ticket_id, func.count())
            .where(models.Anomaly.tenant_id == tenant_id)
            .where(models.Anomaly.ticket_id.in_(ticket_ids))
            .group_by(models.Anomaly.ticket_id)
        )
        return {tid: int(n) for tid, n in rows.all()}

    async def list_events(self, tenant_id: UUID) -> list[Event]:
        rows = await self._s.execute(
            select(models.Event)
            .where(models.Event.tenant_id == tenant_id)
            .order_by(models.Event.name)
        )
        return [_to_event(r) for r in rows.scalars().all()]

    async def list_tickets(self, tenant_id: UUID, event_id: UUID | None = None) -> list[Ticket]:
        """All tickets for the tenant (optionally one event), newest first.

        This is the whole-event path used by the dashboard roll-up, CSV export,
        and the audit packet — callers that must aggregate every row. For a
        paginated page (the ticket-list UI), use ``list_tickets_page``.
        """
        stmt = select(models.Ticket).where(models.Ticket.tenant_id == tenant_id)
        if event_id is not None:
            stmt = stmt.where(models.Ticket.event_id == event_id)
        stmt = stmt.order_by(models.Ticket.created_at.desc())
        rows = list((await self._s.execute(stmt)).scalars().all())
        counts = await self._anomaly_counts(tenant_id, [r.id for r in rows])
        return [_to_ticket(r, counts.get(r.id, 0)) for r in rows]

    async def list_tickets_page(
        self,
        tenant_id: UUID,
        *,
        event_id: UUID | None = None,
        status: TicketStatus | None = None,
        debris_class: DebrisClass | None = None,
        limit: int,
        offset: int,
        sort: TicketSort = TicketSort.CREATED,
        order: SortOrder = SortOrder.DESC,
    ) -> tuple[list[Ticket], int]:
        """One page of tickets plus the total matching count.

        Tenant-scoped with optional ``event_id``/``status``/``debris_class``
        filters, ordered by ``sort``/``order`` (default newest first). Runs a
        COUNT over the filtered set and a separate LIMIT/OFFSET page query so the
        envelope's ``total`` reflects the full match, not the page. The two
        queries share the same filter predicates. Rows with a null sort value
        (e.g. an uncalled ticket has no delta) always sort to the end regardless
        of direction, so they never masquerade as extreme values.
        """
        filters = [models.Ticket.tenant_id == tenant_id]
        if event_id is not None:
            filters.append(models.Ticket.event_id == event_id)
        if status is not None:
            filters.append(models.Ticket.status == status.value)
        if debris_class is not None:
            filters.append(models.Ticket.debris_class == debris_class.value)

        total = int(
            (
                await self._s.execute(
                    select(func.count()).select_from(models.Ticket).where(*filters)
                )
            ).scalar_one()
        )
        page_stmt = (
            select(models.Ticket)
            .where(*filters)
            .order_by(*_order_by(sort, order))
            .limit(limit)
            .offset(offset)
        )
        rows = list((await self._s.execute(page_stmt)).scalars().all())
        counts = await self._anomaly_counts(tenant_id, [r.id for r in rows])
        return [_to_ticket(r, counts.get(r.id, 0)) for r in rows], total

    async def list_anomalies_for_ticket(
        self, tenant_id: UUID, ticket_id: UUID
    ) -> list[models.Anomaly]:
        """All anomaly flags for one ticket (tenant-scoped), ordered by severity."""
        order = {"high": 0, "warn": 1, "info": 2}
        rows = list(
            (
                await self._s.execute(
                    select(models.Anomaly)
                    .where(models.Anomaly.tenant_id == tenant_id)
                    .where(models.Anomaly.ticket_id == ticket_id)
                )
            )
            .scalars()
            .all()
        )
        return sorted(rows, key=lambda a: order.get(a.severity, 3))

    async def _get_row(self, tenant_id: UUID, ticket_id: UUID) -> models.Ticket:
        row = (
            await self._s.execute(
                select(models.Ticket)
                .where(models.Ticket.tenant_id == tenant_id)
                .where(models.Ticket.id == ticket_id)
            )
        ).scalar_one_or_none()
        if row is None:
            raise TicketNotFoundError(str(ticket_id))
        return row

    async def get_ticket(self, tenant_id: UUID, ticket_id: UUID) -> Ticket:
        row = await self._get_row(tenant_id, ticket_id)
        counts = await self._anomaly_counts(tenant_id, [row.id])
        return _to_ticket(row, counts.get(row.id, 0))

    async def set_monitor_call(
        self, tenant_id: UUID, ticket_id: UUID, monitor_fill_pct: Decimal
    ) -> Ticket:
        row = await self._get_row(tenant_id, ticket_id)
        # Reuse the domain recompute for the §7a delta, then persist the fields.
        dom = _to_ticket(row, 0)
        dom.apply_monitor_call(monitor_fill_pct)
        row.monitor_call_fill_pct = dom.monitor_call_fill_pct
        row.monitor_cubic_yards = dom.monitor_cubic_yards
        row.monitor_dollar_value = dom.monitor_dollar_value
        row.delta_cubic_yards = dom.delta_cubic_yards
        row.delta_dollar_value = dom.delta_dollar_value
        await self._s.flush()
        return await self.get_ticket(tenant_id, ticket_id)

    async def set_status(self, tenant_id: UUID, ticket_id: UUID, status: TicketStatus) -> Ticket:
        row = await self._get_row(tenant_id, ticket_id)
        row.status = status.value
        if status in (TicketStatus.CONFIRMED, TicketStatus.OVERRIDDEN):
            # Use an explicit None check: a legitimate 0% monitor call must not
            # fall back to the estimate (0 is falsy under `or`).
            row.confirmed_fill_pct = (
                row.monitor_call_fill_pct
                if row.monitor_call_fill_pct is not None
                else row.est_fill_pct
            )
        await self._s.flush()
        return await self.get_ticket(tenant_id, ticket_id)

    async def update_ticket(
        self,
        tenant_id: UUID,
        ticket_id: UUID,
        *,
        truck_id: str | None = None,
        debris_class: DebrisClass | None = None,
        fields_set: set[str],
    ) -> Ticket:
        """Edit a ticket's identity/classification and recompute its valuation.

        Only fields named in ``fields_set`` change (so a caller can set
        ``truck_id`` to ``None`` to clear it). Changing the truck re-runs the
        certified-capacity lookup; changing the debris class re-reads the event's
        rate table. Either change re-runs the §7a value path so cubic yards, the
        monitor delta, and the dollar value all stay consistent, never patched by
        hand.
        """
        row = await self._get_row(tenant_id, ticket_id)

        if "truck_id" in fields_set:
            new_truck = (truck_id or "").strip() or None
            row.truck_id = new_truck
            # Re-derive certified capacity from the registry for the new truck.
            match = await self._match_capacity(tenant_id, new_truck)
            row.certified_cubic_yards = match

        if "debris_class" in fields_set and debris_class is not None:
            row.debris_class = debris_class.value
            row.rate_per_cy = await self._rate_for(tenant_id, row.event_id, debris_class)

        # Recompute every derived figure from the (possibly) new inputs via the
        # single §7a value path, preserving any monitor call already recorded.
        dom = _to_ticket(row, 0)
        v = value_ticket(
            certified_cubic_yards=dom.certified_cubic_yards,
            rate_per_cy=dom.rate_per_cy,
            est_fill_pct=dom.est_fill_pct,
            monitor_fill_pct=dom.monitor_call_fill_pct,
        )
        row.est_cubic_yards = v.est_cubic_yards
        row.est_dollar_value = v.est_dollar_value
        row.monitor_cubic_yards = v.monitor_cubic_yards
        row.monitor_dollar_value = v.monitor_dollar_value
        row.delta_cubic_yards = v.delta_cubic_yards
        row.delta_dollar_value = v.delta_dollar_value
        await self._s.flush()
        return await self.get_ticket(tenant_id, ticket_id)

    async def _match_capacity(self, tenant_id: UUID, truck_id: str | None) -> Decimal:
        """Certified capacity for a (possibly fuzzy) truck id, or 0 if unknown."""
        if not truck_id:
            return Decimal(0)
        registry = TruckRegistry(
            [
                CertifiedTruck(number, cap, body_type or "")
                for number, body_type, cap in await self.get_registry(tenant_id)
            ]
        )
        match = registry.lookup(truck_id)
        return match.truck.certified_cubic_yards if match.truck else Decimal(0)

    async def _rate_for(
        self, tenant_id: UUID, event_id: UUID, debris_class: DebrisClass
    ) -> Decimal:
        """The event's $/CY rate for a debris class, or 0 when unset."""
        event = await self.get_event(tenant_id, event_id)
        return event.rate_for(debris_class) if event is not None else Decimal(0)

    async def save_pipeline_stages(
        self, tenant_id: UUID, ticket_id: UUID, stages: list[object]
    ) -> None:
        """Persist the AI pipeline trace for a ticket. ``stages`` are StageRecords."""
        for i, s in enumerate(stages):
            self._s.add(
                models.PipelineStageRow(
                    tenant_id=tenant_id,
                    ticket_id=ticket_id,
                    position=i,
                    stage_key=getattr(s, "key", ""),
                    label=getattr(s, "label", ""),
                    model=getattr(s, "model", ""),
                    status=getattr(s, "status", "ok"),
                    summary=getattr(s, "summary", ""),
                    confidence=getattr(s, "confidence", None),
                    duration_ms=getattr(s, "duration_ms", 0.0) or 0.0,
                    details=list(getattr(s, "details", None) or []),
                    analysis=getattr(s, "analysis", "") or None,
                )
            )
        await self._s.flush()

    async def save_ticket_evidence(
        self,
        tenant_id: UUID,
        ticket_id: UUID,
        *,
        content_hash: str,
        media_kind: str,
        mime: str,
        fps: float | None,
        segments: dict[str, str],
        ai_cache_namespace: str = "",
    ) -> None:
        """Link a ticket to its processed clip and SAM's raw segmentation."""
        self._s.add(
            models.TicketEvidence(
                tenant_id=tenant_id,
                ticket_id=ticket_id,
                content_hash=content_hash,
                media_kind=media_kind,
                mime=mime,
                fps=fps,
                segments=dict(segments),
                ai_cache_namespace=ai_cache_namespace or None,
            )
        )
        await self._s.flush()

    async def get_ticket_evidence(
        self, tenant_id: UUID, ticket_id: UUID
    ) -> models.TicketEvidence | None:
        """The ticket's evidence row (tenant-scoped), or None."""
        return (
            await self._s.execute(
                select(models.TicketEvidence)
                .where(models.TicketEvidence.tenant_id == tenant_id)
                .where(models.TicketEvidence.ticket_id == ticket_id)
            )
        ).scalar_one_or_none()

    async def reverify_ticket(self, tenant_id: UUID, ticket_id: UUID) -> ReverifyResult:
        """Recompute a ticket's fill % from its stored model evidence and receipt.

        Deterministic and offline: Muse's stored per-frame estimates are combined
        with the same median as ingestion; older/fixture results without those
        estimates replay from the stored SAM masks. Raises ``TicketNotFoundError``
        if the ticket is absent and returns ``reproducible=False`` when evidence
        needed to replay is unavailable.
        """
        from decimal import ROUND_HALF_UP
        from statistics import median

        from app.ai import serde
        from app.ai.sam_measure import BED_LABEL, LOAD_LABEL
        from app.pipeline.geometry import MaskMeasurement, estimate_fill
        from app.pipeline.receipt import ReceiptInputs, compute_receipt, sam_output_hash

        ticket = await self.get_ticket(tenant_id, ticket_id)
        evidence = await self.get_ticket_evidence(tenant_id, ticket_id)
        settings = get_settings()

        track_json = (
            await self.get_ai_stage_result(
                tenant_id,
                evidence.content_hash,
                f"{serde.STAGE_TRACK}:{evidence.ai_cache_namespace}"
                if evidence.ai_cache_namespace
                else serde.STAGE_TRACK,
            )
            if evidence is not None
            else None
        )
        if evidence is None or track_json is None or not serde.track_is_current(track_json):
            return ReverifyResult(
                reproducible=False,
                reason="No stored segmentation is available to replay for this ticket.",
                stored_fill_pct=ticket.est_fill_pct,
                recomputed_fill_pct=None,
                receipt_hash=None,
                receipt_inputs={},
            )

        track = serde.track_from_json(track_json)
        bed = track.by_label(BED_LABEL)
        debris = track.by_label(LOAD_LABEL)
        bed_area = sum(bed.mask_areas) / len(bed.mask_areas) if bed and bed.mask_areas else 0.0
        load_area = (
            sum(debris.mask_areas) / len(debris.mask_areas) if debris and debris.mask_areas else 0.0
        )
        body_type = await self._body_type_for(tenant_id, ticket.truck_id)

        classify_key = (
            f"{serde.STAGE_CLASSIFY}:{evidence.ai_cache_namespace}"
            if evidence.ai_cache_namespace
            else serde.STAGE_CLASSIFY
        )
        classify_json = await self.get_ai_stage_result(
            tenant_id, evidence.content_hash, classify_key
        )
        if classify_json is None:
            legacy_classify_key = (
                f"spark_fill_v2:{evidence.ai_cache_namespace}"
                if evidence.ai_cache_namespace
                else "spark_fill_v2"
            )
            classify_json = await self.get_ai_stage_result(
                tenant_id, evidence.content_hash, legacy_classify_key
            )
        raw_frame_fills = classify_json.get("frame_fill_pcts") if classify_json else None
        muse_frame_fills: list[float] = []
        if isinstance(raw_frame_fills, list):
            for value in raw_frame_fills:
                if (
                    isinstance(value, bool)
                    or not isinstance(value, int | float)
                    or not 0 <= float(value) <= 100
                ):
                    return ReverifyResult(
                        reproducible=False,
                        reason="Stored Muse frame estimates are invalid.",
                        stored_fill_pct=ticket.est_fill_pct,
                        recomputed_fill_pct=None,
                        receipt_hash=None,
                        receipt_inputs={},
                    )
                muse_frame_fills.append(float(value))

        fill_source = "muse_spark_frame_median" if muse_frame_fills else "sam_mask_coverage"
        if not muse_frame_fills and (bed is None or debris is None or not bed.mask_areas):
            return ReverifyResult(
                reproducible=False,
                reason="No stored Muse frame estimates or usable bed segmentation are available.",
                stored_fill_pct=ticket.est_fill_pct,
                recomputed_fill_pct=None,
                receipt_hash=None,
                receipt_inputs={},
            )
        recomputed_fill_pct = (
            Decimal(str(median(muse_frame_fills))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            if muse_frame_fills
            else estimate_fill(
                [
                    MaskMeasurement(
                        bed_area=bed_area,
                        load_area=load_area,
                        load_height_ratio=debris.load_height_ratio if debris else 0.0,
                    )
                ]
            ).fill_pct
        )

        served_spark: list[str] = []
        for stage in (serde.STAGE_OCR, serde.STAGE_CLASSIFY):
            stage_key = (
                f"{stage}:{evidence.ai_cache_namespace}" if evidence.ai_cache_namespace else stage
            )
            cached = await self.get_ai_stage_result(tenant_id, evidence.content_hash, stage_key)
            if cached is not None and cached.get("_model"):
                identity = str(cached["_model"])
                if cached.get("_provider_model"):
                    identity += ":" + str(cached["_provider_model"])
                if identity not in served_spark:
                    served_spark.append(identity)

        receipt = compute_receipt(
            ReceiptInputs(
                content_hash=evidence.content_hash,
                sam_output_hash=sam_output_hash(
                    {str(k): str(v) for k, v in (evidence.segments or {}).items()}
                ),
                bed_area=bed_area,
                load_area=load_area,
                load_height_ratio=debris.load_height_ratio if debris else 0.0,
                body_type=body_type,
                truck_id=ticket.truck_id,
                debris_class=ticket.debris_class.value,
                certified_cubic_yards=str(ticket.certified_cubic_yards),
                rate_per_cy=str(ticket.rate_per_cy),
                est_fill_pct=str(ticket.est_fill_pct),
                est_cubic_yards=str(ticket.est_cubic_yards),
                est_dollar_value=str(ticket.est_dollar_value),
                sam_model=str(track_json.get("_model") or settings.sam_model),
                spark_model="; ".join(served_spark) or settings.spark_model,
                fill_source=fill_source,
                muse_frame_fill_pcts=muse_frame_fills,
            )
        )
        reproducible = recomputed_fill_pct == ticket.est_fill_pct
        return ReverifyResult(
            reproducible=reproducible,
            reason=(
                "Recomputed fill matches the stored ticket."
                if reproducible
                else "Recomputed fill differs from the stored ticket."
            ),
            stored_fill_pct=ticket.est_fill_pct,
            recomputed_fill_pct=recomputed_fill_pct,
            receipt_hash=receipt.receipt_hash,
            receipt_inputs=receipt.inputs,
        )

    async def _body_type_for(self, tenant_id: UUID, truck_id: str | None) -> str | None:
        """The matched truck's body type (pinned on the receipt), or None."""
        if not truck_id:
            return None
        registry = TruckRegistry(
            [
                CertifiedTruck(number, cap, body_type or "")
                for number, body_type, cap in await self.get_registry(tenant_id)
            ]
        )
        match = registry.lookup(truck_id)
        return match.truck.body_type if match.truck else None

    async def list_pipeline_stages(
        self, tenant_id: UUID, ticket_id: UUID
    ) -> list[models.PipelineStageRow]:
        """The persisted AI pipeline trace for a ticket, in order."""
        rows = list(
            (
                await self._s.execute(
                    select(models.PipelineStageRow)
                    .where(models.PipelineStageRow.tenant_id == tenant_id)
                    .where(models.PipelineStageRow.ticket_id == ticket_id)
                )
            )
            .scalars()
            .all()
        )
        return sorted(rows, key=lambda r: int(r.position))

    async def pipeline_stages_for_tickets(
        self, tenant_id: UUID, ticket_ids: list[UUID]
    ) -> dict[UUID, list[models.PipelineStageRow]]:
        """Persisted stages for many tickets at once, keyed by ticket id.

        One query instead of one per ticket, so the AI Pipeline list reads the
        durable trace without an N+1. Each ticket's stages are ordered.
        """
        if not ticket_ids:
            return {}
        rows = list(
            (
                await self._s.execute(
                    select(models.PipelineStageRow)
                    .where(models.PipelineStageRow.tenant_id == tenant_id)
                    .where(models.PipelineStageRow.ticket_id.in_(ticket_ids))
                )
            )
            .scalars()
            .all()
        )
        by_ticket: dict[UUID, list[models.PipelineStageRow]] = {}
        for r in rows:
            by_ticket.setdefault(r.ticket_id, []).append(r)
        for stages in by_ticket.values():
            stages.sort(key=lambda r: int(r.position))
        return by_ticket

    async def get_ai_stage_result(
        self, tenant_id: UUID, content_hash: str, stage_key: str
    ) -> dict[str, object] | None:
        """The persisted raw output of one AI stage for a clip, or None on a miss.

        This is the read side of "run the vision model once, forever": when a row
        exists for ``(tenant, content_hash, stage)`` the pipeline replays it with
        no model call. Tenant-scoped so one tenant never reads another's results.
        """
        row = (
            await self._s.execute(
                select(models.AIStageResult)
                .where(models.AIStageResult.tenant_id == tenant_id)
                .where(models.AIStageResult.content_hash == content_hash)
                .where(models.AIStageResult.stage_key == stage_key)
            )
        ).scalar_one_or_none()
        return dict(row.result_json) if row is not None else None

    async def save_ai_stage_result(
        self,
        tenant_id: UUID,
        content_hash: str,
        stage_key: str,
        *,
        result_json: dict[str, object],
        model: str = "",
        confidence: float | None = None,
    ) -> None:
        """Persist one AI stage's raw output, keyed by the clip's content hash.

        Idempotent per ``(tenant, content_hash, stage)``: if a row already exists
        (e.g. a concurrent ingest of the same clip won the race) it is updated in
        place rather than duplicated, honouring the unique index.
        """
        existing = (
            await self._s.execute(
                select(models.AIStageResult)
                .where(models.AIStageResult.tenant_id == tenant_id)
                .where(models.AIStageResult.content_hash == content_hash)
                .where(models.AIStageResult.stage_key == stage_key)
            )
        ).scalar_one_or_none()
        if existing is not None:
            existing.result_json = result_json
            existing.model = model
            existing.confidence = confidence
        else:
            self._s.add(
                models.AIStageResult(
                    tenant_id=tenant_id,
                    content_hash=content_hash,
                    stage_key=stage_key,
                    result_json=result_json,
                    model=model,
                    confidence=confidence,
                )
            )
        await self._s.flush()

    async def add_from_pipeline(self, ticket: Ticket, anomalies: list[object]) -> Ticket:
        """Persist a pipeline-produced draft ticket and its anomalies.

        ``anomalies`` items expose ``.type``, ``.severity``, ``.explanation``,
        ``.evidence_frame`` (the Stage-6 Anomaly dataclass).
        """
        row = models.Ticket(
            id=ticket.id,
            tenant_id=ticket.tenant_id,
            event_id=ticket.event_id,
            truck_id=ticket.truck_id,
            certified_cubic_yards=ticket.certified_cubic_yards,
            debris_class=ticket.debris_class.value,
            rate_per_cy=ticket.rate_per_cy,
            est_fill_pct=ticket.est_fill_pct,
            est_cubic_yards=ticket.est_cubic_yards,
            est_dollar_value=ticket.est_dollar_value,
            status=ticket.status.value,
            evidence_frames=list(ticket.evidence_frames),
        )
        self._s.add(row)
        for a in anomalies:
            self._s.add(
                models.Anomaly(
                    tenant_id=ticket.tenant_id,
                    ticket_id=ticket.id,
                    type=str(a.type),  # type: ignore[attr-defined]
                    severity=str(a.severity),  # type: ignore[attr-defined]
                    explanation=a.explanation,  # type: ignore[attr-defined]
                    evidence_frame=a.evidence_frame,  # type: ignore[attr-defined]
                )
            )
        await self._s.flush()
        return await self.get_ticket(ticket.tenant_id, ticket.id)

    async def get_registry(self, tenant_id: UUID) -> list[tuple[str, str | None, Decimal]]:
        """Certified trucks for the tenant as (number, body_type, capacity)."""
        rows = await self._s.execute(
            select(models.Truck).where(models.Truck.tenant_id == tenant_id)
        )
        return [
            (r.truck_number, r.body_type, r.certified_cubic_yards) for r in rows.scalars().all()
        ]

    async def get_event(self, tenant_id: UUID, event_id: UUID) -> Event | None:
        row = (
            await self._s.execute(
                select(models.Event)
                .where(models.Event.tenant_id == tenant_id)
                .where(models.Event.id == event_id)
            )
        ).scalar_one_or_none()
        return _to_event(row) if row is not None else None

    async def dashboard(self, tenant_id: UUID, event_id: UUID) -> DashboardSummary:
        tickets = await self.list_tickets(tenant_id, event_id)
        reviewed = [
            t for t in tickets if t.status in (TicketStatus.CONFIRMED, TicketStatus.OVERRIDDEN)
        ]
        total_delta_cy = sum((t.delta_cubic_yards or Decimal(0) for t in tickets), Decimal(0))
        total_delta_usd = sum((t.delta_dollar_value or Decimal(0) for t in tickets), Decimal(0))
        return DashboardSummary(
            event_id=event_id,
            ticket_count=len(tickets),
            reviewed_count=len(reviewed),
            anomaly_count=sum(t.anomaly_count for t in tickets),
            overbill_ticket_count=sum(1 for t in tickets if t.is_overbill),
            total_delta_cubic_yards=total_delta_cy,
            total_delta_dollar_value=total_delta_usd,
            accuracy_within_10pct=_compute_accuracy_within_10pct(tickets),
        )

    async def _anomaly_severity_counts(self, tenant_id: UUID, event_id: UUID) -> dict[str, int]:
        """Anomaly counts by severity for one event's tickets (tenant-scoped)."""
        rows = await self._s.execute(
            select(models.Anomaly.severity, func.count())
            .join(models.Ticket, models.Anomaly.ticket_id == models.Ticket.id)
            .where(models.Anomaly.tenant_id == tenant_id)
            .where(models.Ticket.event_id == event_id)
            .group_by(models.Anomaly.severity)
        )
        return {str(sev): int(n) for sev, n in rows.all()}

    async def reports_summary(self, tenant_id: UUID, event_id: UUID) -> ReportsSummaryData:
        """Build the reports-page roll-up for one event (tenant-scoped)."""
        tickets = await self.list_tickets(tenant_id, event_id)

        counts_by_status: dict[str, int] = {}
        counts_by_debris_class: dict[str, int] = {}
        total_est = Decimal(0)
        total_delta = Decimal(0)
        overbill_count = 0
        overbill_dollars = Decimal(0)
        reviewed = 0
        for t in tickets:
            counts_by_status[t.status.value] = counts_by_status.get(t.status.value, 0) + 1
            counts_by_debris_class[t.debris_class.value] = (
                counts_by_debris_class.get(t.debris_class.value, 0) + 1
            )
            total_est += t.est_dollar_value
            total_delta += t.delta_dollar_value or Decimal(0)
            if t.is_overbill:
                overbill_count += 1
                overbill_dollars += t.delta_dollar_value or Decimal(0)
            if t.status in (TicketStatus.CONFIRMED, TicketStatus.OVERRIDDEN):
                reviewed += 1

        within, benchmarked = _accuracy_counts(tickets)
        return ReportsSummaryData(
            event_id=event_id,
            ticket_count=len(tickets),
            counts_by_status=counts_by_status,
            counts_by_debris_class=counts_by_debris_class,
            total_est_dollar_value=total_est,
            total_delta_dollar_value=total_delta,
            overbill_ticket_count=overbill_count,
            overbill_dollar_value=overbill_dollars,
            anomaly_counts_by_severity=await self._anomaly_severity_counts(tenant_id, event_id),
            reviewed_count=reviewed,
            pending_count=len(tickets) - reviewed,
            accuracy_within_10pct=(within / benchmarked if benchmarked else None),
            benchmarked_count=benchmarked,
        )

    # ── Truck registry CRUD (admin screen) ──────────────────────────────────
    async def list_trucks(self, tenant_id: UUID) -> list[models.Truck]:
        """All certified trucks for the tenant, ordered by number."""
        rows = await self._s.execute(
            select(models.Truck)
            .where(models.Truck.tenant_id == tenant_id)
            .order_by(models.Truck.truck_number)
        )
        return list(rows.scalars().all())

    async def _truck_row(self, tenant_id: UUID, truck_id: UUID) -> models.Truck:
        row = (
            await self._s.execute(
                select(models.Truck)
                .where(models.Truck.tenant_id == tenant_id)
                .where(models.Truck.id == truck_id)
            )
        ).scalar_one_or_none()
        if row is None:
            raise TruckNotFoundError(str(truck_id))
        return row

    async def _truck_number_taken(
        self, tenant_id: UUID, truck_number: str, *, exclude_id: UUID | None = None
    ) -> bool:
        stmt = (
            select(models.Truck.id)
            .where(models.Truck.tenant_id == tenant_id)
            .where(models.Truck.truck_number == truck_number)
        )
        if exclude_id is not None:
            stmt = stmt.where(models.Truck.id != exclude_id)
        return (await self._s.execute(stmt)).first() is not None

    async def create_truck(
        self,
        tenant_id: UUID,
        *,
        truck_number: str,
        body_type: str | None,
        certified_cubic_yards: Decimal,
        registry_source: str | None,
    ) -> models.Truck:
        """Register a truck; raises ``DuplicateTruckError`` on a used number."""
        if await self._truck_number_taken(tenant_id, truck_number):
            raise DuplicateTruckError(truck_number)
        row = models.Truck(
            tenant_id=tenant_id,
            truck_number=truck_number,
            body_type=body_type,
            certified_cubic_yards=certified_cubic_yards,
            registry_source=registry_source,
        )
        self._s.add(row)
        await self._s.flush()
        return row

    async def update_truck(
        self,
        tenant_id: UUID,
        truck_id: UUID,
        *,
        truck_number: str | None = None,
        body_type: str | None = None,
        certified_cubic_yards: Decimal | None = None,
        registry_source: str | None = None,
        fields_set: set[str],
    ) -> models.Truck:
        """Patch a truck. ``fields_set`` names which fields the caller supplied
        (so an explicit ``null`` clears a column but an omitted field doesn't)."""
        row = await self._truck_row(tenant_id, truck_id)
        if "truck_number" in fields_set and truck_number is not None:
            if await self._truck_number_taken(tenant_id, truck_number, exclude_id=truck_id):
                raise DuplicateTruckError(truck_number)
            row.truck_number = truck_number
        if "body_type" in fields_set:
            row.body_type = body_type
        if "certified_cubic_yards" in fields_set and certified_cubic_yards is not None:
            row.certified_cubic_yards = certified_cubic_yards
        if "registry_source" in fields_set:
            row.registry_source = registry_source
        await self._s.flush()
        return row

    async def delete_truck(self, tenant_id: UUID, truck_id: UUID) -> None:
        """Remove a truck; raises ``TruckNotFoundError`` if absent."""
        row = await self._truck_row(tenant_id, truck_id)
        await self._s.delete(row)
        await self._s.flush()

    # ── User / member management (admin Users screen) ────────────────────────
    async def list_users(self, tenant_id: UUID) -> list[models.User]:
        """All members for the tenant, ordered by email."""
        rows = await self._s.execute(
            select(models.User)
            .where(models.User.tenant_id == tenant_id)
            .order_by(models.User.email)
        )
        return list(rows.scalars().all())

    async def get_user_by_email(self, tenant_id: UUID, email: str) -> models.User | None:
        """Look up a member by email within the tenant (used for login)."""
        return (
            await self._s.execute(
                select(models.User)
                .where(models.User.tenant_id == tenant_id)
                .where(func.lower(models.User.email) == email.strip().lower())
            )
        ).scalar_one_or_none()

    async def get_user(self, tenant_id: UUID, user_id: UUID) -> models.User | None:
        """Fetch a member by id within the tenant (used to refresh identity)."""
        return (
            await self._s.execute(
                select(models.User)
                .where(models.User.tenant_id == tenant_id)
                .where(models.User.id == user_id)
            )
        ).scalar_one_or_none()

    async def _user_email_taken(self, tenant_id: UUID, email: str) -> bool:
        row = (
            await self._s.execute(
                select(models.User.id)
                .where(models.User.tenant_id == tenant_id)
                .where(models.User.email == email)
            )
        ).first()
        return row is not None

    async def _user_row(self, tenant_id: UUID, user_id: UUID) -> models.User:
        row = (
            await self._s.execute(
                select(models.User)
                .where(models.User.tenant_id == tenant_id)
                .where(models.User.id == user_id)
            )
        ).scalar_one_or_none()
        if row is None:
            raise UserNotFoundError(str(user_id))
        return row

    async def create_user(
        self,
        tenant_id: UUID,
        *,
        email: str,
        full_name: str | None,
        role: str,
        status: str,
    ) -> models.User:
        """Add a member; raises ``DuplicateUserError`` on a used email."""
        if await self._user_email_taken(tenant_id, email):
            raise DuplicateUserError(email)
        row = models.User(
            tenant_id=tenant_id,
            email=email,
            full_name=full_name,
            role=role,
            status=status,
        )
        self._s.add(row)
        await self._s.flush()
        return row

    async def update_user(
        self,
        tenant_id: UUID,
        user_id: UUID,
        *,
        email: str | None,
        full_name: str | None,
        role: str | None,
        status: str | None,
        fields_set: set[str],
    ) -> models.User:
        """Update a member; only supplied fields change."""
        row = await self._user_row(tenant_id, user_id)
        if "email" in fields_set and email is not None and email != row.email:
            if await self._user_email_taken(tenant_id, email):
                raise DuplicateUserError(email)
            row.email = email
        if "full_name" in fields_set:
            row.full_name = full_name
        if "role" in fields_set and role is not None:
            row.role = role
        if "status" in fields_set and status is not None:
            row.status = status
        await self._s.flush()
        return row

    async def delete_user(self, tenant_id: UUID, user_id: UUID) -> None:
        """Remove a member; raises ``UserNotFoundError`` if absent."""
        row = await self._user_row(tenant_id, user_id)
        await self._s.delete(row)
        await self._s.flush()

    # ── Event management (admin screen) ──────────────────────────────────────
    async def _event_row(self, tenant_id: UUID, event_id: UUID) -> models.Event:
        row = (
            await self._s.execute(
                select(models.Event)
                .where(models.Event.tenant_id == tenant_id)
                .where(models.Event.id == event_id)
            )
        ).scalar_one_or_none()
        if row is None:
            raise EventNotFoundError(str(event_id))
        return row

    async def create_event(
        self,
        tenant_id: UUID,
        *,
        name: str,
        location: str | None,
        status: str,
        rate_table: dict[str, float],
        tags: list[str] | None = None,
    ) -> Event:
        """Create a disaster event for the tenant."""
        row = models.Event(
            tenant_id=tenant_id,
            name=name,
            location=location,
            status=status,
            rate_table=rate_table,
            tags=list(tags or []),
        )
        self._s.add(row)
        await self._s.flush()
        return _to_event(row)

    async def update_event(
        self,
        tenant_id: UUID,
        event_id: UUID,
        *,
        name: str | None = None,
        location: str | None = None,
        status: str | None = None,
        rate_table: dict[str, float] | None = None,
        tags: list[str] | None = None,
        fields_set: set[str],
    ) -> Event:
        """Patch an event; only fields named in ``fields_set`` change."""
        row = await self._event_row(tenant_id, event_id)
        if "name" in fields_set and name is not None:
            row.name = name
        if "location" in fields_set:
            row.location = location
        if "status" in fields_set and status is not None:
            row.status = status
        if "rate_table" in fields_set and rate_table is not None:
            row.rate_table = rate_table
        if "tags" in fields_set and tags is not None:
            row.tags = list(tags)
        await self._s.flush()
        return _to_event(row)

    # ── Source connections (admin screen + multi-source ingest) ──────────────
    async def list_sources(self, tenant_id: UUID, event_id: UUID) -> list[models.Source]:
        """Connected sources for one event, oldest first (tenant-scoped)."""
        rows = await self._s.execute(
            select(models.Source)
            .where(models.Source.tenant_id == tenant_id)
            .where(models.Source.event_id == event_id)
            .order_by(models.Source.created_at)
        )
        return list(rows.scalars().all())

    async def source_row(self, tenant_id: UUID, source_id: UUID) -> models.Source:
        """Fetch one source; raises ``SourceNotFoundError`` if absent."""
        row = (
            await self._s.execute(
                select(models.Source)
                .where(models.Source.tenant_id == tenant_id)
                .where(models.Source.id == source_id)
            )
        ).scalar_one_or_none()
        if row is None:
            raise SourceNotFoundError(str(source_id))
        return row

    async def create_source(
        self,
        tenant_id: UUID,
        event_id: UUID,
        *,
        kind: str,
        name: str,
        config: dict[str, object],
        status: str,
    ) -> models.Source:
        """Connect a source to an event. Raises ``EventNotFoundError`` if the
        event is absent (or another tenant's)."""
        await self._event_row(tenant_id, event_id)  # existence + tenant guard
        row = models.Source(
            tenant_id=tenant_id,
            event_id=event_id,
            kind=kind,
            name=name,
            config=config,
            status=status,
        )
        self._s.add(row)
        await self._s.flush()
        return row

    async def update_source(
        self,
        tenant_id: UUID,
        source_id: UUID,
        *,
        kind: str | None = None,
        name: str | None = None,
        config: dict[str, object] | None = None,
        status: str | None = None,
        fields_set: set[str],
    ) -> models.Source:
        """Patch a source; only fields named in ``fields_set`` change."""
        row = await self.source_row(tenant_id, source_id)
        if "kind" in fields_set and kind is not None:
            row.kind = kind
        if "name" in fields_set and name is not None:
            row.name = name
        if "config" in fields_set and config is not None:
            # Shallow-merge so a PATCH that omits a write-only secret (the UI
            # cannot resend one it never received) preserves the stored value.
            # An empty-string value explicitly clears that key.
            merged = {**(row.config or {}), **config}
            row.config = {k: v for k, v in merged.items() if v != ""}
        if "status" in fields_set and status is not None:
            row.status = status
        await self._s.flush()
        return row

    async def delete_source(self, tenant_id: UUID, source_id: UUID) -> None:
        """Remove a source; raises ``SourceNotFoundError`` if absent."""
        row = await self.source_row(tenant_id, source_id)
        await self._s.delete(row)
        await self._s.flush()


# Fill estimates and calls are on a 0–100 scale; "within 10%" means the machine
# estimate is within this many percentage points of the human benchmark.
_ACCURACY_TOLERANCE_PCT = Decimal(10)


def _accuracy_counts(tickets: list[Ticket]) -> tuple[int, int]:
    """(within, benchmarked): how many benchmarked tickets (those with a monitor
    call) had the machine fill estimate within ±10 points of that call, and how
    many were benchmarked in total."""
    within = 0
    benchmarked = 0
    for t in tickets:
        call = t.monitor_call_fill_pct
        if call is None:
            continue
        benchmarked += 1
        if abs(t.est_fill_pct - call) <= _ACCURACY_TOLERANCE_PCT:
            within += 1
    return within, benchmarked


def _compute_accuracy_within_10pct(tickets: list[Ticket]) -> float | None:
    """Fraction of benchmarked tickets whose machine fill estimate lands within
    ±10 percentage points of the human monitor's independent call.

    The monitor's call is the ground truth: it's the human's own reading of the
    same load, recorded at review. Tickets without a call aren't benchmarked, so
    they're excluded. Returns ``None`` when no ticket has a call yet (the UI then
    shows "no benchmark" rather than a fabricated number).
    """
    within, benchmarked = _accuracy_counts(tickets)
    if benchmarked == 0:
        return None
    return within / benchmarked
