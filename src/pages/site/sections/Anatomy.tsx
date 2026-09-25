import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PhoneFrame } from '../../../components/site/PhoneFrame';
import { Reveal } from '../../../components/site/Reveal';
import '../../../components/pact/category.css';
import { SectionHeading } from '../../../components/ui/SectionHeading';
import { formatNaira } from '../../../lib/format';
import { useMediaQuery } from '../../../lib/useMediaQuery';
import { ease } from '../../../tokens/tokens';
import { showcase, showcaseMembers, showcaseSummary as s } from './pactFixtures';

/**
 * Each step is a real screen from the app with a spotlight on the part that matters.
 * Spotlight boxes are percentages of the 390×844 screen.
 */
const steps = [
  {
    key: 'goal',
    label: 'Goal',
    tint: 'sun',
    title: 'Name it and set the number',
    body: `What the money is for, how much, and by when. ${formatNaira(showcase.target)} for ${showcase.title} is the one target everyone joins.`,
    screen: 'create',
    spot: { top: 19.5, left: 4, width: 92, height: 31, label: 'The goal' },
  },
  {
    key: 'people',
    label: 'People',
    tint: 'sky',
    title: 'Bring your people in',
    body: 'One link, shared on WhatsApp or Messages. Everyone who joins shows up on the Pact in their own colour.',
    screen: 'invite-sarah',
    spot: { top: 62, left: 4, width: 92, height: 29, label: `${showcaseMembers.length} people joined` },
  },
  {
    key: 'contributions',
    label: 'Contributions',
    tint: 'coral',
    title: 'Everyone chips in',
    body: 'Pick an amount, see your share land in your colour, then press and hold to send. The whole group sees it move.',
    screen: 'contribute',
    spot: { top: 13, left: 4, width: 92, height: 44, label: 'Your share, previewed' },
  },
  {
    key: 'deadline',
    label: 'Deadline',
    tint: 'lilac',
    title: 'A clear finish line',
    body: `${s.daysLeft} days left and ${formatNaira(s.remaining)} to go. The ring is made of everyone’s money, so nobody wonders where things stand.`,
    screen: 'detail',
    spot: { top: 47.5, left: 4, width: 92, height: 14, label: `${s.daysLeft} days left` },
  },
] as const;

type Step = (typeof steps)[number];

function Spotlight({ step }: { step: Step }) {
  const reduce = useReducedMotion();
  const { top, left, width, height, label } = step.spot;
  return (
    <motion.div
      className={`spot tint--${step.tint}`}
      initial={false}
      animate={{ top: `${top}%`, left: `${left}%`, width: `${width}%`, height: `${height}%` }}
      transition={reduce ? { duration: 0 } : { duration: 0.7, ease: ease.out }}
      aria-hidden
    >
      <span className="spot__label">{label}</span>
    </motion.div>
  );
}

function StepText({ step, index }: { step: Step; index: number }) {
  return (
    <>
      <p className={`how__label tint--${step.tint}`}>
        <span className="how__n num">{index + 1}</span>
        {step.label}
      </p>
      <h3 className="how__title">{step.title}</h3>
      <p className="how__body">{step.body}</p>
    </>
  );
}

function ScrollStep({ index, active, onActive, children }: { index: number; active: boolean; onActive: (i: number) => void; children: ReactNode }) {
  const ref = useRef<HTMLLIElement>(null);
  const inView = useInView(ref, { margin: '-45% 0px -45% 0px' });
  useEffect(() => {
    if (inView) onActive(index);
  }, [inView, index, onActive]);
  return (
    <li ref={ref} className={`how__step ${active ? 'is-active' : ''}`} aria-current={active ? 'step' : undefined}>
      {children}
    </li>
  );
}

export function Anatomy() {
  const wide = useMediaQuery('(min-width: 1024px)');
  const [active, setActive] = useState(0);
  const [slide, setSlide] = useState(0);
  const rail = useRef<HTMLOListElement>(null);
  const step = steps[active];

  return (
    <section id="how" className="section how" aria-labelledby="how-title">
      <div className="container">
        <Reveal>
          <SectionHeading
            variant="site"
            id="how-title"
            title="One goal. Everyone knows where things stand."
            description="Four moments in the app, from naming the goal to watching it fill."
          />
        </Reveal>

        {wide ? (
          <div className="how__grid">
            <ol className="how__steps">
              {steps.map((st, i) => (
                <ScrollStep key={st.key} index={i} active={active === i} onActive={setActive}>
                  <StepText step={st} index={i} />
                </ScrollStep>
              ))}
            </ol>
            <div className="how__sticky">
              <div className={`how__backdrop tint--${step.tint}`} aria-hidden />
              <div className="how__phone">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div
                    key={step.screen}
                    className="how__screen"
                    initial={{ opacity: 0, y: 24, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -24, scale: 0.98 }}
                    transition={{ duration: 0.5, ease: ease.out }}
                  >
                    <PhoneFrame src={step.screen} alt={`PACT app: ${step.title}`} overlay={<Spotlight step={step} />} />
                  </motion.div>
                </AnimatePresence>
              </div>
              <ol className="how__dots" aria-hidden>
                {steps.map((st, i) => (
                  <li key={st.key} className={active === i ? `is-active tint--${st.tint}` : ''}>
                    {st.label}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        ) : (
          <>
            <ol
              className="how__rail"
              ref={rail}
              onScroll={(e) => {
                const el = e.currentTarget;
                const card = el.firstElementChild as HTMLElement | null;
                if (card) setSlide(Math.round(el.scrollLeft / (card.offsetWidth + 12)));
              }}
            >
              {steps.map((st, i) => (
                <li key={st.key} className={`how__card tint--${st.tint}`}>
                  <div className="how__card-phone">
                    <PhoneFrame src={st.screen} alt={`PACT app: ${st.title}`} overlay={<Spotlight step={st} />} />
                  </div>
                  <StepText step={st} index={i} />
                </li>
              ))}
            </ol>
            <div className="how__pager" role="tablist" aria-label="Steps">
              {steps.map((st, i) => (
                <button
                  key={st.key}
                  type="button"
                  role="tab"
                  aria-selected={slide === i}
                  aria-label={`${i + 1}. ${st.label}`}
                  className={slide === i ? 'is-active' : ''}
                  onClick={() => {
                    const el = rail.current;
                    const card = el?.children[i] as HTMLElement | undefined;
                    if (el && card) el.scrollTo({ left: card.offsetLeft - el.offsetLeft - 16, behavior: 'smooth' });
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
