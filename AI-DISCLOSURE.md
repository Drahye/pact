# AI disclosure

PACT was built with heavy use of AI coding assistants (Anthropic's Claude, through Claude Code), directed by the owner. Most of the code, tests, scripts and documentation in this repository were written by the assistant and reviewed, run and steered by a person. Treat it as AI-assisted code and plan for a proper engineering review before you depend on it.

## What that means in practice

- **Reviewed by running, not by line-by-line reading.** The owner checked behaviour in the running app, with the test suite, and with the audit scripts. Not every line was read by a human engineer.
- **It is consistent but may hide assumptions.** AI-written code tends to look uniform and confident. Business rules, money flows and edge cases deserve a second pair of eyes even where tests pass.
- **Documentation was written alongside the code.** Files such as `README.md`, `STAGING.md`, `LAUNCH_AUDIT.md` and the audit notes in `docs/` describe intent and known gaps. They are useful, but they are written by the same process as the code.

## What backs the code up

- A typechecked codebase (`npm run typecheck`, TypeScript across web and API).
- An API integration test suite (`npm test`, 47 test files), including adversarial security tests for access control, replay, rate limits and configuration safety.
- Browser journey and audit scripts in `scripts/` (end-to-end flows, accessibility, contrast, overflow, console errors).
- CI on every push and pull request: typecheck, tests, build and a production dependency audit (`.github/workflows/ci.yml`).
- Internal reviews: [LAUNCH_AUDIT.md](LAUNCH_AUDIT.md) and [docs/AUDIT-2026-10-03.md](docs/AUDIT-2026-10-03.md). These are the project's own reviews, not an independent third-party audit.

## What I recommend a new owner does

1. **Independent security review of the money paths.** Wallet, ledger, payouts, refunds and webhooks (`server/src/modules/`, `server/src/payments/`). The 2026-10-03 audit sampled these but did not re-audit payout and refund logic.
2. **Replace the BVN stub** with a real identity provider before taking real money. See [HOWTOSETUP.md](HOWTOSETUP.md).
3. **Legal and compliance review** for holding and moving customers' funds in your jurisdiction. [LAUNCH.md](LAUNCH.md) lists the business-side questions; it is not legal advice.
4. **Replace the placeholder photography** with images you have rights to. The stock photos are free-licence placeholders (see `public/home-photos/CREDITS.md` and `public/covers/CREDITS.md`).
5. **Run the tests and a load test on your own infrastructure** (`npm test`, `scripts/loadtest.mjs`) and fix whatever your environment surfaces.
6. **Rotate every credential** you receive or generate. No real secrets are committed to this repository, but any key used during development should be treated as exposed to the previous owner.

## Third-party code and assets

Dependencies are listed in `package.json` and locked in `package-lock.json`. Run `npm audit` for current advisories. The icon set is Phosphor Icons. Photos are Pexels and Unsplash placeholders. Check each licence yourself before commercial use.
