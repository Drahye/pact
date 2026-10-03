import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PersonDTO, SplitDTO, SplitLinkDTO, SplitNeedDTO, SplitSummaryDTO, WithPeople } from '../../shared/contracts';
import { api } from './client';
import { circleKeys } from './circles';
import { register } from './mappers';

export const splitKeys = {
  one: (id: string) => ['split', id] as const,
  circle: (circleId: string) => ['circle-splits', circleId] as const,
  needs: ['splits-needs-you'] as const,
  link: (token: string) => ['split-link', token] as const,
  mine: (token: string) => ['split-link-mine', token] as const,
};

type Single = WithPeople<SplitDTO>;
type Link = WithPeople<SplitLinkDTO>;
const LIVE = { refetchInterval: 8_000, refetchOnWindowFocus: true } as const;
const unwrap = <T extends { people: PersonDTO[] }>(r: T) => (register(r.people), r);

export function useSplit(id: string | undefined, from?: 'circle' | 'home') {
  return useQuery({
    queryKey: splitKeys.one(id ?? ''),
    enabled: !!id,
    queryFn: async () => unwrap(await api<Single>('GET', `/splits/${id}${from ? `?from=${from}` : ''}`)).data,
    retry: (n, err) => (err as { status?: number }).status !== 404 && n < 2,
    ...LIVE,
  });
}

export function useCircleSplits(circleId: string | undefined) {
  return useQuery({ queryKey: splitKeys.circle(circleId ?? ''), enabled: !!circleId, queryFn: async () => (await api<WithPeople<SplitSummaryDTO[]>>('GET', `/circles/${circleId}/splits`)).data, ...LIVE });
}

export function useSplitNeeds() {
  return useQuery({ queryKey: splitKeys.needs, queryFn: async () => (await api<WithPeople<SplitNeedDTO[]>>('GET', '/splits/needs-you')).data, ...LIVE });
}

export function useSplitLink(token: string) {
  return useQuery({ queryKey: splitKeys.link(token), queryFn: async () => unwrap(await api<Link>('GET', `/split-links/${token}`)).data, retry: false, ...LIVE });
}

export function useSplitLinkMine(token: string, enabled: boolean) {
  return useQuery({ queryKey: splitKeys.mine(token), enabled, queryFn: async () => unwrap(await api<Link>('GET', `/split-links/${token}/mine`)).data, retry: false, ...LIVE });
}

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['circle-splits'] });
    qc.invalidateQueries({ queryKey: splitKeys.needs });
    qc.invalidateQueries({ queryKey: circleKeys.all });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };
}

function useSplitWrite<V>(splitId: string, fn: (v: V) => Promise<Single>) {
  const refresh = useRefresh();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      register(r.people);
      qc.setQueryData(splitKeys.one(splitId), r.data);
      refresh();
    },
  });
}

export interface SplitInput {
  title: string;
  total: number;
  paidBy: string;
  mode: 'equal' | 'custom';
  participants: { userId: string; amount?: number }[];
}

export function useCreateSplit(circleId: string) {
  const refresh = useRefresh();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: SplitInput & { from?: 'circle' | 'home' | 'nav' }) => {
      const { from, ...body } = b;
      return api<Single>('POST', `/circles/${circleId}/splits${from ? `?from=${from}` : ''}`, body);
    },
    onSuccess: (r) => (register(r.people), qc.setQueryData(splitKeys.one(r.data.id), r.data), refresh()),
  });
}

export const useUpdateSplit = (id: string) => useSplitWrite(id, (b: Partial<SplitInput>) => api('PATCH', `/splits/${id}`, b));
export const useCancelSplit = (id: string) => useSplitWrite(id, (_: void) => api('POST', `/splits/${id}/cancel`, {}));
export const useSettleShare = (id: string) => useSplitWrite(id, (b: { userId: string; settled: boolean }) => api('PUT', `/splits/${id}/shares/${b.userId}`, { settled: b.settled }));

export function useSettleViaLink(token: string) {
  const refresh = useRefresh();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { settled: boolean; afterAuth?: boolean }) => api<Link>('PUT', `/split-links/${token}/settle`, b),
    onSuccess: (r) => (register(r.people), qc.setQueryData(splitKeys.mine(token), r.data), qc.invalidateQueries({ queryKey: splitKeys.link(token) }), refresh()),
  });
}

export function useJoinCircleFromSplit(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<WithPeople<{ id: string; name: string }>>('POST', `/split-links/${token}/join-circle`, {}),
    onSuccess: (r) => (register(r.people), qc.invalidateQueries({ queryKey: circleKeys.all }), qc.invalidateQueries({ queryKey: splitKeys.mine(token) })),
  });
}

export const recordSplitShared = (splitId: string, via: 'native' | 'copy') => void api('POST', `/splits/${splitId}/shared`, { via }).catch(() => undefined);
export const recordSplitLinkShared = (token: string, via: 'native' | 'copy') => void api('POST', `/split-links/${token}/shared`, { via }).catch(() => undefined);
