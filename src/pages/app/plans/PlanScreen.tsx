import { ArrowRight, Check, ChevronRight, Ellipsis, Link2, Plus, Share2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Attendance, PlanDTO, PlanStatus } from '../../../../shared/contracts';
import { useAuth } from '../../../api/auth';
import { useCircleAsks } from '../../../api/asks';
import { ApiError } from '../../../api/client';
import { useAddTask, useDeleteTask, useHandOverPlan, useLinkAsk, usePatchTask, usePlan, useResetPlanLink, useRsvp, useSetRsvpOpen, useSetPlanStatus, useUpdatePlan } from '../../../api/plans';
import { PlanSkeleton } from '../../../components/app/DetailSkeletons';
import { ErrorState, Notice } from '../../../components/app/States';
import { statusLabel } from '../../../components/plan/PlanBits';
import { ActivityRow, Hero, PlanDecisions, PlanHero, RsvpTrack, Sheet } from '../../../components/objects';
import { AmountInput } from '../../../components/ui/AmountInput';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { IconButton } from '../../../components/ui/IconButton';
import { Input } from '../../../components/ui/Input';
import { HandOverSheet } from '../../../components/circle/HandOverSheet';
import { Modal } from '../../../components/ui/Modal';
import { TopBar } from '../../../components/ui/TopBar';
import { useToast } from '../../../components/ui/Toast';
import { getUser } from '../../../data/users';
import { budgetText, dateRange } from '../../../lib/planDates';
import { sharePlan } from '../../../lib/planShare';
import { peopleLine } from '../../../lib/peopleLine';
import { startPactPath } from '../../../lib/startPactPath';
import { Screen } from '../Screen';
import '../../../components/plan/plan.css';
import '../object-detail.css';
import './plan-detail.css';

type Sheet = null | 'menu' | 'edit' | 'link' | 'pact' | 'cancel' | 'reset' | 'sure' | 'hand';
const attLabel: Record<Attendance, string> = { in: 'In', maybe: 'Maybe', out: 'Can’t' };

/** "Sarah is in", "Daniel changed to Maybe", "Tobi completed “Pick hotel”". Plain words; no chat. */
/** Who is in, said the way a friend would: "You, Maya and 2 others are in · Tolu maybe". */
function peopleText(rsvps: PlanDTO['rsvps'], selfId?: string | null) {
  const ids = (s: string) => rsvps.filter((r) => r.status === s).map((r) => r.userId);
  const going = ids('in');
  const maybe = ids('maybe');
  const parts: string[] = [];
  if (going.length) parts.push(`${peopleLine(going, selfId)} ${going.length === 1 && going[0] !== selfId ? 'is' : 'are'} in`);
  if (maybe.length) parts.push(`${peopleLine(maybe, selfId)} maybe`);
  return parts.join(' · ');
}

function activityText(a: PlanDTO['activity'][number], who: string, me: boolean) {
  const be = me ? 'are' : 'is';
  switch (a.kind) {
    case 'created':
      return `${who} created the plan`;
    case 'rsvp':
      return a.status === 'in' ? `${who} ${be} in` : a.status === 'maybe' ? `${who} said maybe` : `${who} can’t make it`;
    case 'rsvp_changed':
      return `${who} changed to ${a.status ? attLabel[a.status] : ''}`;
    case 'task_added':
      return `${who} added “${a.detail}”`;
    case 'task_done':
      return `${who} completed “${a.detail}”`;
    case 'ask_linked':
      return `${who} linked a question`;
    case 'confirmed':
      return `${who} confirmed the plan`;
    case 'done':
      return a.detail === 'pact' ? 'The Pact was completed' : 'The plan happened';
    case 'cancelled':
      return `${who} cancelled the plan`;
    case 'date_changed': {
      const [d, e] = (a.detail ?? '').split('|');
      return d ? `${who} changed the date to ${dateRange(d, e || null)}` : `${who} removed the date`;
    }
    case 'location_changed':
      return a.detail ? `${who} changed the location to ${a.detail}` : `${who} removed the location`;
    case 'pact_closed':
      return 'The Pact was closed, so the plan is open again';
    default:
      return 'The plan became a Pact';
  }
}

/** One plan, for the Circle's members: the answer first (are you in?), then what's known, what's to do, who is coming. */
export function PlanScreen() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const from = params.get('from') === 'home' ? 'home' : params.get('from') === 'circle' ? 'circle' : undefined;
  const plan = usePlan(id, from);
  const rsvp = useRsvp(id);
  const status = useSetPlanStatus(id);
  const update = useUpdatePlan(id);
  const addTask = useAddTask(id);
  const patchTask = usePatchTask(id);
  const delTask = useDeleteTask(id);
  const link = useLinkAsk(id);
  const reset = useResetPlanLink(id);
  const handOver = useHandOverPlan(id);
  const rsvpOpen = useSetRsvpOpen(id);
  const circleAsks = useCircleAsks(plan.data?.circleId);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [task, setTask] = useState('');
  const [ask, setAsk] = useState<{ body: Record<string, unknown>; message: string } | null>(null);
  const [draft, setDraft] = useState({ title: '', date: '', endDate: '', location: '', budget: 0 });
  const justCreated = (location.state as { justCreated?: boolean } | null)?.justCreated === true;

  if (plan.isLoading) return <Screen topBar={<TopBar backTo="/app/circles" />}><PlanSkeleton /></Screen>;
  if (plan.error || !plan.data) {
    const gone = (plan.error as ApiError)?.status === 404;
    return (
      <Screen topBar={<TopBar backTo="/app/circles" />}>
        <ErrorState message={gone ? 'This plan isn’t available. It may be in a Circle you’re not in.' : undefined} onRetry={gone ? undefined : () => plan.refetch()} />
      </Screen>
    );
  }
  const p: PlanDTO = plan.data;
  const open = p.status === 'planning' || p.status === 'confirmed';
  // Once a Pact exists the Plan is the record: nothing here is edited or added to.
  const live = open && !p.pactId;
  // Closing RSVPs stops everyone else; the organiser can still answer for themselves.
  const canAnswer = p.rsvpOpen || p.createdBy === user?.id;
  const name = (uid: string) => (uid === user?.id ? 'You' : getUser(uid).name);
  const loose = (circleAsks.data ?? []).filter((a) => !a.planId);

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast(ok);
      return true;
    } catch (e) {
      toast((e as ApiError).message, 'neutral');
      return false;
    }
  };
  const share = async () => {
    if (!p.shareToken) return;
    const r = await sharePlan(p, p.shareToken, { planId: p.id });
    if (r === 'copied') toast('Link copied');
    else if (r === 'failed') toast('Couldn’t share. Try again.', 'neutral');
  };
  const setStatus = (s: PlanStatus, ok: string) => act(() => status.mutateAsync(s), ok);
  const close = () => setSheet(null);
  const editBody = () => ({
    title: draft.title.trim(),
    date: draft.date || null,
    endDate: draft.date ? draft.endDate || null : null,
    location: draft.location.trim() || null,
    roughBudget: draft.budget ? Math.round(draft.budget * 100) : null,
  });
  /** A new date or place changes things for people who already answered: the server says so first, and we ask. */
  const save = async (confirm = false) => {
    const body = editBody();
    try {
      await update.mutateAsync(confirm ? { ...body, confirm: true } : body);
      toast('Saved');
      setAsk(null);
      close();
    } catch (e) {
      const err = e as ApiError;
      if (err.code === 'confirm_needed') {
        setAsk({ body, message: err.message });
        setSheet('sure');
      } else toast(err.message, 'neutral');
    }
  };
  const openEdit = () => (setDraft({ title: p.title, date: p.date ?? '', endDate: p.endDate ?? '', location: p.location ?? '', budget: p.roughBudget ? p.roughBudget / 100 : 0 }), setSheet('edit'));

  return (
    <Screen
      className={`xhero tint--${p.pactId ? 'mint' : 'sun'}`}
      topBar={
        <TopBar
          backTo={params.get('from') === 'home' ? '/app/home' : `/app/circles/${p.circleId}`}
          tone="transparent"
          title={p.circle.name}
          trailing={
            <span className="detail__top-actions">
              <IconButton label="Share" icon={<Share2 />} onClick={share} />
              {(p.canEdit || p.canHandOver) && <IconButton label="More" icon={<Ellipsis />} onClick={() => setSheet(p.canEdit ? 'menu' : 'hand')} />}
            </span>
          }
        />
      }
    >
      <Hero tint={p.pactId ? 'mint' : 'sun'} className="xh--plan">
        <PlanHero
          title={p.title}
          date={p.date}
          endDate={p.endDate}
          location={p.location}
          status={p.pactId ? 'Became a Pact' : statusLabel[p.status]}
          goingIds={p.rsvps.filter((r) => r.status === 'in').map((r) => r.userId)}
          going={p.counts.in}
          peopleText={peopleText(p.rsvps, user?.id)}
          history={!!p.pactId}
          done={p.status === 'done' && !p.pactId}
        />
      </Hero>
      <Sheet className="od-plan">
        {p.pactId && (
          <Link to={`/app/pact/${p.pactId}`} className="od-handoff tint--mint">
            <span className="od-handoff__flow" aria-hidden>
              <span>Plan</span>
              <ArrowRight />
              <span>Pact</span>
            </span>
            <strong>{p.status === 'done' ? 'Completed. You made it happen.' : 'This is a Pact now'}</strong>
            <span className="od-handoff__line">{p.status === 'done' ? 'See what the group did together.' : 'Money, tasks and the deadline live there. This Plan stays as the record.'}</span>
            <span className="act act--solid od-handoff__go">
              Open Pact
              <ChevronRight aria-hidden />
            </span>
          </Link>
        )}

        {live && canAnswer && !p.pactId && p.status !== 'done' && <RsvpTrack value={p.mine ?? null} onChange={(a) => void act(() => rsvp.mutateAsync(a))} disabled={rsvp.isPending} />}
        {p.asks.length > 0 && (
          <PlanDecisions decisions={p.asks.map((a) => ({ id: a.id, question: a.title, leading: a.status === 'closed' ? a.headline : a.responseCount ? a.headline : undefined, to: `/app/asks/${a.id}?from=circle`, mine: a.answered || a.status === 'closed' }))} />
        )}

        {justCreated && open && <Notice tone="accent">Your plan is up. Share it so people can say if they’re in.</Notice>}
        {!(live && canAnswer) && (
          <p className="od-note od-yours" role="status">
            {p.mine ? (p.mine === 'in' ? 'You’re in.' : p.mine === 'maybe' ? 'You’re a maybe.' : 'You can’t make it.') : null}{' '}
            {open && !p.rsvpOpen && !canAnswer ? `RSVPs are closed.${p.mine ? ' Your answer is saved.' : ''}` : !open ? (p.status === 'done' ? 'This plan happened.' : 'This plan was cancelled.') : ''}
          </p>
        )}
        {p.status === 'done' && !p.pactId && (
          <Button variant="secondary" to={`/app/recap/plan/${p.id}`}>
            View recap
          </Button>
        )}

        {/* Organiser prompt for what is still missing (never shown to others) */}
        {p.canEdit && open && (!p.date || !p.location) && (
          <p className="od-note">
            <button type="button" className="plan-task__take" onClick={openEdit}>
              Add {!p.date && !p.location ? 'a date and place' : !p.date ? 'a date' : 'a place'}
            </button>
          </p>
        )}

        {live && (
          <div className="od-plan__asks">
            <Link className="act act--tonal tint--sky" to={`/app/asks/new?circle=${p.circleId}&plan=${p.id}`}>
              <Plus aria-hidden /> Ask the group
            </Link>
            {loose.length > 0 && (
              <button type="button" className="act act--text" onClick={() => setSheet('link')}>
                <Link2 aria-hidden /> Link a question
              </button>
            )}
          </div>
        )}

        {/* Who is coming, by answer, as faces */}
        <section className="od-who" aria-labelledby="who-h">
          <h2 id="who-h" className="t-section">
            Who’s in
          </h2>
          {(
            [
              ['in', 'In'],
              ['maybe', 'Maybe'],
              ['out', 'Can’t make it'],
            ] as const
          ).map(([st, label]) => {
            const rows = p.rsvps.filter((r) => r.status === st);
            return rows.length ? (
              <div key={st} className={`od-who__group od-who__group--${st}`}>
                <h3 className="t-label od-label">
                  {label} <span className="num">{rows.length}</span>
                </h3>
                <ul className="od-faces">
                  {rows.map((r) => (
                    <li key={r.userId}>
                      <Avatar userId={r.userId} size={st === 'in' ? 'lg' : 'md'} label={false} />
                      <span>{name(r.userId)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null;
          })}
          {p.waiting.length > 0 && (
            <div className="od-who__group od-who__group--waiting">
              <h3 className="t-label od-label">
                No response <span className="num">{p.waiting.length}</span>
              </h3>
              <ul className="od-faces">
                {p.waiting.map((uid) => (
                  <li key={uid}>
                    <Avatar userId={uid} size="md" pending label={false} />
                    <span>{name(uid)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Who is doing what. Once there is a Pact, the doing happens there. */}
        {p.pactId && p.tasks.length > 0 && (
          <p className="od-note">
            {p.tasks.filter((t) => t.status === 'done').length} of {p.tasks.length} {p.tasks.length === 1 ? 'task' : 'tasks'} done here. The Pact keeps the list from now on.
          </p>
        )}
        {!p.pactId && (p.tasks.length > 0 || live) && (
          <section className="od-section" aria-labelledby="todo-h">
            <h2 id="todo-h" className="t-section">
              Who’s doing what
            </h2>
            {p.tasks.length > 0 && (
              <ul className="plan-tasks">
                {p.tasks.map((t) => {
                  const mineTask = t.assigneeId === user?.id;
                  const canFinish = live && (mineTask || p.canEdit);
                  return (
                    <li key={t.id} className={`plan-task ${t.status === 'done' ? 'is-done' : ''}`}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={t.status === 'done'}
                        aria-label={`${t.title}${t.assigneeId ? `, ${name(t.assigneeId)}` : ', nobody yet'}`}
                        className="plan-task__box"
                        disabled={!canFinish}
                        onClick={() => void act(() => patchTask.mutateAsync({ taskId: t.id, status: t.status === 'done' ? 'open' : 'done' }))}
                      >
                        <span>{t.status === 'done' && <Check strokeWidth={3} aria-hidden />}</span>
                      </button>
                      <span className="plan-task__text">
                        {t.title}
                        {t.status === 'done' && <span className="visually-hidden"> (done)</span>}
                      </span>
                      {t.assigneeId ? (
                        <span className="plan-task__who">
                          <Avatar userId={t.assigneeId} size="xs" label={false} />
                          {name(t.assigneeId)}
                        </span>
                      ) : (
                        live && (
                          <button type="button" className="plan-task__take" onClick={() => void act(() => patchTask.mutateAsync({ taskId: t.id, assigneeId: user!.id }), 'It’s yours')}>
                            I’ll do it
                          </button>
                        )
                      )}
                      {live && (p.canEdit || t.createdBy === user?.id) && (
                        <IconButton label={`Remove ${t.title}`} variant="ghost" icon={<span aria-hidden>×</span>} onClick={() => void act(() => delTask.mutateAsync(t.id))} />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {live && (
              <form
                className="plan-add"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!task.trim()) return;
                  if (await act(() => addTask.mutateAsync({ title: task.trim() }))) setTask('');
                }}
              >
                <Input id="new-task" label="Add a task" value={task} maxLength={80} autoComplete="off" placeholder="Pick hotel" onChange={(e) => setTask(e.target.value)} />
                <Button type="submit" variant="secondary" disabled={!task.trim()} loading={addTask.isPending}>
                  Add
                </Button>
              </form>
            )}
          </section>
        )}

        {/* Rough budget: informational only */}
        {budgetText(p.roughBudget) && (
          <p className="od-note">
            Rough budget <b className="num">{budgetText(p.roughBudget)}</b>. A rough idea only. Nobody owes anything until this becomes a Pact.
          </p>
        )}

        {p.activity.length > 0 && (
          <section className="od-lately" aria-labelledby="plan-lately">
            <h2 id="plan-lately" className="t-label">
              Lately
            </h2>
            <ul>
              {p.activity.map((a, i) => (
                <li key={`${a.kind}-${a.userId}-${a.at}-${i}`}>
                  <ActivityRow actorId={a.userId} kind="plan" at={a.at} text={activityText(a, name(a.userId), a.userId === user?.id)} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Make it a Pact: low on the page, and only once there is momentum */}
        {!p.pactId && p.canMakePact && (p.status === 'confirmed' || p.counts.in >= 2) && (
          <section className="od-handoff od-handoff--offer tint--mint" aria-labelledby="pact-h">
            <span className="od-handoff__flow" aria-hidden>
              <span>Plan</span>
              <ArrowRight />
              <span>Pact</span>
            </span>
            <strong id="pact-h">Ready to make this real?</strong>
            <span className="od-handoff__line">Turn the Plan into a Pact when the group is ready to commit money, responsibilities and a deadline.</span>
            <Button onClick={() => setSheet('pact')}>Make it a Pact</Button>
          </section>
        )}
      </Sheet>

      <Modal open={sheet === 'menu'} onClose={close} title={p.title}>
        <div className="menu">
          <button type="button" className="menu__row" onClick={openEdit}>
            <span className="menu__text"><span className="menu__title">Edit Plan</span><span className="menu__sub">Name, dates, place and rough budget</span></span>
          </button>
          {p.status === 'planning' ? (
            <button type="button" className="menu__row" onClick={async () => (await setStatus('confirmed', 'Plan confirmed')) && close()}>
              <span className="menu__text"><span className="menu__title">Confirm Plan</span><span className="menu__sub">The basics are agreed. People who are in get told</span></span>
            </button>
          ) : (
            <button type="button" className="menu__row" onClick={async () => (await setStatus('planning', 'Back to planning')) && close()}>
              <span className="menu__text"><span className="menu__title">Back to planning</span></span>
            </button>
          )}
          <button type="button" className="menu__row" onClick={async () => (await act(() => rsvpOpen.mutateAsync(!p.rsvpOpen), p.rsvpOpen ? 'RSVPs closed' : 'RSVPs open')) && close()}>
            <span className="menu__text"><span className="menu__title">{p.rsvpOpen ? 'Close RSVPs' : 'Reopen RSVPs'}</span><span className="menu__sub">{p.rsvpOpen ? 'Answers so far stay' : 'People can answer again'}</span></span>
          </button>
          {!p.pactId && (
            <button type="button" className="menu__row" onClick={async () => (await setStatus('done', 'Marked as done')) && close()}>
              <span className="menu__text"><span className="menu__title">Mark as done</span><span className="menu__sub">The Plan happened</span></span>
            </button>
          )}
          <button type="button" className="menu__row" onClick={() => setSheet('hand')}>
            <span className="menu__text"><span className="menu__title">Hand over</span><span className="menu__sub">Let someone else run this plan</span></span>
          </button>
          <button type="button" className="menu__row" onClick={() => setSheet('reset')}>
            <span className="menu__text"><span className="menu__title">Reset the link</span><span className="menu__sub">Turns the old link off</span></span>
          </button>
          {!p.pactId && (
            <button type="button" className="menu__row menu__row--danger" onClick={() => setSheet('cancel')}>
              <span className="menu__text"><span className="menu__title">Cancel Plan</span></span>
            </button>
          )}
        </div>
      </Modal>

      <Modal
        open={sheet === 'edit'}
        onClose={close}
        title="Edit plan"
        footer={
          <Button fullWidth loading={update.isPending} disabled={!draft.title.trim()} onClick={() => void save()}>
            Save
          </Button>
        }
      >
        <div className="plan-sheet">
          {p.pactId && <p className="plan-note">This Plan already has a Pact. Changes here won’t change the Pact.</p>}
          <Input label="Plan name" value={draft.title} maxLength={80} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <Input label="Date" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value, endDate: draft.endDate && draft.endDate < e.target.value ? '' : draft.endDate })} />
          <Input label="End date (optional)" type="date" value={draft.endDate} min={draft.date || undefined} disabled={!draft.date} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} />
          <Input label="Location" value={draft.location} maxLength={80} placeholder="Accra" onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
          <AmountInput label="Rough budget" value={draft.budget} onChange={(v) => setDraft({ ...draft, budget: v })} />
        </div>
      </Modal>

      <Modal
        open={sheet === 'sure'}
        onClose={() => setSheet('edit')}
        title={ask?.message ?? 'This changes the plan for everyone.'}
        description="People who answered will see the new details."
        footer={
          <>
            <Button fullWidth loading={update.isPending} onClick={() => void save(true)}>
              Update it
            </Button>
            <Button fullWidth variant="ghost" onClick={() => setSheet('edit')}>
              Go back
            </Button>
          </>
        }
      >
        <span />
      </Modal>

      <Modal open={sheet === 'link'} onClose={close} title="Link a question" description="Questions from this Circle that aren’t part of a plan yet.">
        <ul className="list-stack">
          {loose.map((a) => (
            <li key={a.id}>
              <button type="button" className="menu__row" onClick={async () => (await act(() => link.mutateAsync(a.id), 'Linked')) && close()}>
                <span className="menu__text"><span className="menu__title">{a.title}</span><span className="menu__sub">{a.headline}</span></span>
              </button>
            </li>
          ))}
        </ul>
      </Modal>

      <Modal
        open={sheet === 'pact'}
        onClose={close}
        title="Ready to make this happen?"
        description="Turn this plan into a Pact when the group is ready to commit money, responsibilities and a deadline. You’ll review everything before anything is created."
        footer={
          <>
            <Button fullWidth onClick={() => navigate(startPactPath({ planId: p.id, hasCreated: true }))}>
              Continue to Pact setup
            </Button>
            <Button fullWidth variant="ghost" onClick={close}>
              Not yet
            </Button>
          </>
        }
      >
        <ul className="plan-people" aria-label="What carries over">
          <li>Name, dates and rough budget</li>
          <li>{p.counts.in + p.counts.maybe - 1 > 0 ? `${p.counts.in + p.counts.maybe - 1} people who are in or maybe` : 'The Circle’s people, to invite'}</li>
          <li>{p.tasksOpen} open {p.tasksOpen === 1 ? 'task' : 'tasks'}</li>
        </ul>
      </Modal>

      <Modal
        open={sheet === 'cancel'}
        onClose={close}
        title="Cancel this plan?"
        description="People will see it was cancelled and RSVPs close. It stays in the Circle’s history. You can’t undo this."
        footer={
          <Button fullWidth loading={status.isPending} onClick={async () => (await setStatus('cancelled', 'Plan cancelled')) && (close(), navigate(`/app/circles/${p.circleId}`, { replace: true }))}>
            Cancel the plan
          </Button>
        }
      >
        <span />
      </Modal>

      <HandOverSheet open={sheet === 'hand'} onClose={close} circleId={p.circleId} currentId={p.createdBy} busy={handOver.isPending} onPick={async (uid) => (await act(() => handOver.mutateAsync(uid), 'Handed over')) && close()} />

      <Modal
        open={sheet === 'reset'}
        onClose={close}
        title="Reset the link?"
        description="The current link stops working at once. Share the new one with the people who still need it."
        footer={
          <Button fullWidth loading={reset.isPending} onClick={async () => (await act(() => reset.mutateAsync(), 'New link ready')) && close()}>
            Reset link
          </Button>
        }
      >
        <span />
      </Modal>
    </Screen>
  );
}
