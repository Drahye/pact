import { AnimatePresence, motion } from 'framer-motion';
import { transition } from '../../tokens/tokens';
import './objects.css';

/** A number that changes by sliding: the count in "Needs you · 2" becoming "· 1". Plain opacity under reduced motion. */
export function AnimatedCount({ value }: { value: number }) {
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

