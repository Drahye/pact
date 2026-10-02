# Beta product analytics

First-party, server-side, pseudonymous. No analytics SDK, no cookies, no third party sees anything. Because nothing here uses browser storage, it is not gated by the cookie banner; the banner's "optional analytics" choice (`pact.consent`, `src/lib/consent.ts`) exists so that any future optional cookie or storage checks `analyticsAllowed()` first. The point is to answer a handful of product questions during the closed beta, not to watch people.

## What is recorded

Twenty events, in one table (`product_events`, migrations 013, 014 and 015). Nothing else is accepted: the table has a `CHECK` on the name, and `server/src/lib/events.ts` drops any property that is not on a per-event allow-list.

| Column | Meaning |
| --- | --- |
| `name` | One of the twenty events below |
| `occurred_at` | When it happened (the time of the underlying record) |
| `actor` | Pseudonym of the person: an HMAC of their id under the server's `HASH_SECRET`. For previews, a per-day visitor pseudonym instead |
| `pact` | Pseudonym of the Pact, same construction |
| `props` | A few coarse values, listed below |
| `once_key` | Idempotency key, built from pseudonyms, so an event is never recorded twice |

Never present: PINs, codes, phone numbers, names, BVNs, bank details, amounts (only a band), invite codes, ids, message or memory text, IP addresses, browsers. A test (`server/test/events.test.ts`) checks the table for all of these after a full journey.

Pseudonyms are keyed hashes, so nobody with only the table can tell who is who, and nobody without the secret can recompute them. They are still personal data in law (the secret holder can re-derive them), so the privacy page says so, and rows are deleted after 18 months.

## Event schema

| Event | When | `props` |
| --- | --- | --- |
| `signup_completed` | An account is created | `referred` (bool), `had_invite` (a phone invite was waiting) |
| `pact_created` | A Pact is created | `category`, `mode` (target, budget, orders), `tasks` (count), `invites` (count at creation), `split_mode`, `missed_goal`, `was_participant` (the creator had joined someone else's Pact before) |
| `second_pact_created` | A person's second Pact | none |
| `invite_created` | An organiser invites someone, by member or by phone | `via` (member, phone), `count`, `at` (create, later) |
| `invite_previewed` | An invite link's public page is opened. One per visitor per Pact per day | `status` (open, funded, closed), `has_pay_account` |
| `pact_joined` | Someone joins a Pact (once per person per Pact) | `via` (link, invite) |
| `participation_selected` | Someone says how they are showing up | `participation` (money, task, both, later), `at` (join, later) |
| `contribution_completed` | A contribution lands, from a member or a guest transfer | `amount_band` (under 5k, 25k, 100k, over), `guest`, `first_for_person` |
| `task_claimed` | Someone takes a task | `self` |
| `task_completed` | A task is finished | `by_assignee` |
| `pact_funded` | The goal is reached (once per Pact) | `mode`, `days_to_fund` |
| `pact_completed` | The funds were released to the organiser (once per Pact). Kept with its original meaning so earlier numbers line up; the outcome has its own event below | `days_since_funded` |
| `pact_execution_started` | The money was put to work: the first payment from the Pact was asked for (once per Pact) | `days_since_funded`, `with_budget_line` |
| `pact_payment_completed` | A payment from the Pact reached its recipient. Never who was paid or how much exactly | `amount_band` (under 5k, 25k, 100k, over), `with_budget_line`, `needed_approval` |
| `pact_outcome_completed` | The organiser said the plan happened (once per Pact). Funded is not finished: this is the outcome | `days_since_funded`, `paid_lines` (count), `tasks_done_band` (none, some, most, all, no_tasks), `released_remaining` |
| `pact_update_posted` | An organiser posts an update into the activity stream | `length` (short, medium, long). Never the text |
| `activity_commented` | A comment on an activity item or update | `on` (update, system), `first_on_item`. Never the text |
| `activity_reacted` | A reaction is given (one of four) | `reaction`, `on` (update, system) |
| `activity_pinned` | An item is pinned (written directly: a pin leaves no row of its own) | `kind` (update, system) |
| `memory_added` | The first memory note or photo (once per Pact) | `has_photo` |

## Funded is not finished

`pact_funded` means the target was reached. `pact_execution_started` (the first payment from the Pact), `pact_payment_completed` and `pact_outcome_completed` follow what happens next, so the funnel can tell a Pact that only collected money from one that made the plan happen. The report shows `executed_pct` (of funded Pacts, how many started paying for the plan) next to `completed_pct`, which now counts outcomes rather than releases.

## How events are produced

Server-authoritative: events are read from records the server has already committed (users, Pacts, members, the activity feed), by `syncProductEvents` (`server/src/modules/events.ts`). Two events cannot be reconstructed afterwards and are written directly: `invite_previewed` (it leaves no other record) and the choice made on the invite page when joining. The worker syncs every ten minutes and the report syncs before it reads, so nothing needs to be called from the money or join code paths, and analytics can never fail a payment.

## Reading it

```bash
# staging: point at its database (same variables the server uses)
DATABASE_URL=... JWT_SECRET=... HASH_SECRET=... DATA_ENCRYPTION_KEY=... npm run report:funnel -- --since 2026-10-15
npm run report:funnel -- --json     # machine-readable
```

Use the same `HASH_SECRET` as the running environment, or newly derived pseudonyms will not match old rows.

### The four questions, and the SQL behind them

**Invite preview to join.** Previews are anonymous (a daily visitor pseudonym), so this is a pooled ratio, not a per visitor funnel: joins through the link, on Pacts that had been previewed, over distinct daily previews.

```sql
SELECT COUNT(DISTINCT p.actor || p.pact) AS previews,
       COUNT(DISTINCT j.actor || j.pact) FILTER (WHERE j.props->>'via' = 'link') AS joins_by_link
FROM product_events p
LEFT JOIN product_events j ON j.name = 'pact_joined' AND j.pact = p.pact AND j.occurred_at >= p.occurred_at
WHERE p.name = 'invite_previewed';
```

Joins from a direct invite (`via = 'invite'`) are reported separately: those people never needed the preview.

**Join to first meaningful action.** Per person per Pact: the first `contribution_completed`, `task_claimed` or `task_completed` after `pact_joined`, with the share who did so within 24 hours and 7 days and the median time.

```sql
WITH j AS (SELECT actor, pact, MIN(occurred_at) AS joined_at FROM product_events WHERE name = 'pact_joined' GROUP BY 1, 2)
SELECT COUNT(*) AS joined, COUNT(e.first_action) AS acted
FROM j LEFT JOIN LATERAL (
  SELECT MIN(occurred_at) AS first_action FROM product_events e
   WHERE e.actor = j.actor AND e.pact = j.pact AND e.occurred_at >= j.joined_at
     AND e.name IN ('contribution_completed', 'task_claimed', 'task_completed')) e ON true;
```

**Pact completion rate.** Of Pacts created at least N days ago (default 14, so young Pacts do not drag it down), the share that were funded, that ran to release, and that kept a memory.

```sql
SELECT COUNT(*) AS created,
       COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM product_events f WHERE f.name = 'pact_funded' AND f.pact = c.pact)) AS funded
FROM product_events c WHERE c.name = 'pact_created' AND c.occurred_at <= now() - interval '14 days';
```

**Participants who later create a Pact.** People whose first `pact_joined` came before a `pact_created` of their own. `pact_created.props.was_participant` marks the same thing at the moment of creation, and `second_pact_created` counts organisers who came back.

```sql
WITH j AS (SELECT actor, MIN(occurred_at) AS first_join FROM product_events WHERE name = 'pact_joined' GROUP BY 1)
SELECT COUNT(*) AS participants,
       COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM product_events c WHERE c.name = 'pact_created' AND c.actor = j.actor AND c.occurred_at > j.first_join)) AS later_created
FROM j;
```

## Limits to keep in mind

- Preview to join is a ratio of counts, not a conversion of the same people.
- Wallet and direct payments are not told apart in events (the activity feed does not record it).
- Guest transfers appear as `contribution_completed` with `guest = true` and no actor.
- A beta of a few dozen groups gives rough rates. Read the counts before the percentages.
