"""FastAPI application entry point.

Wires configuration, logging, and the versioned API router. Heavy video work is
delegated to the ARQ worker (see PLAN.md §4); routes stay fast and stream progress.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth_context import router as auth_context_router
from app.api.auth_session import router as auth_session_router
from app.api.chat import router as chat_router
from app.api.ingest import router as ingest_router
from app.api.reports import router as reports_router
from app.api.sources import router as sources_router
from app.api.system import router as system_router
from app.api.tickets import router as tickets_router
from app.api.trucks import router as trucks_router
from app.api.users import router as users_router
from app.config import get_settings
from app.log import configure_logging, get_logger

settings = get_settings()
configure_logging(settings.log_level)
log = get_logger("app")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    log.info(
        "startup",
        environment=settings.environment,
        model_api_configured=settings.model_api_configured,
        database=("sqlite" if settings.is_sqlite else "postgres"),
    )
    if not settings.model_api_configured:
        log.warning("model_api_key_missing", hint="set MODEL_API_KEY in .env before pipeline runs")
    # Interim SQLite: create tables from ORM metadata and seed the demo tenant.
    # Tests provide their own isolated DB via a dependency override, so they set
    # LOADTRUTH_SKIP_STARTUP_DB=1 to skip touching the on-disk file DB.
    # Create tables (SQLite and local Docker Postgres) and seed the demo tenant.
    # Tests provide their own isolated DB via a dependency override, so they set
    # LOADTRUTH_SKIP_STARTUP_DB=1 to skip touching the real DB.
    if os.environ.get("LOADTRUTH_SKIP_STARTUP_DB") != "1":
        from app.db.engine import get_sessionmaker, init_db
        from app.tickets.seed import seed_demo

        await init_db()
        async with get_sessionmaker()() as session:
            await seed_demo(session)
    yield
    log.info("shutdown")


app = FastAPI(
    title="LoadTruth API",
    version="0.1.0",
    summary="Video-verified load tickets — multi-tenant backend.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["system"])
async def health() -> dict[str, object]:
    """Liveness probe. Reports whether the Meta Model API key is configured."""
    return {
        "status": "ok",
        "environment": settings.environment,
        "model_api_configured": settings.model_api_configured,
    }


app.include_router(auth_session_router)
app.include_router(auth_context_router)
app.include_router(tickets_router)
app.include_router(trucks_router)
app.include_router(users_router)
app.include_router(sources_router)
app.include_router(ingest_router)
app.include_router(reports_router)
app.include_router(chat_router)
app.include_router(system_router)
