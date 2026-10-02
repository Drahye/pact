import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../api/auth';
import { Button } from '../../components/ui/Button';
import { markIntro } from './store';
import { HowScene, ProofScene, PromiseScene } from './scenes';
import { trackOnboarding } from './track';
import './onboarding.css';

const SLIDES = [
  { title: 'Make plans happen together.', body: 'Bring the people, money, tasks and next steps for a shared plan into one place.', Scene: PromiseScene },
  { title: 'Everyone can see what’s happening.', body: 'No more chasing people or guessing what’s left.', Scene: HowScene },
  { title: 'Real plans. Finished together.', body: 'Here is how sample Pacts ended. Yours could be next.', Scene: ProofScene },
] as const;

/**
 * Three short screens for someone brand new, then the choice of where to go. Skippable at any point, never repeated, and
 * every control is a button: swiping is only a shortcut. It leads straight into the real app, not an empty dashboard.
 */
export function OnboardingScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const reduce = !!useReducedMotion();
  const [params] = useSearchParams();
  const replay = params.get('replay') === '1';
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!replay) trackOnboarding('onboarding_started');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Each slide announces itself: focus moves to its heading.
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [i]);

  if (!user) return <Navigate to="/app" replace />;
  const last = i === SLIDES.length - 1;
  const slide = SLIDES[i];

  const go = (next: number) => {
    setDir(next > i ? 1 : -1);
    setI(Math.max(0, Math.min(SLIDES.length - 1, next)));
  };
  const finish = (how: 'finished' | 'skipped', to: string, state?: Record<string, unknown>) => {
    if (!replay) {
      markIntro(user.id, how);
      trackOnboarding('onboarding_completed', { how });
    }
    navigate(to, { replace: true, state });
  };
  const choose = (intent: 'start' | 'join' | 'explore') => {
    trackOnboarding('onboarding_intent_selected', { intent });
    if (intent === 'start') finish('finished', '/app/start', { from: 'onboarding' });
    else if (intent === 'join') finish('finished', '/app/join-invite', { from: 'onboarding' });
    else finish('finished', '/app/demo/sarahs_birthday', { from: 'onboarding' });
  };

  return (
    <div className="ob">
      <header className="ob__top">
        <button type="button" className="ob__back" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Back">
          <ArrowLeft aria-hidden />
        </button>
        <ol className="ob__dots" aria-label={`Step ${i + 1} of ${SLIDES.length}`}>
          {SLIDES.map((s, n) => (
            <li key={s.title} className={n === i ? 'is-on' : n < i ? 'is-past' : ''} aria-current={n === i ? 'step' : undefined}>
              <span className="visually-hidden">{n === i ? `Step ${n + 1}, current` : `Step ${n + 1}`}</span>
            </li>
          ))}
        </ol>
        <button type="button" className="ob__skip" onClick={() => finish('skipped', '/app/home')}>
          Skip
        </button>
      </header>

      <main className="ob__body" tabIndex={0} aria-label="Intro">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.section
            key={i}
            className="ob__slide"
            aria-labelledby="ob-title"
            custom={dir}
            initial={reduce ? false : { opacity: 0, x: dir * 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: dir * -28 }}
            transition={{ duration: reduce ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
            drag={reduce ? false : 'x'}
            dragDirectionLock
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.18}
            onDragEnd={(_, info) => {
              if (info.offset.x < -70 && !last) go(i + 1);
              else if (info.offset.x > 70 && i > 0) go(i - 1);
            }}
          >
            <h1 id="ob-title" className="ob__title" ref={heading} tabIndex={-1}>
              {slide.title}
            </h1>
            <p className="ob__copy">{slide.body}</p>
            <slide.Scene />
          </motion.section>
        </AnimatePresence>
      </main>

      <footer className="ob__foot">
        {last ? (
          <>
            <p className="ob__ask" id="ob-ask">
              What brought you to PACT?
            </p>
            <div className="ob__actions" role="group" aria-labelledby="ob-ask">
              <Button fullWidth onClick={() => choose('start')}>
                Create your first Pact
              </Button>
              <Button fullWidth variant="secondary" onClick={() => choose('join')}>
                I’ve been invited
              </Button>
              <Button fullWidth variant="ghost" onClick={() => choose('explore')}>
                Explore first
              </Button>
            </div>
          </>
        ) : (
          <Button fullWidth onClick={() => go(i + 1)}>
            Continue
          </Button>
        )}
      </footer>
    </div>
  );
}
