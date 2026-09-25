import type { Activity } from './types';

/** Newest first. */
export const seedActivities: Activity[] = [
  { id: 'a1', pactId: 'sarahs-birthday', type: 'contribution', userId: 'david', amount: 40_000, at: '2026-09-25T07:12:00' },
  { id: 'a2', pactId: 'cape-town', type: 'contribution', userId: 'james', amount: 50_000, at: '2026-09-25T06:40:00' },
  { id: 'a3', pactId: 'sarahs-birthday', type: 'join', userId: 'maya', at: '2026-09-24T21:05:00' },
  { id: 'a4', pactId: 'sarahs-birthday', type: 'contribution', userId: 'abraham', amount: 25_000, at: '2026-09-24T18:30:00' },
  { id: 'a5', pactId: 'cape-town', type: 'contribution', userId: 'abraham', amount: 30_000, at: '2026-09-24T12:10:00' },
  { id: 'a6', pactId: 'sarahs-birthday', type: 'contribution', userId: 'sarah', amount: 50_000, at: '2026-09-23T16:45:00' },
  { id: 'a7', pactId: 'wedding-gift', type: 'contribution', userId: 'kemi', amount: 20_000, at: '2026-09-22T10:00:00' },
  { id: 'a8', pactId: 'new-apartment', type: 'contribution', userId: 'david', amount: 100_000, at: '2026-09-20T09:30:00' },
  { id: 'a9', pactId: 'wedding-gift', type: 'join', userId: 'zara', at: '2026-09-19T14:20:00' },
];
