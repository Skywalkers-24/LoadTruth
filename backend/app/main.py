"""FastAPI application entry point.

Wires configuration, logging, and the versioned API router. Heavy video work is
delegated to the ARQ worker (see PLAN.md §4); routes stay fast and stream progress.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
    )
    if not settings.model_api_configured:
        log.warning("model_api_key_missing", hint="set MODEL_API_KEY in .env before pipeline runs")
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
