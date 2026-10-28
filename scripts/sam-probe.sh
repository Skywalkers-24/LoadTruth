#!/usr/bin/env bash
# Try SAM concept phrases on a stored evidence clip (costs ~$0.01 per phrase).
# Usage: scripts/sam-probe.sh <content_hash> "truck bed" "tailgate" "debris pile" "pile" --measure
set -euo pipefail
cd "$(dirname "$0")/.."
echo "sam-probe: one SAM request per phrase on media/evidence/$1"
exec backend/.venv/bin/python scripts/sam_probe.py "$@"
