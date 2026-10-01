# PACT

**Plan it together. Fund it together.**

PACT is a social money app for groups saving toward one shared goal: a trip, a birthday gift, a wedding contribution, rent. Everyone tops up a wallet, contributes to the Pact with their PIN, and sees every naira land in a ring made of everyone's colours. When the goal is reached the organiser releases the funds; if it isn't, the rule the group agreed at the start runs on its own.

This repository holds the whole product: the marketing site, the mobile-first web app, and the API with its ledger, payments and background jobs.

```bash
npm install
npm run dev        # web on :5173, API on :8787 (embedded Postgres, sandbox payments, seeded demo data)
npm test           # API tests, including adversarial security tests
node scripts/audit.mjs out.json   # accessibility, overflow, console errors (needs `npm run dev`)
node scripts/e2e.mjs   # full user journey in a headless browser, with screenshots (needs `npm run dev`)
```

**Demo:** watch the 3-minute walkthrough in [`docs/demo/pact-demo.mp4`](docs/demo/pact-demo.mp4), or run it live with the talk track in [DEMO.md](DEMO.md).

Open `http://localhost:5173/app`. Sign up with any Nigerian mobile number (the SMS code is shown on screen in the sandbox), or use a demo account: `0801 000 0001` (Abraham, organiser of Sarah's Birthday), `0801 000 0002`, `0801 000 0003`. Demo PIN `1357`.

---

## What the product does

| Area | Capability |
| --- | --- |
| Sign in | Phone number and 6-digit SMS code. New numbers set their name and a 4-digit transaction PIN. Sessions per device, revocable. |
| Wallet | Balance, history with receipts, top up by bank transfer (free) or card (1.5%, capped at ₦2,000), withdraw to your own bank account (₦50). |
| Pacts | Create from a type (birthday, trip, wedding, gift, event, dinner, home) with suggested budget lines and tasks. Set one target or a budget whose total becomes the target. Pick a split mode and a missed-goal rule (refund everyone, or keep what was raised). Invite by link, WhatsApp, SMS or phone number; people not on PACT get a text and the invite waits for them. |
| The plan | Budget lines fill in order as money arrives. Lightweight tasks: add, claim, progress, done, assign. Each member says how they're showing up (money, a task, both, or later). A needs-attention card on each Pact and on Home. |
| Contributing | Hold to contribute from the wallet, confirm with PIN, or pay straight into a Pact by transfer or card. Cover the rest in one move, or split the rest as an ask (never a charge). Contributions can't overshoot the goal. |
| Pay by transfer | Each Pact can get its own account number. Anyone pays it from any bank app, no download needed. A transfer counts for the member whose name matches the sender's bank name; anyone else shows as a named guest, and organisers can say who it was. The number is on the public invite page. Transfers after a Pact closes go back to the sender. |
| Paying vendors | Organisers pay a vendor's bank account straight from the Pact, checked with the bank first and tied to a budget line. Once more than ₦200,000 would go out without approval in a day, the co-organiser (BVN-verified, never the person who asked) approves. With a co-organiser, releasing the pool to the organiser's wallet needs their approval too. Every member sees each payment, its verified account name and its receipt (write-once). Refund-if-missed Pacts can pay vendors only once funded, so the refund promise holds. |
| Pledges | "I'll add ₦20,000 by Friday." PACT reminds the person on the day and once the day after, tells the organiser then, and stops. Kept automatically when the money arrives, whichever way it's paid. |
| Order Pacts | For aso-ebi, souvenirs or tickets: the organiser lists items with prices, sizes and stock; people order now and pay by the Pact's date (each order becomes a pledge). The total is what people order. Members see their own orders; organisers get an order sheet by item and size, ready to copy or send to the tailor. Unpaid orders lapse after the pay-by date. |
| Completion | We did it: people, contributions and tasks done. The organiser releases the pool (BVN required) or closes the Pact and refunds everyone. The group keeps a memory: a note, the date and up to six private photos. Reminders are personal and at most once a day. |
| Deadlines | Three days out, people who haven't contributed are reminded. After the deadline plus a 3-day grace period the Pact's rule runs automatically. |
| Trust | Notifications for every movement of money and every security event, tiered limits (Starter, Verified, Plus), withdrawals only to accounts in your own name, data export and account closure, forgotten-PIN reset. |

The launch review is in [LAUNCH_AUDIT.md](LAUNCH_AUDIT.md).

---

## Architecture

```
┌─────────────── Browser / PWA ───────────────┐
│ React 18 · React Router · TanStack Query    │
│ access token in memory, refresh token in an │
│ httpOnly SameSite=Strict cookie             │
└───────────────┬─────────────────────────────┘
                │ /api (JSON, Idempotency-Key on money routes)
┌───────────────▼─────────────────────────────┐
│ Fastify API (stateless, horizontally        │     ┌──────────────────┐
│ scalable)                                   │────▶│ Payment provider │
│ auth · wallet · pacts · notifications       │◀────│ Paystack/sandbox │
│ webhooks (HMAC-verified, deduplicated)      │ hook└──────────────────┘
└───────────────┬─────────────────────────────┘
                │ SQL (transactions, row locks)
┌───────────────▼─────────────────────────────┐     ┌──────────────────┐
│ Postgres                                    │◀────│ Worker(s)        │
│ double-entry ledger · outbox job queue      │     │ SKIP LOCKED jobs │
└─────────────────────────────────────────────┘     └──────────────────┘
```

```
server/src/
  app.ts               HTTP layer: security headers, CORS, rate limits, idempotency, routes
  config.ts            validated environment; refuses unsafe production settings
  db/                  driver (PGlite in dev/tests, pg pool in prod), migrations, demo seed
  modules/ledger.ts    double-entry postings with ordered row locks
  modules/wallet.ts    top-ups, bank accounts, withdrawals and reversals
  modules/pacts.ts     Pact lifecycle, contributions, release, refunds, deadline sweep
  modules/auth.ts      OTP, sessions, refresh rotation, PIN
  modules/webhooks.ts  verified, deduplicated processor events
  payments/            provider interface, Paystack adapter, sandbox provider, SMS
  jobs/worker.ts       outbox worker and recurring jobs
shared/                request schemas, response types and product policy used by both sides
src/                   web app (/app), marketing site (/), style guide, legal pages
```

### Money model

- All amounts are **integer kobo**. No floats anywhere in the money path.
- Every movement is a **balanced double-entry transaction**: user wallets, Pact pools and three system accounts (`provider_clearing`, `payout_clearing`, `fee_revenue`). A deferred Postgres constraint trigger rejects any transaction whose entries don't sum to zero, and ledger entries are append-only (a trigger blocks updates and deletes).
- Accounts are locked in a stable order with `SELECT ... FOR UPDATE` before balances change, and a `CHECK` constraint keeps wallets and pools from going negative. Concurrent contributions can't overdraw a wallet or overshoot a goal (covered by a test that fires five at once).
- Top-ups are credited **only** on a signature-verified webhook or a server-side verification call to the processor, never on the client's word. The amount paid is checked against what was expected.
- Withdrawals debit the wallet first, then pay out from the outbox. A failed or returned transfer is reversed in full, fee included.
- Bank transfers into a Pact's account number are credited once per processor reference, straight from `provider_clearing` to the Pact pool. Money that can't be placed (an unknown number, a late transfer with no sender account) goes to a fourth system account, `suspense`, and raises an ops alert.
- Vendor payments are held from the pool the moment they're requested (pool to `payout_clearing`, fee to `fee_revenue`), so nothing can be spent twice while waiting for approval, and are put back if turned down or returned by the bank. Refunds after vendors were paid share what's left in proportion to what each person put in, to the kobo.
- An hourly job reconciles every cached balance against its entries and alerts on drift. `GET /api/ops/reconcile` exposes the same check behind `OPS_TOKEN`.

### Scalability

- The API is stateless: any number of instances behind a load balancer. JWT access tokens are verified locally; a single indexed query confirms the session is live, so revocation is immediate.
- Background work goes through a **transactional outbox**: jobs are inserted in the same transaction as the change that caused them and drained with `FOR UPDATE SKIP LOCKED`, so workers scale out without double-processing. Run `RUN_WORKER=false` on API instances and `npm run worker` separately.
- Recurring jobs (deadline sweep, reconciliation) are scheduled with dedupe keys, safe to trigger from every instance.
- Lists are cursor-paginated; hot paths are indexed; Pact lists are hydrated with a fixed number of queries whatever their size.
- Serialization failures and deadlocks are retried automatically.
- Per-IP rate limits are counted in Postgres (`RATE_LIMIT_STORE=postgres`, the default), so they hold across instances; `memory` suits a single process. Business limits (OTPs per number, PIN attempts, daily wallet limits) live in Postgres too.

---

## Security

| Threat | Control |
| --- | --- |
| Broken access control | Every protected route checks membership or ownership in code. Underneath, Postgres row-level security runs person-scoped requests as a restricted `pact_app` role that can only read and write rows the policies allow and has no access to money, credential or audit tables. The adversarial suite in `server/test/security.test.ts` attacks both layers. |
| Account takeover | SMS OTP (hashed, 5-minute expiry, 5 attempts, per-number and per-IP limits). Refresh tokens are opaque, hashed at rest and rotated on every use; replaying an old one revokes the session. Sessions are listed and revocable per device. |
| Unauthorised payments | Every movement out of a wallet needs the 4-digit PIN (scrypt-hashed, weak PINs refused, locked for 30 minutes after 5 wrong attempts, owner notified). A forgotten PIN is reset with a fresh SMS code; other devices are signed out and withdrawals pause for 24 hours. |
| Double charges | `Idempotency-Key` on every money route; retries replay the first response. Unique references at the ledger layer as a second line. |
| Forged payment events | Webhooks verified with HMAC-SHA512 over the raw body using constant-time comparison; events are stored and deduplicated before processing. |
| Fraudulent withdrawals | Payouts only to bank accounts whose resolved name matches the verified profile. Releasing Pact funds requires BVN verification. |
| Malicious uploads | Memory photos are identified by their content (not name or declared type), limited to JPEG, PNG and WebP, re-encoded to WebP, resized, stripped of all metadata including GPS, capped at six per Pact, and served only to members through the API. |
| Data exposure | Bank account numbers and BVNs encrypted with AES-256-GCM; BVN uniqueness enforced with a keyed hash. Logs redact tokens, PINs, account numbers and cookies. Non-members get a 404 for Pacts, so ids can't be probed. |
| Web attacks | Strict CSP, HSTS, `frame-ancestors 'none'`, CORS allowlist, 64 KB body limit, all input validated with Zod, parameterised SQL only. Access tokens never touch storage; the refresh cookie is httpOnly, Secure and SameSite=Strict, and refresh requires a custom header. |
| Misconfiguration | Production refuses to boot with development secrets, without Postgres, with the sandbox provider, or with SMS codes going to logs. |
| Audit | Sign-ins, PIN failures, bank changes, KYC, money movements and security events are written to `audit_log`. |

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

---

## Configuration and deployment

All settings are environment variables, documented in [.env.example](.env.example) and validated in `server/src/config.ts`.

```bash
npm run build      # web app to dist/, API and worker bundles to build/
npm start          # serves the web app and the API from one process
npm run worker     # optional separate job worker
docker compose up --build   # Postgres + app + worker, production-like
```

The Docker image runs as a non-root user with a health check on `/api/health`. CI (GitHub Actions) typechecks, runs the API tests, builds, and audits production dependencies on every push and pull request.

A closed beta with real people and no real money runs on **staging**: [STAGING.md](STAGING.md) has the deployment, [docs/ANALYTICS.md](docs/ANALYTICS.md) the funnel events and report (`npm run report:funnel`).

Going live needs: a managed Postgres, a Paystack live secret key with the webhook URL set to `https://<your-domain>/api/webhooks/paystack`, an SMS sender (Termii adapter included), an identity provider for BVN checks (the sandbox accepts any BVN; the production call is a single function in `modules/users.ts`), and push notification credentials for the native apps (the `push.send` job is the hook). [LAUNCH.md](LAUNCH.md) covers the business side.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API (watch mode) and web app together |
| `npm test` | API integration tests on an in-memory Postgres |
| `npm run typecheck` | Web app and API |
| `npm run build` / `npm start` | Production build and server |
| `npm run db:reset` | Delete the local embedded database (reseeds on next start) |
| `node scripts/e2e.mjs [dir]` | Browser journey: sign up, top up, create, contribute, verify, withdraw |

The earlier design-submission exports (`npm run export:screens`, `RATIONALE.md`, `PROJECT_NOTES.md`) describe the original prototype. The app screens now need the API and a signed-in session, so those capture scripts reflect the prototype, not the current product.
