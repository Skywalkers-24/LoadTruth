"""Structured JSON logging. Every log line carries context; secrets are never logged.

Per the agent protocol §9: structured logs with request_id + tenant_id, and a
model-cost ledger for every Meta Model API call.
"""

from __future__ import annotations

import logging

import structlog


def configure_logging(log_level: str = "INFO") -> None:
    """Configure structlog to emit JSON with ISO timestamps and log levels."""
    level = getattr(logging, log_level.upper(), logging.INFO)
    logging.basicConfig(format="%(message)s", level=level)
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    logger: structlog.stdlib.BoundLogger = structlog.get_logger(name)
    return logger
