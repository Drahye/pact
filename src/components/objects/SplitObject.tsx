import { Check } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { formatNaira } from '../../lib/format';
import { koboText } from '../../lib/splitMoney';
import { getUser } from '../../data/users';
import { AnimatedNumber } from '../pact/AnimatedNumber';
import { Avatar } from '../ui/Avatar';
import { DoneMark } from './CompletionState';
import { ActionButton, ObjectLink, type ObjectAction } from './ObjectLink';
import { StatusIndicator } from './StatusIndicator';
import './primitives.css';

export interface SplitShare {
  userId: string;
  /** Naira. */
  amount: number;
  status: 'owed' | 'settled' | 'payer';
  /** The viewer may mark this share settled, or take that back. Without it the row only says where it stands. */
  canChange?: boolean;
}

/**
 * A split as people, not a ledger: the total, who paid, a bar with one segment per person who owes, and each person's share with
 * where it stands. Settling is the moment that matters: the row warms, a tick pops, a segment fills and the amount still to come in
 * counts down. When the last share settles, the whole object resolves. No table, no balances, no banking.
 */
export function SplitObject({
  title,
  total,
  payerId,
  shares = [],
  viewerId,
  onSettle,
  onUndo,
  kobo,
  heading,
  cancelled,
  disabled,
  density = 'full',
  summary,
  href,
  onOpen,
  circleName,
  action,
  modeText,
}: {
  title: string;
  total?: number;
  /** Without it the payer line is left out (a shared link says who paid in its header, and carries no account id). */
  payerId?: string;
  shares?: SplitShare[];
  viewerId?: string;
  /** Called with the person whose share is to be marked settled. */
  onSettle?: (userId: string) => void;
  /** Called with the person whose settled share is to be taken back. */
  onUndo?: (userId: string) => void;
  /** Amounts are kobo (the Split screens): shown to the kobo instead of rounded to the naira. */
  kobo?: boolean;
  /** The Split's own page: the title is the h1 and the head sits on the page; the people sit on one surface below. */
  heading?: boolean;
  cancelled?: boolean;
  disabled?: boolean;
  /** compact: no rows. The amount that matters to you, who paid, and how far along it is. */
  density?: 'full' | 'compact';
  /** Compact only: what the viewer can see without the full list. `owe` is true when the amount is theirs to pay. */
  summary?: { amount: number; owe: boolean; settled: number; count: number };
  href?: string;
  onOpen?: () => void;
  circleName?: string;
  action?: ObjectAction;
  /** "split equally", "custom amounts": said after who paid. */
  modeText?: string;
}) {
  const id = useId();
  const owers = shares.filter((s) => s.status !== 'payer');
  const settled = summary ? summary.settled : owers.filter((s) => s.status === 'settled').length;
  const count = summary ? summary.count : owers.length;
  const left = owers.filter((s) => s.status === 'owed').reduce((t, s) => t + s.amount, 0);
  const resolved = count > 0 && settled === count;
  // The share that has just changed stays warm for a moment, so the change is seen.
  const [fresh, setFresh] = useState<string | null>(null);
  const prev = useRef(shares);
  useEffect(() => {
    const changed = shares.find((s) => s.status === 'settled' && prev.current.find((p) => p.userId === s.userId)?.status === 'owed');
    prev.current = shares;
    if (!changed) return;
    setFresh(changed.userId);
    const t = window.setTimeout(() => setFresh(null), 1600);
    return () => window.clearTimeout(t);
  }, [shares]);
  const name = (uid: string) => (uid === viewerId ? 'You' : getUser(uid).name);
  const bare = shares.length === 0 && !!summary;
  const money = (n: number) => (kobo ? koboText(n) : formatNaira(n));

  if (density === 'compact') {
    const owe = summary?.owe ?? false;
    return (
      <article className={`ox-split ox-split--compact tint--lilac ${resolved ? 'is-resolved' : ''} ${disabled ? 'is-disabled' : ''}`} aria-labelledby={`${id}-t`}>
        <ObjectLink to={href} onOpen={onOpen} className="ox-split__main" label={href ? `${title}. ${owe ? 'You owe' : 'Still to come in'} ${money(summary?.amount ?? 0)}` : undefined}>
          <p className="ox-kicker">
            <StatusIndicator tone="live" />
            <span>Split</span>
            {circleName && <span className="ox-kicker__where">· {circleName}</span>}
          </p>
          <h3 id={`${id}-t`} className="ox-split__title t-object">
            {title}
          </h3>
          <p className="ox-split__line">
            <span className="ox-split__amount num">{money(summary?.amount ?? total ?? 0)}</span>
            <span className="ox-split__who t-support">
              {owe && payerId ? (
                <>
                  <Avatar userId={payerId} size="xs" label={false} /> you owe {name(payerId)}
                </>
              ) : (
                'still to come in'
              )}
            </span>
          </p>
          <span className="ox-split__bar" role="img" aria-label={`${settled} of ${count} settled`}>
            {Array.from({ length: Math.min(count, 8) }, (_, i) => (
              <i key={i} className={i < settled ? 'is-on' : ''} />
            ))}
          </span>
          <p className="ox-split__left t-support">{settled} of {count} settled</p>
        </ObjectLink>
        {action && (
          <div className="ox-split__action">
            <ActionButton action={action} tone="tonal" onOpen={onOpen} />
          </div>
        )}
      </article>
    );
  }

  const Title = heading ? 'h1' : 'h3';
  return (
    <article className={`ox-split tint--lilac ${heading ? 'ox-split--page' : ''} ${resolved ? 'is-resolved' : ''} ${cancelled ? 'is-cancelled' : ''} ${disabled ? 'is-disabled' : ''}`} aria-labelledby={`${id}-t`}>
      <header className="ox-split__head">
        <p className="ox-kicker">
          {resolved ? <DoneMark className="ox-kicker__done" /> : <StatusIndicator tone={cancelled ? 'quiet' : 'live'} />}
          <span>{cancelled ? 'Cancelled' : resolved && !heading ? 'All settled' : 'Split'}</span>
          {circleName && <span className="ox-kicker__where">· {circleName}</span>}
        </p>
        <Title id={`${id}-t`} className={`ox-split__title ${heading ? 't-page' : 't-object'}`}>
          {title}
        </Title>
        <p className="ox-split__total num" aria-label={`Total ${money(total ?? 0)}`}>
          {money(total ?? 0)}
        </p>
        {payerId && (
          <p className="ox-split__payer t-support">
            <Avatar userId={payerId} size="xs" label={false} />
            <span>
              {name(payerId)} paid{modeText ? ` · ${modeText}` : ''}
            </span>
          </p>
        )}
        {!cancelled && (
          <span className="ox-split__bar" role="img" aria-label={`${settled} of ${bare ? count : owers.length} settled`}>
            {bare
              ? Array.from({ length: Math.min(count, 12) }, (_, i) => <i key={i} className={i < settled ? 'is-on' : ''} />)
              : owers.map((s) => (
                  <i key={s.userId} className={s.status === 'settled' ? 'is-on' : ''} />
                ))}
          </span>
        )}
        {!cancelled && !(resolved && heading) && (
          <p className="ox-split__left t-support" role="status">
            {resolved ? (
              'Everyone is square.'
            ) : bare ? (
              `${settled} of ${count} settled`
            ) : owers.length === 0 ? null : settled === 0 ? (
              <>
                No one has settled yet · <b className="ox-split__left-n num">{money(left)}</b> to come in
              </>
            ) : kobo && left % 100 ? (
              <>
                <b className="ox-split__left-n num">{money(left)}</b> still to come in
              </>
            ) : (
              <>
                <AnimatedNumber value={kobo ? left / 100 : left} format="naira" className="ox-split__left-n" /> still to come in
              </>
            )}
          </p>
        )}
      </header>

      {shares.length > 0 && (
      <ul className="ox-split__rows">
        {shares.map((s) => (
          <li key={s.userId} className={`ox-share ${s.status === 'settled' ? 'is-settled' : ''} ${fresh === s.userId ? 'is-fresh' : ''}`}>
            <Avatar userId={s.userId} size={heading ? 'md' : 'sm'} label={false} />
            <span className="ox-share__who">
              <span className="ox-share__name">{name(s.userId)}</span>
              <span className="ox-share__amount num">{money(s.amount)}</span>
            </span>
            {s.status === 'payer' ? (
              <span className="ox-share__state t-support">Paid it</span>
            ) : s.status === 'settled' ? (
              <span className="ox-share__state ox-share__state--done">
                Settled <Check aria-hidden strokeWidth={3} />
                {s.canChange && onUndo && !disabled && (
                  <button type="button" className="ox-share__undo" aria-label={`Mark ${name(s.userId)}’s ${money(s.amount)} as unsettled`} onClick={() => onUndo(s.userId)}>
                    Undo
                  </button>
                )}
              </span>
            ) : onSettle && s.canChange !== false && !disabled && !cancelled ? (
              <button type="button" className="act act--tonal" aria-label={`Mark ${name(s.userId)}’s ${money(s.amount)} as settled`} onClick={() => onSettle(s.userId)}>
                Mark settled
              </button>
            ) : (
              <span className="ox-share__state t-support">Owes</span>
            )}
          </li>
        ))}
      </ul>
      )}
    </article>
  );
}
