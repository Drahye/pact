/**
 * Where a notification leads. One definition, used by the app when you tap a notification and by the
 * server when it builds the address a push opens, so the two can never disagree. Paths only, never a
 * full URL: a push can only ever send someone somewhere inside PACT.
 */
export function notificationLink(n: { type: string; pactId?: string | null; refId?: string | null }): string | null {
  if (!n.pactId) return null;
  const base = `/app/pact/${n.pactId}`;
  // Comments, organiser updates and pins all live on an activity item: open its thread.
  if ((n.type === 'comment' || n.type === 'update' || n.type === 'pinned') && n.refId) return `${base}?thread=${n.refId}`;
  return base;
}
