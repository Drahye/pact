const KNOWN = ['birthday', 'gift', 'dinner', 'trip', 'event', 'household', 'wedding', 'fund', 'other'];

/** A warm photograph for each kind of Pact or plan (Nigerian stock for now, replace with real photography before launch; credits in public/home-photos/CREDITS.md). */
export const coverOf = (category?: string | null) => `/covers/${category && KNOWN.includes(category) ? category : 'other'}.jpg`;
