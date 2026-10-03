/** Small behaviours the audit asked to pin down: one answer for "Start a Pact", and an error message that doesn't talk about money. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startPactPath } from '../../src/lib/startPactPath.js';
import { setup } from './helpers.js';

describe('Start a Pact has one destination rule', () => {
  const C = '3f1c2d4e-0000-4000-8000-000000000001';
  const P = '9a8b7c6d-0000-4000-8000-000000000002';
  it('guided start for someone who has never organised one, the full form otherwise', () => {
    assert.equal(startPactPath({ hasCreated: false }), '/app/start');
    assert.equal(startPactPath({ hasCreated: true }), '/app/create');
    assert.equal(startPactPath({ hasCreated: null }), '/app/create', 'unknown yet: the full form works for everyone');
  });
  it('keeps the Circle on either path', () => {
    assert.equal(startPactPath({ hasCreated: false, circleId: C }), `/app/start?circle=${C}`);
    assert.equal(startPactPath({ hasCreated: true, circleId: C }), `/app/create?circle=${C}`);
  });
  it('a Plan always goes to the full form, with the Plan', () => {
    assert.equal(startPactPath({ hasCreated: false, planId: P }), `/app/create?plan=${P}`);
    assert.equal(startPactPath({ hasCreated: true, planId: P, circleId: C }), `/app/create?plan=${P}`);
  });
});

describe('the generic server error', () => {
  let t: Awaited<ReturnType<typeof setup>>;
  before(async () => (t = await setup()));
  after(async () => t.close());
  it('does not claim anything about charges', async () => {
    const a = await t.signIn('08032220001', { firstName: 'Err', lastName: 'Test', pin: '2468' });
    const orig = t.ctx.db.query.bind(t.ctx.db);
    t.ctx.db.query = ((sql: string, ...rest: unknown[]) => (/FROM pact_payouts po/.test(String(sql)) ? Promise.reject(new Error('boom')) : (orig as (...x: unknown[]) => unknown)(sql, ...rest))) as never;
    const r = await t.call('GET', '/home', a.accessToken);
    t.ctx.db.query = orig as never;
    assert.equal(r.status, 500);
    assert.equal(r.body.error.message, 'Something went wrong on our side. Try again.');
  });
});
