import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthTokensDTO, MeDTO, OtpVerifyDTO } from '../../shared/contracts';
import { setCurrentUserId } from '../data/users';
import { api, onSessionEnded, refreshSession, setAccessToken } from './client';
import { clearAllDrafts, setDraftOwner } from '../lib/drafts';
import { register } from './mappers';

type Status = 'loading' | 'signedOut' | 'signedIn';

export interface ServerConfig {
  provider: 'sandbox' | 'paystack';
  sandbox: boolean;
  deployEnv?: 'development' | 'staging' | 'production';
  exposeDevCodes: boolean;
}

interface AuthValue {
  status: Status;
  user: MeDTO | null;
  config: ServerConfig | null;
  requestOtp: (phone: string) => Promise<{ phone: string; expiresInSec: number; devCode?: string }>;
  verifyOtp: (phone: string, code: string) => Promise<OtpVerifyDTO>;
  signup: (input: { signupToken: string; firstName: string; lastName: string; pin: string; referralCode?: string }) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (u: MeDTO) => void;
  /** Why the last session ended. Only an expired session should bring the next sign-in back to the same page. */
  signOutReason: 'explicit' | 'expired' | null;
}

const AuthContext = createContext<AuthValue | null>(null);

/** Not a credential: just remembers that a refresh cookie probably exists, so first-time visitors skip the refresh call. */
const HINT = 'pact.hasSession';
const hint = {
  get: () => {
    try {
      return localStorage.getItem(HINT) === '1';
    } catch {
      return true;
    }
  },
  set: (on: boolean) => {
    try {
      if (on) localStorage.setItem(HINT, '1');
      else localStorage.removeItem(HINT);
    } catch {
      /* ignore */
    }
  },
};

function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return 'Android phone';
  return 'Web browser';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUserState] = useState<MeDTO | null>(null);
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [signOutReason, setSignOutReason] = useState<'explicit' | 'expired' | null>(null);

  const setUser = useCallback((u: MeDTO) => {
    setUserState(u);
    setCurrentUserId(u.id);
    setDraftOwner(u.id);
    register([u]);
  }, []);

  const accept = useCallback(
    (t: AuthTokensDTO) => {
      setAccessToken(t.accessToken);
      setUser(t.user);
      setStatus('signedIn');
      hint.set(true);
    },
    [setUser],
  );

  const endSession = useCallback((reason: 'explicit' | 'expired' = 'expired') => {
    setSignOutReason(reason);
    setAccessToken(null);
    setUserState(null);
    setDraftOwner(null);
    // Choosing to sign out wipes saved drafts on this device; an expired session keeps them for when you're back.
    if (reason === 'explicit') clearAllDrafts();
    setStatus('signedOut');
    hint.set(false);
    qc.clear();
  }, [qc]);

  useEffect(() => {
    onSessionEnded(() => endSession('expired'));
    api<ServerConfig>('GET', '/config').then(setConfig).catch(() => undefined);
    // Resume the session from the refresh cookie, if there is one.
    if (!hint.get()) setStatus('signedOut');
    else
      void refreshSession().then(async (t) => {
        // Offline at start-up: try once more before giving up, and keep the session hint either way.
        if (t === 'offline') t = await new Promise<Awaited<ReturnType<typeof refreshSession>>>((r) => setTimeout(() => void refreshSession().then(r), 1500));
        if (t && t !== 'offline') accept(t);
        else if (t === null) endSession();
        else setStatus('signedOut');
      });
  }, [accept, endSession]);

  // Refresh the access token shortly before it expires while the app is open.
  useEffect(() => {
    if (status !== 'signedIn') return;
    const id = window.setInterval(
      () =>
        void refreshSession().then((t) => {
            if (t === null) endSession('expired');
          else if (t !== 'offline') setUser(t.user);
        }),
      12 * 60_000,
    );
    return () => window.clearInterval(id);
  }, [status, setUser, endSession]);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      config,
      requestOtp: (phone) => api('POST', '/auth/otp/request', { phone }),
      verifyOtp: async (phone, code) => {
        const out = await api<OtpVerifyDTO>('POST', '/auth/otp/verify', { phone, code, device: deviceName() });
        if (out.status === 'signed_in') accept(out);
        return out;
      },
      signup: async (input) => accept(await api<AuthTokensDTO>('POST', '/auth/signup', input)),
      signOut: async () => {
        await api('POST', '/auth/logout', {}).catch(() => undefined);
        endSession('explicit');
      },
      setUser,
      signOutReason,
    }),
    [status, user, config, accept, endSession, setUser, signOutReason],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
