import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AskDTO, AskSummaryDTO, Attendance, PersonDTO, WithPeople } from '../../shared/contracts';
import { api } from './client';
import { circleKeys } from './circles';
import { register } from './mappers';

export const askKeys = {
  one: (id: string) => ['ask', id] as const,
  circle: (circleId: string) => ['circle-asks', circleId] as const,
  needs: ['asks-needs-you'] as const,
  link: (token: string) => ['ask-link', token] as const,
  mine: (token: string) => ['ask-link-mine', token] as const,
};

export type Answer = { optionId: string } | { attendance: Attendance };
type Single = WithPeople<AskDTO>;
type List = WithPeople<AskSummaryDTO[]>;
type Mine = WithPeople<{ ask: AskDTO; canJoinCircle: boolean }>;

const LIVE = { refetchInterval: 8_000, refetchOnWindowFocus: true } as const;
const unwrap = <T extends { people: PersonDTO[] }>(r: T) => (register(r.people), r);

/** One Ask, for a Circle member. `from` is only for coarse analytics. */
export function useAsk(id: string | undefined, from?: 'circle' | 'home') {
  return useQuery({
    queryKey: askKeys.one(id ?? ''),
    enabled: !!id,
    queryFn: async () => unwrap(await api<Single>('GET', `/asks/${id}${from ? `?from=${from}` : ''}`)).data,
    retry: (n, err) => (err as { status?: number }).status !== 404 && n < 2,
    ...LIVE,
  });
}

export function useCircleAsks(circleId: string | undefined) {
  return useQuery({
    queryKey: askKeys.circle(circleId ?? ''),
    enabled: !!circleId,
    queryFn: async () => unwrap(await api<List>('GET', `/circles/${circleId}/asks`)).data,
    ...LIVE,
  });
}

/** Open questions that are waiting on me. Home shows these. */
export function useNeedsYou() {
  return useQuery({ queryKey: askKeys.needs, queryFn: async () => unwrap(await api<List>('GET', '/asks/needs-you')).data, ...LIVE });
}

/** A shared link, readable before anyone signs in. */
export function useAskLink(token: string, signedIn = false) {
  return useQuery({
    queryKey: askKeys.link(token),
    queryFn: async () => unwrap(await api<Single>('GET', `/ask-links/${token}${signedIn ? '?auth=1' : ''}`)).data,
    retry: false,
    ...LIVE,
  });
}

/** The signed-in viewer's side of a link: their answer, membership, and whether they could join the Circle. */
export function useAskLinkMine(token: string, enabled: boolean) {
  return useQuery({
    queryKey: askKeys.mine(token),
    enabled,
    queryFn: async () => unwrap(await api<Mine>('GET', `/ask-links/${token}/mine`)).data,
    retry: false,
    ...LIVE,
  });
}

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['circle-asks'] });
    qc.invalidateQueries({ queryKey: askKeys.needs });
    qc.invalidateQueries({ queryKey: circleKeys.all });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };
}

export function useCreateAsk(circleId: string) {
  const refresh = useRefresh();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { type: 'choice' | 'attendance'; title: string; options?: string[]; from: 'circle' | 'home' | 'nav'; planId?: string }) => api<Single>('POST', `/circles/${circleId}/asks`, b),
    onSuccess: (r) => {
      register(r.people);
      qc.setQueryData(askKeys.one(r.data.id), r.data);
      refresh();
    },
  });
}

export function useRespond(id: string) {
  const refresh = useRefresh();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: Answer) => api<Single>('PUT', `/asks/${id}/response`, a),
    onSuccess: (r) => {
      register(r.people);
      qc.setQueryData(askKeys.one(id), r.data);
      refresh();
    },
  });
}

export function useRespondViaLink(token: string) {
  // `afterAuth`: the answer was chosen before sign-in and is being saved now. Coarse analytics only.
  const refresh = useRefresh();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ answer, afterAuth }: { answer: Answer; afterAuth?: boolean }) => api<Mine>('PUT', `/ask-links/${token}/response`, { ...answer, ...(afterAuth ? { afterAuth: true } : {}) }),
    onSuccess: (r) => {
      register(r.people);
      qc.setQueryData(askKeys.mine(token), r.data);
      qc.invalidateQueries({ queryKey: askKeys.link(token) });
      refresh();
    },
  });
}

export function useCloseAsk(id: string) {
  const refresh = useRefresh();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<Single>('POST', `/asks/${id}/close`, {}),
    onSuccess: (r) => (register(r.people), qc.setQueryData(askKeys.one(id), r.data), refresh()),
  });
}

export function useResetAskLink(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<Single>('POST', `/asks/${id}/share/reset`, {}),
    onSuccess: (r) => (register(r.people), qc.setQueryData(askKeys.one(id), r.data)),
  });
}

export function useJoinCircleFromAsk(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<WithPeople<{ id: string; name: string }>>('POST', `/ask-links/${token}/join-circle`, {}),
    onSuccess: (r) => {
      register(r.people);
      qc.invalidateQueries({ queryKey: circleKeys.all });
      qc.invalidateQueries({ queryKey: askKeys.mine(token) });
    },
  });
}

/** Coarse, anonymous: a visitor tapped an answer. Never blocks the screen. */
export const markAskStarted = (token: string, signedIn = false) => void api('POST', `/ask-links/${token}/started`, { signedIn }).catch(() => undefined);
/** Steps along the shared-link path the server can't see: sign-in started, Circle prompt shown. Anonymous and coarse. */
export const recordAskStep = (token: string, step: 'auth_started' | 'join_prompt', signedIn = false) => void api('POST', `/ask-links/${token}/step`, { step, signedIn }).catch(() => undefined);
export const recordAuthCompleted = (token: string) => void api('POST', `/ask-links/${token}/auth-completed`, {}).catch(() => undefined);
export const recordLinkReshared = (token: string, via: 'native' | 'copy') => void api('POST', `/ask-links/${token}/reshared`, { via }).catch(() => undefined);
export const recordAskShared = (id: string, via: 'native' | 'copy') => void api('POST', `/asks/${id}/shared`, { via }).catch(() => undefined);
