# How to set up PACT

From a fresh clone to a running copy, in the order you will need it. Three stages: run it locally, run a closed beta (staging), go live. Each stage builds on the one before.

For what the product does and how it is built, read [README.md](README.md). This page is only the setup.

## What you need

- **Node.js 24** and npm (the CI runs Node 24; see `.github/workflows/ci.yml`).
- **Docker**, only if you want the production-like compose stack. Not needed for local development.
- **PostgreSQL 16 or newer** for staging and production. Local development uses an embedded Postgres, so you install nothing.
- A Mac, Linux or WSL shell. The scripts use `bash`, `openssl` and `curl`.

## 1. Run it locally (about 5 minutes, no accounts)

```bash
git clone <repo-url> pact && cd pact
npm install
npm run dev
```

This starts the web app on `http://localhost:5173` and the API on `:8787`, with an embedded Postgres, **sandbox payments** and **seeded demo data**. Nothing is sent anywhere and no real money moves.

Open `http://localhost:5173/app`.

- Sign up with any Nigerian mobile number. The SMS code is shown on screen in the sandbox.
- Or use a demo account: `0801 000 0001`, `0801 000 0002` or `0801 000 0003`, PIN `1357`.
- To start again from clean demo data: stop the dev server, run `npm run db:reset`, then `npm run dev`.

Check your copy is healthy:

```bash
npm run typecheck   # web app and API
npm test            # API integration tests on an in-memory Postgres
npm run build       # web app to dist/, API and worker to build/
```

All three should pass on a clean clone. `npm run lint:design` checks the design-token rules.

## 2. Run a closed beta (staging: real people, no real money)

Staging is a hardened copy of production. It refuses to start with unsafe settings (a live payment key, default secrets, mismatched environments), so mistakes fail loudly.

The full walkthrough is in [STAGING.md](STAGING.md). The short version:

1. Get a host that runs Docker or Node 24, a public DNS name, and a Postgres 16+ database whose admin user can create roles.
2. `cp .env.staging.example .env.staging` and fill in every empty value.
3. Generate fresh secrets, never reused from production:
   ```bash
   openssl rand -base64 48   # JWT_SECRET, HASH_SECRET, SANDBOX_WEBHOOK_SECRET (one each)
   openssl rand -base64 32   # DATA_ENCRYPTION_KEY
   ```
   **Back up `DATA_ENCRYPTION_KEY` and `HASH_SECRET`.** Lose the first and encrypted data cannot be read; lose the second and analytics pseudonyms change.
4. Create the database roles in two steps (the roles exist only after the first migration). STAGING.md, step 2, has the exact order. Edit the passwords in `server/src/db/roles.sql` before running it.
5. Bring it up:
   ```bash
   export STAGING_HOST=staging.example.com DB_ADMIN_PASSWORD=...
   docker compose -f deploy/staging/docker-compose.yml --env-file .env.staging up --build -d
   ```
   Without Docker: `npm ci && npm run build`, then run `npm start` (API) and `npm run worker` (jobs) behind a TLS proxy.
6. Check it:
   ```bash
   curl https://$STAGING_HOST/api/health   # {"ok":true}
   curl https://$STAGING_HOST/api/config   # "deployEnv":"staging", "sandbox":true
   ```

## 3. Go live (real money)

Everything in [.env.example](.env.example) applies. The server validates it at startup in `server/src/config.ts` and tells you what is wrong. In short, you need:

| Need | Used for | Setting |
| --- | --- | --- |
| Managed Postgres 16+ with an owner role and a restricted service role | All data | `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `server/src/db/roles.sql` |
| Public HTTPS origin | CORS, cookies, invite links, shared-page previews | `APP_ORIGIN`, `TRUST_PROXY=true` |
| Four generated secrets | Sessions, pseudonymised analytics, encryption | `JWT_SECRET`, `HASH_SECRET`, `DATA_ENCRYPTION_KEY` |
| Paystack live secret key | Payments and payouts | `PAYMENTS_PROVIDER=paystack`, `PAYSTACK_SECRET_KEY=sk_live_...` |
| Paystack webhook | Payment confirmations | Point it at `https://<your-domain>/api/webhooks/paystack` |
| Termii account and sender ID | SMS sign-in codes (or set `SMS_PROVIDER=disabled` to run on email and Google only) | `SMS_PROVIDER`, `TERMII_API_KEY`, `TERMII_SENDER_ID` |
| Stytch project | Email sign-in codes and Continue with Google | `EMAIL_AUTH_PROVIDER=stytch`, `STYTCH_PROJECT_ID`, `STYTCH_SECRET`, `STYTCH_PUBLIC_TOKEN` |
| Resend (only if `EMAIL_AUTH_PROVIDER=native`) and for product email | Notices such as "your sign-in email changed" | `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM` |
| VAPID key pair (optional) | Browser push notifications | `npx web-push generate-vapid-keys`, then the three `WEB_PUSH_*` settings |
| `OPS_TOKEN` (optional) | Protects `GET /api/ops/reconcile` | `OPS_TOKEN` |

### Not finished: read before taking real money

- **BVN verification is a stub.** The sandbox accepts a test BVN. Production needs a real identity provider; the call to replace is a single function in `server/src/modules/users.ts`.
- **Google sign-in is switched off** (`ENABLE_GOOGLE_AUTH=false`) until the production domain is verified with Google. In the Google/Stytch console, register `https://<your-domain>/authenticate` as the redirect.
- **Placeholder photography.** `public/home-photos` and `public/covers` are free stock photos (see the `CREDITS.md` in each folder). Replace them with photography you own before launch.
- **Business side:** [LAUNCH.md](LAUNCH.md) covers licensing, compliance and operations, and [LAUNCH_AUDIT.md](LAUNCH_AUDIT.md) is the pre-launch review with open items.

## Running it as an installable app (PWA)

The web app installs to a phone's home screen with no app store. It needs HTTPS on a real domain; localhost works for testing. The manifest is `public/manifest.webmanifest` and the service worker is `public/sw.js`. Build output goes to `dist/` and is served by `npm start` along with the API.

## Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | API and web app together, with hot reload |
| `npm run typecheck` | Web app and API |
| `npm test` | API integration tests |
| `npm run build` | Production build |
| `npm start` | Serve the built web app and API from one process |
| `npm run worker` | Separate background-job worker (`RUN_WORKER=false` on API instances) |
| `npm run db:reset` | Delete the local embedded database (reseeds on next start) |
| `node scripts/e2e.mjs` | Full user journey in a headless browser (needs `npm run dev`) |

## If something goes wrong

- **The server exits at startup with a config message.** That is the safety check working. Read the message; it names the unsafe or missing setting.
- **Sign-in codes do not arrive.** In sandbox they are shown on screen. In staging with `SMS_PROVIDER=disabled`, phone sign-in is hidden by design.
- **`npm run dev` port in use.** Stop the other process on `:5173` or `:8787`.
- **Anything else:** [SECURITY.md](SECURITY.md) for reporting vulnerabilities, [docs/AUTH-MIGRATION.md](docs/AUTH-MIGRATION.md) for the sign-in design.
