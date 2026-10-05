#!/usr/bin/env bash
# Auth screens for review: a throwaway stack on a local Stytch stand-in with Google switched on, then screenshots at 390 and 430.
# Usage: scripts/auth-shots.sh <outDir>
cd "$(dirname "$0")/.."
for port in 8793 8794 5179; do lsof -ti :$port | xargs kill 2>/dev/null; done
sleep 1
rm -rf .data/auth-shots
STYTCH_PROJECT_ID=project-test-e2e STYTCH_SECRET=secret-test-e2e nohup node scripts/fake-stytch.mjs 8793 > /tmp/pact-auth-shots-fake.log 2>&1 &
PORT=8794 APP_ORIGIN=http://localhost:5179 PGLITE_DIR=.data/auth-shots RATE_LIMIT_ENABLED=false LOG_LEVEL=warn EMAIL_AUTH_PROVIDER=stytch STYTCH_PROJECT_ID=project-test-e2e STYTCH_SECRET=secret-test-e2e STYTCH_PUBLIC_TOKEN=public-token-test-e2e STYTCH_BASE_URL=http://127.0.0.1:8793 nohup npx tsx server/src/index.ts > /tmp/pact-auth-shots-api.log 2>&1 &
API_PORT=8794 nohup npx vite --port 5179 --strictPort > /tmp/pact-auth-shots-web.log 2>&1 &
for _ in $(seq 1 60); do curl -sf localhost:5179/api/config > /dev/null && break; sleep 1; done
curl -s localhost:5179/api/config | head -c 300; echo
node scripts/auth-shots.mjs "${1:-exports/auth}" http://localhost:5179
code=$?
for port in 8793 8794 5179; do lsof -ti :$port | xargs kill 2>/dev/null; done
rm -rf .data/auth-shots
exit $code
