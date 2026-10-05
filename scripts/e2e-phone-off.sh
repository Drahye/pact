#!/usr/bin/env bash
# Starts a throwaway stack with SMS_PROVIDER=disabled (the beta), checks that no phone sign-in or phone verification is offered, and stops it.
cd "$(dirname "$0")/.."
for port in 8794 5178; do lsof -ti :$port | xargs kill 2>/dev/null; done
sleep 1
rm -rf .data/e2e-phone-off
SMS_PROVIDER=disabled PORT=8794 APP_ORIGIN=http://localhost:5178 PGLITE_DIR=.data/e2e-phone-off RATE_LIMIT_ENABLED=false LOG_LEVEL=warn nohup npx tsx server/src/index.ts > /tmp/pact-e2e-phone-off-api.log 2>&1 &
API_PORT=8794 nohup npx vite --port 5178 --strictPort > /tmp/pact-e2e-phone-off-web.log 2>&1 &
for _ in $(seq 1 60); do curl -sf localhost:5178/api/config > /dev/null && break; sleep 1; done
E2E_BASE=http://localhost:5178 node scripts/e2e-phone-off.mjs "$@"
code=$?
for port in 8794 5178; do lsof -ti :$port | xargs kill 2>/dev/null; done
rm -rf .data/e2e-phone-off
exit $code
