/**
 * The communication templates: the words, the data rules and the registry. The screens themselves are checked in a
 * browser (scripts/communications-check.mjs); everything that can go wrong without a screen is checked here.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';
import type { NotificationDTO } from '../../shared/contracts.js';
import { contentFor } from '../../src/components/communication/copy.js';
import { dataFor, kindFor } from '../../src/components/communication/fromNotification.js';
import { COMMUNICATION_KINDS, type CommunicationKind } from '../../src/components/communication/model.js';
import { samples } from '../../src/components/communication/samples.js';
import { cleanMeta } from '../src/modules/platform.js';

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const ROBOTIC = /successfully|has been processed|transaction|task item|user has|pact has been/i;

describe('communication templates', () => {
  it('there is a template for every kind, and the registry maps each one', () => {
    assert.equal(new Set(COMMUNICATION_KINDS).size, 16);
    const registry = read('src/components/communication/registry.tsx');
    const files = readdirSync(new URL('../../src/components/communication/templates/', import.meta.url));
    for (const k of COMMUNICATION_KINDS) {
      assert.match(registry, new RegExp(`\\b${k}:`), `registry maps ${k}`);
      assert.ok(samples[k], `sample data for ${k}`);
    }
    assert.equal(files.filter((f) => f.endsWith('Template.tsx')).length, 16, 'one file per template');
  });

  it('every message is short, human and complete with its sample data', () => {
    for (const k of COMMUNICATION_KINDS) {
      const c = contentFor(k, samples[k]);
      assert.ok(c.title.length > 3 && c.title.length <= 90, `${k} title: ${c.title}`);
      assert.ok(c.message.length > 10 && c.message.length <= 200, `${k} message length`);
      for (const text of [c.title, c.message, c.eyebrow, c.badge.label, c.primary.label, c.secondary?.label ?? '']) {
        assert.ok(!/undefined|NaN|\[object/.test(text), `${k}: "${text}" has a leaked value`);
        assert.ok(!text.includes('—') && !text.includes('–'), `${k}: no dashes used as punctuation: "${text}"`);
        assert.ok(!ROBOTIC.test(text), `${k}: robotic wording in "${text}"`);
      }
      assert.ok(c.badge.label.length > 0, 'the state is written out, not only coloured');
    }
  });

  it('the wording is the wording the brief asked for', () => {
    assert.equal(contentFor('member_joined', samples.member_joined).title, 'David joined Sarah’s Birthday');
    assert.equal(contentFor('contribution', samples.contribution).title, 'Ada added ₦25,000');
    assert.equal(contentFor('payment_approval', samples.payment_approval).title, 'Hotel payment is ready for your approval');
    assert.equal(contentFor('funded', samples.funded).title, 'Sarah’s Birthday is fully funded');
    assert.match(contentFor('funded', samples.funded).message, /The money is ready/);
    assert.equal(contentFor('completed', samples.completed).title, 'You completed the Pact');
    assert.equal(contentFor('completed', samples.completed).eyebrow, 'We made it happen');
  });

  it('buttons only ever lead inside PACT', () => {
    for (const k of COMMUNICATION_KINDS) {
      const c = contentFor(k, samples[k]);
      for (const cta of [c.primary, c.secondary]) if (cta) assert.match(cta.to, /^\/(app|#)/, `${k}: ${cta.to}`);
    }
  });

  it('missing details fall back to calm wording instead of blanks', () => {
    for (const k of COMMUNICATION_KINDS) {
      const c = contentFor(k, { pactName: '' });
      for (const text of [c.title, c.message]) assert.ok(!/undefined|NaN|₦NaN|\s{2,}/.test(text) && text.trim().length > 0, `${k}: "${text}"`);
    }
  });

  it('tone matches the moment: milestones celebrate, approvals need you, failures are an alert, the rest is calm', () => {
    const tone = (k: CommunicationKind) => contentFor(k, samples[k]).tone;
    assert.equal(tone('funded'), 'celebrate');
    assert.equal(tone('completed'), 'celebrate');
    assert.equal(tone('payment_approval'), 'action');
    assert.equal(tone('payment_failed'), 'alert');
    assert.equal(tone('payment_success'), 'calm');
  });

  it('grouped notifications say how many, and drop single-person details', () => {
    assert.equal(contentFor('contribution', { ...samples.contribution, count: 3 }).title, '3 new contributions');
    assert.equal(contentFor('member_joined', { ...samples.member_joined, count: 2 }).title, '2 people joined Sarah’s Birthday');
  });

  describe('from a notification', () => {
    const note = (over: Partial<NotificationDTO>): NotificationDTO => ({ id: 'n1', type: 'funded', title: 't', body: 'b', pactId: 'p1', pactTitle: 'Sarah’s Birthday', refId: null, count: 1, meta: {}, readAt: null, createdAt: '2026-10-02T10:00:00Z', ...over });

    it('only types that have a template get one', () => {
      assert.equal(kindFor(note({ type: 'funded' })), 'funded');
      assert.equal(kindFor(note({ type: 'comment' })), 'reply');
      assert.equal(kindFor(note({ type: 'security' })), null);
      assert.equal(kindFor(note({ type: 'topup' })), null);
      assert.equal(kindFor(note({ type: 'approval', meta: { amount: 25_000_00, purpose: 'Hotel' } })), 'payment_approval');
      assert.equal(kindFor(note({ type: 'approval', meta: {} })), null, 'a release approval has no template');
    });

    it('amounts arrive in kobo and are shown in naira; threads open their thread', () => {
      const d = dataFor(note({ type: 'approval', meta: { actor: 'Abraham', amount: 250_000_00, purpose: 'Hotel', payee: 'Eko Suites' } }));
      assert.equal(d.amount, 250_000);
      assert.equal(contentFor('payment_approval', d).title, 'Hotel payment is ready for your approval');
      const thread = dataFor(note({ type: 'comment', refId: 'a1', meta: { actor: 'David', preview: 'On my way', about: 'the venue update' } }));
      assert.equal(contentFor('reply', thread).primary.to, '/app/pact/p1?thread=a1');
    });
  });

  it('notification details keep only the known, plain, short values', () => {
    const m = cleanMeta({ actor: 'Ada', amount: 25_000_00.4, purpose: 'x'.repeat(500), accountNumber: '0123456789', bvn: '22222222222', pinned: true } as never);
    assert.deepEqual(Object.keys(m).sort(), ['actor', 'amount', 'pinned', 'purpose']);
    assert.equal(m.amount, 2_500_000);
    assert.equal(m.purpose!.length, 200);
  });
});
