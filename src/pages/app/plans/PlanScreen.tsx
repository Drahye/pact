import { Check, Ellipsis, Link2, Plus, Share2 } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Attendance, PlanDTO, PlanStatus } from '../../../../shared/contracts';
import { useAuth } from '../../../api/auth';
import { useCircleAsks } from '../../../api/asks';
import { ApiError } from '../../../api/client';
import { useAddTask, useDeleteTask, useLinkAsk, usePatchTask, usePlan, useResetPlanLink, useRsvp, useSetRsvpOpen, useSetPlanStatus, useUpdatePlan } from '../../../api/plans';
import { PactDetailSkeleton } from '../../../components/app/Skeleton';
import { ErrorState, Notice } from '../../../components/app/States';
import { AskCard } from '../../../components/ask/AskCard';
import { PlanHeading, RsvpButtons } from '../../../components/plan/PlanBits';
import { AmountInput } from '../../../components/ui/AmountInput';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { IconButton } from '../../../components/ui/IconButton';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { SectionHeading } from '../../../components/ui/SectionHeading';
import { TopBar } from '../../../components/ui/TopBar';
import { useToast } from '../../../components/ui/Toast';
import { getUser } from '../../../data/users';
import { budgetText, dateRange } from '../../../lib/planDates';
import { sharePlan } from '../../../lib/planShare';
import { startPactPath } from '../../../lib/startPactPath';
import { Screen } from '../Screen';
import '../../../components/plan/plan.css';

type Sheet = null | 'menu' | 'edit' | 'link' | 'pact' | 'cancel' | 'reset' | 'sure';
const attLabel: Record<Attendance, string> = { in: 'In', maybe: 'Maybe', out: 'Can’t' };

/** "Sarah is in", "Daniel changed to Maybe", "Tobi completed “Pick hotel”". Plain words; no chat. */
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
  const rsvpOpen = useSetRsvpOpen(id);
  const circleAsks = useCircleAsks(plan.data?.circleId);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [task, setTask] = useState('');
  const [changing, setChanging] = useState(false);
  const [ask, setAsk] = useState<{ body: Record<string, unknown>; message: string } | null>(null);
  const [draft, setDraft] = useState({ title: '', date: '', endDate: '', location: '', budget: 0 });
  const justCreated = (location.state as { justCreated?: boolean } | null)?.justCreated === true;

  if (plan.isLoading) return <Screen topBar={<TopBar backTo="/app/circles" />}><PactDetailSkeleton label="Loading plan" /></Screen>;
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
      topBar={
        <TopBar
          backTo={`/app/circles/${p.circleId}`}
          title={p.circle.name}
          trailing={
            <span className="detail__top-actions">
              <IconButton label="Share" icon={<Share2 />} onClick={share} />
              {p.canEdit && <IconButton label="More" icon={<Ellipsis />} onClick={() => setSheet('menu')} />}
            </span>
          }
        />
      }
    >
      <div className="plan-section" style={{ gap: 'var(--space-5)', paddingBottom: 'var(--space-6)' }}>
        <PlanHeading plan={p} counts={p.counts} note />
        {justCreated && open && <Notice tone="accent">Your plan is up. Share it so people can say if they’re in.</Notice>}
        {p.pactId && <Notice tone="neutral">This Plan already has a Pact. Changes here won’t change the Pact.</Notice>}

        {/* 1. Your response */}
        <section className="plan-section" aria-labelledby="rsvp-h">
          {p.mine !== null && !changing ? (
            <>
              <h2 id="rsvp-h" className="plan-section__title">
                {p.mine === 'in' ? 'You’re in ✓' : p.mine === 'maybe' ? 'You’re a maybe' : 'You can’t make it'}
              </h2>
              {open && canAnswer && (
                <div className="plan-section__row">
                  <Button variant="ghost" onClick={() => setChanging(true)}>
                    Change response
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              <h2 id="rsvp-h" className="plan-section__title">
                Are you coming?
              </h2>
              <RsvpButtons
                value={p.mine}
                disabled={!open || !canAnswer || rsvp.isPending}
                onPick={async (a) => {
                  if (await act(() => rsvp.mutateAsync(a))) setChanging(false);
                }}
              />
            </>
          )}
          {open && !p.rsvpOpen && !canAnswer && <p className="plan-note">RSVPs are closed.{p.mine ? ' Your answer is saved.' : ''}</p>}
          {!open && <p className="plan-note">{p.status === 'done' ? 'This plan happened.' : 'This plan was cancelled.'}</p>}
          {p.status === 'done' && (
            <div className="plan-section__row">
              <Button variant="secondary" to={`/app/recap/plan/${p.id}`}>
                View recap
              </Button>
            </div>
          )}
        </section>

        {/* Organiser prompt for what is still missing (never shown to others) */}
        {p.canEdit && open && (!p.date || !p.location) && (
          <p className="plan-note">
            <button type="button" className="plan-task__take" onClick={openEdit}>
              Add {!p.date && !p.location ? 'a date and place' : !p.date ? 'a date' : 'a place'}
            </button>
          </p>
        )}

        {/* 2. Decisions */}
        {(p.asks.length > 0 || open) && (
          <section className="plan-section" aria-labelledby="dec-h">
            <SectionHeading id="dec-h" title="Decisions" />
            {p.asks.length > 0 && (
              <ul className="list-stack" aria-label="Questions for this plan">
                {p.asks.map((a) => (
                  <li key={a.id}>
                    <AskCard ask={a} from="circle" />
                  </li>
                ))}
              </ul>
            )}
            {open && (
              <div className="plan-section__row">
                <Button variant="secondary" iconLeft={<Plus />} to={`/app/asks/new?circle=${p.circleId}&plan=${p.id}`}>
                  Ask the group
                </Button>
                {loose.length > 0 && (
                  <Button variant="ghost" iconLeft={<Link2 />} onClick={() => setSheet('link')}>
                    Link a question
                  </Button>
                )}
              </div>
            )}
          </section>
        )}

        {/* 3. To do */}
        {(p.tasks.length > 0 || open) && (
          <section className="plan-section" aria-labelledby="todo-h">
            <SectionHeading id="todo-h" title="To do" />
            {p.tasks.length > 0 && (
              <ul className="plan-tasks">
                {p.tasks.map((t) => {
                  const mineTask = t.assigneeId === user?.id;
                  const canFinish = open && (mineTask || p.canEdit);
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
                        open && (
                          <button type="button" className="plan-task__take" onClick={() => void act(() => patchTask.mutateAsync({ taskId: t.id, assigneeId: user!.id }), 'It’s yours')}>
                            I’ll do it
                          </button>
                        )
                      )}
                      {open && (p.canEdit || t.createdBy === user?.id) && (
                        <IconButton label={`Remove ${t.title}`} variant="ghost" icon={<span aria-hidden>×</span>} onClick={() => void act(() => delTask.mutateAsync(t.id))} />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {open && (
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

        {/* 4. People, grouped by answer */}
        <section className="plan-section" aria-labelledby="people-h">
          <SectionHeading id="people-h" title="People" />
          {(
            [
              ['in', 'In'],
              ['maybe', 'Maybe'],
              ['out', 'Can’t make it'],
            ] as const
          ).map(([st, label]) => {
            const rows = p.rsvps.filter((r) => r.status === st);
            return rows.length ? (
              <div key={st}>
                <h3 className="plan-group__label">{label}</h3>
                <ul className="plan-people">
                  {rows.map((r) => (
                    <li key={r.userId}>
                      <Avatar userId={r.userId} size="sm" label={false} />
                      <span className="ask__roster-name">{name(r.userId)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null;
          })}
          {p.waiting.length > 0 && (
            <div>
              <h3 className="plan-group__label">No response</h3>
              <ul className="plan-people">
                {p.waiting.map((uid) => (
                  <li key={uid} className="is-waiting">
                    <Avatar userId={uid} size="sm" label={false} />
                    <span className="ask__roster-name">{name(uid)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* 5. Rough budget: informational only */}
        {budgetText(p.roughBudget) && (
          <section className="plan-section" aria-labelledby="budget-h">
            <SectionHeading id="budget-h" title="Rough budget" />
            <p className="plan-head__going">{budgetText(p.roughBudget)}</p>
            <p className="plan-note">A rough idea only. Nobody owes anything until this becomes a Pact.</p>
          </section>
        )}

        {p.activity.length > 0 && (
          <ul className="ask__feed" aria-label="Recent activity">
            {p.activity.map((a, i) => (
              <li key={`${a.kind}-${a.userId}-${a.at}-${i}`}>
                <Avatar userId={a.userId} size="sm" label={false} />
                <span className="ask__feed-text">{activityText(a, name(a.userId), a.userId === user?.id)}</span>
              </li>
            ))}
          </ul>
        )}

        {/* 6. Make it a Pact: low on the page, and only once there is momentum */}
        {p.pactId ? (
          <section className="plan-pact is-done" aria-labelledby="pact-h">
            <strong id="pact-h">{p.status === 'done' ? 'Completed' : 'This plan became a Pact'}</strong>
            <p>{p.status === 'done' ? 'You made it happen 🎉' : 'The group is now committing and executing the plan through its Pact.'}</p>
            <Button to={`/app/pact/${p.pactId}`}>Open Pact</Button>
          </section>
        ) : (
          p.canMakePact &&
          (p.status === 'confirmed' || p.counts.in >= 2) && (
            <section className="plan-pact" aria-labelledby="pact-h">
              <strong id="pact-h">Ready to make this real?</strong>
              <p>Turn the Plan into a Pact when the group is ready to commit money, responsibilities and a deadline.</p>
              <Button onClick={() => setSheet('pact')}>Make it a Pact</Button>
            </section>
          )
        )}
      </div>

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
