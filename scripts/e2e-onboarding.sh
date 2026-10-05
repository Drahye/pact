#!/usr/bin/env bash
# A throwaway stack whose email sign-in goes through a local Stytch stand-in, then the browser journeys, then stop everything.
cd "$(dirname "$0")/.."
for port in 8795 8796 5180; do lsof -ti :$port | xargs kill 2>/dev/null; done
sleep 1
rm -rf .data/e2e-onboarding; mkdir -p .data/e2e-onboarding
STYTCH_PROJECT_ID=project-test-e2e STYTCH_SECRET=secret-test-e2e nohup node scripts/fake-stytch.mjs 8795 > /tmp/pact-e2e-onboarding-fake.log 2>&1 &
PORT=8796 APP_ORIGIN=http://localhost:5180 PGLITE_DIR=.data/e2e-onboarding RATE_LIMIT_ENABLED=false LOG_LEVEL=warn STYTCH_PUBLIC_TOKEN=public-token-test-e2e EMAIL_AUTH_PROVIDER=stytch STYTCH_PROJECT_ID=project-test-e2e STYTCH_SECRET=secret-test-e2e STYTCH_BASE_URL=http://127.0.0.1:8795 nohup npx tsx server/src/index.ts > /tmp/pact-e2e-onboarding-api.log 2>&1 &
API_PORT=8796 nohup npx vite --port 5180 --strictPort > /tmp/pact-e2e-onboarding-web.log 2>&1 &
for _ in $(seq 1 60); do curl -sf localhost:5180/api/config > /dev/null && break; sleep 1; done
node scripts/e2e-onboarding.mjs "$@"
code=$?
for port in 8795 8796 5180; do lsof -ti :$port | xargs kill 2>/dev/null; done
rm -rf .data/e2e-onboarding
exit $code
