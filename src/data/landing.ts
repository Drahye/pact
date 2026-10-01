import type { UserId } from './types';
import { users } from './users';

/** The scripted "live" contributions the hero plays on loop. */
export interface LiveEvent {
  userId: UserId;
  amount: number;
}

export const heroSequence: LiveEvent[] = [
  { userId: 'david', amount: 25_000 },
  { userId: 'maya', amount: 40_000 },
  { userId: 'abraham', amount: 15_000 },
];


/** Each person owns one vivid colour (defined once, on the user). */
export const friendColor: Record<UserId, string> = Object.fromEntries(Object.values(users).map((u) => [u.id, u.color]));

export const liveAmounts = [10_000, 15_000, 20_000, 25_000, 40_000, 50_000];

export const planTypes = [
  'Group trips',
  'Birthday gifts',
  'Wedding contributions',
  'Rent & shared bills',
  'Team dinners',
  'Emergency funds',
  'Owambe',
  'Graduation gifts',
  'Baby showers',
  'Concert tickets',
  'Group gifts',
  'Moving expenses',
  'Events',
];
