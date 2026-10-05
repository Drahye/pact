#!/usr/bin/env bash
# Fresh demo stack with every object the Phase C detail screens need, then one sign-in saved to /tmp/detail-state.json
# (re-running a fixture signs the demo people in again, which ends the saved session: run this whole script again instead).
set -eo pipefail
cd "$(dirname "$0")/.."
rm -f /tmp/detail-state.json
bash scripts/demo-stack.sh | tail -1 && node scripts/home-fixture.mjs | tail -1 && node scripts/phase-c-fixture.mjs | tail -1 && node scripts/detail-fixture.mjs | tail -1 && node scripts/detail-shots.mjs /tmp/detail-signin --only=none | tail -1
