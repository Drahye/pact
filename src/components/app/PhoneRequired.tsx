import { ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../api/auth';
import { Notice } from './States';

/** Money-out actions and identity checks need a verified phone. Everything else never does. Renders nothing once there is one. */
export function PhoneRequired({ what = 'do this' }: { what?: string }) {
  const { user, config } = useAuth();
  if (!user || user.phone) return null;
  // Phone verification is switched off for this beta: say so, and do not send anyone to a verify screen that cannot work.
  if (!config?.auth?.phone) {
    return (
      <Notice tone="sun" icon={<ShieldCheck />}>
        To {what}, PACT needs a verified phone number. Phone verification isn’t available in this beta yet.
      </Notice>
    );
  }
  return (
    <Notice tone="sun" icon={<ShieldCheck />}>
      Verify your phone number to {what}. It keeps your money safe. <Link to="/app/profile/account" className="link">Verify phone</Link>
    </Notice>
  );
}
