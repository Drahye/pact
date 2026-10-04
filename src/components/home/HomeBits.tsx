import { AnimatePresence, motion } from 'framer-motion';
import { CalendarClock, Check, ChevronRight, Handshake, MessagesSquare, Plus, Receipt } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Attendance, ComingUpItem, HomeCircleDTO, HomeObject, NeedsYouItem, RecapCardDTO, RecentItem } from '../../../shared/contracts';
import { trackHome } from '../../api/home';
import { useRsvp } from '../../api/plans';
import { formatDate, formatRelative } from '../../lib/format';
import { dateRange } from '../../lib/planDates';
import { useStartPactPath } from '../../lib/startPact';
import { spring, transition } from '../../tokens/tokens';
import { CircleBadge } from '../circle/CircleBadge';
import { Avatar } from '../ui/Avatar';
import { AvatarGroup } from '../ui/AvatarGroup';
import { SectionHeading } from '../ui/SectionHeading';
import './home-v2.css';

const VISIBLE = 6;

const OBJECT: Record<HomeObject, { label: string; icon: ReactNode; tint: string }> = {
  plan: { label: 'Plan', icon: <CalendarClock aria-hidden />, tint: 'sun' },
  ask: { label: 'Question', icon: <MessagesSquare aria-hidden />, tint: 'sky' },
  split: { label: 'Split', icon: <Receipt aria-hidden />, tint: 'lilac' },
  pact: { label: 'Pact', icon: <Handshake aria-hidden />, tint: 'mint' },
};

/** A number that changes by sliding: the count in "Needs you · 2" becoming "· 1". Plain opacity under reduced motion. */
function AnimatedCount({ value }: { value: number }) {
  return (
    <span className="hv2-count">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={value} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }} transition={transition.state}>
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** True for a moment when something becomes live: one soft pulse, never a loop. */
function usePulseOnce(active: boolean) {
  const was = useRef(active);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    const becameActive = active && !was.current;
    was.current = active;
    if (!becameActive) return;
    setPulse(true);
    const t = window.setTimeout(() => setPulse(false), 1400);
    return () => window.clearTimeout(t);
  }, [active]);
  return pulse;
}

const ANSWERS: { value: Attendance; label: string; done: string }[] = [
  { value: 'in', label: 'I’m in', done: 'You’re in' },
  { value: 'maybe', label: 'Maybe', done: 'Marked maybe' },
  { value: 'out', label: 'Can’t', done: 'Marked can’t' },
];

/** Answer "are you coming?" right on the card. Same request as the Plan screen's RSVP; the screen is one tap away. */
function RsvpPanel({ planId, url, onClose }: { planId: string; url: string; onClose: () => void }) {
  const rsvp = useRsvp(planId);
  const [picked, setPicked] = useState<Attendance | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string>();

  const choose = async (a: Attendance) => {
    if (rsvp.isPending || done) return;
    setPicked(a);
    setError(undefined);
    try {
      await rsvp.mutateAsync(a);
      setDone(true);
      // Hold the confirmation a beat. If this was the last thing, the card leaves; if not, it shows what is left.
      window.setTimeout(onClose, 1100);
    } catch (e) {
      setPicked(null);
      setError((e as { message?: string }).message ?? 'Couldn’t save that. Try again.');
    }
  };

  return (
    <motion.div className="hv2-rsvp" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={transition.state}>
      {done ? (
        <p className="hv2-rsvp__done" role="status">
          <svg viewBox="0 0 24 24" aria-hidden className="hv2-check">
            <circle cx="12" cy="12" r="10" />
            <path d="M7.5 12.5l3 3 6-6.5" />
          </svg>
          {ANSWERS.find((a) => a.value === picked)?.done}
        </p>
      ) : (
        <>
          <div className="hv2-rsvp__choices" role="radiogroup" aria-label="Your answer">
            {ANSWERS.map((a) => (
              <motion.button key={a.value} type="button" role="radio" aria-checked={picked === a.value} disabled={rsvp.isPending} className={`hv2-rsvp__choice ${picked === a.value ? 'is-picked' : ''}`} onClick={() => choose(a.value)} whileTap={{ scale: 0.96 }} transition={spring.press}>
                {a.label}
              </motion.button>
            ))}
          </div>
          {error && (
            <p className="hv2-rsvp__error" role="alert">
              {error}
            </p>
          )}
          <Link to={url} className="hv2-rsvp__open">
            Open plan
          </Link>
        </>
      )}
    </motion.div>
  );
}

/** One thing that needs the viewer, as an object: its Circle's colour, what it is, what is left, and one clear action. */
function NeedCard({ n, memberIds }: { n: NeedsYouItem; memberIds?: string[] }) {
  const [open, setOpen] = useState(false);
  const kind = OBJECT[n.objectType];
  const tint = n.circle?.tint ?? kind.tint;
  const inline = n.type === 'plan_rsvp';
  const track = () => trackHome('home_needs_you_actioned', { object_type: n.objectType, section: 'needs_you' });
  return (
    <motion.article className={`hv2-need surface surface--interactive tint--${tint}`} data-object={n.objectType} whileTap={{ scale: 0.985 }} transition={spring.press} layout="position">
      <Link
        to={n.actionUrl}
        className="hv2-need__main"
        aria-label={`${n.actionLabel}: ${n.title}. ${n.context}${n.parts.length > 1 ? ` ${n.parts.join(', ')}.` : ''}`}
        onClick={track}
      >
        <span className="hv2-need__top">
          {n.circle ? <CircleBadge emoji={n.circle.emoji} tint={n.circle.tint} size="sm" /> : <span className="icon-tile">{kind.icon}</span>}
          <span className="hv2-need__where">{n.circle?.name ?? kind.label}</span>
          {n.circle && (
            <span className="chip" aria-hidden>
              {kind.icon}
              {kind.label}
            </span>
          )}
        </span>
        <strong className="hv2-need__title">{n.title}</strong>
        <span className="hv2-need__context">{n.context}</span>
        {n.parts.length > 1 && (
          <span className="hv2-need__parts" aria-hidden>
            {n.parts.map((p) => (
              <span key={p} className="chip">
                {p}
              </span>
            ))}
          </span>
        )}
      </Link>
      <div className="hv2-need__foot">
        {inline ? (
          <button type="button" className="hv2-cta" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {n.actionLabel}
            <ChevronRight aria-hidden className={open ? 'is-turned' : ''} />
          </button>
        ) : (
          <Link to={n.actionUrl} className="hv2-cta" onClick={track}>
            {n.actionLabel}
            <ChevronRight aria-hidden />
          </Link>
        )}
        {memberIds && memberIds.length > 0 && <AvatarGroup userIds={memberIds} total={memberIds.length} size="xs" max={3} className="hv2-need__people" />}
      </div>
      <AnimatePresence initial={false}>{open && inline && <RsvpPanel key="rsvp" planId={n.sourceId} url={n.actionUrl} onClose={() => setOpen(false)} />}</AnimatePresence>
    </motion.article>
  );
}

/** Only what the viewer can do now. One card per object; resolving one collapses it and the count follows. */
export function NeedsYouSection({ items, total, circles = [] }: { items: NeedsYouItem[]; total: number; circles?: HomeCircleDTO[] }) {
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, VISIBLE);
  const people = (id?: string) => circles.find((c) => c.id === id)?.memberIds;
  return (
    <section className="screen-section screen-section--first" aria-labelledby="needs-you-h">
      <SectionHeading
        id="needs-you-h"
        title={
          total > 1 ? (
            <>
              Needs you · <AnimatedCount value={total} />
            </>
          ) : (
            'Needs you'
          )
        }
      />
      <ul className="hv2-needs">
        <AnimatePresence initial={false}>
          {shown.map((n) => (
            <motion.li key={n.id} layout="position" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, height: 0, marginTop: 0, overflow: 'hidden' }} transition={transition.state}>
              <NeedCard n={n} memberIds={people(n.circleId)} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {items.length > VISIBLE && !all && (
        <button type="button" className="hv2-more" onClick={() => setAll(true)}>
          Show {items.length - VISIBLE} more
        </button>
      )}
    </section>
  );
}

function CircleTile({ c }: { c: HomeCircleDTO }) {
  const live = c.signal.kind === 'needs_you';
  const pulse = usePulseOnce(live);
  return (
    <Link to={`/app/circles/${c.id}`} className={`hv2-circle surface surface--quiet tint--${c.tint} ${live ? 'is-live' : ''} ${pulse ? 'is-pulsing' : ''}`} onClick={() => trackHome('circle_opened_from_home', { section: 'circles' })}>
      <span className="hv2-circle__head">
        <CircleBadge emoji={c.emoji} tint={c.tint} size="md" />
        {live && <span className="hv2-circle__dot" aria-hidden />}
      </span>
      <span className="hv2-circle__name">{c.name}</span>
      <span className="hv2-circle__signal">{c.signal.text}</span>
      <AvatarGroup userIds={c.memberIds} total={c.memberCount} size="xs" max={3} className="hv2-circle__people" />
    </Link>
  );
}

/** Compact identity tiles, one live line each, in a row that scrolls sideways and can be reached by keyboard. */
export function CirclesShelf({ circles }: { circles: HomeCircleDTO[] }) {
  if (!circles.length) return null;
  return (
    <section className="screen-section" aria-labelledby="hv2-circles-h">
      <SectionHeading id="hv2-circles-h" title="Your Circles" action={{ label: 'See all', to: '/app/circles' }} />
      <ul className="hv2-circles" aria-label="Your Circles">
        {circles.map((c) => (
          <li key={c.id}>
            <CircleTile c={c} />
          </li>
        ))}
      </ul>
    </section>
  );
}

const today = () => `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
const daysUntil = (date: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(today())) / 86_400_000);
const groupOf = (date: string) => {
  const d = daysUntil(date);
  return d <= 0 ? 'Today' : d === 1 ? 'Tomorrow' : d < 7 ? 'This week' : 'Later';
};

/** An editorial list: groups by when, a date column, a title and what is going on. No boxes. */
export function ComingUpSection({ items }: { items: ComingUpItem[] }) {
  if (!items.length) return null;
  const groups: { name: string; rows: ComingUpItem[] }[] = [];
  for (const x of items) {
    const name = groupOf(x.date);
    const g = groups.find((y) => y.name === name);
    if (g) g.rows.push(x);
    else groups.push({ name, rows: [x] });
  }
  return (
    <section className="screen-section" aria-labelledby="hv2-soon-h">
      <SectionHeading id="hv2-soon-h" title="Coming up" />
      <div className="hv2-soon">
        {groups.map((g) => (
          <div key={g.name} className="hv2-soon__group" role="group" aria-label={g.name}>
            <p className="hv2-eyebrow" aria-hidden>
              {g.name}
            </p>
            <ul className="hv2-list hv2-list--ruled">
              {g.rows.map((x) => {
                const d = new Date(`${x.date}T12:00:00`);
                return (
                  <li key={`${x.kind}-${x.id}`}>
                    <Link to={x.url} className="hv2-row" onClick={() => trackHome('coming_up_opened', { object_type: x.kind, section: 'coming_up' })}>
                      <time className="hv2-row__date" dateTime={x.date} aria-label={formatDate(x.date, { weekday: 'long', month: 'long', day: 'numeric' })}>
                        <strong>{d.getDate()}</strong>
                        <span>{d.toLocaleDateString('en-US', { month: 'short' })}</span>
                      </time>
                      <span className="hv2-row__main">
                        <strong>
                          {x.title} <span aria-hidden>{x.emoji}</span>
                        </strong>
                        <span>
                          {x.kind === 'plan' && x.endDate ? `${dateRange(x.date, x.endDate)} · ` : ''}
                          {x.text}
                        </span>
                      </span>
                      <ChevronRight aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/** The same rows as Home's Recent, without the heading: the Activity tab's list of everything. */
export function RecentList({ items }: { items: RecentItem[] }) {
  return (
    <ul className="hv2-list hv2-list--ruled hv2-feed">
      {items.map((r) => (
        <li key={r.id}>
          <Link to={r.url} className="hv2-recent">
            {r.actorId ? <Avatar userId={r.actorId} size="sm" label={false} /> : <span className="hv2-recent__dot" aria-hidden />}
            <span className="hv2-recent__text">{r.text}</span>
            <time className="hv2-recent__time" dateTime={r.at}>
              {formatRelative(r.at)}
            </time>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** What changed, as a feed of people doing things. Open rows on the page, separated by a hairline. */
export function RecentSection({ items }: { items: RecentItem[] }) {
  if (!items.length) return null;
  return (
    <section className="screen-section" aria-labelledby="hv2-recent-h">
      <SectionHeading id="hv2-recent-h" title="Recent" action={{ label: 'See all', to: '/app/activity' }} />
      <ul className="hv2-list hv2-list--ruled hv2-feed">
        {items.map((r) => (
          <li key={r.id}>
            <Link to={r.url} className="hv2-recent" onClick={() => trackHome('recent_activity_opened', { object_type: r.objectType, section: 'recent' })}>
              {r.actorId ? <Avatar userId={r.actorId} size="sm" label={false} /> : <span className="hv2-recent__dot" aria-hidden />}
              <span className="hv2-recent__text">{r.text}</span>
              <time className="hv2-recent__time" dateTime={r.at}>
                {formatRelative(r.at)}
              </time>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Finished things, acknowledged: a warmer surface, the emoji large, a completion mark and what it took. */
export function MadeItHappenSection({ items, title = 'Made it happen' }: { items: RecapCardDTO[]; title?: string }) {
  if (!items.length) return null;
  return (
    <section className="screen-section" aria-labelledby="hv2-recap-h">
      <SectionHeading id="hv2-recap-h" title={title} />
      <ul className="hv2-list">
        {items.map((r) => (
          <li key={`${r.kind}-${r.id}`}>
            <Link to={`${r.url}?from=home`} className="hv2-recapcard surface surface--interactive" aria-label={`View recap: ${r.title}`}>
              <span className="hv2-recapcard__emoji" aria-hidden>
                {r.emoji}
                <span className="hv2-recapcard__done">
                  <Check />
                </span>
              </span>
              <span className="hv2-recapcard__main">
                <strong className="hv2-recapcard__title">{r.title}</strong>
                <span className="hv2-recapcard__line">We made it happen.</span>
                <span className="hv2-recapcard__meta">
                  {r.people} {r.people === 1 ? 'person' : 'people'} · {formatDate(r.completedAt, { month: 'short', day: 'numeric' })}
                </span>
              </span>
              <span className="hv2-recapcard__go">
                View recap
                <ChevronRight aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Nothing started, or nothing running: the four things you can begin. */
export function MakeHappenSection({ heading }: { heading: string }) {
  const startPath = useStartPactPath();
  return (
    <section className="hv2-start" aria-labelledby="hv2-start-h">
      <h2 id="hv2-start-h" className="hv2-start__title">
        {heading}
      </h2>
      <ul className="hv2-start__grid">
        {[
          ['Ask the group', '/app/asks/new'],
          ['Make a plan', '/app/plans/new'],
          ['Split an expense', '/app/splits/new'],
          ['Start a Pact', startPath()],
        ].map(([label, to]) => (
          <li key={to}>
            <Link to={to} className="hv2-start__btn" state={{ from: 'home' }}>
              <Plus aria-hidden />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
