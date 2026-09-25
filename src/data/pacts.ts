import type { Pact } from './types';

/**
 * Fixed "today" so days-left, relative times and the showcase numbers
 * stay identical every time the prototype is opened.
 */
export const TODAY = new Date('2026-09-25T09:00:00');

export const seedPacts: Pact[] = [
  {
    id: 'sarahs-birthday',
    slug: 'sarah-birthday',
    title: "Sarah's Birthday",
    category: 'gift',
    target: 500_000,
    deadline: '2026-10-07',
    createdAt: '2026-09-02',
    organizerId: 'abraham',
    members: [
      { userId: 'sarah', contributed: 50_000, status: 'joined' },
      { userId: 'david', contributed: 60_000, status: 'joined' },
      { userId: 'maya', contributed: 45_000, status: 'joined' },
      { userId: 'abraham', contributed: 40_000, status: 'joined' },
      { userId: 'tolu', contributed: 35_000, status: 'joined' },
      { userId: 'kemi', contributed: 30_000, status: 'joined' },
      { userId: 'femi', contributed: 30_000, status: 'joined' },
      { userId: 'zara', contributed: 30_000, status: 'joined' },
    ], // 320,000
  },
  {
    id: 'cape-town',
    slug: 'weekend-cape-town',
    title: 'Weekend in Cape Town',
    category: 'trip',
    target: 1_200_000,
    deadline: '2026-12-11',
    createdAt: '2026-08-14',
    organizerId: 'james',
    members: [
      { userId: 'james', contributed: 250_000, status: 'joined' },
      { userId: 'abraham', contributed: 180_000, status: 'joined' },
      { userId: 'ada', contributed: 200_000, status: 'joined' },
      { userId: 'chidi', contributed: 150_000, status: 'joined' },
    ], // 780,000
  },
  {
    id: 'wedding-gift',
    slug: 'tolu-and-femi',
    title: 'Wedding Gift',
    category: 'wedding',
    target: 250_000,
    deadline: '2026-11-21',
    createdAt: '2026-09-10',
    organizerId: 'kemi',
    members: [
      { userId: 'kemi', contributed: 60_000, status: 'joined' },
      { userId: 'abraham', contributed: 50_000, status: 'joined' },
      { userId: 'maya', contributed: 40_000, status: 'joined' },
      { userId: 'zara', contributed: 30_000, status: 'joined' },
    ], // 180,000
  },
  {
    id: 'new-apartment',
    slug: 'lekki-apartment',
    title: 'New Apartment',
    category: 'household',
    target: 600_000,
    deadline: '2027-01-15',
    createdAt: '2026-07-30',
    organizerId: 'abraham',
    members: [
      { userId: 'abraham', contributed: 220_000, status: 'joined' },
      { userId: 'david', contributed: 200_000, status: 'joined' },
    ], // 420,000
  },
];

export const FEATURED_PACT_ID = 'sarahs-birthday';
