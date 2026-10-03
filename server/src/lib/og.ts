/**
 * Link previews for shared Asks. The app is a single page, so a crawler (WhatsApp, iMessage, Slack) only ever sees the
 * HTML the server sends. For an Ask link the server fills in the title, description and card image from a few safe
 * summary fields (the Circle's name and emoji, the question, how many have answered) and leaves the rest of the
 * page alone, so people get the same HTML and the React app boots as usual. Never a name, an option, a result or a
 * token (other than the link's own address). The image is one strong generic card; a per-Ask image is a later step.
 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface OgMeta {
  title: string;
  description: string;
  /** The page's own address, for the canonical link and og:url. */
  url?: string;
  /** Absolute address of the card image. */
  image?: string;
  /** Keep search engines out. */
  noindex?: boolean;
}

const set = (html: string, re: RegExp, value: string) => html.replace(re, (_m, a: string, b: string) => `${a}${value}${b}`);

export function injectOg(html: string, m: OgMeta): string {
  const title = esc(m.title);
  const desc = esc(m.description);
  let out = html
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, (_x, a: string, b: string) => `${a}${desc}${b}`);
  out = set(out, /(<meta property="og:title" content=")[^"]*(")/, title);
  out = set(out, /(<meta property="og:description" content=")[^"]*(")/, desc);
  if (m.image) out = set(out, /(<meta property="og:image" content=")[^"]*(")/, esc(m.image));
  const extra = [
    m.url ? `<meta property="og:url" content="${esc(m.url)}" />\n    <link rel="canonical" href="${esc(m.url)}" />` : '',
    '<meta name="twitter:title" content="' + title + '" />',
    '<meta name="twitter:description" content="' + desc + '" />',
    m.image ? `<meta name="twitter:image" content="${esc(m.image)}" />` : '',
    m.noindex ? '<meta name="robots" content="noindex,nofollow" />' : '',
  ]
    .filter(Boolean)
    .join('\n    ');
  return out.replace(/(<meta name="twitter:card"[^>]*>)/, `$1\n    ${extra}`);
}

const people = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What the preview says. Short, no promotion, never a person's name. */
export function askPreviewText(a: { circleName: string; circleEmoji: string; title: string; type: 'choice' | 'attendance'; responses: number; closed: boolean }): OgMeta {
  const title = `${a.circleName} ${a.circleEmoji} · ${a.title}`;
  if (a.closed) return { title, description: a.type === 'choice' ? 'Decision made. Responses are closed.' : 'Responses are closed.' };
  if (!a.responses) return { title, description: a.type === 'attendance' ? 'Are you in? Be the first to respond.' : 'Be the first to vote.' };
  return { title, description: a.type === 'attendance' ? `${people(a.responses, 'person has', 'people have')} answered. Are you in?` : `${people(a.responses, 'person is', 'people are')} deciding. Add your vote.` };
}

/** For a link that is wrong, turned off or gone: nothing about any Circle. */
export const unavailablePreview: OgMeta = { title: 'PACT', description: 'This Ask is no longer available.', noindex: true };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const part = (iso: string) => ({ m: Number(iso.slice(5, 7)) - 1, d: Number(iso.slice(8, 10)) });

/** "Dec 18–22", "Dec 28 – Jan 2" or "Dec 18". */
export function dateRange(date: string | null, end: string | null): string | null {
  if (!date) return null;
  const a = part(date);
  if (!end || end === date) return `${MONTHS[a.m]} ${a.d}`;
  const b = part(end);
  return a.m === b.m ? `${MONTHS[a.m]} ${a.d}–${b.d}` : `${MONTHS[a.m]} ${a.d} – ${MONTHS[b.m]} ${b.d}`;
}

/** The preview for a shared Plan: when and where, how many are in, and the question. No tasks, no budget, no names. */
export function planPreviewText(p: { title: string; circleName: string; circleEmoji: string; date: string | null; endDate: string | null; location: string | null; going: number; status: string }): OgMeta {
  const when = [dateRange(p.date, p.endDate), p.location].filter(Boolean).join(' · ');
  const title = `${p.title} · ${p.circleName} ${p.circleEmoji}`;
  if (p.status === 'cancelled') return { title, description: 'This plan was cancelled.' };
  if (p.status === 'done') return { title, description: 'This plan happened.' };
  const count = p.going ? `${people(p.going, 'person is', 'people are')} in. ` : '';
  return { title, description: `${when ? `${when}. ` : ''}${count}Are you coming?` };
}

/** The preview for a shared Split: the title and a plain line. Never an amount, a name or who owes. */
export const splitPreviewText = (title: string): OgMeta => ({ title, description: 'A shared expense on PACT.' });
