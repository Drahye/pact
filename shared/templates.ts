/**
 * Starting points per Pact type. They only make creation faster: every line and task
 * is optional and editable, and nothing here is required by the server.
 */
import type { categories } from './contracts';

type Category = (typeof categories)[number];

export interface PactTemplate {
  label: string;
  placeholder: string;
  budget: string[];
  tasks: string[];
  /** Typical goals in naira, shown as one-tap suggestions. Never required. */
  goals: number[];
  /** How far ahead people usually set the date, in days. */
  days: number;
  /** How people usually split this kind of Pact; only ever offered as a suggestion. */
  split: 'equal' | 'flexible';
}

export const TEMPLATES: Record<Category, PactTemplate> = {
  birthday: {
    label: 'Birthday',
    placeholder: 'Sarah’s Birthday',
    budget: ['Gift', 'Dinner', 'Cake', 'Decorations', 'Photography'],
    tasks: ['Book the venue', 'Order the cake', 'Buy the gift', 'Find a photographer'],
    goals: [50_000, 150_000, 300_000],
    days: 21,
    split: 'flexible',
  },
  trip: {
    label: 'Trip',
    placeholder: 'Weekend in Calabar',
    budget: ['Flights', 'Accommodation', 'Transport', 'Activities', 'Food'],
    tasks: ['Book the flights', 'Choose the accommodation', 'Plan the activities'],
    goals: [300_000, 800_000, 1_500_000],
    days: 60,
    split: 'equal',
  },
  wedding: {
    label: 'Wedding',
    placeholder: 'Tolu and Femi’s Wedding',
    budget: ['Gift', 'Aso ebi', 'Transport', 'Accommodation'],
    tasks: ['Choose the gift', 'Collect notes for the card', 'Book transport'],
    goals: [100_000, 300_000, 600_000],
    days: 45,
    split: 'flexible',
  },
  gift: {
    label: 'Gift',
    placeholder: 'A gift for Mum',
    budget: ['Gift', 'Wrapping and card', 'Delivery'],
    tasks: ['Choose the gift', 'Write the card'],
    goals: [30_000, 80_000, 200_000],
    days: 14,
    split: 'flexible',
  },
  event: {
    label: 'Event',
    placeholder: 'Class of 2016 reunion',
    budget: ['Venue', 'Food and drinks', 'Sound', 'Decorations'],
    tasks: ['Book the venue', 'Sort the food', 'Send the reminders'],
    goals: [200_000, 500_000, 1_000_000],
    days: 45,
    split: 'flexible',
  },
  dinner: {
    label: 'Dinner',
    placeholder: 'Friday dinner at Nok',
    budget: ['Food', 'Drinks', 'Service charge'],
    tasks: ['Book the table'],
    goals: [40_000, 100_000, 250_000],
    days: 10,
    split: 'equal',
  },
  household: {
    label: 'Home',
    placeholder: 'New apartment',
    budget: ['Rent deposit', 'Agency fee', 'Furniture', 'Moving'],
    tasks: ['Sign the lease', 'Book movers', 'Set up internet'],
    goals: [500_000, 1_500_000, 3_000_000],
    days: 60,
    split: 'equal',
  },
  fund: {
    label: 'Fund',
    placeholder: 'Support for Ada',
    budget: [],
    tasks: [],
    goals: [50_000, 200_000, 500_000],
    days: 30,
    split: 'flexible',
  },
  other: {
    label: 'Other',
    placeholder: 'What are you planning?',
    budget: [],
    tasks: [],
    goals: [50_000, 200_000, 500_000],
    days: 30,
    split: 'flexible',
  },
};

/** The types offered when creating a Pact, in order. */
export const PACT_TYPES: Category[] = ['birthday', 'trip', 'wedding', 'gift', 'event', 'dinner', 'household', 'other'];
