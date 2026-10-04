import { NGN } from '../../../shared/policy.js';
import type { Ctx } from '../context.js';
import { hashSecret, randomCode } from '../lib/crypto.js';
import { addDays, lagosToday } from '../lib/time.js';
import { createAccount, post, systemAccountId } from '../modules/ledger.js';
import { colorFor } from '../modules/pacts.js';

/** Demo sign-in: any of these numbers, the code shown in the app, and PIN 1357. */
export const DEMO_PIN = '1357';

const people = [
  { key: 'abraham', first: 'Abraham', last: 'Okafor', tint: 'mint', color: '#3dd68c', tier: 2 },
  { key: 'sarah', first: 'Sarah', last: 'Adeyemi', tint: 'peach', color: '#ff7a5c', tier: 2 },
  { key: 'david', first: 'David', last: 'Eze', tint: 'sky', color: '#4da3ff', tier: 1 },
  { key: 'maya', first: 'Maya', last: 'Bello', tint: 'lilac', color: '#9b7bff', tier: 1 },
  { key: 'tolu', first: 'Tolu', last: 'Martins', tint: 'sand', color: '#ffc53d', tier: 1 },
  { key: 'kemi', first: 'Kemi', last: 'Adebayo', tint: 'mint', color: '#ff6fb5', tier: 2 },
  { key: 'femi', first: 'Femi', last: 'Johnson', tint: 'peach', color: '#22b8a6', tier: 1 },
  { key: 'zara', first: 'Zara', last: 'Musa', tint: 'sky', color: '#ff9f43', tier: 1 },
  { key: 'james', first: 'James', last: 'Obi', tint: 'lilac', color: '#4da3ff', tier: 2 },
  { key: 'ada', first: 'Ada', last: 'Nwosu', tint: 'sand', color: '#ff6fb5', tier: 1 },
  { key: 'chidi', first: 'Chidi', last: 'Okeke', tint: 'sky', color: '#ffc53d', tier: 1 },
] as const;

export const demoPhone = (i: number) => `+23480100000${String(i + 1).padStart(2, '0')}`;

type Key = (typeof people)[number]['key'];

/** Contributions are listed oldest first; `hoursAgo` spreads them over the last weeks. */
const pactsSeed: {
  title: string;
  category: string;
  target: number;
  days: number;
  organizer: Key;
  note?: string;
  contributions: [Key, number, number][];
  /** What the money covers, in the order raised money fills it. */
  budget?: [string, number][];
  tasks?: [string, Key | null, 'open' | 'in_progress' | 'done', string?][];
  participation?: Partial<Record<Key, 'money' | 'task' | 'both' | 'later'>>;
}[] = [
  {
    title: "Sarah's Birthday",
    category: 'birthday',
    target: 500_000,
    days: 12,
    organizer: 'abraham',
    note: 'Dinner at Nok and the gift she keeps talking about.',
    contributions: [
      ['kemi', 30_000, 400], ['femi', 30_000, 380], ['zara', 30_000, 300], ['tolu', 35_000, 220], ['abraham', 15_000, 150],
      ['maya', 45_000, 40], ['sarah', 50_000, 64], ['david', 20_000, 30], ['abraham', 25_000, 15], ['david', 40_000, 2],
    ],
    budget: [['Dinner at Nok', 180_000], ['Cake', 70_000], ['Gift', 150_000], ['Photography', 100_000]],
    tasks: [
      ['Book the restaurant', 'maya', 'done', 'Dinner at Nok'],
      ['Pick up the cake', 'tolu', 'in_progress', 'Cake'],
      ['Buy the gift', 'abraham', 'open', 'Gift'],
      ['Find a photographer', null, 'open', 'Photography'],
    ],
    participation: { maya: 'both', tolu: 'both' },
  },
  {
    title: 'Weekend in Cape Town',
    category: 'trip',
    target: 1_200_000,
    days: 77,
    organizer: 'james',
    contributions: [['james', 200_000, 900], ['ada', 200_000, 800], ['chidi', 150_000, 700], ['abraham', 150_000, 500], ['abraham', 30_000, 21], ['james', 50_000, 2.5]],
    budget: [['Flights', 600_000], ['Accommodation', 400_000], ['Activities', 200_000]],
    tasks: [
      ['Book the flights', 'james', 'in_progress', 'Flights'],
      ['Choose the accommodation', null, 'open', 'Accommodation'],
      ['Plan the wine tour', 'ada', 'open', 'Activities'],
    ],
  },
  {
    title: 'Wedding Gift',
    category: 'wedding',
    target: 250_000,
    days: 57,
    organizer: 'kemi',
    note: 'For Tolu and Femi.',
    contributions: [['kemi', 40_000, 300], ['abraham', 50_000, 200], ['maya', 40_000, 160], ['zara', 30_000, 140], ['kemi', 20_000, 71]],
    tasks: [
      ['Choose the gift from their registry', 'kemi', 'open'],
      ['Collect everyone’s notes for the card', 'maya', 'done'],
    ],
  },
  {
    title: 'New Apartment',
    category: 'household',
    target: 600_000,
    days: 112,
    organizer: 'abraham',
    contributions: [['abraham', 220_000, 1200], ['david', 100_000, 1100], ['david', 100_000, 120]],
    budget: [['Deposit', 400_000], ['Furniture', 200_000]],
    tasks: [
      ['Sign the lease', 'abraham', 'done', 'Deposit'],
      ['Book movers', 'david', 'open'],
    ],
  },
];

export async function seedDemo(ctx: Ctx) {
  const { db } = ctx;
  const existing = await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM users');
  if (existing.rows[0].n > 0) return false;

  const pinHash = await hashSecret(DEMO_PIN);
  const now = ctx.now().getTime();
  const at = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000);

  await db.tx(async (q) => {
    const ids = {} as Record<Key, string>;
    const wallets = {} as Record<Key, string>;
    const clearing = await systemAccountId(q, 'provider_clearing');

    for (const [i, p] of people.entries()) {
      const r = await q.query<{ id: string }>(
        `INSERT INTO users (phone, first_name, last_name, color, tint, photo_url, pin_hash, kyc_tier, bvn_last4, referral_code, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [demoPhone(i), p.first, p.last, p.color, p.tint, null, pinHash, p.tier, p.tier > 1 ? '4821' : null, randomCode(7), at(2000)],
      );
      ids[p.key] = r.rows[0].id;
      await q.query(`INSERT INTO user_identities (user_id, provider, provider_subject, phone, verified_at) VALUES ($1, 'phone', $2, $2, $3)`, [ids[p.key], demoPhone(i), at(2000)]);
      wallets[p.key] = await createAccount(q, 'user_wallet', ids[p.key]);
    }

    // Everyone tops up enough for their contributions, plus a balance to play with.
    const spend = {} as Record<Key, number>;
    for (const pact of pactsSeed) for (const [k, amt] of pact.contributions) spend[k] = (spend[k] ?? 0) + amt;
    for (const p of people) {
      const extra = p.key === 'abraham' ? 85_000 : 40_000;
      const amount = ((spend[p.key] ?? 0) + extra) * NGN;
      const reference = `seed_${p.key}_${randomCode(6)}`;
      const { transactionId } = await post(q, {
        kind: 'topup',
        reference: `topup:${reference}`,
        description: 'Top up by bank transfer',
        userId: ids[p.key],
        postings: [{ accountId: clearing, amount: -amount }, { accountId: wallets[p.key], amount }],
      });
      await q.query(
        `INSERT INTO topups (user_id, reference, provider, channel, amount, status, ledger_tx_id, created_at, completed_at)
         VALUES ($1, $2, 'sandbox', 'bank_transfer', $3, 'succeeded', $4, $5, $5)`,
        [ids[p.key], reference, amount, transactionId, at(1900)],
      );
      await q.query('UPDATE ledger_transactions SET created_at = $2 WHERE id = $1', [transactionId, at(1900)]);
    }

    const today = lagosToday(ctx.now());
    for (const pact of pactsSeed) {
      const pactId = (await q.query<{ id: string }>('SELECT gen_random_uuid() AS id')).rows[0].id;
      const account = await createAccount(q, 'pact_pool', pactId);
      const first = Math.max(...pact.contributions.map((c) => c[2])) + 24;
      const slug = `${pact.title.toLowerCase().replace(/['’]s\b/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${randomCode(4).toLowerCase()}`;
      await q.query(
        `INSERT INTO pacts (id, slug, invite_code, title, note, category, target_amount, deadline, organizer_id, account_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [pactId, slug, randomCode(8), pact.title, pact.note ?? null, pact.category, pact.target * NGN, addDays(today, pact.days), ids[pact.organizer], account, at(first)],
      );
      await q.query(`INSERT INTO activities (pact_id, actor_id, type, created_at) VALUES ($1, $2, 'created', $3)`, [pactId, ids[pact.organizer], at(first)]);

      const members: Key[] = [pact.organizer, ...pact.contributions.map((c) => c[0])].filter((k, i, a) => a.indexOf(k) === i);
      for (const [i, k] of members.entries()) {
        const joinedAt = at(first - 1 - i);
        await q.query(
          `INSERT INTO pact_members (pact_id, user_id, role, status, joined_at, created_at, participation, color) VALUES ($1, $2, $3, 'joined', $4, $4, $5, $6)`,
          [pactId, ids[k], k === pact.organizer ? 'organizer' : 'member', joinedAt, pact.participation?.[k] ?? (k === pact.organizer ? 'both' : 'money'), await colorFor(q, pactId, ids[k])],
        );
        if (k !== pact.organizer) await q.query(`INSERT INTO activities (pact_id, actor_id, type, created_at) VALUES ($1, $2, 'join', $3)`, [pactId, ids[k], joinedAt]);
      }

      let raised = 0;
      for (const [k, amt, hoursAgo] of pact.contributions) {
        const amount = amt * NGN;
        raised += amount;
        const { transactionId } = await post(q, {
          kind: 'contribution',
          reference: `contribution:${pactId}:${randomCode(12)}`,
          description: `Contribution to ${pact.title}`,
          userId: ids[k],
          pactId,
          postings: [{ accountId: wallets[k], amount: -amount }, { accountId: account, amount }],
        });
        await q.query('UPDATE ledger_transactions SET created_at = $2 WHERE id = $1', [transactionId, at(hoursAgo)]);
        await q.query('UPDATE pact_members SET contributed = contributed + $3 WHERE pact_id = $1 AND user_id = $2', [pactId, ids[k], amount]);
        await q.query(`INSERT INTO activities (pact_id, actor_id, type, amount, created_at) VALUES ($1, $2, 'contribution', $3, $4)`, [pactId, ids[k], amount, at(hoursAgo)]);
      }
      await q.query('UPDATE pacts SET raised_amount = $2 WHERE id = $1', [pactId, raised]);

      const budgetIds = new Map<string, string>();
      for (const [i, [name, amount]] of (pact.budget ?? []).entries()) {
        const b = await q.query<{ id: string }>('INSERT INTO budget_items (pact_id, name, amount, position, created_by, created_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id', [
          pactId, name, amount * NGN, i, ids[pact.organizer], at(first),
        ]);
        budgetIds.set(name, b.rows[0].id);
      }
      for (const [i, [title, who, status, line]] of (pact.tasks ?? []).entries()) {
        const created = at(first - 2 - i);
        await q.query(
          `INSERT INTO tasks (pact_id, title, budget_item_id, assignee_id, status, created_by, created_at, completed_at, completed_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [pactId, title, line ? budgetIds.get(line) ?? null : null, who ? ids[who] : null, status, ids[pact.organizer], created,
            status === 'done' ? at(Math.max(1, first / 3)) : null, status === 'done' && who ? ids[who] : null],
        );
        if (who) await q.query(`INSERT INTO activities (pact_id, actor_id, type, detail, created_at) VALUES ($1, $2, 'task_claimed', $3, $4)`, [pactId, ids[who], title, at(first / 2 - i)]);
        if (status === 'done' && who) await q.query(`INSERT INTO activities (pact_id, actor_id, type, detail, created_at) VALUES ($1, $2, 'task_done', $3, $4)`, [pactId, ids[who], title, at(Math.max(1, first / 3))]);
      }
    }

    await q.query(
      `INSERT INTO notifications (user_id, type, title, body, created_at) VALUES
       ($1, 'contribution', 'New contribution', 'David added ₦40,000 to Sarah''s Birthday.', $2),
       ($1, 'topup', 'Wallet topped up', '₦85,000 is ready for your next Pact.', $3)`,
      [ids.abraham, at(2), at(1900)],
    );
  });
  ctx.log.info(`seeded demo data: sign in with ${demoPhone(0)} and PIN ${DEMO_PIN}`);
  return true;
}
