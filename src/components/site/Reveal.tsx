import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { ease } from '../../tokens/tokens';

interface Props {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: 'div' | 'li' | 'section';
}

/** Scroll-triggered fade-and-rise, once. */
export function Reveal({ children, delay = 0, y = 20, className, as = 'div' }: Props) {
  const reduce = useReducedMotion();
  const Comp = motion[as];
  return (
    <Comp
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ duration: 0.7, ease: ease.out, delay }}
    >
      {children}
    </Comp>
  );
}
