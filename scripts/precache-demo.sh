#!/usr/bin/env bash
# Pre-cache the demo clips (Winner.md B8).
#
# Ingests every clip in a demo directory once, so each clip's SAM + Spark stage
# results and its evidence media are persisted in the durable, content-hash-keyed
# store (the AIStageResult table + the evidence dir). Both live on volumes that
# survive a container rebuild, so after this runs the demo arc replays from cache
# with no model call and no network.
#
#   DEMO_CLIPS=path TOKEN=<bearer> EVENT_ID=<uuid> scripts/precache-demo.sh
#
# TOKEN is a signed-in bearer (get one from the running app's localStorage key
# "loadtruth-token"); EVENT_ID is the demo event. BASE defaults to the local
# backend. Idempotent: re-ingesting a cached clip is free and overwrites nothing.
set -euo pipefail
cd "$(dirname "$0")/.."

DEMO_CLIPS="${DEMO_CLIPS:-data_bench/clips}"
BASE="${BASE:-http://localhost:8000}"
EVENT_ID="${EVENT_ID:-}"
TOKEN="${TOKEN:-}"

if [ -z "$EVENT_ID" ] || [ -z "$TOKEN" ]; then
  echo "Set EVENT_ID and TOKEN (a signed-in bearer). See the script header." >&2
  exit 1
fi
if [ ! -d "$DEMO_CLIPS" ]; then
  echo "No clips directory at $DEMO_CLIPS." >&2
  exit 1
fi

shopt -s nullglob
count=0
for clip in "$DEMO_CLIPS"/*.mp4 "$DEMO_CLIPS"/*.mov "$DEMO_CLIPS"/*.jpg "$DEMO_CLIPS"/*.png; do
  echo "Pre-caching $(basename "$clip")"
  curl -sS -o /dev/null -w "  -> %{http_code}\n" \
    -H "Authorization: Bearer $TOKEN" \
    -F "file=@${clip}" \
    "$BASE/events/$EVENT_ID/ingest"
  count=$((count + 1))
done

echo "Pre-cached $count clip(s). The demo arc now replays from the durable cache."
