#!/usr/bin/env bash
# ==============================================================================
# LoadTruth — One-Command Local Docker Full-Stack Run
# ==============================================================================
# Smooth, single-command entry point to validate environment, build, and start
# all services (Next.js Frontend, FastAPI Backend, PostgreSQL 16, Redis 7).
#
# Usage:
#   ./run_docker.sh
#   ./run_docker.sh --help
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ -f "scripts/setup_docker.sh" ]; then
    chmod +x "scripts/setup_docker.sh"
    exec ./scripts/setup_docker.sh "$@"
else
    echo "[ERROR] scripts/setup_docker.sh not found." >&2
    exit 1
fi

