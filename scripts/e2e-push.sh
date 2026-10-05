#!/usr/bin/env bash
# A throwaway stack with Web Push configured (real VAPID keys), then the browser journeys for the notification prompt and state, then stop.
# The browser's PushManager is stubbed in the page (headless Chromium has no push service); everything else is the real app and server.
cd "$(dirname "$0")/.."
for port in 8797 5181; do lsof -ti :$port | xargs kill 2>/dev/null; done
sleep 1
rm -rf .data/e2e-push; mkdir -p .data/e2e-push
KEYS=$(node -e "const k=require('web-push').generateVAPIDKeys();console.log(k.publicKey+' '+k.privateKey)")
PUB=${KEYS% *}; PRIV=${KEYS#* }
PORT=8797 APP_ORIGIN=http://localhost:5181 PGLITE_DIR=.data/e2e-push RATE_LIMIT_ENABLED=false LOG_LEVEL=warn WEB_PUSH_VAPID_PUBLIC_KEY=$PUB WEB_PUSH_VAPID_PRIVATE_KEY=$PRIV WEB_PUSH_SUBJECT=mailto:ops@pact.test nohup npx tsx server/src/index.ts > /tmp/pact-e2e-push-api.log 2>&1 &
API_PORT=8797 nohup npx vite --port 5181 --strictPort > /tmp/pact-e2e-push-web.log 2>&1 &
for _ in $(seq 1 60); do curl -sf localhost:5181/api/config > /dev/null && break; sleep 1; done
node scripts/e2e-push.mjs "$@"
code=$?
for port in 8797 5181; do lsof -ti :$port | xargs kill 2>/dev/null; done
rm -rf .data/e2e-push
exit $code
