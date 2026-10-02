import { Check, FlaskConical } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { BudgetList, TaskList } from '../../components/pact/Plan';
import { CategoryIcon } from '../../components/pact/category';
import { SegmentedRing } from '../../components/pact/SegmentedRing';
import { Avatar } from '../../components/ui/Avatar';
import { ActivityItem } from '../../components/ui/ActivityItem';
import { AvatarGroup } from '../../components/ui/AvatarGroup';
import { Button } from '../../components/ui/Button';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { TopBar } from '../../components/ui/TopBar';
import { getUser } from '../../data/users';
import { formatNaira } from '../../lib/format';
import { Screen } from '../../pages/app/Screen';
import { trackOnboarding } from '../onboarding/track';
import { DEMOS, isDemoId, type DemoPact } from './fixtures';
import './demo.css';

/** The lifecycle, in the order a Pact lives it. Each step shows the part of the sample Pact that belongs to it. */
const STEPS = [
  { key: 'create', label: 'Create', line: 'It starts with a name, a goal and a date.' },
  { key: 'invite', label: 'Invite', line: 'One link brings everyone in. Each person picks how they’ll show up.' },
  { key: 'contribute', label: 'Contribute', line: 'Money goes in. Every colour in the ring is someone.' },
  { key: 'organise', label: 'Organise', line: 'Tasks get an owner, and the next step is always clear.' },
  { key: 'execute', label: 'Execute', line: 'Funded isn’t finished: the group pays for the plan from the Pact.' },
  { key: 'complete', label: 'Complete', line: 'The plan gets finished, and what’s left is settled.' },
] as const;
type Step = (typeof STEPS)[number]['key'];

/** What each step's activity feed shows. */
const FEED: Record<Step, string[]> = {
  create: ['created'],
  invite: ['join'],
  contribute: ['contribution', 'completed'],
  organise: ['task_done'],
  execute: ['vendor_paid'],
  complete: ['pact_completed', 'released'],
};

/** Everything the viewer could do on a real Pact is switched off here: nothing inside is interactive. */
function ReadOnly({ children }: { children: ReactNode }) {
  return (
    <div className="demo-readonly" {...({ inert: '' } as object)}>
      {children}
    </div>
  );
}

const ringShares = (d: DemoPact) => d.pact.members.map((m) => ({ id: m.userId, color: getUser(m.userId).color, value: m.contributed }));

function Feed({ demo, step }: { demo: DemoPact; step: Step }) {
  const items = demo.activities.filter((a) => FEED[step].includes(a.type));
  if (!items.length) return null;
  return (
    <section className="demo-block" aria-labelledby={`feed-${step}`}>
      <h3 id={`feed-${step}`} className="demo-block__title">
        Activity
      </h3>
      <ul className="demo-feed">
        {items.slice(0, 6).map((a) => (
          <li key={a.id}>
            <ActivityItem activity={a} viewerId={null} meta={<span>Day {demo.days[a.id]}</span>} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Panel({ demo, step }: { demo: DemoPact; step: Step }) {
  const p = demo.pact;
  const total = p.members.reduce((s, m) => s + m.contributed, 0);
  const used = demo.spent.reduce((s, x) => s + x.amount, 0);
  const done = (p.tasks ?? []).filter((t) => t.status === 'done').length;
  const all = p.tasks?.length ?? 0;

  switch (step) {
    case 'create':
      return (
        <>
          <section className="demo-block" aria-labelledby="ov">
            <h3 id="ov" className="demo-block__title">
              Overview
            </h3>
            <dl className="demo-facts">
              <div><dt>For</dt><dd>{demo.purpose}</dd></div>
              <div><dt>Goal</dt><dd className="num">{formatNaira(p.target)}</dd></div>
              <div><dt>When</dt><dd>{demo.dateLabel}</dd></div>
              <div><dt>Organiser</dt><dd>{getUser(p.organizerId).name}</dd></div>
            </dl>
          </section>
          <Feed demo={demo} step={step} />
        </>
      );
    case 'invite':
      return (
        <>
          <section className="demo-block" aria-labelledby="pp">
            <h3 id="pp" className="demo-block__title">
              People · {p.members.length}
            </h3>
            <ul className="demo-people">
              {p.members.map((m) => (
                <li key={m.userId}>
                  <Avatar userId={m.userId} size="md" label={false} accent />
                  <span>
                    <strong>{getUser(m.userId).name}</strong>
                    <small>{m.role === 'organizer' ? 'Organiser' : 'Money and a task'}</small>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <Feed demo={demo} step={step} />
        </>
      );
    case 'contribute':
      return (
        <>
          <section className="demo-block demo-block--ring" aria-labelledby="cn">
            <h3 id="cn" className="demo-block__title">
              Contributions
            </h3>
            <SegmentedRing shares={ringShares(demo)} target={total} size={180} stroke={18} label={`${p.title} funded`} animate={false}>
              <span className="demo-ring__center">
                <strong className="num">{formatNaira(total)}</strong>
                <span>100% funded</span>
              </span>
            </SegmentedRing>
            <ProgressBar value={100} label="Funded" />
            <ul className="demo-gave">
              {p.members.map((m) => (
                <li key={m.userId}>
                  <span><Avatar userId={m.userId} size="xs" label={false} accent /> {getUser(m.userId).name}</span>
                  <strong className="num">{formatNaira(m.contributed)}</strong>
                </li>
              ))}
            </ul>
          </section>
          <Feed demo={demo} step={step} />
        </>
      );
    case 'organise':
      return (
        <>
          <section className="demo-block" aria-labelledby="nx">
            <h3 id="nx" className="demo-block__title">
              Next step
            </h3>
            <div className="demo-next">
              <p className="demo-next__eyebrow">What the group saw along the way</p>
              <p className="demo-next__title">{p.tasks?.[1]?.title ?? 'Order the cake'}</p>
              <p className="demo-next__body">{getUser(p.tasks?.[1]?.assigneeId ?? 'tolu').name} has it. One next step at a time, so nobody has to ask.</p>
            </div>
          </section>
          <section className="demo-block" aria-labelledby="tk">
            <h3 id="tk" className="demo-block__title">
              Tasks
            </h3>
            <ReadOnly>
              <TaskList pact={p} tasks={p.tasks ?? []} meId="demo-viewer" onOpen={() => undefined} />
            </ReadOnly>
          </section>
          <section className="demo-block" aria-labelledby="pr">
            <h3 id="pr" className="demo-block__title">
              Progress
            </h3>
            <ProgressBar value={all ? (done / all) * 100 : 100} label="Tasks done" />
            <p className="demo-note num">{done} of {all} tasks done</p>
          </section>
          <Feed demo={demo} step={step} />
        </>
      );
    case 'execute':
      return (
        <>
          <section className="demo-block" aria-labelledby="ex">
            <h3 id="ex" className="demo-block__title">
              Execution
            </h3>
            <p className="demo-note">Funded is not finished. These were paid straight from the Pact.</p>
            <ReadOnly>
              <BudgetList lines={p.budget ?? []} />
            </ReadOnly>
            <p className="demo-total num">
              <strong>{formatNaira(used)}</strong> paid · {formatNaira(demo.remaining)} left
            </p>
          </section>
          <Feed demo={demo} step={step} />
        </>
      );
    case 'complete':
      return (
        <>
          <section className="demo-block demo-done" aria-labelledby="cp">
            <SegmentedRing shares={ringShares(demo)} target={total} size={132} stroke={14} label={`${p.title} completed`} animate={false}>
              <span className="demo-done__check" aria-hidden>
                <Check strokeWidth={3} />
              </span>
            </SegmentedRing>
            <h3 id="cp" className="demo-done__title">
              {p.title} is complete
            </h3>
            <p className="demo-done__outcome">{demo.outcome}</p>
            <dl className="demo-stats">
              <div><dd className="num">{p.members.length}</dd><dt>People</dt></div>
              <div><dd className="num">{formatNaira(total)}</dd><dt>Raised</dt></div>
              <div><dd className="num">{formatNaira(used)}</dd><dt>Used for the plan</dt></div>
              <div><dd className="num">{formatNaira(demo.remaining)}</dd><dt>Left over</dt></div>
            </dl>
            <Button to="/app/start" state={{ from: 'demo' }} fullWidth>
              Create one like this
            </Button>
          </section>
          <Feed demo={demo} step={step} />
        </>
      );
  }
}

/**
 * A sample Pact you can explore from Create to Complete. Read only: it is drawn from fixed data with the app's own
 * components, and nothing here reads from or writes to the server. Everything interactive is switched off.
 */
export function DemoPactScreen() {
  const { id } = useParams();
  const location = useLocation();
  const [step, setStep] = useState<Step>('create');
  const tabsId = useId();
  const valid = isDemoId(id);
  const demo = valid ? DEMOS[id] : null;
  const from = (location.state as { from?: string } | null)?.from === 'onboarding' ? 'onboarding' : 'home';

  useEffect(() => {
    if (valid) trackOnboarding('demo_pact_opened', { demo: id, from });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => {
    if (valid && step === 'complete') trackOnboarding('demo_pact_completed_view', { demo: id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, id]);

  if (!demo) return <Navigate to="/app/home" replace />;
  const p = demo.pact;
  const current = STEPS.find((s) => s.key === step)!;

  return (
    <Screen
      topBar={<TopBar backTo="/app/home" title="Demo Pact" />}
      footer={
        <div className="demo-footer">
          <Button to="/app/start" state={{ from: 'demo' }} fullWidth>
            Create one like this
          </Button>
          <p>Sample data. Nothing here is real, and nothing can be changed.</p>
        </div>
      }
    >
      <div className="demo">
        <p className="demo-banner" role="note">
          <FlaskConical aria-hidden />
          <span>
            <strong>Demo Pact</strong> A sample of how a group finishes a plan. You can look around, not change anything.
          </span>
        </p>

        <header className="demo-head">
          <CategoryIcon category={demo.category} size="lg" />
          <div>
            <h1 className="demo-head__title">{p.title}</h1>
            <p className="demo-head__meta">
              {demo.dateLabel} · <AvatarGroup userIds={p.members.map((m) => m.userId)} max={3} size="xs" total={p.members.length} /> {p.members.length} people
            </p>
          </div>
          <span className="demo-badge demo-badge--done">
            <Check aria-hidden strokeWidth={3} /> Completed
          </span>
        </header>

        <div role="tablist" aria-label="How a Pact works, step by step" className="demo-steps">
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              id={`${tabsId}-${s.key}`}
              aria-selected={step === s.key}
              aria-controls={`${tabsId}-panel`}
              className={`demo-step ${step === s.key ? 'is-on' : ''}`}
              onClick={() => setStep(s.key)}
            >
              <span className="demo-step__n num">{i + 1}</span>
              {s.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${step}`} className="demo-panel" tabIndex={0}>
          <p className="demo-line">{current.line}</p>
          <Panel demo={demo} step={step} />
          {step !== 'complete' && (
            <Button variant="secondary" fullWidth onClick={() => setStep(STEPS[STEPS.findIndex((s) => s.key === step) + 1].key)}>
              Next: {STEPS[STEPS.findIndex((s) => s.key === step) + 1].label}
            </Button>
          )}
        </div>
      </div>
    </Screen>
  );
}
