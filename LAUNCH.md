# Launch plan

How PACT goes from this repository to real people moving real money. Product and engineering are ready for a closed beta in sandbox; the items marked **Before real money** are business, legal and operational work the code can't do on its own.

## 1. Positioning

**Plan it together. Fund it together.** Group money in Nigeria moves through one person's account while the status lives in a WhatsApp thread. Nobody knows the real total, one person ends up chasing everyone, and trust carries the whole thing. PACT makes the shared goal the product: the money sits in the Pact, everyone sees every contribution, and the rules are agreed up front and enforced by software.

- **Against the group-chat treasurer:** no single person holds the money; the total and who has paid are always visible.
- **Against ajo / esusu apps:** PACT is for one-off goals with a deadline, not rotating savings. No credit, no interest, no lock-in.
- **Against bank transfers with a spreadsheet:** reminders, refunds and payouts happen on their own.

## 2. Who it's for first

| Segment | The moment | Why they'll invite others |
| --- | --- | --- |
| Friend groups, 22 to 35, Lagos and Abuja | Birthday gifts, send-offs, group trips (Detty December) | Every Pact needs the rest of the group to join |
| Wedding and event circles | Aso-ebi, couple gifts, owambe contributions | Large groups, 20 to 100 people, strong social pressure to contribute |
| Flatmates | Rent, generator fuel, shared bills | Recurring need, high trust bar |
| Campus associations | Dues, trips, department events | Dense networks, fast word of mouth |

Start with friend groups and weddings: highest emotional stakes, clearest deadline, largest invite fan-out.

## 3. Growth loop

Every Pact is an acquisition channel. An organiser creates a Pact and shares the link to a WhatsApp group; each member opens a preview page that shows what the money is for and the live total, signs up with their number, and contributes. The best contributors become organisers of the next Pact.

Product support already built:
- Public invite previews at `/app/join/<code>` with the organiser's name and live progress.
- Invites by phone number reach people who aren't on PACT yet by SMS, and are waiting in their account when they sign up.
- Referral codes on every account (reward logic intentionally not built yet; decide the incentive first).
- One-tap WhatsApp and SMS sharing with a prefilled message.

Track the loop: **invites sent per Pact → preview-to-signup rate → signup-to-first-contribution rate → share of contributors who later organise.** A Pact of 8 people that converts 5 new users is the unit to optimise.

## 4. Revenue

| Stream | Price | Notes |
| --- | --- | --- |
| Card top-ups | 1.5%, capped at ₦2,000 | Covers processor cost; bank transfer is free to push people to the cheaper rail |
| Withdrawals | ₦50 flat | Above NIP transfer cost |
| Later: Pact Plus | Subscription or per-Pact fee | Custom cover images, larger groups, organiser tools, scheduled contributions |
| Later: float income | Interest on pooled balances, where the partner agreement allows | Requires legal review |

All fees live in `shared/policy.ts`, shown in the app before anyone pays.

## 5. Compliance (Before real money)

PACT should not hold customer funds itself. The architecture assumes a licensed partner holds balances:

1. **Banking / payments partner.** A licensed PSSP, MMO or bank partner provides collections, virtual accounts and payouts, and holds customer funds in a segregated account. The Paystack adapter covers collections and transfers; a bank or BaaS partner covers the custody model. Get the custody and settlement terms in writing.
2. **KYC tiers.** The app's Starter / Verified / Plus tiers follow the shape of the CBN tiered-KYC framework. Confirm the exact limits with the partner and update `TIER_LIMITS`.
3. **Identity verification.** Integrate a BVN/NIN provider (for example through the payments partner, Smile ID, Dojah or Prembly). Replace the sandbox branch in `modules/users.ts`.
4. **AML/CFT.** Transaction monitoring rules (velocity, unusual Pact sizes, rapid in-and-out), suspicious-activity escalation, a named compliance officer, sanctions screening via the identity provider.
5. **Data protection.** Register with the Nigeria Data Protection Commission, appoint a DPO, complete a DPIA, and have the Terms and Privacy Policy at `/terms` and `/privacy` reviewed by counsel (they are written in plain language as a starting point, not legal advice).
6. **Consumer protection.** Complaints channel with response targets, clear refund rules (already enforced by the missed-goal rule), fee disclosure (already in-app).

## 6. Phases

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| **0. Sandbox beta** (now) | Web app with sandbox payments; 5 to 10 friend groups | Groups complete a Pact end to end; qualitative feedback on the flow |
| **1. Closed beta, real money** | Live partner, BVN checks, SMS, caps lowered (for example ₦100k per Pact); 50 groups by invitation | Zero ledger drift; top-up success above 95%; support load understood |
| **2. Public web launch** | Waitlist opens; referral incentive; content on WhatsApp, X and TikTok around real Pacts (with permission) | Week-4 retention of organisers; invite conversion benchmarks |
| **3. Native apps** | iOS and Android shells on the same API; push notifications, contact-based invites, biometrics for PIN | Store ratings, push opt-in, reduced time to first contribution |

## 7. Launch channels

- **Detty December and wedding season** are natural campaigns: "Stop being the group treasurer."
- Partner with event planners and aso-ebi vendors: they recommend PACT to couples collecting gifts.
- Campus ambassadors for associations and trips.
- Creator content showing a real Pact filling up (the ring of colours is made for short video).
- The marketing site's hands-on contribution demo and app screenshots are ready; point every ad to `/download`, which hands off to the web app until the native apps ship.

## 8. Operations checklist (Before real money)

- [ ] Production Postgres with point-in-time recovery; restore tested.
- [ ] Secrets in a manager (never in `.env` on disk in production); rotation plan for `JWT_SECRET` and `HASH_SECRET`; `DATA_ENCRYPTION_KEY` backed up offline.
- [ ] Paystack webhook URL configured, IP allowlist considered, and a daily settlement reconciliation between the processor's report and `provider_clearing`.
- [ ] Alerts on `LEDGER DRIFT DETECTED`, `OPS ALERT`, dead jobs, webhook 5xx and elevated 4xx on auth routes.
- [ ] `server/src/db/roles.sql` applied; API on `pact_service`, migrations on `pact_owner` (`MIGRATION_DATABASE_URL`).
- [ ] `scripts/loadtest.mjs` run against staging with two API instances and a separate worker.
- [ ] Error tracking and uptime monitoring.
- [ ] Penetration test and a review of the threat model in the README.
- [ ] Support inbox (`support@`), a refunds runbook, and an account-freeze runbook (`users.status = 'frozen'` blocks sign-in and API access).
- [ ] App store listings, screenshots and privacy nutrition labels for the native apps.

## 9. Metrics

- **North star:** naira successfully pooled into Pacts that reach their goal, per week.
- Activation: new users who contribute within 24 hours of signing up.
- Virality: new users per Pact created.
- Health: top-up success rate, withdrawal success rate, time to release, refund rate, ledger drift (must be zero), support tickets per 1,000 transactions.
