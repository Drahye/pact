import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../api/auth';
import { currentState, disablePush, enablePush, type PushState } from './push';

/** This browser's push state, plus the two things a person can do about it. Asks for nothing until `enable` is called. */
export function usePush() {
  const { config, user } = useAuth();
  const enabled = config?.push?.enabled;
  const publicKey = config?.push?.publicKey ?? null;
  const userId = user?.id;
  const [state, setState] = useState<PushState | 'checking'>('checking');
  const [busy, setBusy] = useState(false);

  // Checked against the browser and the server on every mount and whenever the person changes, never from a remembered flag.
  useEffect(() => {
    if (!config || !userId) return;
    let alive = true;
    void currentState(userId, enabled, publicKey).then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, [config, enabled, publicKey, userId]);

  const enable = useCallback(async (): Promise<PushState> => {
    if (!publicKey || !userId) return 'unavailable';
    setBusy(true);
    try {
      const next = await enablePush(userId, publicKey);
      setState(next);
      return next;
    } finally {
      setBusy(false);
    }
  }, [publicKey, userId]);

  const disable = useCallback(async () => {
    if (!userId) return;
    setBusy(true);
    try {
      setState(await disablePush(userId));
    } finally {
      setBusy(false);
    }
  }, [userId]);

  return { state, busy, enable, disable };
}
