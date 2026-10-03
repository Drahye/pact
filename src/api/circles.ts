import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CircleDTO, CircleInvitePreviewDTO, CircleSummaryDTO, CircleTint, WithPeople } from '../../shared/contracts';
import { api } from './client';
import { register } from './mappers';

export const circleKeys = {
  all: ['circles'] as const,
  one: (id: string) => ['circle', id] as const,
  invite: (token: string) => ['circle-invite', token] as const,
};

export function useCircles() {
  return useQuery({
    queryKey: circleKeys.all,
    queryFn: async () => {
      const r = await api<WithPeople<CircleSummaryDTO[]>>('GET', '/circles');
      register(r.people);
      return r.data;
    },
    refetchOnWindowFocus: true,
  });
}

export function useCircle(id: string | undefined) {
  return useQuery({
    queryKey: circleKeys.one(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      const r = await api<WithPeople<CircleDTO>>('GET', `/circles/${id}`);
      register(r.people);
      return r.data;
    },
    refetchInterval: 20_000,
    retry: (n, err) => (err as { status?: number }).status !== 404 && n < 2,
  });
}

/** Writes return the whole Circle, so the screen updates from the answer. */
function useCircleWrite<V>(fn: (v: V) => Promise<WithPeople<CircleDTO>>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      register(r.people);
      qc.setQueryData(circleKeys.one(r.data.id), r.data);
      qc.invalidateQueries({ queryKey: circleKeys.all });
    },
  });
}

export const useCreateCircle = () => useCircleWrite((b: { name: string; emoji: string; tint: CircleTint }) => api('POST', '/circles', b));
export const useUpdateCircle = (id: string) => useCircleWrite((b: Partial<{ name: string; emoji: string; tint: CircleTint }>) => api('PATCH', `/circles/${id}`, b));
export const useEnsureInvite = (id: string) => useCircleWrite((_: void) => api('POST', `/circles/${id}/invites`, {}));
export const useResetInvite = (id: string) => useCircleWrite((_: void) => api('POST', `/circles/${id}/invites/reset`, {}));
export const useRemoveMember = (id: string) => useCircleWrite((userId: string) => api('DELETE', `/circles/${id}/members/${userId}`));

export function useLeaveCircle(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: true }>('POST', `/circles/${id}/leave`, {}),
    onSuccess: () => {
      qc.removeQueries({ queryKey: circleKeys.one(id) });
      qc.invalidateQueries({ queryKey: circleKeys.all });
    },
  });
}

/** What a link is for. Public, so it works before anyone signs in. */
export function useCircleInvitePreview(token: string) {
  return useQuery({
    queryKey: circleKeys.invite(token),
    queryFn: () => api<CircleInvitePreviewDTO>('GET', `/circle-invites/${token}`),
    retry: false,
  });
}

export function useJoinCircle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => api<WithPeople<CircleDTO>>('POST', `/circle-invites/${token}/join`, {}),
    onSuccess: (r) => {
      register(r.people);
      qc.setQueryData(circleKeys.one(r.data.id), r.data);
      qc.invalidateQueries({ queryKey: circleKeys.all });
    },
  });
}

/** Coarse, privacy-safe usage events. Nothing typed, no names, no links. Only signed-in people are recorded. */
export function trackClient(name: 'circle_invite_shared' | 'universal_create_opened', props: Record<string, string>) {
  void api('POST', '/me/onboarding-event', { name, props }).catch(() => undefined);
}
