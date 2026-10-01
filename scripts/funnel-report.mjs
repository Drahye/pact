// Beta funnel report from the first-party product events.
// Usage (reads the same environment as the server, so DATABASE_URL points it at staging):
//   node --import tsx scripts/funnel-report.mjs [--since 2026-10-01] [--min-age 14] [--json]
// With no DATABASE_URL it reads the local embedded database (stop `npm run dev` first).
import { loadConfig } from '../server/src/config.js';
import { createDb } from '../server/src/db/index.js';
import { migrate } from '../server/src/db/migrate.js';
import { syncProductEvents } from '../server/src/modules/events.js';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const since = new Date(arg('since', '1970-01-01'));
const minAgeDays = Number(arg('min-age', 14));
const asJson = process.argv.includes('--json');

const config = loadConfig();
const db = await createDb(config);
await migrate(db);
await syncProductEvents({ config, db, now: () => new Date(), log: { warn() {}, error() {}, info() {}, debug() {} } });

const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);
const out = { since: since.toISOString().slice(0, 10), generatedAt: new Date().toISOString() };

out.events = Object.fromEntries((await db.query('SELECT name, COUNT(*)::int AS n FROM product_events WHERE occurred_at >= $1 GROUP BY name ORDER BY name', [since])).rows.map((r) => [r.name, r.n]));

// 1. Invite preview -> join. Pooled, not per visitor: previews are anonymous daily pseudonyms.
const prev = await one(`SELECT COUNT(*)::int AS previews, COUNT(DISTINCT pact)::int AS pacts_previewed FROM product_events WHERE name = 'invite_previewed' AND occurred_at >= $1`, [since]);
const viaLink = await one(
  `SELECT COUNT(*)::int AS joins FROM product_events j
    WHERE j.name = 'pact_joined' AND j.props->>'via' = 'link' AND j.occurred_at >= $1
      AND EXISTS (SELECT 1 FROM product_events p WHERE p.name = 'invite_previewed' AND p.pact = j.pact AND p.occurred_at <= j.occurred_at)`,
  [since],
);
const viaInvite = await one(`SELECT COUNT(*)::int AS joins FROM product_events WHERE name = 'pact_joined' AND props->>'via' = 'invite' AND occurred_at >= $1`, [since]);
out.invite_preview_to_join = { ...prev, joins_after_preview: viaLink.joins, joins_from_direct_invites: viaInvite.joins, preview_to_join_pct: pct(viaLink.joins, prev.previews) };

// 2. Join -> first meaningful action (a contribution, claiming a task, or finishing one), per person per Pact.
const act = await one(
  `WITH j AS (SELECT actor, pact, MIN(occurred_at) AS joined_at FROM product_events WHERE name = 'pact_joined' AND occurred_at >= $1 GROUP BY actor, pact),
        a AS (SELECT j.actor, j.pact, j.joined_at, MIN(e.occurred_at) AS first_action
                FROM j LEFT JOIN product_events e ON e.actor = j.actor AND e.pact = j.pact AND e.occurred_at >= j.joined_at
                 AND e.name IN ('contribution_completed', 'task_claimed', 'task_completed') GROUP BY j.actor, j.pact, j.joined_at)
   SELECT COUNT(*)::int AS joined,
          COUNT(first_action)::int AS acted,
          COUNT(*) FILTER (WHERE first_action <= joined_at + interval '24 hours')::int AS acted_24h,
          COUNT(*) FILTER (WHERE first_action <= joined_at + interval '7 days')::int AS acted_7d,
          ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (first_action - joined_at)) / 3600))::numeric, 1) AS median_hours
     FROM a`,
  [since],
);
out.join_to_first_action = { ...act, acted_pct: pct(act.acted, act.joined), acted_24h_pct: pct(act.acted_24h, act.joined), acted_7d_pct: pct(act.acted_7d, act.joined) };

// 3. Pact completion: of Pacts old enough to have had their chance, how many were funded, and how many ran to the end.
const comp = await one(
  `SELECT COUNT(*)::int AS pacts_created,
          COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM product_events f WHERE f.name = 'pact_funded' AND f.pact = c.pact))::int AS funded,
          COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM product_events f WHERE f.name = 'pact_completed' AND f.pact = c.pact))::int AS completed,
          COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM product_events m WHERE m.name = 'memory_added' AND m.pact = c.pact))::int AS with_memory
     FROM product_events c
    WHERE c.name = 'pact_created' AND c.occurred_at >= $1 AND c.occurred_at <= now() - make_interval(days => $2)`,
  [since, minAgeDays],
);
out.pact_completion = { min_age_days: minAgeDays, ...comp, funded_pct: pct(comp.funded, comp.pacts_created), completed_pct: pct(comp.completed, comp.pacts_created), memory_pct: pct(comp.with_memory, comp.funded) };

// 4. Participants who later create a Pact of their own.
const later = await one(
  `WITH j AS (SELECT actor, MIN(occurred_at) AS first_join FROM product_events WHERE name = 'pact_joined' AND actor IS NOT NULL AND occurred_at >= $1 GROUP BY actor)
   SELECT COUNT(*)::int AS participants,
          COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM product_events c WHERE c.name = 'pact_created' AND c.actor = j.actor AND c.occurred_at > j.first_join))::int AS later_created
     FROM j`,
  [since],
);
const second = await one(`SELECT COUNT(*)::int AS n FROM product_events WHERE name = 'second_pact_created' AND occurred_at >= $1`, [since]);
out.participants_who_create = { ...later, later_created_pct: pct(later.later_created, later.participants), organisers_with_second_pact: second.n };

await db.close();
if (asJson) console.log(JSON.stringify(out, null, 2));
else {
  const line = (k, v) => console.log(`  ${k.padEnd(34)} ${v ?? 'n/a'}`);
  console.log(`PACT beta funnel since ${out.since}\n\nEvents`);
  for (const [k, v] of Object.entries(out.events)) line(k, v);
  for (const [title, key] of [['Invite preview -> join', 'invite_preview_to_join'], ['Join -> first meaningful action', 'join_to_first_action'], [`Pact completion (created at least ${minAgeDays} days ago)`, 'pact_completion'], ['Participants who later create a Pact', 'participants_who_create']]) {
    console.log(`\n${title}`);
    for (const [k, v] of Object.entries(out[key])) if (k !== 'min_age_days') line(k, v);
  }
}
