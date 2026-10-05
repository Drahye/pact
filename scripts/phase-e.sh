#!/usr/bin/env bash
# Fresh demo stack, home fixture, share-page fixture, then signed-out screenshots: scripts/phase-e.sh <outDir> [widths...]
cd "$(dirname "$0")/.."
out="${1:-exports/phase-e}"; shift
bash scripts/demo-stack.sh | tail -1 && node scripts/home-fixture.mjs | tail -1 && node scripts/phase-e-fixture.mjs | tail -1 | cut -c1-120 && node scripts/phase-e-shots.mjs "$out" http://localhost:5174 "$@"
