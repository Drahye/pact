import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Activity } from '../../data/types';
import { formatPercent } from '../../lib/format';
import { ActivityItem } from '../ui/ActivityItem';
import { ProgressRing } from '../ui/ProgressRing';
import type { PactCategory } from '../../data/types';
import { CategoryIcon } from './category';
import { ease } from '../../tokens/tokens';
import './feed-group.css';

interface Props {
  title: string;
  percent: number;
  items: Activity[];
  /** App: rows link into the Pact. Site: static. */
  to?: string;
  viewerId?: string | null;
  /** Stagger rows in when scrolled into view (marketing). */
  reveal?: boolean;
  headingLevel?: 'h2' | 'h3';
  category?: PactCategory;
}

/** Activity for one Pact: a progress header, then who did what. */
export function FeedGroup({ title, percent, items, to, viewerId, reveal, headingLevel: H = 'h2', category }: Props) {
  const reduce = useReducedMotion();
  const done = percent >= 100;
  const head = (
    <>
      {category ? <CategoryIcon category={category} size="md" /> : <ProgressRing value={percent} size={36} stroke={4} label={`${title} progress`} />}
      <span className="feed-group__head-text">
        <H className="feed-group__title">{title}</H>
        <span className="num">{done ? 'Fully funded' : `${formatPercent(percent)} funded`}</span>
      </span>
      {to && <ChevronRight aria-hidden />}
    </>
  );
  return (
    <section className="feed-group">
      {to ? (
        <Link to={to} className="feed-group__head">
          {head}
        </Link>
      ) : (
        <div className="feed-group__head">{head}</div>
      )}
      <ul className="activity-list">
        {items.map((a, i) => (
          <motion.li
            key={a.id}
            initial={reveal && !reduce ? { opacity: 0, y: 12 } : false}
            whileInView={reveal ? { opacity: 1, y: 0 } : undefined}
            viewport={{ once: true, margin: '0px 0px -10% 0px' }}
            transition={{ duration: 0.5, ease: ease.out, delay: 0.15 + i * 0.12 }}
          >
            <ActivityItem activity={a} to={to} viewerId={viewerId} />
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
