import { Check, ImagePlus } from 'lucide-react';
import { AppBar, Chip, DemoRing, Face, kobo, NextStepCard, seg, sharesAt, StatusBar, Swap, cast } from './demoKit';

/** Scene 5: the last loose ends settle, the organiser completes the Pact, and the outcome appears. t runs 0..1. */
export function CompleteDemo({ t }: { t: number }) {
  const cake = t >= 0.1;
  const transport = t >= 0.2;
  const decor = t >= 0.3;
  const pressed = t >= 0.42 && t < 0.5;
  const o = seg(t, 0.5, 0.6); // the outcome fades over the checklist
  const pop = seg(t, 0.6, 0.72);
  return (
    <div className="d-screen">
      <div className="d-layer" style={{ opacity: 1 - o, pointerEvents: 'none' }}>
        <StatusBar />
        <AppBar title="Sarah’s Birthday" />
        <div className="d-detail">
          <div className="d-exhead">
            <DemoRing shares={sharesAt(500)} size={58} stroke={7}>
              <b className="d-ring__sm num">100%</b>
            </DemoRing>
            <div>
              <span className="d-pill is-funded">Funded</span>
              <p className="d-exhead__t">Almost done</p>
            </div>
          </div>
          <NextStepCard
            tone="ink"
            title={decor ? 'Complete the Pact' : 'Finish the final task'}
            body={decor ? 'Everything on the plan is done' : 'Pick up decorations'}
            action="Complete Pact"
            pressed={pressed}
          />
          <p className="d-h">Payments</p>
          <ul className="d-lines">
            {[
              { n: 'Venue', k: 200, ok: true },
              { n: 'Cake', k: 80, ok: cake },
              { n: 'Transport', k: 120, ok: transport },
            ].map((l) => (
              <li key={l.n} className="d-line">
                <span className={`d-tick ${l.ok ? 'is-on' : ''}`}>{l.ok && <Check strokeWidth={3} />}</span>
                <span className="d-line__name">
                  <b>{l.n}</b>
                  <small className="num">{kobo(l.k)}</small>
                </span>
                <Swap k={l.ok ? 'p' : 'w'}>
                  <Chip tone={l.ok ? 'mint' : 'sky'}>{l.ok ? 'Paid' : l.n === 'Cake' ? 'Pending' : 'Not paid'}</Chip>
                </Swap>
              </li>
            ))}
          </ul>
          <p className="d-h">Tasks</p>
          <ul className="d-lines">
            <li className="d-line">
              <span className={`d-tick ${decor ? 'is-on' : ''}`}>{decor && <Check strokeWidth={3} />}</span>
              <span className="d-line__name">
                <b>Pick up decorations</b>
                <small>Femi</small>
              </span>
              <Swap k={decor ? 'd' : 'p'}>
                <Chip tone={decor ? 'mint' : 'sky'}>{decor ? 'Done' : 'In progress'}</Chip>
              </Swap>
            </li>
          </ul>
        </div>
      </div>

      <div className="d-layer d-done" style={{ opacity: o, pointerEvents: 'none' }}>
        <StatusBar />
        <span className="d-orb d-orb--a" />
        <span className="d-orb d-orb--b" />
        <span className="d-orb d-orb--c" />
        <div className="d-done__ring" style={{ transform: `scale(${0.92 + pop * 0.08})` }}>
          <DemoRing shares={sharesAt(500)} size={150} stroke={16}>
            <span className="d-check" style={{ transform: `scale(${pop})` }}>
              <Check strokeWidth={3} />
            </span>
          </DemoRing>
        </div>
        <p className="d-done__badge">
          <i /> Completed
        </p>
        <h4 className="d-done__h">We made it happen.</h4>
        <p className="d-done__sub">Sarah’s Birthday took place, with everyone in it.</p>

        <div className="d-receipt">
          <div>
            <span>Used for the plan</span>
            <b className="num">{kobo(400)}</b>
          </div>
          <div>
            <span>Payments</span>
            <b>3 of 3 paid</b>
          </div>
          <div>
            <span>Tasks</span>
            <b>3 of 3 done</b>
          </div>
          <div className="d-receipt__faces">
            <span>8 people made this happen</span>
            <span className="d-faces">
              {cast.slice(0, 6).map((id) => (
                <Face key={id} id={id} size="xs" />
              ))}
            </span>
          </div>
        </div>
        <div className="d-memory">
          <span className="d-memory__t">
            <ImagePlus /> Add a memory
          </span>
          <i className="m1" />
          <i className="m2" />
          <i className="m3" />
        </div>
      </div>
    </div>
  );
}
