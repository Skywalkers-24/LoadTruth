#!/usr/bin/env bash
# Known-volume fill-% benchmark (Winner.md B1).
#
# Runs the real pipeline over every clip in the ground-truth manifest and writes
# a results JSON with MAE, % within the tolerance band, and error broken down by
# material, angle, and lighting. This is the independent accuracy number (not
# agreement with the monitor).
#
#   scripts/benchmark.sh                      # default paths under data_bench/
#   CLIPS=path TRUTH=path OUT=path scripts/benchmark.sh
#   MOCK_AI=1 scripts/benchmark.sh            # fixtures, no credits
#
# Clips live in data_bench/clips/ (gitignored); the manifest + results are
# committed.
set -euo pipefail
cd "$(dirname "$0")/.."

CLIPS="${CLIPS:-data_bench/clips}"
TRUTH="${TRUTH:-data_bench/ground_truth.csv}"
OUT="${OUT:-data_bench/results.json}"

PY="backend/.venv/bin/python"
if [ ! -x "$PY" ]; then
  echo "backend venv not found at $PY — run scripts/setup.sh first." >&2
  exit 1
fi

echo "Benchmarking clips in $CLIPS against $TRUTH"
( cd backend && exec "../$PY" -m app.bench.run \
    --clips "../$CLIPS" --truth "../$TRUTH" --out "../$OUT" )
echo "Wrote $OUT"
