import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../api/auth';
import { currentState, disablePush, enablePush, type PushState } from './push';

/** This browser's push state, plus the two things a person can do about it. Asks for nothing until `enable` is called. */
export function usePush() {
  const { config } = useAuth();
  const enabled = config?.push?.enabled;
  const publicKey = config?.push?.publicKey ?? null;
  const [state, setState] = useState<PushState | 'checking'>('checking');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!config) return;
    let alive = true;
    void currentState(enabled).then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, [config, enabled]);

  const enable = useCallback(async (): Promise<PushState> => {
    if (!publicKey) return 'unavailable';
    setBusy(true);
    try {
      const next = await enablePush(publicKey);
      setState(next);
      return next;
    } catch {
      setState('off');
      return 'off';
    } finally {
      setBusy(false);
    }
  }, [publicKey]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      setState(await disablePush());
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, enable, disable };
}
