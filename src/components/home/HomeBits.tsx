import { ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ComingUpItem, HomeCircleDTO, NeedsYouItem, RecapCardDTO, RecentItem } from '../../../shared/contracts';
import { trackHome } from '../../api/home';
import { formatDate, formatRelative } from '../../lib/format';
import { dateRange } from '../../lib/planDates';
import { useStartPactPath } from '../../lib/startPact';
import { CircleBadge } from '../circle/CircleBadge';
import { Avatar } from '../ui/Avatar';
import { AvatarGroup } from '../ui/AvatarGroup';
import { SectionHeading } from '../ui/SectionHeading';
import './home-v2.css';

const VISIBLE = 6;

/** Only what the viewer can do now. One card per object; the lead action is named, the rest are listed underneath. */
export function NeedsYouSection({ items, total }: { items: NeedsYouItem[]; total: number }) {
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, VISIBLE);
  return (
    <section className="screen-section screen-section--first" aria-labelledby="needs-you-h">
      <SectionHeading id="needs-you-h" title={total > 1 ? `Needs you · ${total}` : 'Needs you'} />
      <ul className="hv2-needs">
        {shown.map((n) => (
          <li key={n.id}>
            <Link
              to={n.actionUrl}
              className={`hv2-need hv2-need--${n.objectType}`}
              aria-label={`${n.actionLabel}: ${n.title}. ${n.context}${n.parts.length > 1 ? ` ${n.parts.join(', ')}.` : ''}`}
              onClick={() => trackHome('home_needs_you_actioned', { object_type: n.objectType, section: 'needs_you' })}
            >
              {n.circle && (
                <span className="hv2-need__circle">
                  <CircleBadge emoji={n.circle.emoji} tint={n.circle.tint} size="sm" />
                  <span>{n.circle.name}</span>
                </span>
              )}
              <strong className="hv2-need__title">{n.title}</strong>
              <span className="hv2-need__context">{n.context}</span>
              {n.parts.length > 1 && <span className="hv2-need__parts">{n.parts.join(' · ')}</span>}
              <span className="hv2-need__action">
                {n.actionLabel}
                <ChevronRight aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {items.length > VISIBLE && !all && (
        <button type="button" className="hv2-more" onClick={() => setAll(true)}>
          Show {items.length - VISIBLE} more
        </button>
      )}
    </section>
  );
}

/** One live line per Circle, in a row that scrolls sideways and can be reached by keyboard. */
export function CirclesShelf({ circles }: { circles: HomeCircleDTO[] }) {
  if (!circles.length) return null;
  return (
    <section className="screen-section" aria-labelledby="hv2-circles-h">
      <SectionHeading id="hv2-circles-h" title="Your Circles" action={{ label: 'See all', to: '/app/circles' }} />
      <ul className="hv2-circles" aria-label="Your Circles">
        {circles.map((c) => (
          <li key={c.id}>
            <Link to={`/app/circles/${c.id}`} className={`hv2-circle ${c.signal.kind === 'needs_you' ? 'is-live' : ''}`} onClick={() => trackHome('circle_opened_from_home', { section: 'circles' })}>
              <span className="hv2-circle__head">
                <CircleBadge emoji={c.emoji} tint={c.tint} size="md" />
                <AvatarGroup userIds={c.memberIds} total={c.memberCount} size="xs" max={3} />
              </span>
              <span className="hv2-circle__name">{c.name}</span>
              <span className="hv2-circle__signal">{c.signal.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const whenLabel = (date: string) => {
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / 86_400_000);
  return days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : days < 7 ? new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' }) : formatDate(date, { month: 'short', day: 'numeric' });
};

export function ComingUpSection({ items }: { items: ComingUpItem[] }) {
  if (!items.length) return null;
  return (
    <section className="screen-section" aria-labelledby="hv2-soon-h">
      <SectionHeading id="hv2-soon-h" title="Coming up" />
      <ul className="hv2-list">
        {items.map((x) => (
          <li key={`${x.kind}-${x.id}`}>
            <Link to={x.url} className="hv2-row" onClick={() => trackHome('coming_up_opened', { object_type: x.kind, section: 'coming_up' })}>
              <span className="hv2-row__when">
                <time dateTime={x.date}>{whenLabel(x.date)}</time>
              </span>
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
        ))}
      </ul>
    </section>
  );
}

export function RecentSection({ items }: { items: RecentItem[] }) {
  if (!items.length) return null;
  return (
    <section className="screen-section" aria-labelledby="hv2-recent-h">
      <SectionHeading id="hv2-recent-h" title="Recent" action={{ label: 'See all', to: '/app/activity' }} />
      <ul className="hv2-list">
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

export function MadeItHappenSection({ items, title = 'Made it happen' }: { items: RecapCardDTO[]; title?: string }) {
  if (!items.length) return null;
  return (
    <section className="screen-section" aria-labelledby="hv2-recap-h">
      <SectionHeading id="hv2-recap-h" title={title} />
      <ul className="hv2-list">
        {items.map((r) => (
          <li key={`${r.kind}-${r.id}`}>
            <Link to={`${r.url}?from=home`} className="hv2-recapcard" aria-label={`View recap: ${r.title}`}>
              <span className="hv2-recapcard__emoji" aria-hidden>
                {r.emoji}
              </span>
              <span className="hv2-row__main">
                <strong>{r.title}</strong>
                <span>
                  {r.people} {r.people === 1 ? 'person' : 'people'} · completed {formatDate(r.completedAt, { month: 'short', day: 'numeric' })}
                </span>
              </span>
              <span className="hv2-need__action">
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
