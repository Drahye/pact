/**
 * Pulls an invite code out of whatever someone pasted: the whole link, a link without the scheme, or the bare code.
 * Returns null when it does not look like one, so we can say so instead of sending them to a dead page.
 */
export function parseInvite(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const fromLink = text.match(/\/join\/([A-Za-z0-9_-]{4,40})(?:[/?#\s]|$)/);
  if (fromLink) return fromLink[1];
  // A link without /join/: take the last path segment.
  if (/[/.]/.test(text)) {
    const seg = text.replace(/[?#].*$/, '').split('/').filter(Boolean).pop() ?? '';
    return /^[A-Za-z0-9_-]{4,40}$/.test(seg) && !seg.includes('.') ? seg : null;
  }
  return /^[A-Za-z0-9_-]{4,40}$/.test(text) ? text : null;
}

