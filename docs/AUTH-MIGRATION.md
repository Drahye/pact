# Sign-in: Google and email first, phone as the trust layer

Migrations 029 to 033. Additive and staged; phone sign-in still works exactly as before.

## Model

`users` stays the account. `user_identities` (service-only, RLS on, no `pact_app` grant) holds the verified ways to reach it:

| provider | `provider_subject`            | extra            |
| -------- | ----------------------------- | ---------------- |
| `google` | the OIDC `sub` (never the email) | `email` (verified, refreshed when Google's changes) |
| `email`  | normalised address            | `email`          |
| `phone`  | E.164                         | `phone`          |

`UNIQUE (provider, provider_subject)`: one identity can never belong to two users. `users.phone` is now nullable and kept as a compatibility mirror (still unique) for invites and Paystack. Sessions authenticate the **user**, never a phone.

Backfill: every existing phone was verified at sign-up (the only code path that creates a user is `/auth/signup`, which needs a token only a successful phone OTP can mint; the demo seed inserts fixtures that sign in through the same OTP), so each gets a `phone` identity with `verified_at = created_at`. Closed accounts get none.

## Sign-in methods

- **Phone**: unchanged endpoints; resolves through identities.
- **Email**: `POST /auth/email/request`, `/auth/email/verify`. Codes are keyed hashes in `email_otp_challenges`, 10 minutes, 5 attempts, single use, limited per address (per requester, plus a ceiling) and per IP. The request answer is identical for known and unknown addresses. Normalisation: trim and lowercase the domain only.
- **Google**: `POST /auth/google/start` returns the authorize URL (state, nonce, PKCE S256); `GET /auth/google/callback` finishes it. State, nonce, encrypted verifier and the validated return path live server-side in `oauth_states` (single use, 10 minutes) and are bound to the browser by an httpOnly `pact_oa` cookie. The ID token is verified with `jose` (RS256, Google JWKS, issuer, audience, expiry, nonce). No Google token is stored.

Matching order for Google: (1) the `sub`; (2) a verified email equal to an existing **email** identity (link, no duplicate); (3) otherwise a new account after a name. A phone-only account is never merged by name or look-alike: the person connects Google from Profile while signed in. An email code for an address that already signs in through Google attaches the email to that account.

New accounts of any kind ask only for a name (Google pre-fills it). The signup continuation is a signed 20-minute credential in an httpOnly cookie (`pact_su`), never in page storage.

## Phone, PIN and step-up

- Phone is verified from Account (`/me/identities/phone/*`): the OTP attaches the number to the signed-in account. A number on another account is a 409, never a move. Pending phone invites are claimed **only then**.
- A verified phone is required for: withdrawals, adding a bank account, BVN verification. Social features (Circles, Asks, Plans, RSVPs, Splits, Recaps) never need one.
- PIN is no longer created at sign-up. `PinSheet` (used by every sensitive action) asks for a new PIN on first use, then runs the original action. `POST /me/pin/setup` works only while no PIN exists.
- PIN reset: verified phone (SMS) or verified email (email OTP), then the existing 24-hour hold. `via` selects the channel.
- Changing the email needs the new address verified, plus the PIN when one exists; the old address is told. Unlinking needs the PIN when one exists, and the last way in can never be removed.

## Config

`EMAIL_PROVIDER` (`resend` in production; `log` prints codes, development only), `RESEND_API_KEY`, `EMAIL_FROM`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (derived from `APP_ORIGIN` if empty; set it explicitly in production), `GOOGLE_PROVIDER=fake` (local browser tests only; refused in production mode). Production refuses to start with half a Google config or without real email.

## Tests

Server: `identities`, `email-auth`, `google-auth` (OIDC checks against a local key set, state, PKCE, matching, conflicts), `account`, `auth-logs`, `security-headers`. Browser: `scripts/e2e-auth.sh` (Google/Ask, email/Plan, phone→Google→same account, Google→verify phone→invite claimed) runs against a stack with the fake Google stand-in. **Live Google has not been exercised.**
