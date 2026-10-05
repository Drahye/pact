import { X } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { OBJECT_KINDS as K, type ObjectKind } from '../objects/kinds';
import { IconButton } from '../ui/IconButton';
import { useOverlayRoot } from '../ui/overlay';
import { useDialogFocus } from './useDialogFocus';
import './create-sheet.css';

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const OPEN_MS = 380;
const CLOSE_MS = 280;

export interface CreateChoice {
  kind: ObjectKind;
  title: string;
  body?: string;
  onSelect: () => void;
  disabled?: boolean;
}

/**
 * The shell for the centre +: a dialog that grows out of the button that opened it and offers what can be started. It knows nothing
 * about routes or forms; whoever opens it says what each choice does. `origin` is the button's rectangle; without it (or under
 * reduced motion) the sheet rises or fades instead. `inline` renders it in place for review instead of over the page.
 */
export function CreateSheetShell({ open, origin, onClose, choices, title = 'What do you want to do?', inline }: { open: boolean; origin?: DOMRect; onClose: () => void; choices: CreateChoice[]; title?: string; inline?: boolean }) {
  return (
    <CreateSheetPanel open={open} origin={origin} onClose={onClose} title={title} inline={inline}>
      <ul className="create-sheet" aria-label="Things you can start">
        {choices.map((c) => (
          <CreateOption key={c.kind} choice={c} />
        ))}
      </ul>
    </CreateSheetPanel>
  );
}

/**
 * The sheet that the + becomes. It is clipped to the button's rectangle at first, the same colour, then opens upward to the full
 * sheet while its colour settles to paper and its contents arrive. A clip rather than a scale, so nothing inside is ever stretched.
 * Closing runs it backwards into the button. Without an origin (or under reduced motion) it just rises or fades.
 */
function CreateSheetPanel({ open, origin, onClose, children, title, inline }: { open: boolean; origin?: DOMRect; onClose: () => void; children: ReactNode; title: string; inline?: boolean }) {
  const root = useOverlayRoot();
  const panel = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const originRef = useRef<DOMRect | undefined>(undefined);
  const titleId = useId();
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (origin) originRef.current = origin;

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  /** Clip rectangles that take the panel from the button's shape to its own, and back. */
  const clips = () => {
    const p = panel.current!;
    const r = p.getBoundingClientRect();
    const o = originRef.current;
    if (!o) return null;
    const radius = Math.min(o.width, o.height) / 2;
    const from = `inset(${o.top - r.top}px ${r.right - o.right}px ${r.bottom - o.bottom}px ${o.left - r.left}px round ${radius}px ${radius}px ${radius}px ${radius}px)`;
    const to = 'inset(0px 0px 0px 0px round 28px 28px 0px 0px)';
    return { from, to };
  };

  const run = (dir: 'open' | 'close', done?: () => void) => {
    const p = panel.current;
    const b = backdrop.current;
    const c = body.current;
    if (!p || !b || !c) return done?.();
    const start = dir === 'open';
    const ms = start ? OPEN_MS : CLOSE_MS;
    const fade = (el: HTMLElement, keyframes: Keyframe[], opts: KeyframeAnimationOptions) => el.animate(dir === 'open' ? keyframes : [...keyframes].reverse(), opts);
    if (reduce) {
      p.animate(start ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'both' }).onfinish = () => done?.();
      b.animate(start ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'both' });
      return;
    }
    fade(b, [{ opacity: 0 }, { opacity: 1 }], { duration: ms * 0.7, easing: 'ease-out', fill: 'both' });
    const clip = clips();
    const green = getComputedStyle(document.documentElement).getPropertyValue('--green-500').trim() || 'currentColor';
    const paper = getComputedStyle(p).backgroundColor;
    let a: Animation;
    const extra: Animation[] = [];
    if (clip) {
      a = fade(p, [{ clipPath: clip.from }, { clipPath: clip.to }], { duration: ms, easing: EASE, fill: 'both' });
      // Green at the start, paper by the time the shape is mostly open; the other way round on the way back.
      extra.push(fade(p, [{ backgroundColor: green }, { backgroundColor: paper }], { duration: ms * 0.5, delay: start ? 0 : ms * 0.5, easing: 'ease-out', fill: 'both' }));
      // The contents arrive once the shape is mostly there, and leave first on the way out.
      c.animate(start ? [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }] : [{ opacity: 1 }, { opacity: 0 }], { duration: start ? 240 : 120, delay: start ? 150 : 0, easing: EASE, fill: 'both' });
    } else {
      a = fade(p, [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { duration: ms, easing: EASE, fill: 'both' });
    }
    a.onfinish = () => {
      // The animation held its end state with fill; release it so the panel is an ordinary element again.
      if (start) {
        a.cancel();
        extra.forEach((x) => x.cancel());
        c.getAnimations().forEach((x) => x.cancel());
        b.getAnimations().forEach((x) => x.cancel());
      }
      done?.();
    };
  };

  useLayoutEffect(() => {
    if (mounted && open) {
      setVisible(true);
      run('open');
    }
  }, [mounted, open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open && mounted && visible) {
      run('close', () => {
        setVisible(false);
        setMounted(false);
        originRef.current = undefined;
      });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useDialogFocus(panel, open && mounted, onClose);

  if (!root || !mounted) return null;
  const inFrame = root !== document.body;
  const tree = (
    <div className={`csheet ${inFrame || inline ? 'csheet--frame' : ''} ${inline ? 'csheet--inline' : ''}`}>
      <div ref={backdrop} className="csheet__backdrop" onClick={onClose} />
      <div ref={panel} className="csheet__panel" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div ref={body} className="csheet__body">
          <span className="csheet__handle" aria-hidden />
          <header className="csheet__header">
            <h2 id={titleId} className="csheet__title">
              {title}
            </h2>
            <IconButton label="Close" icon={<X />} variant="ghost" onClick={onClose} />
          </header>
          {children}
        </div>
      </div>
    </div>
  );
  return inline ? tree : createPortal(tree, root);
}


function CreateOption({ choice }: { choice: CreateChoice }) {
  const k = K[choice.kind];
  return (
    <li>
      <button type="button" disabled={choice.disabled} className={`create-sheet__option create-sheet__option--${choice.kind} tint--${k.tint}`} onClick={choice.onSelect}>
        <span className="create-sheet__icon" aria-hidden>
          {k.icon}
        </span>
        <span className="create-sheet__text">
          <span className="create-sheet__title">{choice.title}</span>
          <span className="create-sheet__body">{choice.body ?? k.blurb}</span>
        </span>
      </button>
    </li>
  );
}
