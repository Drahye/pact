import { AnimatePresence, motion } from 'framer-motion';
import { Check, Divide, HandCoins } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '../../../components/ui/Avatar';
import { SectionHeading } from '../../../components/ui/SectionHeading';
import { getUser } from '../../../data/users';
import { formatNaira } from '../../../lib/format';
import { spring } from '../../../tokens/tokens';

const TARGET = 500_000;
const RAISED = 470_000;
const REST = TARGET - RAISED;
const SPLIT_WITH = ['david', 'maya', 'kemi', 'zara'];

/** The last stretch: one person covers it, or the rest is shared out as an ask, never a charge. */
export function AlmostThere() {
  const [mode, setMode] = useState<'cover' | 'split' | null>(null);
  const covered = mode === 'cover';
  const pct = covered ? 100 : (RAISED / TARGET) * 100;
  const share = Math.ceil(REST / SPLIT_WITH.length);
  return (
    <section className="section almost" aria-labelledby="almost-title">
      <div className="container almost__inner">
        <SectionHeading
          id="almost-title"
          variant="site"
          eyebrow="The last stretch"
          title="Almost there?"
          description="When the goal is close, finish it in one move, or share what’s left. Nobody is charged without confirming."
        />
        <div className="almost__card">
          <p className="almost__label">Sarah’s Birthday</p>
          <p className="almost__amount num">
            <strong>{formatNaira(covered ? TARGET : RAISED)}</strong> / {formatNaira(TARGET)}
          </p>
          <div className="almost__bar" role="progressbar" aria-label="Funded" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
            <motion.span animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
          </div>
          <p className="almost__left num" aria-live="polite">
            {covered ? 'Pact complete.' : `${formatNaira(REST)} left`}
          </p>

          <div className="almost__actions" role="group" aria-label="Finish the goal">
            <button type="button" className={`almost__btn ${mode === 'cover' ? 'is-on' : ''}`} aria-pressed={mode === 'cover'} onClick={() => setMode(mode === 'cover' ? null : 'cover')}>
              <HandCoins aria-hidden /> Cover the rest
            </button>
            <button type="button" className={`almost__btn ${mode === 'split' ? 'is-on' : ''}`} aria-pressed={mode === 'split'} onClick={() => setMode(mode === 'split' ? null : 'split')}>
              <Divide aria-hidden /> Split the rest
            </button>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {mode === 'cover' && (
              <motion.p key="cover" className="almost__result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={spring.gentle}>
                <span className="almost__check">
                  <Check strokeWidth={3} />
                </span>
                <span>
                  <strong>{getUser('abraham').name}</strong> covered the final <strong className="num">{formatNaira(REST)}</strong>.
                </span>
              </motion.p>
            )}
            {mode === 'split' && (
              <motion.ul key="split" className="almost__split" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={spring.gentle}>
                {SPLIT_WITH.map((id) => (
                  <li key={id}>
                    <Avatar userId={id} size="sm" label={false} accent />
                    <span>{getUser(id).name}</span>
                    <strong className="num">{formatNaira(share)}</strong>
                  </li>
                ))}
                <li className="almost__note">Each person gets their share as a note. Nothing moves until they confirm.</li>
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
