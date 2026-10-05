import { FlaskConical } from 'lucide-react';
import { useAuth } from '../../api/auth';
import { Notice } from './States';

/** The beta runs on sandbox payments: a balance here is test money. Shown wherever a balance or a withdrawal is, never in a real-money deployment. */
export function SandboxNote() {
  const { config } = useAuth();
  if (!config?.sandbox) return null;
  return (
    <Notice tone="sun" icon={<FlaskConical aria-hidden />}>
      Sandbox beta: this is test money. No real money moves in or out of PACT.
    </Notice>
  );
}
