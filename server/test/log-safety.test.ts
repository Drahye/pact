/** Capability links carry a secret in the path. It must never reach the request log; the route, method, status and request id still do. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { sanitizeUrl } from '../src/lib/logSafe.js';
import { setup } from './helpers.js';

const FAKE = 'FAKEcapabilityTOKEN0123456789abcdefghijkLMNOP';

describe('request logs never keep a capability token', () => {
  const lines: string[] = [];
  let t: Awaited<ReturnType<typeof setup>>;
  before(async () => {
    t = await setup({ logStream: { write: (l) => void lines.push(l) } });
  });
  after(async () => t.close());

  it('sanitizes every capability path shape and leaves other URLs alone', () => {
    const cases: [string, string][] = [
      [`/api/ask-links/${FAKE}`, '/api/ask-links/[REDACTED]'],
      [`/api/plan-links/${FAKE}/rsvp`, '/api/plan-links/[REDACTED]/rsvp'],
      [`/api/split-links/${FAKE}/mine?x=1`, '/api/split-links/[REDACTED]/mine?x=1'],
      [`/api/recap-links/${FAKE}`, '/api/recap-links/[REDACTED]'],
      [`/api/circle-invites/${FAKE}/join`, '/api/circle-invites/[REDACTED]/join'],
      [`/api/invites/ABCD2345`, '/api/invites/[REDACTED]'],
      [`/a/${FAKE}`, '/a/[REDACTED]'],
      [`/p/${FAKE}`, '/p/[REDACTED]'],
      [`/s/${FAKE}?utm=1`, '/s/[REDACTED]?utm=1'],
      [`/r/${FAKE}`, '/r/[REDACTED]'],
      [`/app/c/${FAKE}`, '/app/c/[REDACTED]'],
      [`/app/ask/${FAKE}`, '/app/ask/[REDACTED]'],
      ['/api/home', '/api/home'],
      ['/api/circles/abc/plans', '/api/circles/abc/plans'],
      ['/app/home', '/app/home'],
    ];
    for (const [a, b] of cases) assert.equal(sanitizeUrl(a), b);
  });

  it('logs the requests for Ask, Plan, Split, Recap and Circle invite links without the token', async () => {
    for (const url of [`/api/ask-links/${FAKE}`, `/api/plan-links/${FAKE}`, `/api/split-links/${FAKE}`, `/api/recap-links/${FAKE}`, `/api/circle-invites/${FAKE}`, `/api/split-links/${FAKE}/mine`]) {
      await t.app.inject({ method: 'GET', url });
    }
    await t.app.inject({ method: 'POST', url: `/api/circle-invites/${FAKE}/join`, payload: {} });
    await t.app.inject({ method: 'GET', url: `/a/${FAKE}` });
    const out = lines.join('\n');
    assert.ok(out.length > 0, 'something was logged');
    assert.ok(!out.includes(FAKE), 'the raw token is not in the log');
    for (const route of ['ask-links', 'plan-links', 'split-links', 'recap-links', 'circle-invites']) assert.ok(out.includes(`/api/${route}/[REDACTED]`), `${route} is logged with the token redacted`);
    const entries = lines.map((l) => JSON.parse(l)).filter((e) => e.req?.url?.includes('split-links'));
    assert.ok(entries.every((e) => e.reqId && e.req.method), 'method and request id are kept');
    assert.ok(lines.some((l) => /"statusCode":4\d\d/.test(l)), 'status is kept');
  });

  it('a 404 and a rate-limit audit row do not keep the token either', async () => {
    lines.length = 0;
    const r = await t.app.inject({ method: 'GET', url: `/p/${FAKE}` });
    assert.equal(r.statusCode, 404);
    assert.ok(!lines.join('\n').includes(FAKE), 'the unmatched-route message has no token');
    assert.ok(lines.some((l) => l.includes('/p/[REDACTED]')));
    const rows = await t.db.query<{ target_id: string }>(`SELECT target_id FROM audit_log WHERE target_id LIKE '%FAKEcapability%'`);
    assert.equal(rows.rowCount, 0);
  });
});
