/**
 * The startup loader exists in two places that must stay one picture: the first paint in index.html (before any
 * JavaScript) and the React loader. Both are drawn from the same source, and these checks make drift loud.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { loaderClass, loaderHtml, loaderSvg } from '../../src/components/brand/loaderMarkup.js';
import { injectLoader, loaderCss } from '../../vite.loader.js';

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

describe('startup loader', () => {
  const index = read('index.html');
  const built = injectLoader(index);

  it('index.html holds placeholders only: the loader is not hand-written there', () => {
    assert.ok(index.includes('<!--pact-loader-style-->') && index.includes('<!--pact-loader-->'));
    assert.ok(!/class="pl[ _"]/.test(index) && !index.includes('<svg'), 'no loader markup typed into index.html');
  });

  it('the first paint carries the real loader: same markup as React, styled by the same stylesheet', () => {
    assert.ok(!built.includes('<!--pact-loader'), 'both placeholders are filled');
    assert.ok(built.includes(`<div id="root">${loaderHtml()}</div>`));
    assert.ok(built.includes(loaderSvg()), 'identical SVG geometry');
    assert.ok(built.includes(`<style>${loaderCss()}</style>`), 'identical CSS');
    assert.equal(loaderClass(true), 'pl pl--full');
  });

  it('React draws it from that same source', () => {
    const states = read('src/components/app/States.tsx');
    assert.match(states, /loaderSvg\(\)/);
    assert.match(states, /loaderClass\(full\)/);
    assert.ok(!/<circle|pl__disc/.test(states), 'no second, hand-drawn design in the component');
  });

  it('it is the small segmented loop, not a big disc', () => {
    const css = read('src/styles/loader.css');
    assert.match(css, /clamp\(56px, 18vw, 88px\)/);
    assert.ok(!/pl__disc|48vw|240px/.test(css));
    assert.ok(!loaderSvg().includes('<circle'));
    assert.equal((loaderSvg().match(/<path /g) ?? []).length, 4, 'the logo’s four pieces');
  });

  it('it follows the theme from the first paint: light and dark page colours, no white flash', () => {
    const css = loaderCss();
    assert.ok(css.includes('background:#f6f4ef') && css.includes("html[data-theme='dark']"));
    assert.ok(css.includes('#0f1512'));
  });
});
