import { Bus, Cake, Landmark } from 'lucide-react';
import type { ReactNode } from 'react';
import { ActivityRow, AppBar, Chip, DemoRing, kobo, NextStepCard, seg, sharesAt, StatusBar, Swap, TARGET_K, type Tone } from './demoKit';

type Line = { name: string; k: number; icon: ReactNode; status: 'none' | 'pending' | 'paid'; pressed: boolean };

const chipFor = (s: Line['status']): { tone: Tone; label: string } =>
  s === 'paid' ? { tone: 'mint', label: 'Paid' } : s === 'pending' ? { tone: 'sky', label: 'Pending' } : { tone: 'sun', label: 'Not paid' };

/** Scene 4: the Pact is funded, and the money starts being used for the plan. t runs 0..1. */
export function ExecuteDemo({ t }: { t: number }) {
  const venueUsed = seg(t, 0.2, 0.36);
  const cakeUsed = seg(t, 0.56, 0.7);
  const poolK = TARGET_K - 200 * venueUsed - 80 * cakeUsed;
  const usedK = TARGET_K - poolK;
  const lines: Line[] = [
    { name: 'Venue', k: 200, icon: <Landmark />, status: t >= 0.38 ? 'paid' : t >= 0.2 ? 'pending' : 'none', pressed: t >= 0.14 && t < 0.2 },
    { name: 'Cake', k: 80, icon: <Cake />, status: t >= 0.7 ? 'pending' : t >= 0.56 ? 'pending' : 'none', pressed: t >= 0.5 && t < 0.56 },
    { name: 'Transport', k: 120, icon: <Bus />, status: 'none', pressed: false },
  ];
  const next =
    t < 0.2
      ? { title: 'Pay the venue', body: `${kobo(200)} from the Pact`, action: 'Pay venue', pressed: t >= 0.14 }
      : t < 0.56
        ? { title: 'Pay the cake', body: `${kobo(80)} from the Pact`, action: 'Pay cake', pressed: t >= 0.5 }
        : { title: 'Pay transport', body: `${kobo(120)} is the last line`, action: 'Pay transport' };
  const act =
    t >= 0.56
      ? [
          { id: 'abraham', text: 'is paying Cake', amount: 80 },
          { id: 'abraham', text: 'paid Venue from the Pact', amount: 200 },
        ]
      : t >= 0.38
        ? [{ id: 'abraham', text: 'paid Venue from the Pact', amount: 200 }, { id: 'femi', text: 'contributed', amount: 40 }]
        : [{ id: 'femi', text: 'contributed', amount: 40 }, { id: 'kemi', text: 'contributed', amount: 50 }];
  return (
    <div className="d-screen">
      <StatusBar />
      <AppBar title="Sarah’s Birthday" right />
      <div className="d-detail">
        <div className="d-exhead">
          <DemoRing shares={sharesAt(500)} size={58} stroke={7}>
            <b className="d-ring__sm num">100%</b>
          </DemoRing>
          <div>
            <span className="d-pill is-funded">Funded</span>
            <p className="d-exhead__t">Making it happen</p>
          </div>
        </div>

        <div className="d-pool">
          <p className="d-pool__l">Left in the Pact</p>
          <p className="d-pool__v num">{kobo(poolK)}</p>
          <div className="d-pool__bar">
            <span style={{ width: `${(usedK / TARGET_K) * 100}%` }} />
          </div>
          <p className="d-pool__s num">
            {kobo(usedK)} used for the plan · {kobo(TARGET_K)} raised
          </p>
        </div>

        <NextStepCard {...next} />

        <p className="d-h">The plan</p>
        <ul className="d-lines">
          {lines.map((l) => {
            const c = chipFor(l.status);
            return (
              <li key={l.name} className="d-line">
                <span className="d-line__icon">{l.icon}</span>
                <span className="d-line__name">
                  <b>{l.name}</b>
                  <small className="num">{kobo(l.k)}</small>
                </span>
                {l.status === 'none' ? (
                  <span className={`d-btn d-btn--xs ${l.pressed ? 'is-pressed' : ''}`}>Pay</span>
                ) : (
                  <Swap k={c.label}>
                    <Chip tone={c.tone}>{c.label}</Chip>
                  </Swap>
                )}
              </li>
            );
          })}
        </ul>
        <p className="d-h">Activity</p>
        <ul className="d-list d-list--act">
          {act.map((a, i) => (
            <ActivityRow key={`${a.text}-${a.id}`} {...a} fresh={i === 0} />
          ))}
        </ul>
      </div>
    </div>
  );
}
