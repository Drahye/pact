import { ArrowDownToLine, Eye, EyeOff, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatNairaKobo } from '../../lib/format';
import { TIER_LIMITS } from '../../../shared/policy';
import './app-ui.css';

interface Props {
  balance: number | undefined;
  tier?: 1 | 2 | 3;
  compact?: boolean;
}

const HIDE_KEY = 'pact.hideBalance';

/** Wallet balance with the two actions people come for. Balance can be hidden for privacy in public. */
export function WalletCard({ balance, tier = 1, compact }: Props) {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(HIDE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggle = () => {
    setHidden((h) => {
      try {
        localStorage.setItem(HIDE_KEY, h ? '0' : '1');
      } catch {
        /* private mode */
      }
      return !h;
    });
  };
  return (
    <section className={`wallet-card ${compact ? 'wallet-card--compact' : ''}`} aria-label="Wallet">
      <span className="wallet-card__shape wallet-card__shape--a" aria-hidden />
      <span className="wallet-card__shape wallet-card__shape--b" aria-hidden />
      <div className="wallet-card__top">
        <p className="wallet-card__label">Wallet balance</p>
        <Link to="/app/profile/verify" className="wallet-card__tier">
          {TIER_LIMITS[tier].label}
        </Link>
      </div>
      <div className="wallet-card__row">
        <p className="wallet-card__balance num" aria-live="polite">
          {balance === undefined ? <span className="skeleton skeleton--num" /> : hidden ? '₦ ••••••' : formatNairaKobo(balance)}
        </p>
        <button type="button" className="wallet-card__eye" onClick={toggle} aria-label={hidden ? 'Show balance' : 'Hide balance'} aria-pressed={hidden}>
          {hidden ? <Eye /> : <EyeOff />}
        </button>
      </div>
      <div className="wallet-card__actions">
        <Link to="/app/wallet/topup" className="wallet-card__action wallet-card__action--primary">
          <Plus aria-hidden /> Top up
        </Link>
        <Link to="/app/wallet/withdraw" className="wallet-card__action">
          <ArrowDownToLine aria-hidden /> Withdraw
        </Link>
      </div>
    </section>
  );
}
