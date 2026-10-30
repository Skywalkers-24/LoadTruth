"""Run inside the backend container; JSON input/output, no model calls or schema changes."""

import asyncio
import json
import ssl
import sys
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from app.config import get_settings
from app.db.models import Anomaly, Event, PipelineStageRow, Ticket, TicketEvidence
from app.pipeline.benchmark_media import BENCHMARK_MEDIA
from sqlalchemy import DateTime, Numeric, insert, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import create_async_engine

MODELS = (Event, Ticket, Anomaly, PipelineStageRow, TicketEvidence)


def normalized(row):
    return json.loads(json.dumps(dict(row), default=str))


def typed(table, row):
    if set(row) != set(table.columns.keys()):
        raise ValueError("Bundle columns do not match backend schema: " + table.name)
    result = dict(row)
    for col in table.columns:
        value = result[col.name]
        if value is not None:
            if isinstance(col.type, DateTime):
                result[col.name] = datetime.fromisoformat(value)
            elif isinstance(col.type, Numeric):
                result[col.name] = Decimal(str(value))
    return result


async def export(data):
    s = get_settings()
    if s.is_sqlite or make_url(s.database_url).host != "db":
        raise ValueError("Export only supports local Compose Postgres")
    tenant, event = UUID(data["tenant_id"]), UUID(data["event_id"])
    tickets = {UUID(v) for v in data["tickets"]}
    if not tickets:
        raise ValueError("No tickets selected")
    engine = create_async_engine(s.database_url)
    bundle = {
        "version": 1,
        "tenant_id": str(tenant),
        "event_id": str(event),
        "evidence_bucket": s.b2_bucket_name,
        "tables": {},
    }
    try:
        async with engine.connect() as conn:
            await conn.execute(
                text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            )
            for model in MODELS:
                table = model.__table__
                query = select(table).where(table.c.tenant_id == tenant)
                if model is Event:
                    query = query.where(table.c.id == event)
                elif model is Ticket:
                    query = query.where(
                        table.c.event_id == event, table.c.id.in_(tickets)
                    )
                else:
                    query = query.where(table.c.ticket_id.in_(tickets))
                bundle["tables"][table.name] = [
                    normalized(r)
                    for r in (await conn.execute(query.order_by(table.c.id))).mappings()
                ]
        if {r["id"] for r in bundle["tables"]["tickets"]} != {str(v) for v in tickets}:
            raise ValueError(
                "One or more requested tickets were not found in this event/tenant"
            )
        validate(bundle)
        return bundle
    finally:
        await engine.dispose()


def validate(bundle):
    if bundle.get("version") != 1 or set(bundle["tables"]) != {
        m.__tablename__ for m in MODELS
    }:
        raise ValueError("Unknown bundle format")
    tenant, event = bundle["tenant_id"], bundle["event_id"]
    UUID(tenant)
    UUID(event)
    tables = bundle["tables"]
    if len(tables["events"]) != 1 or tables["events"][0]["id"] != event:
        raise ValueError("Bundle must contain exactly its selected event")
    ticket_ids = {r["id"] for r in tables["tickets"]}
    if not ticket_ids:
        raise ValueError("Bundle has no tickets")
    for table, rows in tables.items():
        if len({r["id"] for r in rows}) != len(rows):
            raise ValueError("Duplicate row IDs in bundle")
        for row in rows:
            if row["tenant_id"] != tenant:
                raise ValueError("Cross-tenant rows are forbidden")
            if table == "tickets" and (
                row["event_id"] != event or row["clip_id"] is not None
            ):
                raise ValueError("Ticket event mismatch or unsupported clip dependency")
            if (
                table not in {"events", "tickets"}
                and row["ticket_id"] not in ticket_ids
            ):
                raise ValueError("Orphaned ticket detail")
    evidence = tables["ticket_evidence"]
    if {r["ticket_id"] for r in evidence} != ticket_ids:
        raise ValueError("Every ticket needs evidence")
    if any(r["media_storage"] == "b2" for r in evidence):
        bundle["requires_b2"] = True
    if any(r["media_storage"] not in {"b2", "memory"} for r in evidence):
        raise ValueError("Unsupported evidence storage")
    if any(
        r["media_storage"] == "memory" and r["content_hash"] not in BENCHMARK_MEDIA
        for r in evidence
    ):
        raise ValueError(
            "Memory evidence requires a known Cloudflare benchmark playback URL"
        )
    if {r["ticket_id"] for r in tables["pipeline_stages"]} != ticket_ids:
        raise ValueError("Every ticket needs a persisted pipeline trace")


async def promote(data):
    bundle = data["bundle"]
    validate(bundle)
    if (
        bundle.get("requires_b2")
        and data.get("target_bucket") != bundle["evidence_bucket"]
    ):
        raise ValueError(
            "Confirm the deployed backend uses the bundle B2 bucket via --target-bucket"
        )
    url = make_url(data["target"])
    host = url.host or ""
    if url.get_backend_name() not in {"postgresql", "postgres"} or not (
        host.endswith((".supabase.co", ".supabase.com"))
    ):
        raise ValueError("Target must be a Supabase Postgres connection")
    # SSL is mandatory. Accept only the repository's explicit asyncpg
    # ``ssl=require`` setting; otherwise use the platform's verified CA store.
    ssl_mode = url.query.get("ssl")
    if ssl_mode not in {None, "require"}:
        raise ValueError("Target SSL must be verified or explicitly set to require")
    url = url.set(drivername="postgresql+asyncpg", query={})
    engine = create_async_engine(
        url,
        connect_args={
            "ssl": "require" if ssl_mode == "require" else ssl.create_default_context(),
            "statement_cache_size": 0,
        },
        hide_parameters=True,
    )
    result = {
        "action": data["action"],
        "target_host": host,
        "tenant_id": bundle["tenant_id"],
        "event_id": bundle["event_id"],
        "tables": {},
    }
    try:
        async with engine.begin() as conn:
            if data["action"] == "sync-plan":
                await conn.execute(text("SET TRANSACTION READ ONLY"))
            # A target tenant must already exist; this workflow never creates identities.
            rbac = (
                await conn.execute(text("SELECT to_regclass('rbac.groups')"))
            ).scalar()
            if rbac:
                exists = (
                    await conn.execute(
                        text("SELECT id FROM rbac.groups WHERE id=:id"),
                        {"id": UUID(bundle["tenant_id"])},
                    )
                ).first()
            else:
                exists = None
            # Older production datasets can predate rbac.groups provisioning
            # while still carrying the same tenant in the app's users table.
            # Accept that already-present identity; never invent or remap one.
            if not exists:
                exists = (
                    await conn.execute(
                        text("SELECT id FROM users WHERE tenant_id=:id LIMIT 1"),
                        {"id": UUID(bundle["tenant_id"])},
                    )
                ).first()
            if not exists:
                raise ValueError(
                    "The local tenant ID does not exist in target; no implicit remapping"
                )
            pending = []
            for model in MODELS:
                table = model.__table__
                count = {"insert": 0, "identical": 0}
                rows = bundle["tables"][table.name]
                existing_rows = {
                    str(r["id"]): r
                    for r in (
                        await conn.execute(
                            select(table).where(
                                table.c.id.in_([UUID(r["id"]) for r in rows])
                            )
                        )
                    ).mappings()
                }
                for row in bundle["tables"][table.name]:
                    values = typed(table, row)
                    existing = existing_rows.get(row["id"])
                    if existing:
                        # Compare native values to tolerate equivalent Decimal formatting.
                        old = typed(table, normalized(existing))
                        if old != values:
                            raise ValueError(
                                f"Conflicting {table.name} row {row['id']}; nothing overwritten"
                            )
                        count["identical"] += 1
                    else:
                        count["insert"] += 1
                        pending.append((table, values))
                result["tables"][table.name] = count
            if data["action"] == "sync":
                for table, values in pending:
                    await conn.execute(insert(table).values(**values))
        result["committed"] = data["action"] == "sync"
        return result
    finally:
        await engine.dispose()


async def main(data):
    if data["action"] == "export":
        return await export(data)
    if data["action"] not in {"sync", "sync-plan"}:
        raise ValueError("Unknown operation")
    return await promote(data)


if __name__ == "__main__":
    try:
        print(json.dumps(asyncio.run(main(json.load(sys.stdin)))))
    except (ValueError, KeyError, OSError, SQLAlchemyError) as exc:
        # Database driver exceptions can contain connection details: never emit them.
        original = getattr(exc, "orig", None)
        diagnostic = getattr(original, "diag", None)
        db_issue = ", ".join(
            f"{key}={value}"
            for key, value in (
                ("sqlstate", getattr(original, "sqlstate", None)),
                ("table", getattr(diagnostic, "table_name", None)),
                ("constraint", getattr(diagnostic, "constraint_name", None)),
            )
            if value
        )
        print(
            str(exc)
            if isinstance(exc, ValueError)
            else (
                f"{type(exc).__name__}: database operation failed"
                + (f" ({db_issue})" if db_issue else "")
                + "; no partial promotion committed"
            ),
            file=sys.stderr,
        )
        sys.exit(1)
