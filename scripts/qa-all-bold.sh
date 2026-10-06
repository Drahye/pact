#!/usr/bin/env bash
# Release-style regression pass for the signed-in UI: typecheck, build, axe, pathological content, dark+reduced-motion journeys,
# creation flows, detail checks, phone-off. Usage: bash scripts/qa-all-bold.sh > /tmp/qa-bold.log
cd "$(dirname "$0")/.."
echo "== typecheck"; npm run typecheck 2>&1 | tail -2
echo "== build"; npm run build 2>&1 | grep -E "index-.*\.js|index-.*\.css|built in|error" | cut -c1-120
echo "== axe"; bash scripts/demo-stack.sh | tail -1; node scripts/qa-axe.mjs > /tmp/axe-bold.log 2>&1; tail -1 /tmp/axe-bold.log; grep -A2 VIOL /tmp/axe-bold.log | cut -c1-190 | head -60
echo "== patho"; bash scripts/demo-stack.sh | tail -1; node scripts/qa-patho.mjs exports/qa/patho-bold > /tmp/patho-bold.log 2>&1; tail -1 /tmp/patho-bold.log; grep -E "^ FAIL" /tmp/patho-bold.log | sed -E 's/ @.*//' | sort | uniq -c; grep -E "off-screen|clipped|scrolls" /tmp/patho-bold.log | sed -E 's/ [0-9-]+\.\.[0-9-]+$//' | sort | uniq -c | sort -rn | head -12
echo "== journeys dark+reduced"; bash scripts/detail-up.sh >/dev/null 2>&1; node scripts/qa-journeys.mjs exports/qa/journeys-bold --state 2>&1 | grep -E "FAIL|PASS|FAILED"
echo "== create flows (axe)"; bash scripts/detail-up.sh >/dev/null 2>&1; node scripts/create-shots.mjs exports/bold-create --w=390 --axe 2>&1 | grep -E "FAIL|PASS|violation|errors" | head
echo "== create 320"; bash scripts/detail-up.sh >/dev/null 2>&1; node scripts/create-shots.mjs exports/bold-create-320 --w=320 2>&1 | grep -E "FAIL|PASS|errors"
echo "== detail-check"; bash scripts/detail-up.sh >/dev/null 2>&1; node scripts/detail-check.mjs 2>&1 | grep -E " FAIL |FAILED|PASS"
echo "== e2e-phone-off"; bash scripts/e2e-phone-off.sh 2>&1 | grep -E "✗|passed|FAILED"
echo ARTDONE
