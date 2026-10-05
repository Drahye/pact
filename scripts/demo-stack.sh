#!/usr/bin/env bash
# Starts a throwaway copy of the app on its own ports with a fresh seeded database, for recording the demo.
# API on 8788, web on 5174, data in .data/demo. Run again to reset. Stop with: scripts/demo-stack.sh stop
cd "$(dirname "$0")/.."
for port in 8788 5174; do lsof -ti :$port | xargs kill 2>/dev/null; done
[ "$1" = "stop" ] && exit 0
sleep 1
rm -rf .data/demo
# APP_ORIGIN must match the web port or the refresh cookie is never set.
CREATE_LIMIT_PER_10_MIN=500 PORT=8788 APP_ORIGIN=http://localhost:5174 PGLITE_DIR=.data/demo RATE_LIMIT_ENABLED=false LOG_LEVEL=warn nohup npx tsx server/src/index.ts > /tmp/pact-demo-api.log 2>&1 &
API_PORT=8788 nohup npx vite --port 5174 --strictPort > /tmp/pact-demo-web.log 2>&1 &
for _ in $(seq 1 40); do
  curl -sf localhost:5174/api/config > /dev/null && { echo "demo stack ready: http://localhost:5174"; exit 0; }
  sleep 1
done
echo "demo stack did not come up; see /tmp/pact-demo-*.log" >&2
exit 1
