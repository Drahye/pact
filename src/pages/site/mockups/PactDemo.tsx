import { CalendarDays, Target, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';
import { gsap } from '../../../lib/gsap';
import { ActivityRow, AppBar, clamp, DemoRing, kobo, lerp, NextStepCard, seg, sharesAt, StatusBar, Swap, TARGET_K, TaskRow } from './demoKit';
import { PhoneFrame } from './PhoneFrame';

export interface DetailState {
  raisedK: number;
  people: number;
  next: { title: string; body: string; action: string; pressed?: boolean };
  tasks: { name: string; who?: string; status: 'open' | 'doing' | 'done' }[];
  latest?: { id: string; text: string; amount?: number };
  before?: { id: string; text: string; amount?: number };
  funded?: boolean;
}

/** Sarah's Birthday as the app shows it: ring, facts, the next step, tasks and what just happened. */
export function PactDetail({ s }: { s: DetailState }) {
  const pct = Math.round((s.raisedK / TARGET_K) * 100);
  const toGo = Math.max(0, TARGET_K - s.raisedK);
  return (
    <div className="d-screen">
      <StatusBar />
      <AppBar title="Sarah’s Birthday" right />
      <div className="d-detail">
        <div className="d-ringwrap">
          <DemoRing shares={sharesAt(s.raisedK)} size={156} stroke={16}>
            <b className="d-ring__amt num">{kobo(s.raisedK)}</b>
            <span className="d-ring__of num">of {kobo(TARGET_K)}</span>
            <Swap k={s.funded ? 'f' : 'p'}>
              <span className={`d-pill ${s.funded ? 'is-funded' : ''}`}>{s.funded ? 'Funded' : `${pct}% funded`}</span>
            </Swap>
          </DemoRing>
        </div>
        <ul className="d-stats">
          <li className="d-stat d-stat--sun">
            <CalendarDays />
            <b>12</b>
            <span>days left</span>
          </li>
          <li className="d-stat d-stat--sky">
            <Users />
            <b className="num">{s.people}</b>
            <span>people</span>
          </li>
          <li className="d-stat d-stat--mint">
            <Target />
            <b className="num">{toGo ? kobo(toGo).replace(',000', 'k').replace('₦', '₦') : 'Done'}</b>
            <span>{toGo ? 'to go' : 'raised'}</span>
          </li>
        </ul>
        <NextStepCard {...s.next} />
        <p className="d-h">Tasks</p>
        <ul className="d-list">
          {s.tasks.map((t) => (
            <TaskRow key={t.name} {...t} />
          ))}
        </ul>
        <p className="d-h">Activity</p>
        <ul className="d-list d-list--act">
          {s.latest && <ActivityRow key={`${s.latest.id}-${s.latest.text}`} {...s.latest} fresh />}
          {s.before && <ActivityRow {...s.before} />}
        </ul>
      </div>
    </div>
  );
}

/* Hero: a short loop on a timer ------------------------------------------------------------ */

/** Maps hero time (0..1) to what the phone shows: money lands, the next step moves, someone takes a task, someone joins. */
export function heroState(t: number): DetailState {
  const raisedK = lerp(120, 200, seg(t, 0.12, 0.3)) + lerp(0, 120, seg(t, 0.4, 0.6));
  const david = t >= 0.12;
  const maya = t >= 0.4;
  const taskTaken = t >= 0.72;
  const joined = t >= 0.82;
  const latest = maya
    ? { id: 'maya', text: 'contributed', amount: 120 }
    : david
      ? { id: 'david', text: 'contributed', amount: 80 }
      : { id: 'tolu', text: 'contributed', amount: 30 };
  const before = maya
    ? { id: 'david', text: 'contributed', amount: 80 }
    : david
      ? { id: 'tolu', text: 'contributed', amount: 30 }
      : { id: 'abraham', text: 'contributed', amount: 40 };
  return {
    raisedK,
    people: joined ? 6 : 5,
    next: taskTaken
      ? { title: 'Pick up decorations', body: 'Still needs someone', action: 'Take this task' }
      : t >= 0.4
        ? { title: 'Order the cake', body: 'Claim it so the group knows', action: 'Take this task', pressed: t > 0.66 && t < 0.72 }
        : { title: 'Add your share', body: `${kobo(TARGET_K - raisedK)} to go`, action: 'Contribute' },
    tasks: [
      { name: 'Book venue', who: 'david', status: 'done' },
      { name: 'Order cake', who: taskTaken ? 'tolu' : undefined, status: taskTaken ? 'doing' : 'open' },
      { name: 'Pick up decorations', status: 'open' },
    ],
    latest,
    before,
  };
}

/** The hero phone: plays the loop while it is on screen, holds still for reduced motion. */
export function HeroPhone() {
  const reduce = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box, { margin: '0px 0px -10% 0px' });
  const [t, setT] = useState(reduce ? 0.9 : 0);

  useEffect(() => {
    if (reduce || !inView) return;
    const p = { t: 0 };
    let last = -1;
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.4 });
    tl.to(p, {
      t: 1,
      duration: 11,
      ease: 'none',
      onUpdate: () => {
        const v = Math.round(p.t * 500) / 500;
        if (v !== last) setT((last = v));
      },
    })
      .to({}, { duration: 2.2 })
      .to(p, { t: 0, duration: 0.9, ease: 'power2.inOut', onUpdate: () => setT(clamp(p.t)) });
    return () => {
      tl.kill();
    };
  }, [reduce, inView]);

  const s = heroState(t);
  return (
    <div ref={box} className="hero-phone">
      <PhoneFrame label="PACT showing Sarah's Birthday: ₦320,000 of ₦500,000 raised by 6 people, the next step, tasks and the latest contribution." className="hero-phone__frame">
        <PactDetail s={s} />
      </PhoneFrame>
      <HeroEvents t={t} />
    </div>
  );
}

/** Small notifications that leave the phone as things happen: the group around the plan. */
function HeroEvents({ t }: { t: number }) {
  const on = (a: number, b: number) => (t >= a && t < b ? 'is-on' : '');
  return (
    <>
      <div className={`hero-event hero-event--a ${on(0.14, 0.36)}`} aria-hidden>
        <b>+₦80,000</b>
        <span>David</span>
      </div>
      <div className={`hero-event hero-event--b ${on(0.42, 0.66)}`} aria-hidden>
        <b>+₦120,000</b>
        <span>Maya</span>
      </div>
      <div className={`hero-event hero-event--c ${on(0.74, 0.96)}`} aria-hidden>
        <b>Tolu</b>
        <span>took “Order cake”</span>
      </div>
      <div className={`hero-event hero-event--d ${on(0.84, 1.01)}`} aria-hidden>
        <b>Daniel</b>
        <span>joined</span>
      </div>
    </>
  );
}
