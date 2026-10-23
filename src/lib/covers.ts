/**
 * The cover photographs a Pact can wear: twenty placeholder stock photos (Nigerian and African context), grouped by the kind of occasion they suit.
 * Everyone can pick one for their own Pact; until they do, each Pact gets a default from its kind, chosen by its id so two Pacts of the same kind
 * do not wear the same photograph whenever the kind has more than one. Replace with real photography before launch (credits in public/covers/CREDITS.md).
 */
export interface Cover {
  key: string;
  category: string;
  label: string;
}

export const COVERS: Cover[] = [
  { key: 'trip-road', category: 'trip', label: 'On the road' },
  { key: 'trip-beach', category: 'trip', label: 'Beach day' },
  { key: 'trip-group-car', category: 'trip', label: 'Road trip crew' },
  { key: 'wedding-aso-ebi', category: 'wedding', label: 'Aso ebi' },
  { key: 'wedding-couple', category: 'wedding', label: 'The couple' },
  { key: 'birthday-party', category: 'birthday', label: 'Celebrating together' },
  { key: 'birthday-hats', category: 'birthday', label: 'Party hats' },
  { key: 'gift-laugh', category: 'gift', label: 'Laughing together' },
  { key: 'gift-open', category: 'gift', label: 'Opening the gift' },
  { key: 'dinner-table', category: 'dinner', label: 'Around the table' },
  { key: 'dinner-women', category: 'dinner', label: 'Catching up' },
  { key: 'event-graduation', category: 'event', label: 'Graduation' },
  { key: 'event-graduates', category: 'event', label: 'The graduates' },
  { key: 'event-dance', category: 'event', label: 'On the dance floor' },
  { key: 'household-unpack', category: 'household', label: 'Moving in' },
  { key: 'household-keys', category: 'household', label: 'New keys' },
  { key: 'fund-hug-men', category: 'fund', label: 'Standing with you' },
  { key: 'fund-hug-women', category: 'fund', label: 'A warm hug' },
  { key: 'other-park', category: 'other', label: 'Good company' },
  { key: 'other-beach-hug', category: 'other', label: 'Together' },
];

const byKey = new Map(COVERS.map((c) => [c.key, c]));
export const isCoverKey = (key?: string | null): key is string => !!key && byKey.has(key);

/** An organiser's own photograph: kept on the server and shown only to people in the Pact. */
export const isUploadKey = (key?: string | null): key is string => !!key && key.startsWith('upload-');

/** A small stable number from a string, so the same Pact always gets the same default. */
const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

/** The covers that suit a kind of occasion first, then the rest, for the picker. */
export const coversFor = (category?: string | null) => [...COVERS.filter((c) => c.category === category), ...COVERS.filter((c) => c.category !== category)];

/** The default cover for a kind of Pact or plan; `seed` (its id) picks among the covers for that kind. */
export const defaultCover = (category?: string | null, seed = ''): Cover => {
  const pool = COVERS.filter((c) => c.category === category);
  const list = pool.length ? pool : COVERS.filter((c) => c.category === 'other');
  return list[hash(seed) % list.length];
};

/** A Circle has no occasion of its own, so it wears one of the photographs of people simply together, chosen by its id. */
const CIRCLE_POOL = ['other-park', 'other-beach-hug', 'dinner-women', 'event-dance', 'trip-group-car', 'gift-laugh'];
export const circleCover = (id: string) => coverUrl(CIRCLE_POOL[hash(id) % CIRCLE_POOL.length]);

/** A Circle's cover: the one its owner chose, or one of the photographs of people together picked by its id. */
export const circleCoverOf = (c: { id: string; cover?: string | null }) => (isCoverKey(c.cover) ? coverUrl(c.cover) : circleCover(c.id));

export const coverUrl = (key: string) => `/covers/${key}.jpg`;

/** The photograph to show: the one chosen for it, or the default for its kind. An uploaded one needs `useCover` (it is fetched with the session); here it falls back to the default. */
export const coverOf = (item: { category?: string | null; cover?: string | null; id?: string }) => coverUrl(isCoverKey(item.cover) ? item.cover : defaultCover(item.category, item.id).key);
