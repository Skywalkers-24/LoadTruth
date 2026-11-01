#!/usr/bin/env bash
# Check the live Meta Model API setup, optionally running one clip end to end.
#
#   scripts/live-check.sh                          # key + endpoint (one tiny Spark call)
#   scripts/live-check.sh /path/to/clip.mp4      # plus the full pipeline on a clip
#   scripts/live-check.sh clip.mp4 --truck=FL-DT-3391   # treat that truck as certified
#   scripts/live-check.sh --docker clip.mp4        # run inside the backend container
#
# Reads MODEL_API_KEY from the repo-root .env. The key is never printed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${1:-}" == "--docker" ]]; then
  shift
  args=()
  for a in "$@"; do
    if [[ -f "$a" ]]; then
      # Copy the clip into the container so the path resolves there.
      name="$(basename "$a")"
      docker compose -f "$ROOT/docker-compose.yml" cp "$a" "backend:/tmp/$name"
      args+=("/tmp/$name")
    else
      args+=("$a")
    fi
  done
  echo "==> live check in the backend container"
  exec docker compose -f "$ROOT/docker-compose.yml" exec -T backend \
    python -m app.ai.live_check "${args[@]+"${args[@]}"}"
fi

args=()
for a in "$@"; do
  if [[ -f "$a" ]]; then
    args+=("$(cd "$(dirname "$a")" && pwd)/$(basename "$a")")
  else
    args+=("$a")
  fi
done
echo "==> live check on the host (backend/.venv)"
cd "$ROOT/backend"
exec .venv/bin/python -m app.ai.live_check "${args[@]+"${args[@]}"}"
