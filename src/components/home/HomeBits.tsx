import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ComingUpItem, HomeCircleDTO, NeedsYouItem, RecapCardDTO, RecentItem } from '../../../shared/contracts';
import { trackHome } from '../../api/home';
import { formatDate } from '../../lib/format';
import { dateRange } from '../../lib/planDates';
import { transition } from '../../tokens/tokens';
import { peopleLine } from '../../lib/peopleLine';
import { ActivityRow, AnimatedCount, AvatarStack, CircleTile, CompletionState, ComingUpRow } from '../objects';
import { SectionHeading } from '../ui/SectionHeading';
import { NeedItem, needsShape } from './NeedsObjects';
import './home-v2.css';
import './home-v3.css';

/**
 * Home's sections. Each one is composed from the Phase A objects and rows (components/objects); what is Home's own here is which
 * sections there are, in what order, how a thing waits for a beat when it has just been answered, and the analytics.
 */
/** Three objects up front: the most pressing, as the server ranks them. The rest are one tap away, so Needs you stays a short list, not a wall. */
const VISIBLE = 3;

/** Only what the viewer can do now. One object per thing; resolving one collapses it and the count follows. */
export function NeedsYouSection({ items, total, circles = [], caughtUp }: { items: NeedsYouItem[]; total: number; circles?: HomeCircleDTO[]; caughtUp?: boolean }) {
  const [all, setAll] = useState(false);
  // An answered object stays for a beat, showing it was counted, before it leaves; Home has already stopped listing it.
  const [held, setHeld] = useState<{ item: NeedsYouItem; index: number }[]>([]);
  const hold = (item: NeedsYouItem, index: number) => {
    setHeld((h) => (h.some((x) => x.item.id === item.id) ? h : [...h, { item, index }]));
    window.setTimeout(() => setHeld((h) => h.filter((x) => x.item.id !== item.id)), 1300);
  };
  const merged = [...items];
  for (const { item, index } of held) if (!merged.some((m) => m.id === item.id)) merged.splice(Math.min(index, merged.length), 0, item);
  if (!merged.length)
    return caughtUp ? (
      <section className="screen-section screen-section--first" aria-labelledby="needs-you-h">
        <SectionHeading id="needs-you-h" title="Needs you" />
        <CompletionState size="sm" layout="row" title="You’re all caught up." line="Nothing is waiting on you." />
      </section>
    ) : null;
  const shown = all ? merged : merged.slice(0, VISIBLE);
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
      <ul className="hv3-needs">
        <AnimatePresence initial={false}>
          {shown.map((n, i) => (
            <motion.li key={n.id} className={`is-${needsShape(n)}`} layout="position" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, height: 0, marginTop: 0, overflow: 'hidden' }} transition={transition.state}>
              <NeedItem n={n} memberIds={people(n.circleId)} onAnswered={() => hold(n, i)} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {merged.length > VISIBLE && !all && (
        <button type="button" className="act act--text hv3-more" onClick={() => setAll(true)}>
          Show {merged.length - VISIBLE} more
        </button>
      )}
    </section>
  );
}

/** Compact identity tiles, one live line each, in a row that scrolls sideways and can be reached by keyboard. */
export function CirclesShelf({ circles }: { circles: HomeCircleDTO[] }) {
  if (!circles.length) return null;
  return (
    <section className="screen-section" aria-labelledby="hv2-circles-h">
      <SectionHeading id="hv2-circles-h" title="Your Circles" action={{ label: 'See all', to: '/app/circles' }} />
      <ul className="hv3-circles" aria-label="Your Circles">
        {circles.map((c, i) => (
          <li key={c.id}>
            <CircleTile
              name={c.name}
              emoji={c.emoji}
              tint={c.tint}
              peopleIds={c.memberIds}
              total={c.memberCount}
              signal={c.signal.text}
              live={c.signal.kind === 'needs_you'}
              alt={i % 2 === 1}
              to={`/app/circles/${c.id}`}
              onOpen={() => trackHome('circle_opened_from_home', { section: 'circles' })}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

const today = () => `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
const daysUntil = (date: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(today())) / 86_400_000);
/** "Today", "Tomorrow", then the weekday for this week, then the date. */
const whenLabel = (date: string) => {
  const d = daysUntil(date);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  const at = new Date(`${date}T12:00:00`);
  return d < 7 ? at.toLocaleDateString('en-US', { weekday: 'long' }) : at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/**
 * One calm line under the greeting: how much is waiting, and what is next. A sentence, not a dashboard. Counts come from what Home
 * already holds, so it never disagrees with the list below it.
 */
export function HomePulse({ total, next, recent = [], selfId }: { total: number; next?: ComingUpItem; recent?: RecentItem[]; selfId?: string }) {
  const waiting = total === 0 ? 'Nothing is waiting on you.' : total === 1 ? 'One thing needs you.' : `${total} things need you.`;
  const when = next ? whenLabel(next.date) : null;
  // Who has been doing things today: the people, not the events. Never you.
  const startOfDay = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
  const active = [...new Set(recent.filter((r) => r.actorId && r.actorId !== selfId && new Date(r.at).getTime() >= startOfDay).map((r) => r.actorId as string))];
  return (
    <div className="hv3-pulse-wrap">
    <p className="hv3-pulse">
      <strong className={total ? 'is-live' : undefined}>{waiting}</strong>
      {next && when && (
        <span>
          {' '}
          Next up: {next.title}, {when === 'Today' || when === 'Tomorrow' ? when.toLowerCase() : when}.
        </span>
      )}
    </p>
    {active.length > 0 && (
      <p className="hv3-active">
        <AvatarStack userIds={active} total={active.length} size="sm" max={4} ring="bg" />
        <span>{peopleLine(active, null, { names: 2 })} {active.length === 1 ? 'is' : 'are'} active today</span>
      </p>
    )}
    </div>
  );
}

/** An agenda: when on the left, what and how it is going on the right. One ruled list, no boxes. */
export function ComingUpSection({ items }: { items: ComingUpItem[] }) {
  if (!items.length) return null;
  return (
    <section className="screen-section" aria-labelledby="hv2-soon-h">
      <SectionHeading id="hv2-soon-h" title="Coming up" />
      <ul className="hv2-list hv2-list--ruled">
        {items.map((x) => {
          const when = whenLabel(x.date);
          return (
            <li key={`${x.kind}-${x.id}`}>
              <ComingUpRow
                when={when}
                date={x.date}
                today={when === 'Today'}
                title={x.title}
                emoji={x.emoji}
                meta={`${x.kind === 'plan' && x.endDate ? `${dateRange(x.date, x.endDate)} · ` : ''}${x.text}`}
                to={x.url}
                onOpen={() => trackHome('coming_up_opened', { object_type: x.kind, section: 'coming_up' })}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Today, Yesterday, then Earlier: the day a thing happened, in the person's own calendar. */
const dayGroup = (iso: string) => {
  const at = new Date(iso);
  const now = new Date();
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((start(now) - start(at)) / 86_400_000);
  return diff <= 0 ? 'Today' : diff === 1 ? 'Yesterday' : 'Earlier';
};

/** The Activity tab's list of everything, grouped by when it happened. */
export function RecentList({ items }: { items: RecentItem[] }) {
  const groups: { name: string; rows: RecentItem[] }[] = [];
  for (const r of items) {
    const name = dayGroup(r.at);
    const g = groups.find((x) => x.name === name);
    if (g) g.rows.push(r);
    else groups.push({ name, rows: [r] });
  }
  return (
    <div className="hv3-days">
      {groups.map((g) => (
        <section key={g.name} aria-label={g.name} className="hv3-day">
          <h3 className="hv3-day__name">{g.name}</h3>
          <ul className="hv2-list hv2-list--ruled hv2-feed">
            {g.rows.map((r) => (
              <li key={r.id}>
                <ActivityRow actorId={r.actorId} kind={r.objectType} text={r.text} at={r.at} to={r.url} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** What changed, as a feed of people doing things. Open rows on the page, separated by a hairline; the newest few. */
export function RecentSection({ items }: { items: RecentItem[] }) {
  if (!items.length) return null;
  return (
    <section className="screen-section" aria-labelledby="hv2-recent-h">
      <SectionHeading id="hv2-recent-h" title="Recent" action={{ label: 'See all', to: '/app/activity' }} />
      <ul className="hv2-list hv2-list--ruled hv2-feed">
        <AnimatePresence initial={false}>
          {items.slice(0, 6).map((r) => (
            <motion.li key={r.id} layout="position" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={transition.state}>
              <ActivityRow actorId={r.actorId} kind={r.objectType} text={r.text} at={r.at} to={r.url} onOpen={() => trackHome('recent_activity_opened', { object_type: r.objectType, section: 'recent' })} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}

/** Finished things, acknowledged: the completion language as a row: the thing's emoji, what it was, who and when, a way back to the recap. */
export function MadeItHappenSection({ items, title = 'Made it happen' }: { items: RecapCardDTO[]; title?: string }) {
  if (!items.length) return null;
  return (
    <section className="screen-section" aria-labelledby="hv2-recap-h">
      <SectionHeading id="hv2-recap-h" title={title} />
      <ul className="hv3-made">
        {items.map((r) => (
          <li key={`${r.kind}-${r.id}`}>
            <Link to={`${r.url}?from=home`} className="hv3-made__item" aria-label={`View recap: ${r.title}`}>
              <CompletionState
                layout="row"
                announce={false}
                lead={r.emoji}
                title={r.title}
                line={`${r.people} ${r.people === 1 ? 'person' : 'people'} · ${formatDate(r.completedAt, { month: 'short', day: 'numeric' })}`}
                tint={r.kind === 'split' ? 'lilac' : 'mint'}
              />
              <ChevronRight className="hv3-made__go" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
