# Staging: closed sandbox beta

A hardened copy of production for real people and no real money. Same build and security posture as production (secure cookies, HSTS, CSP, rate limits, least-privilege database roles, Postgres-backed limits); payments are sandbox only and the app refuses to start in any configuration that could move real money.

## What staging is, and is not

| | Staging | Production |
| --- | --- | --- |
| `NODE_ENV` / `DEPLOY_ENV` | `production` / `staging` | `production` / `production` |
| Payments | `sandbox`, or Paystack with an `sk_test_` key | Paystack with an `sk_live_` key only |
| Sign-in codes | Termii SMS (or, for a closed test with test data, `STAGING_SHOW_CODES=true`) | Termii SMS only |
| BVN verification | Accepts only the published test BVN `22222222222`; nothing of it is stored | Needs a real identity provider (not integrated yet) |
| Bank accounts | Any 10 digits; the sandbox resolves the name from the profile | Real name resolution |
| Demo data | Never seeded | Never seeded |

`SMS_PROVIDER=disabled` runs the beta on email and Google only: phone sign-in, phone verification and phone PIN resets answer `feature_unavailable`, no code is generated or sent, and the app hides them. Stored phone numbers and identities are untouched; set the provider back to `termii` to turn phone on again. Production still requires `termii`.

Guards (all in `server/src/config.ts`, covered by `server/test/config.test.ts`): a live Paystack key is refused anywhere but production; production refuses sandbox payments, test keys, a non-Paystack API host, and screen-shown codes; staging refuses live keys and requires either Termii or the explicit `STAGING_SHOW_CODES` flag; `NODE_ENV` and `DEPLOY_ENV` must agree; default secrets are refused. The web app shows a "Sandbox beta: no real money moves" tag on Welcome, and warns in the BVN and bank screens.

## What you need

- A host that runs Docker (or any Node 24 host) with a public DNS name, for example `staging.<your-domain>`, and ports 80 and 443 open.
- Postgres 16 or newer. The compose file bundles Postgres 17 for a single host; a managed Postgres is better. The admin user must be able to create roles.
- Fresh secrets (never reused from production): `openssl rand -base64 48` for `JWT_SECRET`, `HASH_SECRET` and `SANDBOX_WEBHOOK_SECRET`; `openssl rand -base64 32` for `DATA_ENCRYPTION_KEY`. Back up `DATA_ENCRYPTION_KEY` and `HASH_SECRET` (the second one is what keeps analytics pseudonyms stable).
- Optional: a VAPID key pair for browser push notifications (`npx web-push generate-vapid-keys`) set as `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY` and `WEB_PUSH_SUBJECT` (all three, or none). Without them the app works and push is simply unavailable. Run the worker too (the API runs it by default): push goes out from the job queue.
- A Termii account and sender ID, for the real SMS codes. Without one, set `STAGING_SHOW_CODES=true` for a closed test among people you know, with test data only.

## Deploy

1. `cp .env.staging.example .env.staging` and fill in every empty value. `APP_ORIGIN` is the public `https://` origin.
2. Database roles, in two steps because the roles are created after the first migration:
   1. Start once with `MIGRATION_DATABASE_URL` and `DATABASE_URL` both set to the admin user. This creates the schema.
   2. As an administrator, edit the two passwords in `server/src/db/roles.sql`, run it, then set `MIGRATION_DATABASE_URL` to the `pact_owner` URL and `DATABASE_URL` to the `pact_service` URL, and restart. Every later boot applies migrations as the owner and serves traffic as the service role.
3. Bring it up, with two API instances behind Caddy and one worker:
   ```bash
   export STAGING_HOST=staging.example.com DB_ADMIN_PASSWORD=...
   docker compose -f deploy/staging/docker-compose.yml --env-file .env.staging up --build -d
   ```
   Without Docker: `npm ci && npm run build`, then run `npm start` (twice, with `RUN_WORKER=false`) and `npm run worker` (once) behind any TLS proxy that forwards to `/api/health` health checks.
4. Check it: `curl https://$STAGING_HOST/api/config` should show `"deployEnv":"staging"` and `"sandbox":true`. `curl https://$STAGING_HOST/api/health` should return `{"ok":true}`.
5. Send testers the link. Tell them: payments are pretend, use the test BVN `22222222222`, never enter a real BVN or bank number.

## Verify the deployment

```bash
# journey: sign up, top up, create, invite, contribute, complete, memory, verify, withdraw
E2E_BASE=https://$STAGING_HOST E2E_BVN=22222222222 node scripts/e2e.mjs exports/e2e-staging

# accessibility, overflow, console, links; signs up its own person and Pact
AUDIT_BASE=https://$STAGING_HOST AUDIT_FRESH=1 node scripts/audit.mjs exports/audit-staging.json

# load: needs a copy of the staging build with RATE_LIMIT_ENABLED=false and STAGING_SHOW_CODES=true,
# on its own database. Never point it at the beta itself. Per-IP limits would throttle one load generator.
node scripts/loadtest.mjs --base https://loadtest.$STAGING_HOST --users 20 --vus 40 --duration 60
```

The audit injects axe-core, so it runs with the browser's CSP bypassed; the site itself keeps its CSP.

## Operating the beta

- Funnel report: `npm run report:funnel -- --since <date>` with the staging environment variables (see `docs/ANALYTICS.md`).
- Alerts to watch in the logs: `LEDGER DRIFT DETECTED`, `OPS ALERT`, 5xx, dead jobs.
- Account freeze: set `users.status = 'frozen'`. Close a tester's account from Profile.
- Reset between beta waves: restore a snapshot or drop and recreate the staging database (events go with it).
- Anything you learn about the real production setup goes in `LAUNCH_AUDIT.md`.
