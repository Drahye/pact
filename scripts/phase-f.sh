#!/usr/bin/env bash
# Fresh demo stack with a populated Circle, then Phase F screenshots: scripts/phase-f.sh <outDir> [widths...]
cd "$(dirname "$0")/.."
out="${1:-exports/phase-f}"; shift
bash scripts/demo-stack.sh | tail -1 && node scripts/home-fixture.mjs | tail -1 && node scripts/phase-c-fixture.mjs | tail -1 | cut -c1-40 && node scripts/phase-f-shots.mjs "$out" http://localhost:5174 "$@"
