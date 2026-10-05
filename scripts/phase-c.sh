#!/usr/bin/env bash
# Fresh demo stack, home fixture, phase C fixture, then screenshots: scripts/phase-c.sh <outDir> [widths...]
cd "$(dirname "$0")/.."
out="${1:-exports/phase-c}"; shift
bash scripts/demo-stack.sh | tail -1 && node scripts/home-fixture.mjs | tail -1 && node scripts/phase-c-fixture.mjs | tail -1 && node scripts/phase-c-shots.mjs "$out" http://localhost:5174 "$@"
