#!/usr/bin/env bash
# Fresh demo stack, populated Home fixture, then screenshots: scripts/home-review.sh <outDir>
# (A fresh stack each time keeps the sign-in code budget for the demo phone from running out.)
cd "$(dirname "$0")/.."
bash scripts/demo-stack.sh | tail -1 && node scripts/home-fixture.mjs | tail -1 && node scripts/home-shots.mjs "${1:-exports/home}"
