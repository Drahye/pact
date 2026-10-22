import { CompletionState, EmptyState, Hero, OBJECT_KINDS, Sheet, StatusIndicator } from '../../components/objects';
import { Check, Plus, Share } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CategoryChip, CategoryIcon } from '../../components/pact/category';
import { PactListItem } from '../../components/pact/PactListItem';
import { SegmentedBar } from '../../components/pact/SegmentedBar';
import { SegmentedRing } from '../../components/pact/SegmentedRing';
import { PhoneFrame } from '../../components/site/PhoneFrame';
import { StoreButtons } from '../../components/site/StoreButtons';
import { ActivityItem } from '../../components/ui/ActivityItem';
import { AmountInput } from '../../components/ui/AmountInput';
import { Avatar } from '../../components/ui/Avatar';
import { AvatarGroup } from '../../components/ui/AvatarGroup';
import { Badge } from '../../components/ui/Badge';
import { BottomNav } from '../../components/ui/BottomNav';
import { Button } from '../../components/ui/Button';
import { HoldButton } from '../../components/ui/HoldButton';
import { IconButton } from '../../components/ui/IconButton';
import { Input } from '../../components/ui/Input';
import { PactLogo } from '../../components/brand/PactLogo';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { ProgressRing } from '../../components/ui/ProgressRing';
import { Segmented } from '../../components/ui/Segmented';
import { TopBar } from '../../components/ui/TopBar';
import '../../components/ui/toast.css';
import { seedActivities } from '../../data/activities';
import { seedPacts } from '../../data/pacts';
import type { Activity, PactCategory } from '../../data/types';
import { users } from '../../data/users';
import { useTheme } from '../../theme/useTheme';
import { sharesOf } from '../../lib/pact';
import './styleguide.css';
import { setFixedClock } from '../../lib/clock';

const sarah = seedPacts[0];
const trip = seedPacts[1];

/** Reads a CSS custom property so every swatch shows the value the product actually uses. */
function useToken(name: string) {
  const [v, setV] = useState('');
  useEffect(() => setV(getComputedStyle(document.documentElement).getPropertyValue(name).trim()), [name]);
  return v;
}

function Swatch({ token, label, dark }: { token: string; label: string; dark?: boolean }) {
  const v = useToken(token);
  return (
    <div className="sg-swatch">
      <span className={`sg-swatch__chip ${dark ? 'is-dark' : ''}`} style={{ background: `var(${token})` }} />
      <strong>{label}</strong>
      <code>{token}</code>
      <span className="sg-swatch__hex">{v}</span>
    </div>
  );
}

function TokenRow({ token, children }: { token: string; children?: ReactNode }) {
  const v = useToken(token);
  return (
    <div className="sg-token">
      <code>{token}</code>
      <span className="sg-token__value">{v}</span>
      <div className="sg-token__demo">{children}</div>
    </div>
  );
}

/** Resolves any CSS colour (var(), color-mix(), rgba()) to [r, g, b, a] by painting it. */
function resolveColour(css: string, host: HTMLElement): [number, number, number, number] {
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  const probe = document.createElement('span');
  probe.style.color = css;
  host.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  x.clearRect(0, 0, 1, 1);
  x.fillStyle = resolved;
  x.fillRect(0, 0, 1, 1);
  const d = x.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2], d[3] / 255];
}
const lum = ([r, g, b]: number[]) => {
  const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

/** A pair of colours with its measured WCAG ratio, recomputed from the live tokens (so it follows the theme). */
function Contrast({ fg, bg, label, need = 4.5 }: { fg: string; bg: string; label: string; need?: number }) {
  const { resolvedTheme } = useTheme();
  const [r, setR] = useState<number>();
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const b = resolveColour(bg, host.current);
    const f = resolveColour(fg, host.current);
    const a = f[3];
    const mixed = [0, 1, 2].map((i) => f[i] * a + b[i] * (1 - a));
    const [hi, lo] = [lum(mixed), lum(b)].sort((m, n) => n - m);
    setR((hi + 0.05) / (lo + 0.05));
  }, [fg, bg, resolvedTheme]);
  return (
    <div ref={host} className="sg-contrast" style={{ background: bg, color: fg }}>
      <strong>Aa</strong>
      <span>{label}</span>
      <code className={r !== undefined && r < need ? 'is-low' : ''}>{r ? `${r.toFixed(1)}:1` : '…'} {r !== undefined && r >= need ? 'AA' : r ? 'below AA' : ''}</code>
    </div>
  );
}

function Section({ id, title, lede, children }: { id: string; title: string; lede?: string; children: ReactNode }) {
  const [params] = useSearchParams();
  const page = params.get('page') as keyof typeof guidePages | null;
  if (page && guidePages[page] && !(guidePages[page].sections as readonly string[]).includes(id)) return null;
  return (
    <section id={id} className="sg-section" aria-labelledby={`${id}-t`}>
      <header>
        <h2 id={`${id}-t`}>{title}</h2>
        {lede && <p>{lede}</p>}
      </header>
      {children}
    </section>
  );
}

function Spec({ name, children, wide }: { name: string; children: ReactNode; wide?: boolean }) {
  return (
    <figure className={`sg-spec ${wide ? 'sg-spec--wide' : ''}`}>
      <div className="sg-spec__stage">{children}</div>
      <figcaption>{name}</figcaption>
    </figure>
  );
}

const act = (type: Activity['type'], userId: string, amount?: number): Activity => ({ id: `${type}-${userId}`, pactId: 'sarahs-birthday', type, userId, amount, at: seedActivities[0].at });

/** Style guide pages, for exporting one group at a time (?page=…). */
export const guidePages = {
  foundations: { title: 'Foundations: variables', sections: ['principles', 'logo', 'colour', 'type', 'space', 'shape', 'motion', 'screens', 'pressed'] },
  actions: { title: 'Components: buttons and inputs', sections: ['buttons', 'inputs'] },
  progress: { title: 'Components: progress and people', sections: ['progress', 'people'] },
  surfaces: { title: 'Components: cards, feed and navigation', sections: ['cards', 'objects', 'navigation'] },
  feedback: { title: 'Components: feedback and marketing', sections: ['feedback', 'marketing'] },
} as const;

const nav = [
  ['principles', 'Principles'],
  ['logo', 'Brand and logo'],
  ['colour', 'Colour'],
  ['type', 'Typography'],
  ['space', 'Spacing & grid'],
  ['shape', 'Radius, borders, shadows'],
  ['motion', 'Motion'],
  ['screens', 'Hero and sheet'],
  ['pressed', 'Pressed states'],
  ['buttons', 'Buttons'],
  ['inputs', 'Inputs'],
  ['progress', 'Progress'],
  ['people', 'People'],
  ['cards', 'Cards & feed'],
  ['objects', 'Living objects'],
  ['navigation', 'Navigation'],
  ['feedback', 'Feedback'],
  ['marketing', 'Marketing'],
];

function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="sg-theme" role="group" aria-label="Preview theme">
      {(['light', 'dark'] as const).map((t) => (
        <button key={t} type="button" className={theme === t ? 'is-on' : ''} onClick={() => setTheme(t)} aria-pressed={theme === t}>
          {t === 'light' ? 'Light' : 'Dark'}
        </button>
      ))}
    </div>
  );
}

export function StyleGuidePage() {
  // Showcase numbers stay pinned to the launch date.
  setFixedClock(true);
  const [seg, setSeg] = useState<'a' | 'b' | 'c'>('a');
  const [chip, setChip] = useState<'10' | '25' | '50'>('25');
  const [amount, setAmount] = useState(25_000);
  const [params] = useSearchParams();
  const page = params.get('page') as keyof typeof guidePages | null;
  const current = page ? guidePages[page] : null;
  useEffect(() => {
    document.title = current ? `PACT · ${current.title}` : 'PACT · Style guide';
  }, [current]);

  return (
    <div className="sg proto--bold">
      <aside className="sg-nav" aria-label="Style guide sections">
        <PactLogo size="md" />
        <p className="sg-nav__label">Style guide</p>
        <nav>
          {nav
            .filter(([id]) => !current || (current.sections as readonly string[]).includes(id))
            .map(([id, label]) => (
              <a key={id} href={`#${id}`}>
                {label}
              </a>
            ))}
        </nav>
        <p className="sg-nav__note">Rendered from the live code: every value and component here is the one the app and website use.</p>
      </aside>

      <main className="sg-main">
        <header className="sg-hero">
          <p className="sg-hero__eyebrow">PACT design system{current ? ` · ${current.title}` : ''}</p>
          <h1>{current ? current.title.split(': ')[1].replace(/^./, (c) => c.toUpperCase()) + '.' : 'One colour per screen. Ink does the work.'}</h1>
          <p>Green and ink are the brand. Every screen commits to the one colour of the thing it is about, sets its title large on it, and lets the body rise over it as a sheet. Hierarchy is size and weight, never fading below AA. Everything gives under a finger. The same system, light and dark.</p>
          <ThemeSwitch />
        </header>

        <Section id="principles" title="Principles" lede="Nine rules. Every screen, component and token follows them, and scripts/design-lint.mjs fails the build when new CSS breaks the ones a machine can check.">
          <ol className="sg-principles">
            {[
              ['One colour per screen', 'A screen commits to the colour of the thing it is about (Ask sky, Plan sun, Split lilac, Pact green, Circle coral). That colour is the hero; the body is the page colour.'],
              ['Green and ink are the brand', 'Green is the signature: the arrow capsule, the create button, progress, done. Ink anchors: titles, primary buttons, the tab bar. Object colours are identity, never brand.'],
              ['Numbers are the biggest thing on a money surface', 'Amounts and dates are set larger than any title, in tabular figures, and never wrap.'],
              ['One solid action', 'One ink button with a green arrow per screen. Second and third actions are tonal or text.'],
              ['Hierarchy is size and weight', 'Ten type roles, four weights. Secondary text keeps AA contrast; it is smaller or lighter in weight, never faded.'],
              ['Depth, not outlines', 'Cards lift with a hairline and a soft shadow. Borders are for fields and selection.'],
              ['Everything gives under a finger', 'Objects scale and shift tone; words get a halo. Pressed never changes hue and never loses contrast.'],
              ['Heroes stay bright', 'In dark mode the sheet follows the theme and the hero does not: what sits on a bright hero is a light island, ink on white.'],
              ['Tokens only', 'No raw colour, size, weight or tracking in app CSS. If a value is missing, add a token here first.'],
            ].map(([t, d], i) => (
              <li key={t}>
                <b>{i + 1}</b>
                <span>
                  <strong>{t}</strong>
                  <em>{d}</em>
                </span>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="logo" title="Brand and logo" lede="Four rounded pieces of different lengths close a loop: people giving different amounts of the same thing, finishing it together. One component, PactLogo, draws it everywhere, from one geometry file.">
          <h3 className="sg-h3">The brand pair</h3>
          <div className="sg-swatches">
            <Swatch token="--brand" label="Brand green" />
            <Swatch token="--brand-ink" label="Brand ink" dark />
            <Swatch token="--green-700" label="Green as text on paper" dark />
            <Swatch token="--paper-100" label="Paper" />
          </div>
          <h3 className="sg-h3">Sizes</h3>
          <div className="sg-row sg-row--end">
            {(['sm', 'md', 'lg', 'xl'] as const).map((size) => (
              <PactLogo key={size} size={size} />
            ))}
          </div>
          <h3 className="sg-h3">Mark only, from favicon size up</h3>
          <div className="sg-row sg-row--end">
            {[16, 20, 24, 32, 48, 64].map((px) => (
              <PactLogo key={px} markOnly decorative markSize={px} />
            ))}
          </div>
          <h3 className="sg-h3">Surfaces</h3>
          <div className="sg-logo-surfaces">
            <div style={{ background: 'var(--color-bg)' }}>
              <PactLogo size="lg" />
            </div>
            <div style={{ background: 'var(--color-surface-inverse)' }}>
              <PactLogo size="lg" tone="light" />
            </div>
            <div style={{ background: 'var(--brand)' }}>
              <PactLogo size="lg" tone="dark" />
            </div>
            <div style={{ background: 'var(--color-surface)' }}>
              <PactLogo size="lg" color="multi" />
            </div>
          </div>
        </Section>

        <Section id="colour" title="Colour" lede="Primitives feed semantic tokens; screens use the semantic ones. Dark mode re-declares the same names, so nothing here is hard-coded to a theme. Ratios below are measured live from the tokens in the current theme.">
          <h3 className="sg-h3">Ink and paper</h3>
          <div className="sg-swatches">
            <Swatch token="--color-bg" label="Page" />
            <Swatch token="--color-bg-sunken" label="Sunken" />
            <Swatch token="--color-surface" label="Surface" />
            <Swatch token="--color-text" label="Text" dark />
            <Swatch token="--color-text-secondary" label="Secondary" dark />
            <Swatch token="--color-text-tertiary" label="Tertiary" dark />
            <Swatch token="--color-border" label="Border" />
            <Swatch token="--color-border-strong" label="Border strong" />
            <Swatch token="--color-danger" label="Danger" dark />
          </div>
          <div className="sg-contrasts">
            <Contrast fg="var(--color-text)" bg="var(--color-bg)" label="Text on page" />
            <Contrast fg="var(--color-text-secondary)" bg="var(--color-bg)" label="Secondary on page" />
            <Contrast fg="var(--color-text-tertiary)" bg="var(--color-surface)" label="Tertiary on surface" />
            <Contrast fg="var(--color-placeholder)" bg="var(--color-surface)" label="Placeholder on field" />
            <Contrast fg="var(--color-accent-text)" bg="var(--color-bg)" label="Green text on page" />
            <Contrast fg="var(--color-danger)" bg="var(--color-bg)" label="Danger on page" />
          </div>
          <h3 className="sg-h3">Object identity: the hero colour and its text</h3>
          <div className="sg-contrasts">
            {(['sky', 'sun', 'lilac', 'green', 'coral', 'pink'] as const).map((t) => (
              <div key={t}>
                <Contrast fg="var(--on-hero)" bg={`var(${t === 'green' ? '--green-500' : `--${t}-400`})`} label={`${t}: primary`} />
                <Contrast fg="var(--on-hero-2)" bg={`var(${t === 'green' ? '--green-500' : `--${t}-400`})`} label="secondary" />
                <Contrast fg="var(--on-hero-3)" bg={`var(${t === 'green' ? '--green-500' : `--${t}-400`})`} label="tertiary" />
              </div>
            ))}
          </div>
          <h3 className="sg-h3">People (identity colours)</h3>
          <div className="sg-people">
            {Object.values(users)
              .filter((u) => sarah.members.some((m) => m.userId === u.id))
              .map((u) => (
                <div key={u.id} className="sg-person">
                  <Avatar userId={u.id} size="lg" accent label={false} />
                  <strong>{u.name}</strong>
                  <code>{u.color}</code>
                </div>
              ))}
          </div>
          <h3 className="sg-h3">Soft tints (chips, tiles, rows)</h3>
          <div className="sg-swatches">
            <Swatch token="--sun-100" label="Sun" />
            <Swatch token="--coral-100" label="Coral" />
            <Swatch token="--sky-50" label="Sky" />
            <Swatch token="--lilac-50" label="Lilac" />
            <Swatch token="--pink-100" label="Pink" />
            <Swatch token="--mint-100" label="Mint" />
          </div>
          <h3 className="sg-h3">Translucent ladders</h3>
          <div className="sg-swatches">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <Swatch key={`v${n}`} token={`--veil-${n}`} label={`Veil ${n}`} dark />
            ))}
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <Swatch key={`s${n}`} token={`--shade-${n}`} label={`Shade ${n}`} />
            ))}
          </div>
        </Section>

        <Section id="type" title="Typography" lede="One typeface: Geist. Ten roles, four weights (400, 500, 600, 700). A piece of text takes one role and a component never sets a size of its own. Tabular numerals for every amount; large numbers are the visual anchors.">
          <div className="sg-type">
            {[
              ['hero', 'Hero', 'The title on a coloured screen', 'Which date works?'],
              ['display', 'Display', 'A moment: a welcome, a name', 'Good evening, Abraham'],
              ['page', 'Page', 'A screen’s title with no hero', 'Name your Circle'],
              ['section', 'Section', 'A group’s heading', 'Needs you'],
              ['object', 'Object', 'A Circle, Ask, Plan, Split or Pact', 'Sarah’s Birthday'],
              ['lead', 'Lead', 'A name, a row title, a hero’s sub-line', 'Maya is in for Jollof cook-off'],
              ['body', 'Body', 'Reading text', 'Everyone sees each contribution as it lands.'],
              ['support', 'Support', 'What sits under a title', '₦320,000 of ₦500,000 · 12 days left'],
              ['label', 'Label', 'Kickers and chips, always caps', 'Question'],
              ['meta', 'Meta', 'Times, counts, fine print', '4m ago'],
            ].map(([role, label, use, sample]) => (
              <TokenRow key={role} token={`--t-${role}-size`}>
                <span className={`t-${role}`} style={{ display: 'block', fontSize: `min(var(--t-${role}-size), 56px)` }}>
                  {sample}
                </span>
                <span className="t-meta">
                  {label}: {use}
                </span>
              </TokenRow>
            ))}
          </div>
          <h3 className="sg-h3">Figures: numerals and emoji</h3>
          <div className="sg-numbers">
            {['--fig-xs', '--fig-sm', '--fig-md', '--fig-lg', '--fig-xl', '--fig-2xl'].map((t) => (
              <TokenRow key={t} token={t}>
                <span className="num" style={{ fontSize: `var(${t})`, fontWeight: 'var(--weight-heavy)', letterSpacing: 'var(--tracking-numeral)' }}>
                  ₦320,000
                </span>
              </TokenRow>
            ))}
          </div>
          <h3 className="sg-h3">Numbers</h3>
          <div className="sg-numbers">
            {['--num-sm', '--num-md', '--num-lg', '--num-xl'].map((t) => (
              <TokenRow key={t} token={t}>
                <span className="num" style={{ fontSize: `var(${t})`, fontWeight: 'var(--weight-bold)', letterSpacing: 'var(--tracking-tight)' }}>
                  ₦320,000
                </span>
              </TokenRow>
            ))}
          </div>
        </Section>

        <Section id="space" title="Spacing & grid" lede="4pt spacing scale. 12-column grid, 24px gap, 16 / 32 / 48px gutters. Breakpoints 480 · 768 · 1024 · 1280 · 1440.">
          <div className="sg-spacing">
            {[1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24].map((n) => (
              <TokenRow key={n} token={`--space-${n}`}>
                <span className="sg-bar" style={{ width: `var(--space-${n})` }} />
              </TokenRow>
            ))}
          </div>
          <div className="sg-grid" aria-hidden>
            {Array.from({ length: 12 }, (_, i) => (
              <span key={i}>{i + 1}</span>
            ))}
          </div>
        </Section>

        <Section id="shape" title="Radius, borders, shadows" lede="Large curved surfaces (20 to 28px), hairline borders drawn as inset shadows, minimal warm shadows.">
          <div className="sg-tiles">
            {['--radius-sm', '--radius-md', '--radius-lg', '--radius-xl', '--radius-2xl', '--radius-3xl', '--radius-full'].map((t) => (
              <Spec key={t} name={t}>
                <span className="sg-tile" style={{ borderRadius: `var(${t})` }} />
              </Spec>
            ))}
          </div>
          <div className="sg-tiles">
            {['--border-hairline', '--border-strong'].map((t) => (
              <Spec key={t} name={t}>
                <span className="sg-tile sg-tile--plain" style={{ border: `var(${t})` }} />
              </Spec>
            ))}
            {['--shadow-xs', '--shadow-sm', '--shadow-md', '--shadow-lg', '--shadow-focus'].map((t) => (
              <Spec key={t} name={t}>
                <span className="sg-tile sg-tile--plain" style={{ boxShadow: `var(${t})` }} />
              </Spec>
            ))}
          </div>
        </Section>

        <Section id="motion" title="Motion" lede="Motion explains behaviour: amounts count, bars fill, segments draw, people pop in. All of it respects reduced motion.">
          <div className="sg-motion">
            {['--ease-out', '--ease-in-out', '--ease-spring', '--duration-fast', '--duration-base', '--duration-slow', '--duration-slower'].map((t) => (
              <TokenRow key={t} token={t} />
            ))}
          </div>
        </Section>

        <Section id="screens" title="Hero and sheet" lede="Every screen has this shape: a hero in the object's colour that runs up under the top bar, the title set large on it in ink, and the body rising over it as a rounded sheet. The hero stays bright in both themes; the sheet follows the theme.">
          <div className="sg-screens">
            {([['sky', 'Which date works?', 'Ask'], ['sun', 'Bali Trip', 'Plan'], ['lilac', 'Airport taxi', 'Split'], ['mint', 'Sarah’s Birthday', 'Pact'], ['coral', 'The Boys', 'Circle']] as const).map(([tint, title, kind]) => (
              <div key={tint} className="sg-screen">
                <Hero tint={tint}>
                  <p className="xh__meta">{kind}</p>
                  <h1 className="xh__title">{title}</h1>
                  <p className="xh__meta">2 of 5 answered</p>
                </Hero>
                <Sheet>
                  <h2 className="t-section">Needs you</h2>
                  <Button size="md">Respond</Button>
                </Sheet>
              </div>
            ))}
          </div>
        </Section>

        <Section id="pressed" title="Pressed states" lede="Press and hold anything on this page. Objects (cards, rows, buttons, chips, tiles) scale to 0.985 and shift tone: a touch darker on paper, lighter on dark. Words get a soft halo in their own colour. Pressed never changes hue, and its contrast is measured with the resting state's.">
          <div className="sg-specs">
            <Spec name="Solid, secondary, tonal">
              <div className="sg-row">
                <Button>Contribute</Button>
                <Button variant="secondary">Invite</Button>
                <button type="button" className="act act--tonal tint--lilac">Mark settled</button>
              </div>
            </Spec>
            <Spec name="Text, link in a sentence">
              <div className="sg-row">
                <button type="button" className="act act--text">Show 7 more</button>
                <p>
                  You can <a href="#pressed">change your vote</a> until it closes.
                </p>
              </div>
            </Spec>
            <Spec name="Card, row">
              <div style={{ maxWidth: 360 }}>
                <PactListItem pact={trip} to="#pressed" />
              </div>
            </Spec>
          </div>
        </Section>

        <Section id="buttons" title="Buttons" lede="One solid action per screen: an ink pill with a green arrow capsule. Secondary is a white pill with a soft lift, tonal is the object’s own tint, and quiet things are text. Disabled is a sunken pill at reduced emphasis.">
          <div className="sg-specs">
            <Spec name="Primary · lg / md / sm">
              <div className="sg-row">
                <Button>Contribute</Button>
                <Button size="md">Contribute</Button>
                <Button size="sm">Contribute</Button>
              </div>
            </Spec>
            <Spec name="Secondary · Ghost · Inverse">
              <div className="sg-row">
                <Button variant="secondary">Invite people</Button>
                <Button variant="ghost">Sign in</Button>
                <Button variant="inverse">Get the app</Button>
              </div>
            </Spec>
            <Spec name="States · loading · disabled · with icon">
              <div className="sg-row">
                <Button loading>Contribute</Button>
                <Button disabled>Enter an amount</Button>
                <Button iconLeft={<Plus />} variant="secondary">
                  New Pact
                </Button>
              </div>
            </Spec>
            <Spec name="Icon buttons · surface / ghost">
              <div className="sg-row">
                <IconButton label="Share" icon={<Share />} />
                <IconButton label="Add" icon={<Plus />} variant="ghost" />
              </div>
            </Spec>
            <Spec name="Hold button · press and hold to confirm money" wide>
              <div style={{ maxWidth: 360 }}>
                <HoldButton label="Hold to contribute ₦25,000" onComplete={() => {}} />
              </div>
            </Spec>
          </div>
        </Section>

        <Section id="inputs" title="Inputs" lede="56px fields, labels above, inline hints and errors. Amounts are entered large and formatted as you type.">
          <div className="sg-specs">
            <Spec name="Input · default / filled / error">
              <div className="sg-col">
                <Input label="What’s the money for?" placeholder="Sarah’s Birthday" />
                <Input label="What’s the money for?" defaultValue="Weekend in Cape Town" hint="23 days left" />
                <Input label="When do you need it?" defaultValue="" error="Pick a date." />
              </div>
            </Spec>
            <Spec name="Amount input · xl">
              <AmountInput label="Amount" hideLabel value={amount} onChange={setAmount} size="xl" align="center" />
            </Spec>
            <Spec name="Segmented · track / chips">
              <div className="sg-col">
                <Segmented label="Plan" value={seg} onChange={setSeg} options={[{ value: 'a', label: 'Trip' }, { value: 'b', label: 'Gift' }, { value: 'c', label: 'Event' }]} />
                <Segmented label="Amount" variant="chips" value={chip} onChange={setChip} options={[{ value: '10', label: '₦10k' }, { value: '25', label: '₦25k' }, { value: '50', label: '₦50k' }]} />
              </div>
            </Spec>
            <Spec name="Plan kind chips and icons">
              <div className="sg-row">
                {(['gift', 'trip', 'event', 'wedding', 'household', 'fund'] as PactCategory[]).map((c) => (
                  <CategoryIcon key={c} category={c} />
                ))}
              </div>
              <div className="sg-row" style={{ marginTop: 12 }}>
                <CategoryChip category="gift" suffix="by you" />
                <CategoryChip category="trip" />
              </div>
            </Spec>
          </div>
        </Section>

        <Section id="progress" title="Progress" lede="Progress is drawn as people: each contributor is a segment in their colour. Tap a segment to single someone out.">
          <div className="sg-specs">
            <Spec name="Segmented ring · light / inverse">
              <div className="sg-row">
                <SegmentedRing shares={sharesOf(sarah)} target={sarah.target} size={176} stroke={16} label="Sarah’s Birthday" animate={false}>
                  <strong className="num sg-ring-num">64%</strong>
                </SegmentedRing>
                <span className="sg-ink-pad">
                  <SegmentedRing shares={sharesOf(sarah)} target={sarah.target} size={132} stroke={14} tone="inverse" label="Sarah’s Birthday" animate={false}>
                    <strong className="num sg-ring-num sg-ring-num--inv">64%</strong>
                  </SegmentedRing>
                </span>
              </div>
            </Spec>
            <Spec name="Segmented bar · with your pending share">
              <div className="sg-col">
                <SegmentedBar shares={sharesOf(sarah)} target={sarah.target} label="Progress" />
                <SegmentedBar shares={sharesOf(sarah)} target={sarah.target} preview={{ amount: 25_000, color: users.abraham.color }} size="lg" label="Progress with preview" />
                <SegmentedBar shares={sharesOf(trip)} target={trip.target} size="sm" label="Trip progress" />
              </div>
            </Spec>
            <Spec name="Progress bar and ring · single value">
              <div className="sg-col">
                <ProgressBar value={64} from={64} size="lg" />
                <div className="sg-row">
                  <ProgressRing value={64} from={64} size={72} stroke={8} />
                  <ProgressRing value={100} from={100} size={72} stroke={8} />
                </div>
              </div>
            </Spec>
          </div>
        </Section>

        <Section id="people" title="People" lede="Rounded portraits with a tinted initials fallback. The identity ring shows whose money is whose. Dashed means invited.">
          <div className="sg-specs">
            <Spec name="Avatar · xs / sm / md / lg / xl">
              <div className="sg-row sg-row--end">
                {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((s) => (
                  <Avatar key={s} userId="sarah" size={s} />
                ))}
              </div>
            </Spec>
            <Spec name="Accent ring · initials fallback · pending">
              <div className="sg-row">
                <Avatar userId="david" size="lg" accent />
                <Avatar userId="tolu" size="lg" accent />
                <Avatar userId="ada" size="lg" />
                <Avatar userId="kemi" size="lg" pending />
              </div>
            </Spec>
            <Spec name="Avatar group · overflow and pending">
              <div className="sg-col">
                <AvatarGroup userIds={sarah.members.map((m) => m.userId)} max={4} size="md" />
                <AvatarGroup userIds={['abraham']} pendingIds={['sarah', 'maya']} max={4} size="md" />
              </div>
            </Spec>
          </div>
        </Section>

        <Section id="cards" title="Cards & feed" lede="Cards lift from the page with a hairline and a soft shadow, with no outline. The first thing that needs you may take the object’s full colour; everything after it is white.">
          <div className="sg-specs">
            <Spec name="Pact in a list (the Pact object, compact)">
              <div style={{ maxWidth: 360 }}>
                <PactListItem pact={trip} to="#cards" />
              </div>
            </Spec>
            <Spec name="Activity item · contribution / join / created / completed" wide>
              <div className="sg-feed">
                <ActivityItem activity={act('contribution', 'david', 40_000)} meta="2h ago" />
                <ActivityItem activity={act('join', 'maya')} meta="12h ago" />
                <ActivityItem activity={act('created', 'abraham')} meta="Sep 2" />
                <ActivityItem activity={act('completed', 'sarah')} meta="Just now" />
              </div>
            </Spec>
          </div>
        </Section>

        <Section id="objects" title="Living objects" lede="Each kind of thing has its own weight, tint and silhouette. Shapes come from --shape-* tokens; status, empty and completion share one language.">
          <div className="sg-specs">
            <Spec name="Kinds · icon, tint, silhouette" wide>
              <div className="sg-row" style={{ gap: 12, flexWrap: 'wrap' }}>
                {(['circle', 'ask', 'plan', 'split', 'pact'] as const).map((k) => (
                  <span key={k} className={`tint--${OBJECT_KINDS[k].tint}`} style={{ display: 'grid', gap: 6, justifyItems: 'center', padding: 14, minWidth: 96, background: 'var(--tint-bg)', color: 'var(--tint-fg)', borderRadius: `var(--shape-${k})`, fontWeight: 600 }}>
                    {OBJECT_KINDS[k].icon}
                    {OBJECT_KINDS[k].noun}
                  </span>
                ))}
              </div>
            </Spec>
            <Spec name="Status indicator">
              <div className="sg-col tint--sky">
                <StatusIndicator tone="live" label="Live" />
                <StatusIndicator tone="waiting" label="Waiting on 2" />
                <StatusIndicator tone="attention" label="Closes today" />
                <StatusIndicator tone="done" label="Settled" />
              </div>
            </Spec>
            <Spec name="Empty state">
              <EmptyState kind="circle" title="Start with the people you already plan with." body="A Circle keeps your group, its plans and its questions in one place." compact />
            </Spec>
            <Spec name="Completion state">
              <CompletionState title="We made it happen." line="Mum’s 60th · 6 people" peopleIds={['abraham', 'maya', 'david']} size="sm" />
            </Spec>
          </div>
        </Section>

        <Section id="navigation" title="Navigation" lede="Top bar for push screens (back) and modal screens (close). A floating pill tab bar echoes the website navigation.">
          <div className="sg-specs">
            <Spec name="Top bar · back with action / close with title">
              <div className="sg-col sg-phone-w">
                <TopBar trailing={<IconButton label="Share" icon={<Share />} />} />
                <TopBar leading="close" title="New Pact" />
              </div>
            </Spec>
            <Spec name="Tab bar (floating pill)">
              <div className="sg-phone-w sg-tabbar">
                <BottomNav />
              </div>
            </Spec>
          </div>
        </Section>

        <Section id="feedback" title="Feedback" lede="Badges for state, toasts for confirmation, bottom sheets for secondary tasks.">
          <div className="sg-specs">
            <Spec name="Badges · neutral / accent / outline / danger / inverse">
              <div className="sg-row">
                <Badge>Draft</Badge>
                <Badge tone="accent" dot>
                  100% funded
                </Badge>
                <Badge tone="outline" dot>
                  12 days left
                </Badge>
                <Badge tone="danger">Payment failed</Badge>
                <span className="sg-ink-pad">
                  <Badge tone="inverse">12 days left</Badge>
                </span>
              </div>
            </Spec>
            <Spec name="Toast · success / neutral">
              <div className="sg-row">
                <div className="toast toast--success">
                  <span className="toast__icon" aria-hidden>
                    <Check strokeWidth={3} />
                  </span>
                  Link copied
                </div>
                <div className="toast toast--neutral">Opening WhatsApp…</div>
              </div>
            </Spec>
            <Spec name="Bottom sheet (modal)">
              <div className="sg-sheet">
                <span className="modal__handle" />
                <p className="modal__title">Invite people</p>
                <p className="modal__description">They’ll get an invite as soon as the Pact is created.</p>
                <Button fullWidth size="md">
                  Add 3 people
                </Button>
              </div>
            </Spec>
          </div>
        </Section>

        <Section id="marketing" title="Marketing" lede="The website reuses the app: real snapshots in a device frame, the same people and colours, and store buttons that lead to the download page.">
          <div className="sg-specs">
            <Spec name="Phone frame with a real app snapshot">
              <div style={{ width: 200 }}>
                <PhoneFrame src="detail" alt="Pact detail screen" />
              </div>
            </Spec>
            <Spec name="Store buttons · dark / light">
              <div className="sg-col">
                <StoreButtons />
                <span className="sg-green-pad">
                  <StoreButtons tone="light" compact />
                </span>
              </div>
            </Spec>
          </div>
        </Section>
      </main>
    </div>
  );
}
