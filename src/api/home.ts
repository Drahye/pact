import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { HomeDTO, PersonDTO, RecapDTO, RecentItem, WithPeople } from '../../shared/contracts';
import { api } from './client';
import { register } from './mappers';

export const homeKeys = { all: ['home'] as const, recap: (kind: string, id: string) => ['recap', kind, id] as const, link: (token: string) => ['recap-link', token] as const };
export type RecapKind = 'plan' | 'pact' | 'split';

const unwrap = <T extends { people: PersonDTO[] }>(r: T) => (register(r.people), r);

/** Everything on Home from one request. Cached data stays on screen while it refreshes, and when offline. */
export function useHome() {
  return useQuery({
    queryKey: homeKeys.all,
    queryFn: async () => unwrap(await api<WithPeople<HomeDTO>>('GET', '/home')).data,
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

/** Everything that happened across the person's Asks, Plans, Splits and Pacts, for the Activity tab. */
export function useFeed() {
  return useQuery({
    queryKey: [...homeKeys.all, 'feed'] as const,
    queryFn: async () => unwrap(await api<WithPeople<RecentItem[]>>('GET', '/feed')).data,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

export function useRecap(kind: RecapKind, id: string, from?: 'home') {
  return useQuery({
    queryKey: homeKeys.recap(kind, id),
    queryFn: async () => unwrap(await api<WithPeople<RecapDTO>>('GET', `/recaps/${kind}/${id}${from ? `?from=${from}` : ''}`)).data,
    retry: false,
  });
}

export function usePublicRecap(token: string) {
  return useQuery({ queryKey: homeKeys.link(token), queryFn: async () => unwrap(await api<WithPeople<RecapDTO>>('GET', `/recap-links/${token}`)).data, retry: false });
}

export function useRecapShare(kind: RecapKind, id: string) {
  const qc = useQueryClient();
  const done = (r: WithPeople<RecapDTO>) => (register(r.people), qc.setQueryData(homeKeys.recap(kind, id), r.data));
  return {
    on: useMutation({ mutationFn: () => api<WithPeople<RecapDTO>>('POST', `/recaps/${kind}/${id}/share`, {}), onSuccess: done }),
    off: useMutation({ mutationFn: () => api<WithPeople<RecapDTO>>('DELETE', `/recaps/${kind}/${id}/share`), onSuccess: done }),
  };
}

export const recordRecapShared = (kind: RecapKind, id: string, via: 'native' | 'copy') => void api('POST', `/recaps/${kind}/${id}/shared`, { via }).catch(() => undefined);

export type HomeEvent = 'home_viewed' | 'home_needs_you_opened' | 'home_needs_you_actioned' | 'circle_opened_from_home' | 'coming_up_opened' | 'recent_activity_opened';
/** Coarse, privacy-safe: a kind of object and a section of Home. Never a title, a name, an amount or a link. */
export const trackHome = (name: HomeEvent, props: Record<string, string | number | boolean> = {}) => void api('POST', '/me/onboarding-event', { name, props }).catch(() => undefined);
