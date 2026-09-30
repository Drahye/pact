import type { User, UserId } from './types';

/**
 * The signed-in person. The website's showcase uses the static cast below; the app
 * sets this from the session and registers everyone it meets from the API.
 */
export let CURRENT_USER_ID: UserId = 'abraham';
export const setCurrentUserId = (id: UserId) => {
  CURRENT_USER_ID = id;
};

export const users: Record<UserId, User> = {
  abraham: { id: 'abraham', name: 'Abraham', fullName: 'Abraham Okafor', tint: 'mint', color: '#3dd68c' },
  sarah: { id: 'sarah', name: 'Sarah', fullName: 'Sarah Adeyemi', tint: 'peach', color: '#ff7a5c' },
  david: { id: 'david', name: 'David', fullName: 'David Eze', tint: 'sky', color: '#4da3ff' },
  maya: { id: 'maya', name: 'Maya', fullName: 'Maya Bello', tint: 'lilac', color: '#9b7bff' },
  tolu: { id: 'tolu', name: 'Tolu', fullName: 'Tolu Martins', tint: 'sand', color: '#ffc53d' },
  kemi: { id: 'kemi', name: 'Kemi', fullName: 'Kemi Adebayo', tint: 'mint', color: '#ff6fb5' },
  femi: { id: 'femi', name: 'Femi', fullName: 'Femi Johnson', tint: 'peach', color: '#22b8a6' },
  zara: { id: 'zara', name: 'Zara', fullName: 'Zara Musa', tint: 'sky', color: '#ff9f43' },
  james: { id: 'james', name: 'James', fullName: 'James Obi', tint: 'lilac', color: '#4da3ff' },
  ada: { id: 'ada', name: 'Ada', fullName: 'Ada Nwosu', tint: 'sand', color: '#ff6fb5' },
  chidi: { id: 'chidi', name: 'Chidi', fullName: 'Chidi Okeke', tint: 'sky', color: '#ffc53d' },
};

const unknown = (id: UserId): User => ({ id, name: 'Someone', fullName: 'PACT member', tint: 'sand', color: '#a7aca6' });

export const getUser = (id: UserId): User => users[id] ?? unknown(id);

/** People from API responses join the registry so avatars, rings and feeds can find them. */
export function registerPeople(people: { id: string; firstName: string; lastName: string; color: string; tint: User['tint']; photoUrl: string | null }[]) {
  for (const p of people) {
    users[p.id] = { id: p.id, name: p.firstName, fullName: `${p.firstName} ${p.lastName}`, photo: p.photoUrl ?? undefined, tint: p.tint, color: p.color };
  }
}

/** People the user can pick when inviting: a stand-in for device contacts. */
export const suggestedContacts: UserId[] = ['sarah', 'david', 'maya', 'tolu', 'kemi', 'james', 'ada', 'chidi'];
