import { CompletionState, EmptyState, OBJECT_KINDS, StatusIndicator } from '../../components/objects';
import { Check, Plus, Share } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
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
  foundations: { title: 'Foundations: variables', sections: ['logo', 'colour', 'type', 'space', 'shape', 'motion'] },
  actions: { title: 'Components: buttons and inputs', sections: ['buttons', 'inputs'] },
  progress: { title: 'Components: progress and people', sections: ['progress', 'people'] },
  surfaces: { title: 'Components: cards, feed and navigation', sections: ['cards', 'objects', 'navigation'] },
  feedback: { title: 'Components: feedback and marketing', sections: ['feedback', 'marketing'] },
} as const;

const nav = [
  ['logo', 'Logo'],
  ['colour', 'Colour'],
  ['type', 'Typography'],
  ['space', 'Spacing & grid'],
  ['shape', 'Radius, borders, shadows'],
  ['motion', 'Motion'],
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
    <div className="sg">
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
          <h1>{current ? current.title.split(': ')[1].replace(/^./, (c) => c.toUpperCase()) + '.' : 'Calm surfaces. Every colour is someone.'}</h1>
          <p>Warm off-white and deep ink carry the interface. Fresh green means progress and action. Each person owns one vivid colour, and their money is drawn in it wherever it appears.</p>
        </header>

        <Section id="logo" title="Logo" lede="Four rounded pieces of different lengths close a loop: people giving different amounts of the same thing, finishing it together. One component, PactLogo, draws it everywhere, from one geometry file.">
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
            <div style={{ background: 'var(--mint-100)' }}>
              <PactLogo size="lg" tone="dark" />
            </div>
            <div style={{ background: 'var(--color-surface)' }}>
              <PactLogo size="lg" color="multi" />
            </div>
          </div>
        </Section>

        <Section id="colour" title="Colour" lede="Semantic tokens map to primitives. Green is reserved for progress, positive states, the primary action and completion.">
          <h3 className="sg-h3">Core</h3>
          <div className="sg-swatches">
            <Swatch token="--color-bg" label="Background" />
            <Swatch token="--color-bg-sunken" label="Sunken" />
            <Swatch token="--color-surface" label="Surface" />
            <Swatch token="--color-text" label="Ink" dark />
            <Swatch token="--color-text-secondary" label="Ink secondary" dark />
            <Swatch token="--color-text-tertiary" label="Ink tertiary" dark />
            <Swatch token="--color-accent" label="Accent green" />
            <Swatch token="--color-accent-text" label="Green text" dark />
            <Swatch token="--color-accent-soft" label="Mint" />
            <Swatch token="--color-border" label="Border" />
            <Swatch token="--color-border-strong" label="Border strong" />
            <Swatch token="--color-danger" label="Muted red" dark />
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
          <h3 className="sg-h3">Tints (plans and sections)</h3>
          <div className="sg-swatches">
            <Swatch token="--sun-100" label="Sun" />
            <Swatch token="--coral-100" label="Coral" />
            <Swatch token="--sky-50" label="Sky" />
            <Swatch token="--lilac-50" label="Lilac" />
            <Swatch token="--pink-100" label="Pink" />
            <Swatch token="--mint-100" label="Mint" />
          </div>
        </Section>

        <Section id="type" title="Typography" lede="One typeface: Geist. Tabular numerals for every amount. Large numbers are the visual anchors.">
          <div className="sg-type">
            {[
              ['--text-display', 'Display', 'Plan it together.'],
              ['--text-h1', 'H1', 'Money works better together.'],
              ['--text-h2', 'H2', 'Start with what you’re planning.'],
              ['--text-h3', 'H3', 'Bring your people in'],
              ['--text-title', 'Title', 'Sarah’s Birthday'],
              ['--text-lg', 'Body large', 'Create a shared goal, invite your people.'],
              ['--text-body', 'Body', 'Everyone sees each contribution as it lands.'],
              ['--text-sm', 'Small', '12 days left · 8 people'],
              ['--text-caption', 'Caption', 'Just now'],
            ].map(([t, label, sample]) => (
              <TokenRow key={t} token={t}>
                <span style={{ fontSize: `min(var(${t}), 64px)`, fontWeight: t.includes('display') || t.includes('h') || t.includes('title') ? 600 : 400, letterSpacing: '-0.03em' }}>
                  {label}: {sample}
                </span>
              </TokenRow>
            ))}
          </div>
          <h3 className="sg-h3">Numbers</h3>
          <div className="sg-numbers">
            {['--num-sm', '--num-md', '--num-lg', '--num-xl'].map((t) => (
              <TokenRow key={t} token={t}>
                <span className="num" style={{ fontSize: `var(${t})`, fontWeight: 600, letterSpacing: '-0.045em' }}>
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

        <Section id="buttons" title="Buttons" lede="One obvious primary action per screen. Green with ink text for primary, white with a hairline for secondary, ink for dark contexts.">
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

        <Section id="cards" title="Cards & feed" lede="White cards on the warm background; one ink surface per view marks what matters most.">
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
