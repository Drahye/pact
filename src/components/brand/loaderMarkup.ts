import { MARK, markPaths } from './geometry';

/**
 * The one definition of the startup loader's markup. Two places draw it and must match exactly:
 *   - the React loader (`Loading` in components/app/States.tsx), and
 *   - the first paint in index.html, which exists before any JavaScript has loaded.
 * index.html is filled in from here by the Vite plugin in vite.loader.ts, so the geometry cannot drift: edit the loader
 * here (markup) and in src/styles/loader.css (look and motion) and both places follow.
 */

/** The PACT mark: four rounded pieces that light up one after another while the loop turns. No tile, no disc. */
export const loaderSvg = () =>
  `<svg class="pl__mark" viewBox="0 0 ${MARK.viewBox} ${MARK.viewBox}" aria-hidden="true" focusable="false">${markPaths()
    .map((d) => `<path d="${d}"/>`)
    .join('')}</svg>`;

/** `full` covers the screen (app start); otherwise the loader sits inside the screen that is waiting. */
export const loaderClass = (full: boolean) => `pl ${full ? 'pl--full' : 'pl--inline'}`;

/** What index.html contains inside #root before React mounts. */
export const loaderHtml = (label = 'Loading PACT') => `<div class="${loaderClass(true)}" role="status" aria-label="${label}">${loaderSvg()}</div>`;
