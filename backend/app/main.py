"""FastAPI application entry point.

Wires configuration, logging, and the versioned API router. Heavy video work is
queued in the database and processed serially by a background task.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.auth_context import router as auth_context_router
from app.api.auth_session import router as auth_session_router
from app.api.billing import router as billing_router
from app.api.chat import router as chat_router
from app.api.demo_videos import router as demo_videos_router
from app.api.ingest import router as ingest_router
from app.api.ingest_jobs import router as ingest_jobs_router
from app.api.reports import router as reports_router
from app.api.sources import router as sources_router
from app.api.system import router as system_router
from app.api.tickets import router as tickets_router
from app.api.trucks import router as trucks_router
from app.api.users import router as users_router
from app.config import get_settings
from app.log import configure_logging, get_logger
from app.pipeline.b2_store import StorageUnavailableError

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
        sam_parse_workers=settings.sam_parse_workers,
    )
    if not settings.model_api_configured:
        log.warning("model_api_key_missing", hint="set MODEL_API_KEY in .env before pipeline runs")
    from app.ai.sam_measure import configure_parse_executor, shutdown_parse_executor
    from app.api.ingest import close_pipeline_cache, initialize_pipeline_cache

    try:
        configure_parse_executor(settings.sam_parse_workers)
        if settings.redis_url != "redis://localhost:6379/0" and await initialize_pipeline_cache():
            log.info("redis_cache_ready")
        # Create tables and seed the demo tenant unless startup DB work is
        # explicitly disabled (as it is in isolated tests).
        current_settings = get_settings()
        if os.environ.get("LOADTRUTH_SKIP_STARTUP_DB") != "1":
            from app.db.engine import get_sessionmaker, init_db
            from app.tickets.seed import seed_demo

            await init_db()
            async with get_sessionmaker()() as session:
                await seed_demo(session)
            if not current_settings.mock_ai:
                from app.api.ingest_jobs import recover_ingest_jobs

                await recover_ingest_jobs()
        yield
    finally:
        from app.api.ingest_jobs import stop_ingest_jobs

        await stop_ingest_jobs()
        await shutdown_parse_executor()
        await close_pipeline_cache()
        from app.api.cache import close_redis_client

        await close_redis_client()
        log.info("shutdown")


app = FastAPI(
    title="LoadTruth API",
    version="0.1.0",
    summary="Video-verified load tickets — multi-tenant backend.",
    lifespan=lifespan,
)


@app.exception_handler(StorageUnavailableError)
async def storage_unavailable(_: Request, __: StorageUnavailableError) -> JSONResponse:
    return JSONResponse(
        status_code=503, content={"detail": "B2 storage is unavailable. Please try again shortly."}
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.api_route("/health", methods=["GET", "HEAD"], response_model=None, tags=["system"])
async def health(request: Request) -> dict[str, object] | Response:
    """Liveness probe. Reports whether the Meta Model API key and cache are configured."""
    if request.method == "HEAD":
        return Response(status_code=200)
    from app.api.ingest import get_cache_status

    cache_info = await get_cache_status()
    return {
        "status": "ok",
        "environment": settings.environment,
        "model_api_configured": settings.model_api_configured,
        "cache": cache_info,
    }


app.include_router(auth_session_router)
app.include_router(auth_context_router)
app.include_router(tickets_router)
app.include_router(trucks_router)
app.include_router(users_router)
app.include_router(sources_router)
app.include_router(ingest_router)
app.include_router(ingest_jobs_router)
app.include_router(demo_videos_router)
app.include_router(reports_router)
app.include_router(billing_router)
app.include_router(chat_router)
app.include_router(system_router)
