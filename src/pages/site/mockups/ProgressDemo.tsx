import { clamp, lerp, seg, kobo } from './demoKit';
import { PactDetail, type DetailState } from './PactDemo';

/** Scene 3: contributions land, the cake task is claimed and finished, and the next step keeps moving. */
export function progressState(t: number): DetailState {
  const raisedK = lerp(120, 200, seg(t, 0.06, 0.22)) + lerp(0, 120, seg(t, 0.24, 0.46)) + lerp(0, 180, seg(t, 0.5, 0.76));
  const doing = t >= 0.4;
  const done = t >= 0.66;
  const funded = raisedK >= 499.5;
  const latest =
    t >= 0.5
      ? { id: t >= 0.68 ? 'femi' : t >= 0.6 ? 'kemi' : 'daniel', text: 'contributed', amount: t >= 0.68 ? 40 : t >= 0.6 ? 50 : 90 }
      : t >= 0.24
        ? { id: 'maya', text: 'contributed', amount: 120 }
        : { id: 'david', text: 'contributed', amount: 80 };
  const before =
    t >= 0.5 ? { id: t >= 0.68 ? 'kemi' : t >= 0.6 ? 'daniel' : 'maya', text: 'contributed', amount: t >= 0.68 ? 50 : t >= 0.6 ? 90 : 120 } : t >= 0.24 ? { id: 'david', text: 'contributed', amount: 80 } : { id: 'tolu', text: 'contributed', amount: 30 };
  return {
    raisedK: clamp(raisedK, 0, 500),
    people: 8,
    funded,
    next: funded
      ? { title: 'Pay the venue', body: `${kobo(500)} is ready to use`, action: 'Use Pact funds' }
      : doing
        ? { title: 'Order the cake', body: 'Tolu is on it', action: 'Nudge Tolu' }
        : { title: 'Add your share', body: `${kobo(500 - raisedK)} to go`, action: 'Contribute' },
    tasks: [
      { name: 'Book venue', who: 'daniel', status: 'done' },
      { name: 'Order cake', who: doing ? 'tolu' : undefined, status: done ? 'done' : doing ? 'doing' : 'open' },
      { name: 'Pick up decorations', who: 'femi', status: 'doing' },
    ],
    latest,
    before,
  };
}

export const ProgressDemo = ({ t }: { t: number }) => <PactDetail s={progressState(t)} />;
