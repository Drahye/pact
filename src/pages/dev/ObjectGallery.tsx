import { Plus } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import type { Attendance } from '../../../shared/contracts';
import { CreateSheetShell } from '../../components/create/CreateSheetShell';
import {
  ActivityRow,
  AskObject,
  AvatarStack,
  CircleTile,
  CompletionState,
  ComingUpRow,
  PactObject,
  PlanObject,
  SplitObject,
  StatusIndicator,
  type AskOption,
  type SplitShare,
} from '../../components/objects';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import type { Share } from '../../components/pact/SegmentedRing';
import './object-gallery.css';

/**
 * A review page for the design system's primitives: tokens, buttons, and every living object in every state, in light and dark side by
 * side. Development only: it is not linked from anywhere and is not routed in a production build.
 */
const iso = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
const day = (d: number) => iso(d).slice(0, 10);
const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

type Mode = 'light' | 'dark';

function Pair({ children }: { children: (mode: Mode) => ReactNode }) {
  const [params] = useSearchParams();
  const theme = params.get('theme') ?? 'both';
  const modes: Mode[] = theme === 'light' ? ['light'] : theme === 'dark' ? ['dark'] : ['light', 'dark'];
  return (
    <div className={`gal-pair ${modes.length === 1 ? 'is-single' : ''}`}>
      {modes.map((m) => (
        <div key={m} className="gal-frame" data-preview-theme={m} data-mode={m}>
          <p className="gal-frame__tag">{m}</p>
          {children(m)}
        </div>
      ))}
    </div>
  );
}

function Section({ id, title, lede, children }: { id: string; title: string; lede?: string; children: ReactNode }) {
  return (
    <section id={id} className="gal-section" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} className="t-page">
        {title}
      </h2>
      {lede && <p className="t-support gal-lede">{lede}</p>}
      {children}
    </section>
  );
}

const State = ({ name, children, wide }: { name: string; children: ReactNode; wide?: boolean }) => (
  <figure className={`gal-state ${wide ? 'is-wide' : ''}`}>
    <figcaption className="t-label">{name}</figcaption>
    {children}
  </figure>
);

/* ---- tokens ---------------------------------------------------------------------------------------------------- */
const TINTS = ['coral', 'sky', 'lilac', 'sun', 'pink', 'mint'] as const;

function Tokens() {
  return (
    <>
      <Section id="color" title="Colour" lede="Ink and paper, one green, and six tints. Components take colour from tokens, never from a raw value.">
        <Pair>
          {() => (
            <>
              <div className="gal-swatches">
                {['--color-bg', '--color-surface', '--color-text', '--color-text-secondary', '--color-text-tertiary', '--green-500', '--color-selected', '--color-border-strong'].map((t) => (
                  <span key={t} className="gal-swatch">
                    <i style={{ background: `var(${t})` }} />
                    <code>{t.replace('--', '')}</code>
                  </span>
                ))}
              </div>
              <div className="gal-tints">
                {TINTS.map((t) => (
                  <span key={t} className={`gal-tint tint--${t}`}>
                    <b>{t}</b>
                    <i className="gal-tint__solid" />
                    <i className="gal-tint__bg" />
                    <i className="gal-tint__fg">Aa</i>
                  </span>
                ))}
              </div>
            </>
          )}
        </Pair>
      </Section>

      <Section id="type" title="Type roles" lede="Eight roles. One role per piece of text.">
        <Pair>
          {() => (
            <div className="gal-type">
              <p className="t-display">Display</p>
              <p className="t-page">Page title</p>
              <p className="t-section">Section title</p>
              <p className="t-object">Object title</p>
              <p className="t-body">Body: the words people read.</p>
              <p className="t-support">Supporting: what sits under a title.</p>
              <p className="t-label">Label</p>
              <p className="t-meta">Meta · 2h ago · 4 in</p>
            </div>
          )}
        </Pair>
      </Section>

      <Section id="shape" title="Surfaces, shapes, borders, elevation" lede="Four surface levels. Each kind of thing has its own silhouette. Rings for borders, three elevations and most things have none.">
        <Pair>
          {() => (
            <>
              <div className="gal-surfaces">
                {[
                  ['0 Base', 'surface-0'],
                  ['1 Quiet', 'surface-1'],
                  ['2 Interactive', 'surface-2'],
                  ['3 Focused', 'surface-3'],
                ].map(([n, c]) => (
                  <span key={c} className={`gal-surface ${c}`}>
                    {n}
                  </span>
                ))}
              </div>
              <div className="gal-shapes">
                {(['circle', 'ask', 'plan', 'split', 'pact'] as const).map((k) => (
                  <span key={k} className="gal-shape" style={{ borderRadius: `var(--shape-${k})` }}>
                    {k}
                  </span>
                ))}
              </div>
              <div className="gal-rings">
                <span className="gal-ring" style={{ boxShadow: 'var(--ring-quiet)' }}>quiet</span>
                <span className="gal-ring" style={{ boxShadow: 'var(--ring-interactive)' }}>interactive</span>
                <span className="gal-ring" style={{ boxShadow: 'var(--ring-selected)' }}>selected</span>
                <span className="gal-ring" style={{ boxShadow: 'var(--elev-1)' }}>elev 1</span>
                <span className="gal-ring" style={{ boxShadow: 'var(--elev-2)' }}>elev 2</span>
              </div>
            </>
          )}
        </Pair>
      </Section>

      <Section id="motion" title="Motion and press" lede="Micro 140, state 220, navigation 320, sheet 380, celebration 550 (ms). Press is 0.985 with a slight dim.">
        <Pair>
          {() => <MotionDemo />}
        </Pair>
      </Section>
    </>
  );
}

function MotionDemo() {
  const [on, setOn] = useState(false);
  const rows: [string, string][] = [['micro', 'var(--motion-micro)'], ['state', 'var(--motion-state)'], ['navigation', 'var(--motion-nav)'], ['sheet', 'var(--motion-sheet)'], ['celebration', 'var(--motion-celebrate)']];
  return (
    <div className="gal-motion">
      <Button variant="secondary" size="md" onClick={() => setOn((v) => !v)}>
        Run {on ? 'back' : 'forward'}
      </Button>
      {rows.map(([n, d]) => (
        <div key={n} className="gal-track">
          <span className="t-meta">{n}</span>
          <span className="gal-track__bar">
            <i style={{ transform: on ? 'translateX(calc(100% * 9))' : 'none', transition: `transform ${d} var(--ease-out)` }} />
          </span>
        </div>
      ))}
      <button type="button" className="gal-press ox-press">
        Press me (0.985)
      </button>
    </div>
  );
}

/* ---- buttons --------------------------------------------------------------------------------------------------- */
function Buttons() {
  return (
    <Section id="buttons" title="Buttons: four roles" lede="Primary is the one confident action. Secondary is tonal. Tertiary is text. Contextual is small and lives inside an object. Not every button is full width, a pill or green.">
      <Pair>
        {() => (
          <div className="gal-buttons">
            <State name="Primary (green) · Ink">
              <div className="gal-row">
                <Button size="md">Continue</Button>
                <Button size="md" variant="ink">
                  Continue
                </Button>
              </div>
            </State>
            <State name="Secondary · Tertiary">
              <div className="gal-row">
                <Button size="md" variant="secondary">
                  Not now
                </Button>
                <Button size="md" variant="tertiary">
                  Skip
                </Button>
              </div>
            </State>
            <State name="Contextual: solid · tonal · text">
              <div className="gal-row tint--sky">
                <button type="button" className="act act--solid">Mark done</button>
                <button type="button" className="act act--tonal">Vote</button>
                <button type="button" className="act act--text">See all</button>
              </div>
            </State>
            <State name="Disabled · loading">
              <div className="gal-row">
                <Button size="md" disabled>
                  Continue
                </Button>
                <Button size="md" loading>
                  Saving
                </Button>
              </div>
            </State>
          </div>
        )}
      </Pair>
    </Section>
  );
}

/* ---- people ---------------------------------------------------------------------------------------------------- */
function People() {
  const [k, setK] = useState(0);
  return (
    <>
      <Section id="avatar" title="Avatar and AvatarStack">
        <Pair>
          {() => (
            <div className="gal-row gal-row--wrap">
              <State name="Sizes">
                <div className="gal-row">
                  {(['xs', 'sm', 'md', 'lg'] as const).map((s) => (
                    <Avatar key={s} userId="sarah" size={s} label={false} />
                  ))}
                </div>
              </State>
              <State name="Pending · accent ring · initials">
                <div className="gal-row">
                  <Avatar userId="david" size="md" pending label={false} />
                  <Avatar userId="maya" size="md" accent label={false} />
                  <Avatar userId="tolu" size="md" label={false} />
                </div>
              </State>
              <State name="Stack · overflow">
                <AvatarStack userIds={['abraham', 'sarah', 'david', 'maya', 'tolu']} size="sm" max={3} />
              </State>
              <State name="Stack · entrance (replays)">
                <div className="gal-row">
                  <AvatarStack key={k} userIds={['abraham', 'sarah', 'david', 'maya']} size="sm" max={4} enter />
                  <button type="button" className="act act--text" onClick={() => setK((v) => v + 1)}>
                    Replay
                  </button>
                </div>
              </State>
            </div>
          )}
        </Pair>
      </Section>
      <Section id="status" title="StatusIndicator">
        <Pair>
          {() => (
            <div className="gal-row gal-row--wrap tint--sky">
              <StatusIndicator tone="live" label="Live" />
              <StatusIndicator tone="waiting" label="Waiting on 2" />
              <StatusIndicator tone="attention" label="Closes today" />
              <StatusIndicator tone="done" label="Settled" />
              <StatusIndicator tone="quiet" label="Quiet" />
            </div>
          )}
        </Pair>
      </Section>
    </>
  );
}

/* ---- rows ------------------------------------------------------------------------------------------------------ */
function Rows() {
  return (
    <>
      <Section id="activity" title="ActivityRow" lede="A thing that happened, in a person's words. Default, linked, and for something with no person.">
        <Pair>
          {() => (
            <div className="gal-list">
              <ActivityRow actorId="abraham" kind="plan" text="Abraham joined Bali Trip" at={ago(3)} />
              <ActivityRow actorId="daniel" kind="split" text="Daniel settled ₦14,000" at={ago(48)} to="#activity" />
              <ActivityRow actorId="sarah" kind="ask" text="Sarah voted Friday" at={ago(60 * 5)} />
              <ActivityRow actorId={null} kind="pact" text="Menu marked done" at={ago(60 * 30)} />
            </div>
          )}
        </Pair>
      </Section>
      <Section id="comingup" title="ComingUpRow" lede="An agenda line, ruled on the page. Today, a weekday, a date, and a disabled one.">
        <Pair>
          {() => (
            <div className="gal-list">
              <ComingUpRow when="Today" today title="Ghana in December" emoji="✨" meta="Oct 3 – Dec 20 · 2 in" to="#a" />
              <ComingUpRow when="Tomorrow" title="Team lunch" emoji="🍽️" meta="3 in" to="#b" />
              <ComingUpRow when="Saturday" title="Beach day" emoji="✈️" meta="2 in · 1 maybe" to="#c" />
              <ComingUpRow when="Oct 16" title="Sarah’s Birthday" emoji="🎉" meta="64% funded" disabled />
            </div>
          )}
        </Pair>
      </Section>
    </>
  );
}

/* ---- circle ---------------------------------------------------------------------------------------------------- */
function Circles() {
  const [sel, setSel] = useState<string | null>('boys');
  return (
    <Section id="circle" title="CircleTile" lede="A place, not a row. Default, live, selected, alternate corner, disabled.">
      <Pair>
        {() => (
          <div className="gal-tiles">
            <State name="Default">
              <CircleTile name="Family" emoji="🏡" tint="coral" peopleIds={['sarah', 'abraham', 'david']} signal="Dinner at Yellow Chilli" to="#family" />
            </State>
            <State name="Live (something needs you)">
              <CircleTile name="The Boys" emoji="✈️" tint="sky" peopleIds={['abraham', 'sarah', 'david', 'maya']} total={5} signal="Which date works? Needs your vote" live alt to="#boys" />
            </State>
            <State name="Selected (pressable)">
              <CircleTile name="Work crew" emoji="🍻" tint="mint" peopleIds={['maya', 'tolu']} signal="Team lunch · starts tomorrow" selected={sel === 'boys'} onOpen={() => setSel(sel === 'boys' ? null : 'boys')} />
            </State>
            <State name="Disabled">
              <CircleTile name="Archived" emoji="🎊" tint="pink" peopleIds={['sarah']} signal="Nothing happening" disabled />
            </State>
          </div>
        )}
      </Pair>
    </Section>
  );
}

/* ---- ask ------------------------------------------------------------------------------------------------------- */
function Asks() {
  const [pick, setPick] = useState<string | null>(null);
  const base: AskOption[] = [
    { id: 'a', label: 'Nov 14', count: 1 },
    { id: 'b', label: 'Nov 21', count: 2 },
    { id: 'c', label: 'Nov 28', count: 0 },
  ];
  // The count moves with the choice, the way a real answer would change it.
  const options = base.map((o) => ({ ...o, count: (o.count ?? 0) + (pick === o.id ? 1 : 0) }));
  return (
    <Section id="ask" title="AskObject" lede="Light and conversational. Tap an answer: it is selected at once, its count ticks, its bar grows. Arrow keys move, Space chooses.">
      <Pair>
        {() => (
          <div className="gal-stack">
            <State name="Default → selected (interactive)">
              <AskObject question="Which weekend works for Lagos?" options={options} selectedId={pick} onSelect={setPick} answered={3 + (pick ? 1 : 0)} of={5} />
            </State>
            <State name="Selected">
              <AskObject question="Where should we eat?" options={[{ id: 'a', label: 'Suya spot', count: 1 }, { id: 'b', label: 'Yellow Chilli', count: 2 }, { id: 'c', label: 'Cook at home', count: 0 }]} selectedId="b" answered={3} of={5} />
            </State>
            <State name="Completed (decided)">
              <AskObject question="Villa or hotel?" options={[{ id: 'a', label: 'Villa', count: 4 }, { id: 'b', label: 'Hotel', count: 1 }]} closed answered={5} of={5} tint="sky" />
            </State>
            <State name="Disabled">
              <AskObject question="Who’s free this weekend?" options={[{ id: 'a', label: 'I’m in' }, { id: 'b', label: 'Maybe' }]} disabled />
            </State>
          </div>
        )}
      </Pair>
    </Section>
  );
}

/* ---- plan ------------------------------------------------------------------------------------------------------ */
function Plans() {
  const [r, setR] = useState<Attendance | null>(null);
  return (
    <Section id="plan" title="PlanObject" lede="Time first. Tap an answer and the pill slides to it. A linked question sits inline. A finished plan goes quiet.">
      <Pair>
        {() => (
          <div className="gal-stack">
            <State name="Default → selected (interactive)">
              <PlanObject title="Bali Trip" date={day(48)} endDate={day(55)} location="Ubud, Bali" goingIds={['sarah', 'david', 'maya']} going={4} maybe={1} rsvp={r} onRsvp={setR} linkedAsk={{ question: 'Villa or hotel?', leading: 'Villa leads' }} />
            </State>
            <State name="Going">
              <PlanObject title="Beach weekend in Lekki" date={day(21)} endDate={day(23)} location="Lekki, Lagos" goingIds={['david', 'maya', 'tolu']} going={3} rsvp="in" />
            </State>
            <State name="Maybe · no date yet">
              <PlanObject title="Detty December" goingIds={['sarah']} going={1} rsvp="maybe" />
            </State>
            <State name="Completed">
              <PlanObject title="Mum’s 60th" date={day(-3)} location="Lagos" goingIds={['sarah', 'david', 'maya']} going={4} done />
            </State>
            <State name="Disabled (RSVPs closed)">
              <PlanObject title="Team lunch" date={day(1)} goingIds={['maya', 'tolu']} going={3} rsvp="in" disabled />
            </State>
          </div>
        )}
      </Pair>
    </Section>
  );
}

/* ---- split ----------------------------------------------------------------------------------------------------- */
function Splits() {
  const [shares, setShares] = useState<SplitShare[]>([
    { userId: 'sarah', amount: 8000, status: 'payer' },
    { userId: 'abraham', amount: 8000, status: 'owed' },
    { userId: 'david', amount: 8000, status: 'settled' },
    { userId: 'maya', amount: 8000, status: 'owed' },
  ]);
  const settle = (id: string) => setShares((s) => s.map((x) => (x.userId === id ? { ...x, status: 'settled' } : x)));
  return (
    <Section id="split" title="SplitObject" lede="Clear and social, not a ledger. Mark a share settled: the row warms, a tick pops, a segment fills, the amount counts down. The last one resolves the whole object.">
      <Pair>
        {() => (
          <div className="gal-stack">
            <State name="Open → settled (interactive)">
              <SplitObject title="Suya and drinks" total={32000} payerId="sarah" shares={shares} viewerId="abraham" onSettle={settle} />
              <button type="button" className="act act--text" onClick={() => setShares((s) => s.map((x) => (x.status === 'settled' && x.userId !== 'david' ? { ...x, status: 'owed' } : x)))}>
                Reset
              </button>
            </State>
            <State name="Partly settled">
              <SplitObject title="Airport taxi" total={18000} payerId="abraham" viewerId="abraham" shares={[{ userId: 'abraham', amount: 4500, status: 'payer' }, { userId: 'sarah', amount: 4500, status: 'settled' }, { userId: 'tolu', amount: 4500, status: 'owed' }, { userId: 'david', amount: 4500, status: 'owed' }]} />
            </State>
            <State name="Completed (fully settled)">
              <SplitObject title="Suya night" total={24000} payerId="abraham" viewerId="abraham" shares={[{ userId: 'abraham', amount: 6000, status: 'payer' }, { userId: 'sarah', amount: 6000, status: 'settled' }, { userId: 'david', amount: 6000, status: 'settled' }, { userId: 'maya', amount: 6000, status: 'settled' }]} />
            </State>
            <State name="Disabled">
              <SplitObject title="Groceries" total={12000} payerId="maya" viewerId="abraham" disabled onSettle={() => undefined} shares={[{ userId: 'maya', amount: 6000, status: 'payer' }, { userId: 'abraham', amount: 6000, status: 'owed' }]} />
            </State>
          </div>
        )}
      </Pair>
    </Section>
  );
}

/* ---- pact ------------------------------------------------------------------------------------------------------ */
const shares = (raised: number): Share[] => [
  { id: 'a', color: 'var(--green-500)', value: raised * 0.34 },
  { id: 'b', color: 'var(--coral-400)', value: raised * 0.26 },
  { id: 'c', color: 'var(--sky-400)', value: raised * 0.22 },
  { id: 'd', color: 'var(--lilac-400)', value: raised * 0.18 },
];

function Pacts() {
  const [done, setDone] = useState(false);
  return (
    <Section id="pact" title="PactObject" lede="The strongest. Segmented by who gave what, your part on it with one small action, and finishing resolves it into a completion with faces.">
      <Pair>
        {() => (
          <div className="gal-stack">
            <State name="Active → task done (interactive)">
              <PactObject title="Sarah’s Birthday" tint="coral" raised={320000} target={500000} shares={shares(320000)} daysLeft={12} contributorIds={['abraham', 'sarah', 'david', 'maya', 'tolu']} assignment={{ label: 'Buy the gift', assigneeId: 'abraham', done }} onMarkDone={() => setDone(true)} />
              {done && (
                <button type="button" className="act act--text" onClick={() => setDone(false)}>
                  Reset
                </button>
              )}
            </State>
            <State name="Active · nothing assigned">
              <PactObject title="Weekend in Cape Town" tint="sky" raised={780000} target={1200000} shares={shares(780000)} daysLeft={77} contributorIds={['david', 'maya', 'tolu']} />
            </State>
            <State name="Completed">
              <PactObject title="Wedding gift" tint="pink" raised={250000} target={250000} shares={shares(250000)} contributorIds={['sarah', 'abraham', 'maya', 'david']} completed onRecap={() => undefined} />
            </State>
            <State name="Disabled">
              <PactObject title="Household fund" tint="sun" raised={90000} target={400000} shares={shares(90000)} daysLeft={30} contributorIds={['tolu']} assignment={{ label: 'Collect receipts', assigneeId: 'tolu' }} onMarkDone={() => undefined} disabled />
            </State>
          </div>
        )}
      </Pair>
    </Section>
  );
}

/* ---- completion + create --------------------------------------------------------------------------------------- */
function Completion() {
  const [k, setK] = useState(0);
  return (
    <Section id="completion" title="CompletionState" lede="One language for finished things: a ring closes, a tick draws, a few sparks leave once, the faces arrive, a way to see what happened.">
      <Pair>
        {() => (
          <div className="gal-stack">
            <button type="button" className="act act--text" onClick={() => setK((v) => v + 1)}>
              Replay
            </button>
            <State name="Pact completed">
              <CompletionState key={`p${k}`} title="We made it happen." line="Sarah’s Birthday · ₦500,000" peopleIds={['abraham', 'sarah', 'david', 'maya']} action={<button type="button" className="act act--solid">View recap</button>} />
            </State>
            <State name="Split settled">
              <CompletionState key={`s${k}`} tint="lilac" title="All settled." line="Everyone is square." peopleIds={['sarah', 'david', 'maya']} />
            </State>
            <State name="Plan finished">
              <CompletionState key={`l${k}`} tint="sun" title="It happened." line="Mum’s 60th · 4 people" peopleIds={['sarah', 'abraham']} size="sm" />
            </State>
            <State name="Task done">
              <CompletionState key={`t${k}`} size="sm" flourish={false} title="Buy the gift, done." />
            </State>
          </div>
        )}
      </Pair>
    </Section>
  );
}

function CreateShell() {
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState<DOMRect | undefined>();
  const btn = useRef<HTMLButtonElement>(null);
  const choices = (['ask', 'plan', 'split', 'pact'] as const).map((kind) => ({ kind, title: { ask: 'Ask the group', plan: 'Make a plan', split: 'Split an expense', pact: 'Start a Pact' }[kind], onSelect: () => setOpen(false) }));
  return (
    <Section id="create" title="CreateSheetShell" lede="Tap +: the button becomes the sheet. The shell knows nothing about routes; whoever opens it says what each choice does.">
      <Pair>
        {(mode) => (
          <div className="gal-stack">
            <State name="Morph from the button (interactive)">
              {mode === 'light' && (
                <button
                  ref={btn}
                  type="button"
                  className="gal-plus"
                  aria-label="Create"
                  aria-haspopup="dialog"
                  aria-expanded={open}
                  onClick={() => {
                    setOrigin(btn.current?.getBoundingClientRect());
                    setOpen(true);
                  }}
                >
                  <Plus aria-hidden />
                </button>
              )}
              {mode === 'dark' && <p className="t-support">Open from the light frame, or use the in-place preview below.</p>}
            </State>
            <State name="In place (static review)" wide>
              <CreateSheetShell inline open onClose={() => undefined} choices={choices} />
            </State>
          </div>
        )}
      </Pair>
      <CreateSheetShell open={open} origin={origin} onClose={() => setOpen(false)} choices={choices} />
    </Section>
  );
}

const NAV: [string, string][] = [['color', 'Colour'], ['type', 'Type'], ['shape', 'Surfaces'], ['motion', 'Motion'], ['buttons', 'Buttons'], ['avatar', 'People'], ['activity', 'Rows'], ['circle', 'Circle'], ['ask', 'Ask'], ['plan', 'Plan'], ['split', 'Split'], ['pact', 'Pact'], ['completion', 'Completion'], ['create', 'Create']];

export function ObjectGallery() {
  const [params, setParams] = useSearchParams();
  const theme = params.get('theme') ?? 'both';
  useEffect(() => {
    document.title = 'PACT UI gallery';
  }, []);
  return (
    <main className="gal">
      <header className="gal-head">
        <h1 className="t-display">PACT UI gallery</h1>
        <p className="t-support">Review only. Tokens, buttons and every living object, in every state, light beside dark.</p>
        <div className="gal-toolbar" role="group" aria-label="Theme">
          {['both', 'light', 'dark'].map((t) => (
            <button key={t} type="button" className={`gal-chip ${theme === t ? 'is-on' : ''}`} aria-pressed={theme === t} onClick={() => setParams({ theme: t })}>
              {t}
            </button>
          ))}
        </div>
        <nav className="gal-nav" aria-label="Sections">
          {NAV.map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
        </nav>
      </header>
      <Tokens />
      <Buttons />
      <People />
      <Rows />
      <Circles />
      <Asks />
      <Plans />
      <Splits />
      <Pacts />
      <Completion />
      <CreateShell />
    </main>
  );
}

/** The router the gallery needs for its links, when it is opened outside the app's own. */
export function ObjectGalleryStandalone() {
  return (
    <MemoryRouter>
      <ObjectGallery />
    </MemoryRouter>
  );
}
