import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PactDraftDTO, PersonDTO, PlanDTO, PlanNeedDTO, PlanStatus, PlanSummaryDTO, WithPeople, Attendance } from '../../shared/contracts';
import { askKeys } from './asks';
import { api } from './client';
import { circleKeys } from './circles';
import { register } from './mappers';

export const planKeys = {
  one: (id: string) => ['plan', id] as const,
  circle: (circleId: string) => ['circle-plans', circleId] as const,
  needs: ['plans-needs-you'] as const,
  link: (token: string) => ['plan-link', token] as const,
  mine: (token: string) => ['plan-link-mine', token] as const,
  draft: (id: string) => ['plan-draft', id] as const,
};

type Single = WithPeople<PlanDTO>;
type Mine = WithPeople<{ plan: PlanDTO; canJoinCircle: boolean }>;
const LIVE = { refetchInterval: 8_000, refetchOnWindowFocus: true } as const;
const unwrap = <T extends { people: PersonDTO[] }>(r: T) => (register(r.people), r);

export function usePlan(id: string | undefined, from?: 'circle' | 'home') {
  return useQuery({
    queryKey: planKeys.one(id ?? ''),
    enabled: !!id,
    queryFn: async () => unwrap(await api<Single>('GET', `/plans/${id}${from ? `?from=${from}` : ''}`)).data,
    retry: (n, err) => (err as { status?: number }).status !== 404 && n < 2,
    ...LIVE,
  });
}

export function useCirclePlans(circleId: string | undefined) {
  return useQuery({ queryKey: planKeys.circle(circleId ?? ''), enabled: !!circleId, queryFn: async () => unwrap(await api<WithPeople<PlanSummaryDTO[]>>('GET', `/circles/${circleId}/plans`)).data, ...LIVE });
}

export function usePlanNeeds() {
  return useQuery({ queryKey: planKeys.needs, queryFn: async () => (await api<WithPeople<PlanNeedDTO[]>>('GET', '/plans/needs-you')).data, ...LIVE });
}

export function usePlanLink(token: string) {
  return useQuery({ queryKey: planKeys.link(token), queryFn: async () => unwrap(await api<Single>('GET', `/plan-links/${token}`)).data, retry: false, ...LIVE });
}

export function usePlanLinkMine(token: string, enabled: boolean) {
  return useQuery({ queryKey: planKeys.mine(token), enabled, queryFn: async () => unwrap(await api<Mine>('GET', `/plan-links/${token}/mine`)).data, retry: false, ...LIVE });
}

/** What the existing Pact form starts with. Fetching it is the start of "Make it a Pact"; nothing is created. */
export function usePactDraft(planId: string | undefined) {
  return useQuery({ queryKey: planKeys.draft(planId ?? ''), enabled: !!planId, queryFn: () => api<PactDraftDTO>('GET', `/plans/${planId}/pact-draft`), retry: false, staleTime: Infinity });
}

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['circle-plans'] });
    qc.invalidateQueries({ queryKey: planKeys.needs });
    qc.invalidateQueries({ queryKey: circleKeys.all });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };
}

/** Writes return the whole plan, so the screen updates from the answer. */
function usePlanWrite<V>(planId: string, fn: (v: V) => Promise<Single>) {
  const refresh = useRefresh();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      register(r.people);
      qc.setQueryData(planKeys.one(planId), r.data);
      qc.invalidateQueries({ queryKey: askKeys.circle(r.data.circleId) });
      refresh();
    },
  });
}

export function useCreatePlan(circleId: string) {
  const refresh = useRefresh();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { title: string; category: string; date?: string; endDate?: string; location?: string; roughBudget?: number }) => api<Single>('POST', `/circles/${circleId}/plans`, b),
    onSuccess: (r) => (register(r.people), qc.setQueryData(planKeys.one(r.data.id), r.data), refresh()),
  });
}

export const useUpdatePlan = (id: string) => usePlanWrite(id, (b: Record<string, unknown>) => api('PATCH', `/plans/${id}`, b));
export const useSetPlanStatus = (id: string) => usePlanWrite(id, (status: PlanStatus) => api('POST', `/plans/${id}/status`, { status }));
export const useRsvp = (id: string) => usePlanWrite(id, (status: Attendance) => api('PUT', `/plans/${id}/rsvp`, { status }));
export const useSetRsvpOpen = (id: string) => usePlanWrite(id, (open: boolean) => api('PUT', `/plans/${id}/rsvp-open`, { open }));
export const useAddTask = (id: string) => usePlanWrite(id, (b: { title: string; assigneeId?: string | null }) => api('POST', `/plans/${id}/tasks`, b));
export const usePatchTask = (id: string) => usePlanWrite(id, (b: { taskId: string; assigneeId?: string | null; status?: 'open' | 'done'; title?: string }) => api('PATCH', `/plans/${id}/tasks/${b.taskId}`, { ...(b.assigneeId !== undefined ? { assigneeId: b.assigneeId } : {}), ...(b.status ? { status: b.status } : {}), ...(b.title ? { title: b.title } : {}) }));
export const useDeleteTask = (id: string) => usePlanWrite(id, (taskId: string) => api('DELETE', `/plans/${id}/tasks/${taskId}`));
export const useLinkAsk = (id: string) => usePlanWrite(id, (askId: string) => api('POST', `/plans/${id}/asks`, { askId }));
export const useUnlinkAsk = (id: string) => usePlanWrite(id, (askId: string) => api('DELETE', `/plans/${id}/asks/${askId}`));
export const useResetPlanLink = (id: string) => usePlanWrite(id, (_: void) => api('POST', `/plans/${id}/share/reset`, {}));

export function useRsvpViaLink(token: string) {
  const refresh = useRefresh();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ status, afterAuth }: { status: Attendance; afterAuth?: boolean }) => api<Mine>('PUT', `/plan-links/${token}/rsvp`, { status, ...(afterAuth ? { afterAuth: true } : {}) }),
    onSuccess: (r) => (register(r.people), qc.setQueryData(planKeys.mine(token), r.data), qc.invalidateQueries({ queryKey: planKeys.link(token) }), refresh()),
  });
}

export function useJoinCircleFromPlan(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<WithPeople<{ id: string; name: string }>>('POST', `/plan-links/${token}/join-circle`, {}),
    onSuccess: (r) => (register(r.people), qc.invalidateQueries({ queryKey: circleKeys.all }), qc.invalidateQueries({ queryKey: planKeys.mine(token) })),
  });
}

export const recordPlanShared = (planId: string, via: 'native' | 'copy') => void api('POST', `/plans/${planId}/shared`, { via }).catch(() => undefined);
export const recordPlanLinkShared = (token: string, via: 'native' | 'copy') => void api('POST', `/plan-links/${token}/shared`, { via }).catch(() => undefined);
