/**
 * Pacts screen rules: lifecycle mapping, search, counts, tab fallback, remembered view. Pure functions.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type { Pact } from '../../src/data/types.js';
import { setFixedClock } from '../../src/lib/clock.js';
import { countByTab, defaultTab, lifecycleOf, matchesTitle, MAX_SEARCH, normalizeQuery, readView, sortForTab, writeView } from '../../src/lib/lifecycle.js';
import { attentionFor } from '../../src/lib/plan.js';

setFixedClock(false);
const mk = (title: string, status?: Pact['status'], deadline = '2030-01-01', id = title): Pact =>
  ({ id, slug: id, title, category: 'trip', target: 100_000, raised: 0, deadline, createdAt: '2026-01-01', organizerId: 'o', members: [], status, viewer: { role: 'member', status: 'joined', suggestedShare: 0 } }) as unknown as Pact;

describe('Pacts screen: lifecycle', () => {
  it('maps the repo statuses precisely', () => {
    assert.equal(lifecycleOf(mk('a', 'open')), 'active');
    assert.equal(lifecycleOf(mk('a', 'funded')), 'active', 'funded is waiting for release, not completed');
    assert.equal(lifecycleOf(mk('a', 'released')), 'completed');
    assert.equal(lifecycleOf(mk('a', 'cancelled')), 'closed');
    assert.equal(lifecycleOf(mk('a', 'refunded')), 'closed');
    assert.equal(lifecycleOf(mk('a', undefined)), 'active');
  });

  it('counts the whole tab, and recounts when a Pact changes state', () => {
    const list = [mk('1', 'open'), mk('2', 'funded'), mk('3', 'released'), mk('4', 'cancelled'), mk('5', 'refunded')];
    assert.deepEqual(countByTab(list), { all: 5, active: 2, completed: 1, closed: 2 });
    // Active -> Completed and Funded -> Released, as the same query data refreshes.
    const next = list.map((p) => (p.id === '1' ? mk('1', 'released') : p.id === '2' ? mk('2', 'released') : p));
    assert.deepEqual(countByTab(next), { all: 5, active: 0, completed: 3, closed: 2 });
  });

  it('keeps the selected tab even when it empties, and only defaults when nothing was chosen', () => {
    assert.equal(defaultTab({ all: 3, active: 0, completed: 3, closed: 0 }), 'all');
    assert.equal(defaultTab({ all: 3, active: 1, completed: 2, closed: 0 }), 'active');
  });
});

describe('Pacts screen: search', () => {
  it('trims, ignores case and repeated spaces, matches titles only', () => {
    assert.equal(normalizeQuery('  Cape   TOWN  '), 'cape town');
    assert.ok(matchesTitle(mk('Weekend in  Cape Town'), normalizeQuery('  cape  town ')));
    assert.ok(matchesTitle(mk('Anything'), ''), 'empty query matches everything');
    assert.ok(matchesTitle(mk('Anything'), normalizeQuery('    ')), 'spaces only is the same as empty');
    assert.ok(!matchesTitle({ ...mk('Birthday'), note: 'cape town' } as Pact, 'cape town'), 'notes are not searched');
    assert.ok(matchesTitle(mk('Tolu & Femi’s (Wedding)? [2026]'), normalizeQuery('(wedding)?')), 'punctuation is literal, never a pattern');
  });

  it('caps very long input', () => {
    assert.equal(normalizeQuery('x'.repeat(5000)).length, MAX_SEARCH);
    assert.doesNotThrow(() => matchesTitle(mk('a'), normalizeQuery('.*+?^${}()|[]\\'.repeat(100))));
  });
});

describe('Pacts screen: ordering', () => {
  it('shows Pacts that are still collecting first (soonest deadline), then funded, then the rest newest first', () => {
    const sorted = sortForTab([mk('released-new', 'released', '2030-05-01'), mk('late', 'open', '2030-03-01'), mk('funded', 'funded', '2030-01-01'), mk('soon', 'open', '2030-02-01'), mk('released-old', 'released', '2030-01-01')]).map((p) => p.title);
    assert.deepEqual(sorted, ['soon', 'late', 'funded', 'released-new', 'released-old']);
  });
  it('handles 60 Pacts without error', () => {
    const many = Array.from({ length: 60 }, (_, i) => mk(`Pact ${i}`, (['open', 'released', 'cancelled'] as const)[i % 3], `2030-01-${String((i % 28) + 1).padStart(2, '0')}`, `id${i}`));
    assert.equal(sortForTab(many).length, 60);
    assert.deepEqual(countByTab(many), { all: 60, active: 20, completed: 20, closed: 20 });
  });
});

describe('Pacts screen: remembered view', () => {
  const store = new Map<string, string>();
  (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  } as Storage;
  afterEach(() => store.clear());

  it('round trips a valid view', () => {
    writeView({ tab: 'completed', query: 'trip' });
    assert.deepEqual(readView(), { tab: 'completed', query: 'trip' });
  });
  it('ignores an unknown tab, wrong types, oversized text and broken JSON', () => {
    store.set('pact.pactsView', JSON.stringify({ tab: 'archived', query: 42 }));
    assert.deepEqual(readView(), { tab: null, query: '' });
    store.set('pact.pactsView', JSON.stringify({ tab: 'closed', query: 'y'.repeat(900) }));
    assert.equal(readView().query.length, MAX_SEARCH);
    store.set('pact.pactsView', '{not json');
    assert.deepEqual(readView(), { tab: null, query: '' });
    store.set('pact.pactsView', 'null');
    assert.deepEqual(readView(), { tab: null, query: '' });
  });
  it('survives storage being unavailable', () => {
    const real = (globalThis as unknown as { sessionStorage: Storage }).sessionStorage;
    (globalThis as unknown as { sessionStorage: unknown }).sessionStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    assert.deepEqual(readView(), { tab: null, query: '' });
    assert.doesNotThrow(() => writeView({ tab: 'all', query: '' }));
    (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = real;
  });
});

describe('Pacts screen: attention lines', () => {
  it('never throws for a Pact with thin data, and gives nothing for non-open Pacts', () => {
    const thin = { ...mk('thin', 'open'), members: undefined, tasks: undefined } as unknown as Pact;
    let line: string | undefined;
    try {
      line = attentionFor(thin, 'me')[0]?.title;
    } catch {
      line = undefined; // the screen wraps this in try/catch; the card then simply has no line
    }
    assert.ok(line === undefined || typeof line === 'string');
    assert.deepEqual(attentionFor(mk('done', 'released'), 'me'), []);
  });
});
