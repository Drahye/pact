import { useAuth } from '../api/auth';
import { usePacts } from '../api/hooks';
import { startPactPath } from './startPactPath';

export { startPactPath } from './startPactPath';

export function useStartPactPath() {
  const { user } = useAuth();
  const pacts = usePacts();
  const hasCreated = pacts.isSuccess && user ? pacts.data.some((p) => p.organizerId === user.id) : null;
  return (o: { circleId?: string; planId?: string } = {}) => startPactPath({ ...o, hasCreated });
}
