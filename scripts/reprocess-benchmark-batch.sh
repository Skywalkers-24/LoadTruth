#!/usr/bin/env bash
# Stable entry point; see scripts/README.md for run/resume and approved promotion.
set -euo pipefail
cd "$(dirname "$0")/.."
exec python3 scripts/benchmark_batch.py "$@"
