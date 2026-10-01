/**
 * The PACT mark: a loop made of four rounded pieces of different lengths, like four people giving
 * different amounts of the same thing. Together they close the circle; the smallest is the one that
 * just joined. This file is the single source of truth: the React component, the favicon, the app
 * icons and the social card are all drawn from it (see scripts/brand-assets.mjs).
 */
export const MARK = {
  viewBox: 32,
  cx: 16,
  cy: 16,
  r: 12,
  stroke: 4.8,
  /** Where the first piece starts, in degrees clockwise from 3 o'clock. */
  start: -102,
  /** Space between pieces, in degrees. Wide enough to stay visible at 16px. */
  gap: 36,
  /** Length of each piece, longest first. Four pieces plus four gaps close the circle. */
  arcs: [92, 64, 40, 20],
} as const;

const rad = (deg: number) => (deg * Math.PI) / 180;
const pt = (deg: number) => [MARK.cx + MARK.r * Math.cos(rad(deg)), MARK.cy + MARK.r * Math.sin(rad(deg))].map((n) => Math.round(n * 1000) / 1000);

/** SVG path data for each piece. */
export function markPaths(): string[] {
  let a = MARK.start;
  return MARK.arcs.map((len) => {
    const [x1, y1] = pt(a);
    const [x2, y2] = pt(a + len);
    const d = `M${x1} ${y1}A${MARK.r} ${MARK.r} 0 ${len > 180 ? 1 : 0} 1 ${x2} ${y2}`;
    a += len + MARK.gap;
    return d;
  });
}

/** A complete standalone SVG of the mark, for static files. */
export function markSvg({ colors, size = MARK.viewBox, tile, inset = 0 }: { colors: string | string[]; size?: number; tile?: { fill: string; radius: number }; inset?: number }): string {
  const palette = Array.isArray(colors) ? colors : MARK.arcs.map(() => colors);
  const paths = markPaths()
    .map((d, i) => `<path d="${d}" fill="none" stroke="${palette[i % palette.length]}" stroke-width="${MARK.stroke}" stroke-linecap="round"/>`)
    .join('');
  const scale = 1 - inset * 2;
  const g = inset ? `<g transform="translate(${16 * (1 - scale)} ${16 * (1 - scale)}) scale(${scale})">${paths}</g>` : paths;
  const bg = tile ? `<rect width="32" height="32" rx="${tile.radius}" fill="${tile.fill}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MARK.viewBox} ${MARK.viewBox}" width="${size}" height="${size}">${bg}${g}</svg>`;
}
