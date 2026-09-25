import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ActivityDTO,
  BankAccountDTO,
  BankDTO,
  CreatePactInput,
  MeDTO,
  NotificationDTO,
  Page,
  PactDTO,
  PactPreviewDTO,
  Participation,
  PersonDTO,
  SessionDTO,
  TopupDTO,
  WalletDTO,
  WalletTxnDTO,
  WithdrawalDTO,
  WithPeople,
} from '../../shared/contracts';
import { useAuth } from './auth';
import { api, fetchPhoto, newIdempotencyKey, uploadPhoto } from './client';
import { register, toActivity, toPact } from './mappers';

export const keys = {
  pacts: ['pacts'] as const,
  pact: (id: string) => ['pact', id] as const,
  wallet: ['wallet'] as const,
  txns: ['wallet', 'txns'] as const,
  activity: ['activity'] as const,
  notifications: ['notifications'] as const,
  banks: ['banks'] as const,
  bankAccounts: ['bank-accounts'] as const,
  people: ['people'] as const,
  sessions: ['sessions'] as const,
};

const live = { refetchInterval: 15_000, refetchOnWindowFocus: true } as const;

/* ---------------------------------------------------------------- reads */

export function usePacts() {
  return useQuery({
    queryKey: keys.pacts,
    queryFn: async () => {
      const r = await api<WithPeople<PactDTO[]>>('GET', '/pacts');
      register(r.people);
      return r.data.map(toPact);
    },
    ...live,
  });
}

type PactDetail = WithPeople<{ pact: PactDTO; activities: ActivityDTO[] }>;

function unpackPact(r: PactDetail) {
  register(r.people);
  return { pact: toPact(r.data.pact), activities: r.data.activities.map(toActivity).filter((a) => a !== null) };
}

export function usePact(id: string | undefined) {
  return useQuery({
    queryKey: keys.pact(id ?? ''),
    enabled: !!id,
    queryFn: async () => unpackPact(await api<PactDetail>('GET', `/pacts/${id}`)),
    ...live,
    refetchInterval: 8_000,
  });
}

export function useActivity() {
  return useQuery({
    queryKey: keys.activity,
    queryFn: async () => {
      const r = await api<WithPeople<ActivityDTO[]>>('GET', '/activity');
      register(r.people);
      return r.data.map(toActivity).filter((a) => a !== null);
    },
    ...live,
  });
}

export function useWallet() {
  return useQuery({ queryKey: keys.wallet, queryFn: () => api<WalletDTO>('GET', '/wallet'), ...live });
}

export function useTransactions() {
  return useInfiniteQuery({
    queryKey: keys.txns,
    initialPageParam: '',
    queryFn: ({ pageParam }) => api<Page<WalletTxnDTO>>('GET', `/wallet/transactions${pageParam ? `?cursor=${pageParam}` : ''}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useNotifications() {
  return useQuery({ queryKey: keys.notifications, queryFn: () => api<Page<NotificationDTO> & { unread: number }>('GET', '/notifications'), ...live, refetchInterval: 20_000 });
}

export const useBanks = () => useQuery({ queryKey: keys.banks, queryFn: () => api<BankDTO[]>('GET', '/banks'), staleTime: 3_600_000 });
export const useBankAccounts = () => useQuery({ queryKey: keys.bankAccounts, queryFn: () => api<BankAccountDTO[]>('GET', '/bank-accounts') });
export const useSessions = () => useQuery({ queryKey: keys.sessions, queryFn: () => api<SessionDTO[]>('GET', '/me/sessions') });

export function useRecentPeople() {
  return useQuery({
    queryKey: keys.people,
    queryFn: async () => {
      const people = await api<PersonDTO[]>('GET', '/people/recent');
      register(people);
      return people;
    },
  });
}

export const useInvitePreview = (code: string | undefined) =>
  useQuery({ queryKey: ['invite', code], enabled: !!code, retry: false, queryFn: () => api<PactPreviewDTO>('GET', `/invites/${code}`) });

export const useTopup = (reference: string | undefined, poll: boolean) =>
  useQuery({
    queryKey: ['topup', reference],
    enabled: !!reference,
    queryFn: () => api<TopupDTO>('GET', `/wallet/topups/${reference}`),
    refetchInterval: (q) => (poll && q.state.data?.status === 'pending' ? 2_000 : false),
  });

export const useWithdrawal = (reference: string | undefined) =>
  useQuery({
    queryKey: ['withdrawal', reference],
    enabled: !!reference,
    queryFn: () => api<WithdrawalDTO>('GET', `/wallet/withdrawals/${reference}`),
    refetchInterval: (q) => (q.state.data && ['pending', 'processing'].includes(q.state.data.status) ? 1_500 : false),
  });

/* ---------------------------------------------------------------- writes */

/** After money moves, everything that shows a balance or a total is refetched. */
function useInvalidateMoney() {
  const qc = useQueryClient();
  return (pactId?: string) => {
    qc.invalidateQueries({ queryKey: keys.wallet });
    qc.invalidateQueries({ queryKey: keys.pacts });
    qc.invalidateQueries({ queryKey: keys.activity });
    qc.invalidateQueries({ queryKey: keys.notifications });
    if (pactId) qc.invalidateQueries({ queryKey: keys.pact(pactId) });
  };
}

function useSetPact() {
  const qc = useQueryClient();
  return (r: PactDetail) => {
    const out = unpackPact(r);
    qc.setQueryData(keys.pact(out.pact.id), out);
    return out;
  };
}

export function useCreatePact() {
  const setPact = useSetPact();
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: ({ input, key }: { input: CreatePactInput; key: string }) => api<PactDetail>('POST', '/pacts', input, { idempotencyKey: key }),
    onSuccess: (r) => {
      const out = setPact(r);
      invalidate(out.pact.id);
    },
  });
}

export function useContribute(pactId: string) {
  const setPact = useSetPact();
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: ({ amount, pin, key }: { amount: number; pin: string; key: string }) =>
      api<PactDetail & { completed: boolean }>('POST', `/pacts/${pactId}/contributions`, { amount, pin }, { idempotencyKey: key }),
    onSuccess: (r) => {
      setPact(r);
      invalidate(pactId);
    },
  });
}

export function usePactAction(pactId: string, action: 'release' | 'cancel') {
  const setPact = useSetPact();
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: ({ pin }: { pin: string }) => api<PactDetail>('POST', `/pacts/${pactId}/${action}`, { pin }, { idempotencyKey: newIdempotencyKey() }),
    onSuccess: (r) => {
      setPact(r);
      invalidate(pactId);
    },
  });
}

export function usePactCommand(pactId: string) {
  const setPact = useSetPact();
  const qc = useQueryClient();
  return {
    accept: useMutation({ mutationFn: () => api<PactDetail>('POST', `/pacts/${pactId}/accept`, {}), onSuccess: (r) => (setPact(r), qc.invalidateQueries({ queryKey: keys.pacts })) }),
    leave: useMutation({ mutationFn: () => api('POST', `/pacts/${pactId}/leave`, {}), onSuccess: () => qc.invalidateQueries({ queryKey: keys.pacts }) }),
    nudge: useMutation({ mutationFn: () => api<{ reminded: number }>('POST', `/pacts/${pactId}/nudge`, {}) }),
    invite: useMutation({
      mutationFn: (body: { userIds?: string[]; phones?: string[] }) => api<PactDetail>('POST', `/pacts/${pactId}/invites`, body),
      onSuccess: (r) => setPact(r),
    }),
  };
}

export function useJoinByCode() {
  const setPact = useSetPact();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ code, participation }: { code: string; participation?: Participation | null }) =>
      api<PactDetail>('POST', `/invites/${code}/join`, participation ? { participation } : {}),
    onSuccess: (r) => {
      setPact(r);
      qc.invalidateQueries({ queryKey: keys.pacts });
    },
  });
}

export function useStartTopup() {
  return useMutation({
    mutationFn: ({ amount, channel, key, pactId }: { amount: number; channel: 'card' | 'bank_transfer'; key: string; pactId?: string }) =>
      api<TopupDTO>('POST', '/wallet/topups', { amount, channel, ...(pactId ? { pactId } : {}) }, { idempotencyKey: key }),
  });
}

export function useWithdraw() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: ({ amount, bankAccountId, pin, key }: { amount: number; bankAccountId: string; pin: string; key: string }) =>
      api<WithdrawalDTO>('POST', '/wallet/withdrawals', { amount, bankAccountId, pin }, { idempotencyKey: key }),
    onSuccess: () => invalidate(),
  });
}

export function useAddBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { bankCode: string; accountNumber: string; pin: string }) => api<BankAccountDTO>('POST', '/bank-accounts', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.bankAccounts }),
  });
}

export function useRemoveBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api('DELETE', `/bank-accounts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.bankAccounts }),
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => api('POST', '/notifications/read', { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.notifications }),
  });
}

export function useProfileActions() {
  const { setUser } = useAuth();
  const qc = useQueryClient();
  return {
    verifyBvn: useMutation({
      mutationFn: (body: { bvn: string; dateOfBirth: string }) => api<MeDTO>('POST', '/me/kyc/bvn', body),
      onSuccess: (u) => {
        setUser(u);
        qc.invalidateQueries({ queryKey: keys.wallet });
        qc.invalidateQueries({ queryKey: keys.notifications });
      },
    }),
    changePin: useMutation({ mutationFn: (body: { currentPin: string; newPin: string }) => api('POST', '/me/pin', body) }),
    revokeSession: useMutation({ mutationFn: (id: string) => api('DELETE', `/me/sessions/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: keys.sessions }) }),
    revokeOthers: useMutation({ mutationFn: () => api('POST', '/me/sessions/revoke-others', {}), onSuccess: () => qc.invalidateQueries({ queryKey: keys.sessions }) }),
  };
}

/* ---------------------------------------------------------------- the plan */

/** Every plan edit returns the fresh Pact, which replaces the cached one. */
function usePlanMutation<V>(run: (v: V) => Promise<PactDetail>) {
  const setPact = useSetPact();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (r) => {
      setPact(r);
      qc.invalidateQueries({ queryKey: keys.pacts });
      qc.invalidateQueries({ queryKey: keys.activity });
    },
  });
}

export function usePlan(pactId: string) {
  const base = `/pacts/${pactId}`;
  return {
    participation: usePlanMutation((participation: Participation) => api<PactDetail>('PATCH', `${base}/participation`, { participation })),
    addTask: usePlanMutation((body: { title: string; budgetItemId?: string | null; assigneeId?: string | null }) => api<PactDetail>('POST', `${base}/tasks`, body)),
    updateTask: usePlanMutation(({ id, ...body }: { id: string; title?: string; status?: 'open' | 'in_progress' | 'done'; assigneeId?: 'me' | string | null }) =>
      api<PactDetail>('PATCH', `${base}/tasks/${id}`, body),
    ),
    deleteTask: usePlanMutation((id: string) => api<PactDetail>('DELETE', `${base}/tasks/${id}`)),
    addBudget: usePlanMutation((body: { name: string; amount: number }) => api<PactDetail>('POST', `${base}/budget`, body)),
    updateBudget: usePlanMutation(({ id, ...body }: { id: string; name?: string; amount?: number }) => api<PactDetail>('PATCH', `${base}/budget/${id}`, body)),
    deleteBudget: usePlanMutation((id: string) => api<PactDetail>('DELETE', `${base}/budget/${id}`)),
    splitRest: usePlanMutation(() => api<PactDetail & { split: { share: number; people: number } }>('POST', `${base}/split-rest`, {})),
    saveMemory: usePlanMutation((body: { note?: string | null; happenedOn?: string | null }) => api<PactDetail>('PUT', `${base}/memory`, body)),
    deletePhoto: usePlanMutation((id: string) => api<PactDetail>('DELETE', `${base}/memory/photos/${id}`)),
    addPhoto: usePlanMutation((file: File) => uploadPhoto(`${base}/memory/photos`, file)),
  };
}

/** Photos are private: fetched with the session and shown from a local object URL. */
export function usePhoto(pactId: string, photoId: string) {
  return useQuery({
    queryKey: ['photo', pactId, photoId],
    enabled: !!photoId,
    staleTime: Infinity,
    queryFn: async () => URL.createObjectURL(await fetchPhoto(`/pacts/${pactId}/memory/photos/${photoId}`)),
  });
}
