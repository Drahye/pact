import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { loaderHtml } from './src/components/brand/loaderMarkup';

/** The loader stylesheet, comments and whitespace removed, small enough to sit inline in the first HTML. */
export const loaderCss = () =>
  readFileSync(new URL('./src/styles/loader.css', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};:,])\s*/g, '$1')
    .trim();

/** Fills the two placeholders in index.html: the inline style and the loader markup inside #root. */
export const injectLoader = (html: string) => html.replace('<!--pact-loader-style-->', `<style>${loaderCss()}</style>`).replace('<!--pact-loader-->', loaderHtml());

/** index.html shows the real PACT loader before JavaScript loads, drawn from the same source as the React one. */
export const pactLoader = (): Plugin => ({
  name: 'pact-loader',
  transformIndexHtml: { order: 'pre', handler: injectLoader },
});
