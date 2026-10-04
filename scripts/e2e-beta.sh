#!/usr/bin/env bash
# Starts a throwaway stack with Google OFF (the beta default), runs the beta sign-in checks, and stops it.
cd "$(dirname "$0")/.."
for port in 8792 5176; do lsof -ti :$port | xargs kill 2>/dev/null; done
sleep 1
rm -rf .data/e2e-beta
PORT=8792 APP_ORIGIN=http://localhost:5176 PGLITE_DIR=.data/e2e-beta RATE_LIMIT_ENABLED=false LOG_LEVEL=warn nohup npx tsx server/src/index.ts > /tmp/pact-e2e-beta-api.log 2>&1 &
API_PORT=8792 nohup npx vite --port 5176 --strictPort > /tmp/pact-e2e-beta-web.log 2>&1 &
for _ in $(seq 1 60); do curl -sf localhost:5176/api/config > /dev/null && break; sleep 1; done
node scripts/e2e-beta.mjs "$@"
code=$?
for port in 8792 5176; do lsof -ti :$port | xargs kill 2>/dev/null; done
rm -rf .data/e2e-beta
exit $code
