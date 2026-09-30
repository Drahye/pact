// Everything the demo says out loud: captions, chapter cards, and the opening and closing lines.
// Shared by the recorder (timing) and the voice generator (audio), so they never disagree.
import { createHash } from 'node:crypto';

export const INTRO = 'Pact. Make it happen together. This is a walkthrough of the whole product, in eight chapters.';
export const OUTRO = 'Plan it. Fund it. Split the work. Keep the memory. Pact: make it happen together.';

const WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const words = (n) => {
  if (n === 0) return 'zero';
  const under1000 = (x) => {
    const h = Math.floor(x / 100);
    const r = x % 100;
    const t = r < 20 ? WORDS[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? `-${WORDS[r % 10]}` : ''}`;
    return [h ? `${WORDS[h]} hundred` : '', h && t ? 'and' : '', t].filter(Boolean).join(' ');
  };
  const parts = [];
  if (n >= 1_000_000) parts.push(`${under1000(Math.floor(n / 1_000_000))} million`);
  if (n % 1_000_000 >= 1000) parts.push(`${under1000(Math.floor((n % 1_000_000) / 1000))} thousand`);
  if (n % 1000) parts.push(under1000(n % 1000));
  return parts.join(' ');
};

/** Captions are written to be read; this makes them easy to say. */
export const speechText = (text) =>
  text
    .replace(/₦\s?([\d,]+)/g, (_, n) => `${words(Number(n.replace(/,/g, '')))} naira`)
    .replace(/\bBVN\b/g, 'B V N')
    .replace(/\bSMS\b/g, 'S M S')
    .replace(/\bPACT\b/g, 'Pact')
    .replace(/(\d+(?:\.\d+)?)%/g, '$1 percent')
    .replace(/…/g, '.')
    .replace(/\s+/g, ' ')
    .trim();

export const lineId = (text) => createHash('sha1').update(speechText(text)).digest('hex').slice(0, 12);

export const chapterSpeech = (n, title, sub) => `Chapter ${n}. ${title}. ${sub}`;

/** All spoken lines found in the recorder's source. */
export function extractLines(src) {
  const out = [INTRO, OUTRO];
  for (const m of src.matchAll(/await cap\('((?:[^'\\]|\\.)*)'/g)) out.push(m[1]);
  for (const m of src.matchAll(/await chapter\((\d+), '((?:[^'\\]|\\.)*)', '((?:[^'\\]|\\.)*)'\)/g)) out.push(chapterSpeech(m[1], m[2], m[3]));
  return [...new Set(out)];
}
