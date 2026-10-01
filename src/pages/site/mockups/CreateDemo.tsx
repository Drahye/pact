import { CalendarDays, ChevronRight, Gift, Heart, Plane, Sparkles } from 'lucide-react';
import { AppBar, Face, lin, seg, StatusBar } from './demoKit';

const NAME = 'Sarah’s Birthday';

/** Scene 1: the form fills itself in, then the button wakes up. t runs 0..1. */
export function CreateDemo({ t }: { t: number }) {
  const typed = NAME.slice(0, Math.round(lin(t, 0.04, 0.3) * NAME.length));
  const caret = t < 0.34 && t > 0.01;
  const gift = t >= 0.38;
  const amount = Math.round(500 * seg(t, 0.46, 0.64));
  const date = t >= 0.7;
  const ready = t >= 0.82;
  const pressed = t >= 0.93;
  return (
    <div className="d-screen">
      <StatusBar />
      <AppBar title="New Pact" left="close" />
      <div className="d-form">
        <h4 className="d-form__h">Create a Pact</h4>
        <p className="d-form__sub">Three details and you’re ready to invite people.</p>

        <p className="d-label">What’s the money for?</p>
        <div className={`d-input ${t < 0.34 ? 'is-focus' : ''}`}>
          <span>{typed}</span>
          {caret && <i className="d-caret" />}
          {!typed && <em>Name your plan</em>}
        </div>
        <div className="d-cats">
          <span className={`d-cat ${gift ? 'is-on is-coral' : ''}`}>
            <Gift /> Gift
          </span>
          <span className="d-cat">
            <Plane /> Trip
          </span>
          <span className="d-cat">
            <Sparkles /> Event
          </span>
          <span className="d-cat">
            <Heart /> Wedding
          </span>
        </div>

        <p className="d-label">How much do you need?</p>
        <div className={`d-input d-input--big ${t >= 0.44 && t < 0.7 ? 'is-focus' : ''}`}>
          <span className="num">
            <small>₦</small>
            {amount ? `${amount},000` : '0'}
          </span>
        </div>

        <p className="d-label">When do you need it?</p>
        <div className="d-input d-input--row">
          <span className={date ? '' : 'is-muted'}>{date ? '07/10/2026' : 'dd/mm/yyyy'}</span>
          <CalendarDays />
        </div>
        <p className={`d-hint ${date ? 'is-on' : ''}`}>Oct 7, 2026 · 12 days left</p>

        <p className="d-label">Who are you doing this with?</p>
        <div className="d-input d-input--row">
          <span className="d-faces">
            <Face id="sarah" size="xs" />
            <Face id="david" size="xs" />
            <Face id="maya" size="xs" />
          </span>
          <span>Sarah, David and 1 other</span>
          <ChevronRight />
        </div>
      </div>
      <div className="d-foot">
        <span className={`d-btn d-btn--block ${ready ? 'is-ready' : 'is-off'} ${pressed ? 'is-pressed' : ''}`}>Create Pact</span>
      </div>
    </div>
  );
}
