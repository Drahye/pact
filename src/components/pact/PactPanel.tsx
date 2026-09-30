import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import type { Activity, UserId } from '../../data/types';
import { formatNaira } from '../../lib/format';
import { spring } from '../../tokens/tokens';
import { ActivityItem } from '../ui/ActivityItem';
import { AvatarGroup } from '../ui/AvatarGroup';
import { Badge } from '../ui/Badge';
import { ProgressBar } from '../ui/ProgressBar';
import { AnimatedNumber } from './AnimatedNumber';
import './pact-panel.css';

export type PanelPart = 'goal' | 'people' | 'contributions' | 'deadline';

export interface PanelFeedItem {
  activity: Activity;
  meta?: string;
}

interface Props {
  title: string;
  eyebrow?: string;
  raised: number;
  target: number;
  fromRaised?: number;
  daysLeft: number;
  deadlineLabel?: string;
  memberIds: UserId[];
  memberLabel?: string;
  feed?: PanelFeedItem[];
  feedTitle?: ReactNode;
  highlight?: PanelPart | null;
  size?: 'md' | 'lg';
  footer?: ReactNode;
  /** Transient "+₦25,000" marker that rides the progress bar. */
  pulse?: { key: string | number; amount: number } | null;
  className?: string;
  id?: string;
}

/**
 * The Product Preview: the real Pact interface, enlarged for the web.
 * Every marketing section renders this rather than a screenshot.
 */
export function PactPanel({
  title,
  eyebrow,
  raised,
  target,
  fromRaised,
  daysLeft,
  deadlineLabel,
  memberIds,
  memberLabel,
  feed,
  feedTitle = 'Activity',
  highlight = null,
  size = 'lg',
  footer,
  pulse,
  className = '',
  id,
}: Props) {
  const pct = Math.min(100, (raised / Math.max(1, target)) * 100);
  const fromPct = fromRaised !== undefined ? Math.min(100, (fromRaised / Math.max(1, target)) * 100) : undefined;
  const part = (p: PanelPart) => (highlight ? (highlight === p ? 'is-lit' : 'is-dim') : '');
  return (
    <div id={id} className={`panel panel--${size} ${highlight ? 'has-highlight' : ''} ${className}`}>
      <div className="panel__head">
        <div className={`panel__heading ${part('goal')}`}>
          {eyebrow && <p className="panel__eyebrow">{eyebrow}</p>}
          <p className="panel__title">{title}</p>
        </div>
        <Badge tone={pct >= 100 ? 'accent' : 'outline'} className={`panel__deadline ${part('deadline')}`} dot={pct < 100}>
          {pct >= 100 ? 'Funded' : deadlineLabel ?? `${daysLeft} days left`}
        </Badge>
      </div>

      <div className={`panel__money ${part('contributions')}`}>
        <p className="panel__raised">
          <AnimatedNumber value={raised} from={fromRaised} />
        </p>
        <p className={`panel__target ${part('goal')}`}>
          of <span className="num">{formatNaira(target)}</span>
        </p>
      </div>

      <div className={`panel__bar ${part('contributions')}`}>
        <ProgressBar value={pct} from={fromPct} size={size === 'lg' ? 'xl' : 'lg'} label={`${title} funded`} />
        <AnimatePresence>
          {pulse && (
            <motion.span
              key={pulse.key}
              className="panel__pulse num"
              style={{ left: `${pct}%` }}
              initial={{ opacity: 0, y: 8, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8 }}
              transition={spring.snappy}
            >
              +{formatNaira(pulse.amount)}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="panel__row">
        <p className={`panel__pct ${part('contributions')}`}>
          <strong>
            <AnimatedNumber value={pct} from={fromPct} format="percent" />
          </strong>{' '}
          funded
        </p>
        <div className={`panel__people ${part('people')}`}>
          <AvatarGroup userIds={memberIds} max={4} size={size === 'lg' ? 'sm' : 'xs'} total={memberIds.length} />
          <span>{memberLabel ?? `${memberIds.length} people`}</span>
        </div>
      </div>

      {feed && (
        <div className={`panel__feed ${part('contributions')}`}>
          <p className="panel__feed-title">{feedTitle}</p>
          <ul className="activity-list">
            <AnimatePresence initial={false}>
              {feed.map(({ activity, meta }) => (
                <motion.li
                  key={activity.id}
                  layout
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0 } }}
                  transition={spring.gentle}
                >
                  <ActivityItem activity={activity} viewerId={null} meta={meta} size={size === 'lg' ? 'md' : 'sm'} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      )}

      {footer && <div className="panel__footer">{footer}</div>}
    </div>
  );
}
