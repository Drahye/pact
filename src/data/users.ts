import type { User, UserId } from './types';

/** Portraits are bundled in /public/avatars so the app never depends on a third-party host. */
const portrait = (set: 'men' | 'women', n: number) => `/avatars/${set}-${n}.jpg`;

/**
 * The signed-in person. The website's showcase uses the static cast below; the app
 * sets this from the session and registers everyone it meets from the API.
 */
export let CURRENT_USER_ID: UserId = 'abraham';
export const setCurrentUserId = (id: UserId) => {
  CURRENT_USER_ID = id;
};

export const users: Record<UserId, User> = {
  abraham: { id: 'abraham', name: 'Abraham', fullName: 'Abraham Okafor', photo: portrait('men', 30), tint: 'mint', color: '#3dd68c' },
  sarah: { id: 'sarah', name: 'Sarah', fullName: 'Sarah Adeyemi', photo: portrait('women', 30), tint: 'peach', color: '#ff7a5c' },
  david: { id: 'david', name: 'David', fullName: 'David Eze', photo: portrait('men', 16), tint: 'sky', color: '#4da3ff' },
  maya: { id: 'maya', name: 'Maya', fullName: 'Maya Bello', photo: portrait('women', 36), tint: 'lilac', color: '#9b7bff' },
  tolu: { id: 'tolu', name: 'Tolu', fullName: 'Tolu Martins', tint: 'sand', color: '#ffc53d' },
  kemi: { id: 'kemi', name: 'Kemi', fullName: 'Kemi Adebayo', photo: portrait('women', 92), tint: 'mint', color: '#ff6fb5' },
  femi: { id: 'femi', name: 'Femi', fullName: 'Femi Johnson', photo: portrait('men', 91), tint: 'peach', color: '#22b8a6' },
  zara: { id: 'zara', name: 'Zara', fullName: 'Zara Musa', photo: portrait('women', 70), tint: 'sky', color: '#ff9f43' },
  daniel: { id: 'daniel', name: 'Daniel', fullName: 'Daniel Ojo', tint: 'sky', color: '#7bc96f' },
  james: { id: 'james', name: 'James', fullName: 'James Obi', photo: portrait('men', 53), tint: 'lilac', color: '#4da3ff' },
  ada: { id: 'ada', name: 'Ada', fullName: 'Ada Nwosu', tint: 'sand', color: '#ff6fb5' },
  chidi: { id: 'chidi', name: 'Chidi', fullName: 'Chidi Okeke', photo: portrait('men', 83), tint: 'sky', color: '#ffc53d' },
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
