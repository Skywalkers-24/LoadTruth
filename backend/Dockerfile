# LoadTruth backend — FastAPI on Python 3.12.
# Multi-stage container build: base -> builder -> tester -> runtime
# syntax=docker/dockerfile:1

FROM python:3.12-slim AS base
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1

FROM base AS builder
ENV PIP_NO_CACHE_DIR=1
RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml ./
# Install production runtime dependencies into isolated venv
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --upgrade pip \
    && /opt/venv/bin/pip install .

FROM builder AS tester
# Test stage to verify backend builds and tests cleanly inside container
COPY . .
RUN /opt/venv/bin/pip install ".[dev]" \
    && LOADTRUTH_SKIP_STARTUP_DB=1 MOCK_AI=1 /opt/venv/bin/pytest tests/test_auth.py -q

FROM base AS runtime
ENV PATH="/opt/venv/bin:$PATH"
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 appuser
COPY --from=builder /opt/venv /opt/venv
COPY . .
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1
# Honor the platform's $PORT (Fly/Render/Railway inject it); default 8000.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
