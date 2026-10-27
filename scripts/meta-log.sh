#!/usr/bin/env bash
# Summarize the Meta Model API exchange log, one short line per call.
#
#   scripts/meta-log.sh          # last 30 calls from logs/meta_api.jsonl
#   scripts/meta-log.sh 100      # last 100
#
# Full requests and responses (media and key redacted) stay in
# logs/meta_api.jsonl; read a single entry with:  tail -n 1 logs/meta_api.jsonl
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/backend"
exec .venv/bin/python -m app.ai.api_log "$ROOT/logs/meta_api.jsonl" "${1:-30}"
