# PACT launch audit

Date: September 26, 2026 · Commit: see `git log -1` · Scope: web app, API, database, marketing site.

**Verdict: not ready for real money. Ready for a sandbox beta.** Product, security controls and accessibility are in good shape and tested. Launch with real money is blocked by items outside the code (payment partner, identity provider, company details, legal review) and a few infrastructure steps listed under *Launch blockers*.

How to reproduce every check in this document:

```bash
npm test                       # 34 API tests, 19 of them adversarial (server/test/security.test.ts)
npm run dev                    # then, in another terminal:
node scripts/e2e.mjs out/      # full user journey in a browser, with screenshots
node scripts/audit.mjs out.json   # axe-core WCAG 2.1 AA, overflow at 6 widths, console errors, links
npm audit --omit=dev           # production dependency advisories
```

---

## 1. Product readiness

| Capability | Status | Evidence |
| --- | --- | --- |
| Create an account (phone + SMS code, name, PIN) | Works | e2e journey |
| Create a Pact: type, target or budget, deadline, invites, tasks, rules | Works | e2e, API tests |
| Budget lines (raised money fills them in order; target = budget total) | Works | API tests |
| Invite by link, WhatsApp, SMS, phone; public preview before sign-up | Works | e2e, security tests |
| Join and choose how to show up (money, task, both, later) | Works | API tests, manual |
| Contribute from wallet (hold, then PIN), or pay straight into a Pact | Works | e2e covers both |
| Cover the rest; split the rest (an ask, never a charge) | Works | API + security tests |
| Tasks: add, claim, progress, done, assign, remove | Works | security tests (rules), manual |
| Activity feed with money, tasks, milestones | Works | e2e |
| Completion: We did it, people, contributions, tasks done | Works | e2e |
| Memory: note, date, up to six private photos | Works | e2e (upload), security tests |
| Release to organiser, close and refund, missed-goal rule | Works | API tests |
| Wallet: top up, history, withdraw to own-name account, reversals | Works | e2e, API tests |
| Notifications, personalised reminders | Works | API tests |
| Data export, account closure, PIN reset | Works | security tests, screens |

Deliberately not built (per the brief's "what not to build"): chat, loans, cards, investments, rewards, referral gamification, AI features. Referral codes exist but carry no reward.

## 2. Technical readiness

| Check | Result |
| --- | --- |
| Typecheck (web + API) | Pass |
| API tests | 34/34 pass |
| Browser journey (sign up → top up → create → contribute with PIN → direct pay to complete → memory photo → BVN → add bank → withdraw) | Pass, repeated runs |
| Routes checked for errors (7 site, 15 app) | 22/22 load, no console errors |
| Horizontal overflow at 390, 430, 768, 1024, 1280, 1440 px | None on any of the 22 routes |
| Broken in-page anchors | None |
| Production build (web + bundled API) | Pass |
| Production boot guard (refuses dev secrets, no Postgres, sandbox payments, SMS-to-logs) | Pass |

Bugs found and fixed during this audit cycle: authorisation ordering on release, a task-update error code, refresh-token rotation breaking on interrupted requests, sign-out on network errors, the Home date using UTC, pluralisation, and a stale anchor after removing a landing section.

## 3. Security readiness

### Attacks tested (brief section 62 / 91)

Every row is an automated test that calls the API or the database directly. Results are from the last run.

| Attempt | Result |
| --- | --- |
| Access another user's Pact by id (read and every write route) | Refused, 404 (no existence leak) |
| Member of one Pact reads the organiser's other Pact | Refused, 404 |
| Modify someone's contribution (API has no such route; raw SQL as that user) | Refused: column not writable, `42501` |
| Call protected APIs without a session, or with a forged/`alg:none` token | 401 on all 19 routes tried |
| Change an amount after payment (webhook with a different amount) | Not credited, top-up marked failed |
| Pay in another currency | Not credited |
| Fake payment success when a real processor is configured | Sandbox routes don't exist (404); unsigned webhook 401 |
| Replay a webhook three times | Credited once |
| Upload an executable disguised as PNG; upload a shell script | 415 |
| Upload as a non-organiser; fetch a photo as an outsider or signed out | 403 / 404 / 401 |
| Photo metadata (EXIF/GPS) survives upload | Stripped (verified on the stored file) |
| Bypass frontend validation: 61-char name, bidi-override spoofing, control characters, `<script>`, negative, fractional or string amounts, unknown category, bad date | 400 on every case |
| Send a 70 KB JSON body | 413 |
| Spam PIN-reset codes | 429 after the per-number limit |
| Enumerate accounts via sign-in | Identical response for new and existing numbers |
| Invite strangers by guessing user ids | 400 (only people you share a Pact with) |
| Admin / debug / test routes, `/.env`, `/package.json`, path traversal | 404 |
| Ops reconciliation without its token | 404 |
| Duplicate contributions via retries | Idempotency replays the first response |
| Concurrent contributions overdrawing a wallet | Blocked (5 parallel, exactly 3 succeed) |
| Stolen refresh token reused after rotation | Whole session revoked |
| Cookie refresh from a foreign origin (CSRF) | 401 |
| Other people's phone numbers, PIN hashes or balances in responses | Not present |
| Row-level security: outsider sees 0 Pacts/tasks; member can't read `accounts`, `ledger_entries`, `sessions`, `bank_accounts`, `audit_log`, `users.phone`, `users.pin_hash` | Enforced by Postgres (`42501`) |

### Controls in place

| Area (brief) | Status |
| --- | --- |
| RLS on every user-data table | Done. Person-scoped requests run as `pact_app` with the user id set per transaction. Money, credential and platform tables have RLS on and no grants at all. |
| Server-side authorisation | Done, on every route, before PIN/KYC checks. |
| Parameterised queries | Done. The only interpolated SQL fragments are constants (column list, `FOR UPDATE`). |
| Rate limits | Done, per route (table below) plus database-backed business limits. |
| Request size limits | 64 KB JSON; 8 MB photo uploads before re-encoding; field lengths in shared schemas. |
| Secrets | Server-side only. Built bundle scanned: no secrets, no source maps. `.env` never committed. |
| CORS | Allowlist from `APP_ORIGIN` + `CORS_ORIGINS`; no wildcard. |
| HSTS / HTTPS | HSTS in production; HTTP→HTTPS redirect behind a proxy; Secure cookies in production. |
| CSRF | State changes use Bearer tokens (not cookies). The one cookie route requires SameSite=Strict, a custom header and an allowed Origin. |
| Sessions | httpOnly refresh cookie, 15-min access tokens, rotation with reuse detection, 30-day absolute and 14-day idle expiry, per-device revocation. PIN change or reset signs out other devices. |
| Password reset | No passwords. PIN reset needs a fresh single-use SMS code (5 min, 5 attempts), is rate-limited, and pauses withdrawals and bank changes for 24 hours. |
| Enumeration | Sign-in responses are identical for new and existing numbers. |
| Brute force | OTP: 5 attempts per code, 4 codes per number per 15 min, 30 per IP per hour. PIN: 5 attempts then a 30-minute pause (not permanent), owner notified. |
| Security logging | Sign-in/up, OTP failures and limits, PIN failures/changes/resets, bank changes, KYC, contributions, releases, closures, webhook signature failures, rate-limit violations, refresh-token reuse, account closure. Append-only. Logs redact tokens, PINs, account numbers, cookies. |
| Payments | Server decides amount, currency, fees and eligibility; credits only on verified webhook or processor verification; amount and currency checked; idempotent. |
| Uploads | Content-sniffed, JPEG/PNG/WebP only, re-encoded to WebP, metadata stripped, 6 per Pact, private, served through the API with `nosniff`. |
| Sanitisation | Control and bidi-override characters and angle brackets rejected server-side; React escapes on render; no raw HTML anywhere. |
| Production lockdown | No debug/admin/test routes; sandbox refused in production unless explicitly allowed; BVN auto-verify never runs in production; generic error messages. Sweep for `skipAuth`, `bypass`, `fakePayment`, `TODO`, `console.log`, `debugger`: none in shipped code. |
| Dependencies | `npm audit --omit=dev`: 0 vulnerabilities (React Router upgraded to v7 to clear two moderate advisories). |

### Rate limits

Per IP, per minute unless stated. Per-IP limits are held in memory per instance (see risks).

| Route | Limit |
| --- | --- |
| Everything (default) | 300 |
| Request sign-in code | 5 (+ 4 per number per 15 min, 30 per IP per hour, in the database) |
| Verify code / sign up / refresh | 10 / 5 / 30 |
| PIN change / reset code / reset | 5 / 3 per 15 min / 5 per 15 min |
| BVN verification | 5 per 10 min |
| Top-up / withdraw / add bank / resolve bank | 10 / 5 / 5 / 10 |
| Create Pact / contribute / release / cancel | 10 / 20 / 5 / 5 |
| Invites / join / invite preview | 20 / 20 / 60 (+ 30 SMS invites per person per day) |
| Remind / split the rest | 5 (+ once a day per person / per Pact) |
| Budget / tasks / memory / photo upload | 30 / 30–60 / 20 / 12 per 10 min |
| Data export / close account | 3 per hour each |
| Payment webhooks | 600 |

## 4. Privacy readiness

| Item | Status |
| --- | --- |
| Privacy Policy (`/privacy`) | Drafted: data collected, purposes, who sees what, processors, retention, rights, children, security. Marked as a draft pending legal review. |
| Terms of Service (`/terms`) | Drafted. |
| Refund Policy (`/refunds`) | Drafted. |
| Cookie Policy (`/cookies`) | Drafted. One strictly necessary cookie. |
| Cookie consent banner | Not needed today: no analytics, advertising or non-essential cookies. Required before adding any. |
| Data access | Profile → Download my data (JSON). |
| Data deletion | Profile → Close my account (erases personal details; keeps records financial rules require). |
| Data minimisation | Phone and name only at sign-up; no email, contacts, location or demographics; BVN only for higher limits; photo metadata stripped. |
| Minimum age | 18+, stated at sign-up and in the Terms; BVN check refuses under-18s. |

### Third-party inventory

| Package / service | Why | Data it sees | Necessary |
| --- | --- | --- | --- |
| Paystack (not yet live) | Payments and payouts | Payment amounts, card/bank details (handled by Paystack), references | Yes |
| Termii (not yet live) | SMS codes and invites | Phone numbers, message text | Yes |
| Identity provider (not chosen) | BVN verification | BVN, name, date of birth | Yes, for Tier 2 |
| Hosting / database (not chosen) | Runs the service | All stored data | Yes |
| fastify, @fastify/*, zod, jose, pg, pino | API framework, validation, tokens, database, logs | Runs on our server; no third-party calls | Yes |
| @electric-sql/pglite | Embedded Postgres for development and tests only | Local data | Dev only |
| sharp | Photo validation and re-encoding | Uploaded photos, on our server | Yes |
| react, react-router, @tanstack/react-query | Web app | In the browser | Yes |
| framer-motion, gsap, three, @react-three/* | Animation and the 3D hero | None | Marketing polish; could be trimmed from the app bundle |
| lucide-react, @fontsource-variable/geist | Icons, font (self-hosted) | None | Yes |
| qrcode | Download page QR | The download URL | Yes |

No analytics, tracking, advertising, chat or AI SDKs are included.

## 5. Accessibility readiness

- axe-core (WCAG 2.0/2.1 A and AA rules) on 22 routes: **0 violations** after fixes. Fixed during the audit: split-text headings with prohibited ARIA, dimmed scroll-text contrast (0.12 → 0.5 opacity), white-on-blue pill text, contributor amounts written in their colour (now a tinted highlight behind dark text), a danger badge, a feed title, an unfocusable scrolling carousel, and an unread dot labelled on a plain element.
- Contributor colour is never the only identifier: rings pair with names and avatars, the group list shows names and amounts, and colour sits behind dark text rather than being the text.
- Bottom sheets trap focus and close on Escape; the hold button also confirms from the keyboard; touch targets are at least 44 px; `prefers-reduced-motion` settles animation.
- Not yet done: a manual screen-reader pass (VoiceOver, TalkBack) and testing with real users who rely on assistive technology. Automated tools catch a fraction of issues.

## 6. Performance readiness

- API: stateless; bounded query counts per list; indexed hot paths; cursor pagination; outbox worker with `SKIP LOCKED`.
- Web: routes are code-split. The main bundle is 712 KB (230 KB gzipped); the marketing pages, style guide and legal pages load on demand (11–34 KB each). The 3D payment scene is its own lazy chunk (899 KB, 248 KB gzipped) but still loads on the app's Welcome screen. Before launch on low-end Android devices, show a static image there instead and keep the 3D scene for the website.
- Not load-tested. Run a load test against the staging stack (Postgres, two API instances, one worker) before public launch.

## 7. Known limitations

- **Per-IP rate limits are in memory per instance.** With more than one API instance they must move to Redis. Business limits (OTP, PIN, invites, reminders) are already in Postgres.
- **Least-privilege database roles are written but untested on managed Postgres.** `server/src/db/roles.sql` and `MIGRATION_DATABASE_URL` separate migration and runtime credentials. Until they're applied, the API connects as the table owner and the service context bypasses RLS (person-scoped reads still run under RLS).
- **Photos are stored in Postgres** (≤2 MB each after re-encoding, 6 per Pact). Fine for launch scale; move to private object storage with signed URLs when volume grows.
- **Push notifications** are a queued stub (in-app notifications work).
- **Referral codes** carry no reward logic.
- **SMS delivery**: `SMS_PROVIDER=termii` is implemented but untested against the live Termii API.
- The earlier design-submission export scripts (`npm run export:screens`) capture the old prototype, not the current product.

## 8. Production environment requirements

Everything in `.env.example`, plus:

- Managed Postgres with point-in-time recovery and a tested restore; `sslmode=require`.
- `JWT_SECRET`, `HASH_SECRET` (48+ random bytes each) and `DATA_ENCRYPTION_KEY` (32 bytes) from a secrets manager, with a rotation plan; back up the encryption key offline.
- `PAYMENTS_PROVIDER=paystack` with a live key and the webhook URL `https://<domain>/api/webhooks/paystack`.
- `SMS_PROVIDER=termii` with a registered sender ID.
- `TRUST_PROXY=true` behind a TLS-terminating proxy; `APP_ORIGIN` set to the real domain.
- Redis for rate limiting if running more than one instance.
- Separate worker process (`npm run worker`) with `RUN_WORKER=false` on API instances.
- Alerting on `LEDGER DRIFT DETECTED`, `OPS ALERT`, dead jobs, webhook 5xx and spikes in auth failures; uptime and error monitoring.

## 9. Human and legal review required

- Custody model and licence position: a licensed banking or payment partner must hold customer funds. The product copy says this will be the case; it isn't yet.
- Terms, Privacy, Refund and Cookie policies: reviewed by Nigerian counsel; confirm record-retention periods (the policy says "at least five years, subject to legal review").
- NDPC registration, a named Data Protection Officer, and a DPIA.
- KYC tier limits in `shared/policy.ts` confirmed with the partner against CBN requirements.
- AML/CFT: transaction monitoring rules, suspicious-activity escalation, sanctions screening, a compliance owner.
- Company identity: registered name, number and address on the legal pages (currently a stated placeholder). Real support, privacy and security mailboxes (currently `@pact.africa` placeholders).
- **Asset licence:** the demo avatar photos in `public/avatars/` came from randomuser.me and their licence for commercial use is unverified. Replace them with licensed or commissioned images, or initials, before public launch. Geist (OFL), Lucide (ISC) and the code libraries are permissively licensed.
- Penetration test by an independent party.

## 10. Launch blockers

1. No licensed payment/custody partner signed, and no live Paystack keys.
2. Identity verification provider not integrated (BVN checks refuse in production by design).
3. Company details and real contact mailboxes missing from the legal pages.
4. Legal review of the four policies; NDPC registration.
5. Demo avatar photos with unverified licences.
6. Least-privilege roles applied and tested on the production database; Redis rate limiting if more than one instance.
7. Replace the 3D scene on the app's Welcome screen with a static image for low-end devices, and load-test staging.

Everything else in this document passed or is intentionally out of scope for the MVP.
