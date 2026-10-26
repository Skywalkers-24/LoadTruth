#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
source ./.env

curl -sS --max-time 300 -X POST "https://api.meta.ai/v1/responses" \
  -H "Authorization: Bearer $MODEL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "muse-spark-1.3",
    "reasoning": { "effort": "low" },
    "input": "A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How much does the ball cost? Give just the answer."
  }' | python3 -m json.tool | tee -a responses.log
echo
