# PACT design system

The single source of truth for how PACT looks. It describes what the product already does and fixes it so it stays that way.
The living version, with every value read from the live tokens in both themes, is `/styleguide`.

- **Tokens:** `src/styles/tokens.css` (colour, type, space, radius, motion, press, brand layer). Mirrored for JS in `src/tokens/tokens.ts`.
- **Skin:** `src/styles/bold.css` (hero, sheet, buttons, tab bar, cards), scoped under `.proto--bold`, which is on every screen.
- **Pressed states:** `src/styles/press.css`.
- **Enforcement:** `npm run lint:design` (`scripts/design-lint.mjs`), run first in `scripts/qa-all-bold.sh`.
- **Measurement:** `node scripts/contrast-audit.mjs` and `node scripts/typo-report.mjs` (see [Verifying](#verifying)).

## Principles

1. **One colour per screen.** A screen commits to the colour of the thing it is about: Ask sky, Plan sun, Split lilac, Pact green, Circle
   coral, lists and settings their own tint. That colour is the hero. The body is the page colour.
2. **Green and ink are the brand.** Green (`--brand`, #3dd68c) is the signature: the arrow capsule, the create button, progress, done.
   Ink (`--brand-ink`, #0f1713) is the anchor: titles, primary buttons, the tab bar. Object colours are identity, never brand.
3. **Numbers are the biggest thing on a money surface.** Amounts and dates are larger than any title, tabular, and never wrap.
4. **One solid action.** One ink pill with a green arrow capsule per screen. The second and third actions are tonal (the object's tint) or text.
5. **Hierarchy is size and weight.** Ten type roles, four weights. Secondary text keeps AA contrast; it is smaller or lighter, never faded.
6. **Depth, not outlines.** Cards lift with a hairline and a soft shadow. Borders are for fields and for selection.
7. **Everything gives under a finger.** Objects scale and shift tone, words get a halo. Pressed never changes hue and never loses contrast.
8. **Heroes stay bright.** In dark mode the sheet follows the theme and the hero does not. What sits on a bright hero is a light island.
9. **Tokens only.** No raw colour, size, weight or tracking in app CSS. If a value is missing, add the token first.

## Colour

**Layers.** Primitives (`--ink-*`, `--paper-*`, `--green-*`, the vivid `--*-400` tints) feed semantic tokens (`--color-bg`, `--color-surface`,
`--color-text`, `--color-text-secondary`, `--color-text-tertiary`, `--color-accent*`, `--color-danger`, `--color-border*`). Screens use the
semantic ones. Dark mode re-declares the same names in `:root[data-theme='dark']`. A screen never names a theme.

**Brand layer** (constants, in both themes): `--brand`, `--brand-ink`, `--green-300`, `--forest-900/800/700` (Home's night-green hero),
`--paper-dial` and `--track-warm` (the pact dial), `--sun-300`, `--whatsapp` (a third party's colour, used only for its button).

**Translucent ladders.** Seven `--veil-1..7` (white, 6 to 88%) lighten what they sit on: glass on a hero, a lit edge in dark. Six
`--shade-1..6` (ink, 6 to 88%) darken it: shadows, hairlines, text on a hero. No value between steps.

**Text on a bright hero** (`.proto--bold`): `--on-hero` (ink), `--on-hero-2` and `--on-hero-3` (ink at `--shade-6`, 5.0:1 on lilac, the hardest tint).
Hero gradients never darken (they end on the tint), so ink always has the contrast it was measured with. Cards on a hero use `--hero-shadow`, a
short shadow, because a long one darkens the colour under the text below it.

**Light islands.** `tokens.css` lists the elements that keep the light palette in a dark page: the hero's top bar, buttons, icon buttons and
actions inside `.xh` and `.xhero--full`, answer cards, split rows, the pact dial, the welcome objects. Add `.on-paper` to anything else.
Type tokens are deliberately not part of an island.

**Contrast floor.** Text 4.5:1, large text (24px, or 18.66px at 700) and icons 3:1, in rest, pressed, hover and focus, in both themes.
Placeholders are 5:1 (`--color-placeholder`). Danger text is `--red-600` (#a8433b) in light.

## Typography

One typeface, Geist Variable. **Four weights, nothing between:** `--weight-regular` 400, `--weight-medium` 500, `--weight-semibold` 600,
`--weight-bold` 700. (`--weight-heavy` is a legacy alias of bold.) `font-synthesis: none`. Size makes hierarchy; a heavier face does not.

| Role | Token prefix | Size (at 390px) | Weight | Tracking | Use |
|---|---|---|---|---|---|
| Hero | `--t-hero-*` | clamp 28 to 36px (33) | 700 | -0.035em | the title on a coloured screen |
| Display | `--t-display-*` | clamp 36 to 46px (41) | 700 | -0.035em | a moment: a welcome, a name |
| Page | `--t-page-*` | clamp 28 to 34px (31) | 700 | -0.035em | a screen's title with no hero |
| Section | `--t-section-*` | 20px | 700 | -0.03em | a group's heading |
| Object | `--t-object-*` | 17px | 700 | -0.02em | a Circle, Ask, Plan, Split, Pact |
| Lead | `--t-lead-*` | 16px | 600 | -0.02em | a name, a row title, a hero's sub-line |
| Body | `--t-body-*` | 15px | 400 | -0.005em | reading text |
| Support | `--t-support-*` | 13px | 400 | 0 | what sits under a title |
| Label | `--t-label-*` | 11px, caps | 600 | +0.08em | kickers and chips |
| Meta | `--t-meta-*` | 12px | 500 | 0 | times, counts, fine print |

Each role has `-size`, `-line`, `-weight` and `-tracking`. Classes `.t-hero`, `.t-page`, `.t-section`, `.t-lead` and so on live in `type.css`.
Legacy names alias the role sizes (`--text-caption` is meta, `--text-sm` is support, `--text-lg` is lead).

**Figures** are numerals and emoji, drawn at a set of sizes and never at a one-off: `--fig-xs/sm/md/lg/xl/2xl` (18, 22, 28, 36, 44, 52px),
plus the big numeral clamps (28 to 44px at most; none above 56px) `--num-md-size`, `--num-lg-size`, `--num-xl-size` (a split's total), `--num-date-size` (a plan's day).
Numerals use `.num` (tabular, lining) and never wrap.

**Tracking tokens:** `--tracking-numeral` -0.06em, `--tracking-display` -0.05em, `--tracking-tight` -0.035em, `--tracking-snug` -0.02em,
`--tracking-normal` -0.005em, `--tracking-wide` +0.04em. Type tightens as it grows.

## Space, shape and depth

- **Space:** 4pt scale, `--space-1..40` (4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128, 160). Screen gutter 20px.
- **Radius families:** control 12 (`--r-control`), tile 20 (`--r-tile`), object 24 (`--r-object`), sheet 28 (`--r-sheet`); hero sheet 34, cards 28 in the skin.
  Each kind of object has its own silhouette (`--shape-circle`, `--shape-ask`, `--shape-plan`, `--shape-split`, `--shape-pact`).
- **Elevation:** three levels. 0 flat, 1 an object you can press (`--elev-interactive`), 2 chosen or modal (`--elev-focused`). Cards use `--card-shadow`:
  a hairline, a 1px lift and a long soft shadow. In dark the lift is a lit top edge, not a black shadow.
- **Surfaces:** base, quiet, interactive, focused (`--surface-*`). A tint decides how much identity colour shows.

## Screen anatomy

Every screen is a **hero** over a **sheet**.

1. The hero (`.xh`) is in the object's colour, runs up under the top bar (`--tb-h`), and holds the title at the hero role, the one line under it, and an
   object that belongs to it (emoji plate, date numeral, dial, art).
2. The sheet (`.xs`) rises over it with a rounded top edge and holds the body on the page colour.
3. Home is the exception that proves it: its hero is Home's night-green (`--forest-*`), and its four starting tiles straddle the sheet's edge.
4. Welcome is the brand moment: night-green hero showing PACT's own objects, a sheet with the promise, one action.
5. Full-colour screens (Ask, Split, shared pages) carry the colour to the whole screen and lay white answer cards on it.
6. List, settings, sign-in and money screens use `PageHero` (a tint, a title, one line) and the page body below.

**Tab bar.** A floating capsule of four tabs (Home, Circles, Activity, Me) on the page surface, with Create as its own round green button beside it
(navigation and the one verb are different kinds of control, so they are different shapes). Icon over label, always labelled. The chosen tab is a solid
ink pill with a filled icon (the same chosen look as a chip). The bar overlaps the content (`--tab-h`), and every screen that carries it pads its end
by `--tab-h` plus 16px, so the last line scrolls clear of it and no strip of another colour is left under it. It follows the theme.

**Scale and restraint (audit 2026-10-22).** Titles stop at 36px, figures at 56px, body is 15px, support 13px, meta 12px. Weights stop at bold: size makes
hierarchy, a black face does not (Apple's large titles are 34pt bold). Group related rows in one inset card with hairlines between them (People, Settings),
not as loose tiles. A sticky footer holds one action; two stacked actions close the page instead (`.screen--completed`).

## Actions

One solid action per screen: ink pill, paper text, a green arrow capsule on the right (`.btn--primary` in the skin). Secondary is a white pill with a soft
lift. Tonal (`.act--tonal`) uses the object's tint. Quiet things are text (`.act--text`, `.link`). Disabled is a sunken pill. Targets are 44px; small
controls get a 44px hit area from `touch.css`.

## Pressed, hover, focus

- **Pressed objects** (cards, rows, buttons, chips, tiles): scale 0.985 (0.96 for small embedded actions) and `--press-dim`, which is 0.96 on paper and
  1.1 on dark, so a surface settles in light and lifts in dark. `press.css` applies this to every tappable that has no pressed look of its own.
  Components may override it; they may not remove it.
- **Pressed words** (links, inline actions): a halo of the text's own colour at 6%. Text colour never changes, so contrast is kept.
- **Hover** applies only where hovering exists (`@media (hover: hover)`), so a tap never leaves a control stuck in its hover colour.
- **Focus** is a 3px ring in `--color-focus`, offset 2px. Hero controls are light islands, so the ring is ink on white there.
- Pressed colours stay in the family of the resting state: ink goes lighter on paper, cream goes darker in dark. Never a new hue.
- iOS applies `:active` only when the page listens for touch; `main.tsx` registers a passive no-op.

## Motion

Five durations: `--motion-micro` 140ms (presses, hover), `--motion-state` 220ms (selection, counts), `--motion-nav` 320ms, `--motion-sheet` 380ms,
`--motion-celebrate` 550ms. Springs are for objects (`--ease-press`), eases for opacity and text. Everything collapses to 0 under reduced motion.

## Dark theme

Same brand, deep green-charcoal. Elevation is tonal: lighter is higher. Hairlines replace shadows. The hero stays bright; the sheet, cards and tab bar
follow the theme. Accent text becomes pale green (`--color-accent-text` #5fe3a3), tone text becomes the soft `--tone-*-fg` values.

## Rules a machine checks

`npm run lint:design` fails on a new raw hex, `rgb()`/`rgba()`/`hsl()`, `font-size`, `font-weight` or `letter-spacing` in app CSS. Allowed: black-alpha
shadows, `var(--x, fallback)`, data URIs, and values built from tokens (`calc`/`clamp` with a `var`). Skipped: `tokens.css` (the source), `loader.css`
(runs before tokens), the marketing site, the gallery and the styleguide. The baseline is `scripts/design-lint.baseline.json` and is currently empty, so
any exception is a regression. Lower it with `--update` when you remove one; it never rises.

## Adding to the system

1. Is there a token? Use it.
2. No token: add it to `tokens.css` (the brand layer for a constant, the colour block for a themed value), name it for what it is for, and add it to `/styleguide`.
3. A new screen: `Screen` with `className="xhero xhero--lite tint--X"`, a transparent `TopBar`, a `PageHero`, then the body. A new object: give it a tint and a silhouette.
4. A colour on a hero: ink on it, measured. A card on a hero: a light island and `--hero-shadow`.
5. Run `npm run lint:design`, then the audit.

## Verifying

`node scripts/ui-audit.mjs /tmp/ui --w=390,320 --theme=light,dark` captures every main screen at the top and scrolled to the bottom, and fails any
screen where text or a control ends under the tab bar or a sticky footer.

```
bash scripts/detail-up.sh                       # fresh stack with fixtures and one saved session
node scripts/contrast-audit.mjs --states=rest,active,hover,focus --feedback --sheets --out=/tmp/contrast
node scripts/typo-report.mjs /tmp/contrast/typo.json
npm run lint:design
bash scripts/qa-all-bold.sh > /tmp/qa.log       # lint, typecheck, build, axe, overflow, journeys, create flows, detail checks, phone-off
```

The audit samples rendered pixels under every text line (text hidden, so gradients and shadows count), forces `:active`, `:hover` and
`:focus-visible` through CDP, and reports anything under AA. `--feedback` lists tappables whose pressed look is identical to rest.
Do not kill an audit mid-run (refresh tokens rotate and the saved session goes stale) and do not edit `src` while it runs.

## Not covered

Ceremony screens (the onboarding carousel, the completed-Pact page, the join-invite card) use the shared tokens and roles but keep their own
composition. The marketing site is light-only and has its own display sizes. Real devices, iOS `:active` and slow networks are untested.
