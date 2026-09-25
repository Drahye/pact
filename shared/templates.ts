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
}

export const TEMPLATES: Record<Category, PactTemplate> = {
  birthday: {
    label: 'Birthday',
    placeholder: 'Sarah’s Birthday',
    budget: ['Gift', 'Dinner', 'Cake', 'Decorations', 'Photography'],
    tasks: ['Book the venue', 'Order the cake', 'Buy the gift', 'Find a photographer'],
  },
  trip: {
    label: 'Trip',
    placeholder: 'Weekend in Cape Town',
    budget: ['Flights', 'Accommodation', 'Transport', 'Activities', 'Food'],
    tasks: ['Book the flights', 'Choose the accommodation', 'Plan the activities'],
  },
  wedding: {
    label: 'Wedding',
    placeholder: 'Tolu and Femi’s Wedding',
    budget: ['Gift', 'Transport', 'Accommodation', 'Outfits'],
    tasks: ['Choose the gift', 'Collect notes for the card', 'Book transport'],
  },
  gift: {
    label: 'Gift',
    placeholder: 'A gift for Mum',
    budget: ['Gift', 'Wrapping and card', 'Delivery'],
    tasks: ['Choose the gift', 'Write the card'],
  },
  event: {
    label: 'Event',
    placeholder: 'Class of 2016 reunion',
    budget: ['Venue', 'Food and drinks', 'Sound', 'Decorations'],
    tasks: ['Book the venue', 'Sort the food', 'Send the reminders'],
  },
  dinner: {
    label: 'Dinner',
    placeholder: 'Friday dinner at Nok',
    budget: ['Food', 'Drinks', 'Service charge'],
    tasks: ['Book the table'],
  },
  household: {
    label: 'Home',
    placeholder: 'New apartment',
    budget: ['Rent deposit', 'Agency fee', 'Furniture', 'Moving'],
    tasks: ['Sign the lease', 'Book movers', 'Set up internet'],
  },
  fund: {
    label: 'Fund',
    placeholder: 'Support for Ada',
    budget: [],
    tasks: [],
  },
  other: {
    label: 'Other',
    placeholder: 'What are you planning?',
    budget: [],
    tasks: [],
  },
};

/** The types offered when creating a Pact, in order. */
export const PACT_TYPES: Category[] = ['birthday', 'trip', 'wedding', 'gift', 'event', 'dinner', 'household', 'other'];
