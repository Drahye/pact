import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AccountDTO } from '../../shared/contracts';
import { api } from './client';

export const accountKey = ['account'] as const;

/** How the signed-in person can be reached: email, Google, phone. Never provider ids. */
export const useAccount = () => useQuery({ queryKey: accountKey, queryFn: () => api<AccountDTO>('GET', '/me/account'), staleTime: 15_000 });

export function useAccountActions() {
  const qc = useQueryClient();
  const set = (a: AccountDTO) => qc.setQueryData(accountKey, a);
  return {
    requestEmail: useMutation({ mutationFn: (email: string) => api<{ email: string; expiresInSec: number; devCode?: string }>('POST', '/me/identities/email/request', { email }) }),
    verifyEmail: useMutation({ mutationFn: (b: { email: string; code: string; pin?: string }) => api<AccountDTO>('POST', '/me/identities/email/verify', b), onSuccess: set }),
    requestPhone: useMutation({ mutationFn: (phone: string) => api<{ phone: string; expiresInSec: number; devCode?: string }>('POST', '/me/identities/phone/request', { phone }) }),
    verifyPhone: useMutation({
      mutationFn: (b: { phone: string; code: string }) => api<{ account: AccountDTO; claimedInvites: number }>('POST', '/me/identities/phone/verify', b),
      onSuccess: (r) => {
        set(r.account);
        // A verified number can bring invitations with it, and changes the account's phone.
        void qc.invalidateQueries({ queryKey: ['home'] });
        void qc.invalidateQueries({ queryKey: ['pacts'] });
      },
    }),
    startGoogle: useMutation({ mutationFn: (returnTo?: string) => api<{ url: string }>('POST', '/me/identities/google/start', returnTo ? { returnTo } : {}) }),
    unlink: useMutation({ mutationFn: (b: { provider: 'google' | 'email' | 'phone'; pin?: string }) => api<AccountDTO>('DELETE', `/me/identities/${b.provider}`, b.pin ? { pin: b.pin } : {}), onSuccess: set }),
  };
}
