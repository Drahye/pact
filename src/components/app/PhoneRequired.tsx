import { ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../api/auth';
import { Notice } from './States';

/** Money-out actions and identity checks need a verified phone. Everything else never does. Renders nothing once there is one. */
export function PhoneRequired({ what = 'do this' }: { what?: string }) {
  const { user } = useAuth();
  if (!user || user.phone) return null;
  return (
    <Notice tone="sun" icon={<ShieldCheck />}>
      Verify your phone number to {what}. It keeps your money safe. <Link to="/app/profile/account" className="link">Verify phone</Link>
    </Notice>
  );
}
