#!/usr/bin/env bash
# Starts a throwaway stack with the local Google stand-in, runs the sign-in browser journeys, and stops it.
cd "$(dirname "$0")/.."
for port in 8789 5175; do lsof -ti :$port | xargs kill 2>/dev/null; done
sleep 1
rm -rf .data/e2e-auth
PORT=8789 APP_ORIGIN=http://localhost:5175 PGLITE_DIR=.data/e2e-auth RATE_LIMIT_ENABLED=false LOG_LEVEL=warn GOOGLE_PROVIDER=fake nohup npx tsx server/src/index.ts > /tmp/pact-e2e-auth-api.log 2>&1 &
API_PORT=8789 nohup npx vite --port 5175 --strictPort > /tmp/pact-e2e-auth-web.log 2>&1 &
for _ in $(seq 1 60); do curl -sf localhost:5175/api/config > /dev/null && break; sleep 1; done
node scripts/e2e-auth.mjs "$@"
code=$?
for port in 8789 5175; do lsof -ti :$port | xargs kill 2>/dev/null; done
exit $code
