/** Where someone may be sent after signing in: only paths inside the app or a PACT share link. Mirrors the client's rule. */
export const safeReturnPath = (raw: string | null | undefined): string | null =>
  raw && raw.length <= 300 && (/^\/app\/[A-Za-z0-9/_\-?=&%.]*$/.test(raw) || /^\/[apsr]\/[A-Za-z0-9_-]{16,64}$/.test(raw)) && !raw.includes('//') && !raw.includes('\\') && !raw.startsWith('/app/auth') ? raw : null;
