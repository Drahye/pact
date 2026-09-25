import type { PactCategory, UserId } from './types';

/** Marketing-site scenarios: one shared goal, three different plans. */
export interface Scenario {
  id: 'trip' | 'gift' | 'event';
  label: string;
  title: string;
  line: string;
  category: PactCategory;
  target: number;
  raised: number;
  daysLeft: number;
  memberIds: UserId[];
}

export const scenarios: Scenario[] = [
  {
    id: 'trip',
    label: 'Trip',
    title: 'Weekend in Cape Town',
    line: '₦1.2m for Cape Town',
    category: 'trip',
    target: 1_200_000,
    raised: 780_000,
    daysLeft: 77,
    memberIds: ['james', 'abraham', 'ada', 'chidi', 'zara', 'tolu'],
  },
  {
    id: 'gift',
    label: 'Gift',
    title: "Dad's 60th Birthday",
    line: "₦250k for Dad's birthday",
    category: 'gift',
    target: 250_000,
    raised: 165_000,
    daysLeft: 9,
    memberIds: ['ada', 'chidi', 'kemi'],
  },
  {
    id: 'event',
    label: 'Event',
    title: 'Team Dinner',
    line: '₦800k for the team dinner',
    category: 'event',
    target: 800_000,
    raised: 360_000,
    daysLeft: 21,
    memberIds: ['david', 'maya', 'femi', 'james', 'kemi', 'sarah', 'tolu', 'zara', 'abraham', 'ada', 'chidi'],
  },
];
