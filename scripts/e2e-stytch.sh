#!/usr/bin/env bash
# A throwaway stack whose email sign-in goes through a local Stytch stand-in, then the browser journeys, then stop everything.
cd "$(dirname "$0")/.."
for port in 8793 8794 5179; do lsof -ti :$port | xargs kill 2>/dev/null; done
sleep 1
rm -rf .data/e2e-stytch
STYTCH_PROJECT_ID=project-test-e2e STYTCH_SECRET=secret-test-e2e nohup node scripts/fake-stytch.mjs 8793 > /tmp/pact-e2e-stytch-fake.log 2>&1 &
PORT=8794 APP_ORIGIN=http://localhost:5179 PGLITE_DIR=.data/e2e-stytch RATE_LIMIT_ENABLED=false LOG_LEVEL=warn EMAIL_AUTH_PROVIDER=stytch STYTCH_PROJECT_ID=project-test-e2e STYTCH_SECRET=secret-test-e2e STYTCH_BASE_URL=http://127.0.0.1:8793 nohup npx tsx server/src/index.ts > /tmp/pact-e2e-stytch-api.log 2>&1 &
API_PORT=8794 nohup npx vite --port 5179 --strictPort > /tmp/pact-e2e-stytch-web.log 2>&1 &
for _ in $(seq 1 60); do curl -sf localhost:5179/api/config > /dev/null && break; sleep 1; done
node scripts/e2e-stytch.mjs "$@"
code=$?
for port in 8793 8794 5179; do lsof -ti :$port | xargs kill 2>/dev/null; done
rm -rf .data/e2e-stytch
exit $code
