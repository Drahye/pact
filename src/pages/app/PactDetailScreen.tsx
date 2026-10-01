import { AnimatePresence, motion } from 'framer-motion';
import { BellRing, CalendarDays, ChevronRight, Divide, Ellipsis, LogOut, RotateCcw, Scale, Share, ShieldCheck, Store, Target, UserPlus, Users, XCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../api/auth';
import { ApiError } from '../../api/client';
import { usePactAction, usePactCommand, usePlan } from '../../api/hooks';
import { PinSheet } from '../../components/app/PinSheet';
import { Notice } from '../../components/app/States';
import { AnimatedNumber } from '../../components/pact/AnimatedNumber';
import { CategoryChip } from '../../components/pact/category';
import { AttentionCard, BudgetList, NextStep, OrganizerProgress, TaskList } from '../../components/pact/Plan';
import { useFitText } from '../../lib/useFitText';
import { SegmentedRing } from '../../components/pact/SegmentedRing';
import { ActivityItem } from '../../components/ui/ActivityItem';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { Modal } from '../../components/ui/Modal';
import { SectionHeading } from '../../components/ui/SectionHeading';
import { TopBar } from '../../components/ui/TopBar';
import { useToast } from '../../components/ui/Toast';
import type { Activity, BudgetLine, Pact, PactPayout, Task } from '../../data/types';
import { getUser } from '../../data/users';
import { addDaysIso } from '../../lib/dates';
import { formatDate, formatNaira, formatNairaCompact, formatPercent } from '../../lib/format';
import { colorOf, GUEST_SHARE_ID, guestTotalOf, invitedMembers, joinedMembers, sharesOf, summarize } from '../../lib/pact';
import { attentionFor, bringsOf, checkpointsFor, nextStepFor, participationLabel, stageOf, type AttentionItem } from '../../lib/plan';
import { spring } from '../../tokens/tokens';
import { MISSED_GOAL_GRACE_DAYS, NGN, VENDOR_APPROVAL_THRESHOLD } from '../../../shared/policy';
import { ApprovalCards, AssignGuestSheet, canPayVendors, CoOrganizerSheet, GuestAvatar, guestsOf, isOrganizerOf, PaidFromPact, PayByTransfer, PayoutSheet, PayVendorSheet, type GuestGroup } from './detail/Money';
import { isOrderPact, MyOrders, OrderMenu, OrderSheetSection, owedOnOrders } from './detail/Orders';
import { MyPledge, pledgeLabel } from './detail/Pledges';
import { AddTaskSheet, BudgetLineSheet, ParticipationSheet, SplitSheet, TaskSheet } from './detail/Sheets';
import { Screen } from './Screen';
import './detail.css';

/** Lets the ring's centre size its amount to the number of characters it has to fit. */
const chars = (text: string) => ({ ['--chars' as string]: text.length });

/** One line of text in the middle of the ring: sized by CSS, then fitted to the ring if the OS text size pushes it out. */
function RingLine({ className, deps, children }: { className: string; deps: unknown[]; children: ReactNode }) {
  const ref = useFitText<HTMLParagraphElement>(deps);
  return (
    <p ref={ref} className={className}>
      {children}
    </p>
  );
}

export function PactDetailScreen({ pact, activity }: { pact: Pact; activity: Activity[] }) {
  const { user } = useAuth();
  const me = user?.id ?? '';
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const fromRaised = (location.state as { fromRaised?: number } | null)?.fromRaised;
  const [selected, setSelected] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [participationOpen, setParticipationOpen] = useState(false);
  const [task, setTask] = useState<Task | null>(null);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [line, setLine] = useState<BudgetLine | null>(null);
  const [lineOpen, setLineOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [payout, setPayout] = useState<PactPayout | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [coOpen, setCoOpen] = useState(false);
  const [guest, setGuest] = useState<GuestGroup | null>(null);
  const cmd = usePactCommand(pact.id);
  const plan = usePlan(pact.id);
  const cancel = usePactAction(pact.id, 'cancel');

  const s = summarize(pact);
  const stage = stageOf(pact, me);
  const joined = joinedMembers(pact);
  const invited = invitedMembers(pact);
  const isOrganizer = pact.organizerId === me;
  // Organiser or co-organiser: can set up the account number, pay vendors, match transfers.
  const runsMoney = isOrganizerOf(pact, me);
  const guests = guestsOf(pact);
  const orders = isOrderPact(pact);
  const owed = orders ? owedOnOrders(pact, me) : 0;
  const isOpen = pact.status === 'open';
  const mine = pact.members.find((m) => m.userId === me);
  const organizer = isOrganizer ? 'you' : getUser(pact.organizerId).name;
  const base = `/app/pact/${pact.id}`;
  const name = (id: string) => (id === me ? 'You' : getUser(id).name);
  const picked = selected ? pact.members.find((m) => m.userId === selected) : null;
  const ask = mine?.requestedAmount || (pact.splitMode === 'equal' ? pact.viewer?.suggestedShare : 0) || 0;
  const tasks = pact.tasks ?? [];
  const budget = pact.budget ?? [];
  const attention = attentionFor(pact, me);
  // The first useful prompt leads the page as the Next step; the rest stay under "Needs attention".
  const next = stage === 'invited' || stage === 'closed' ? null : nextStepFor(pact, me);
  const checkpoints = isOrganizer ? checkpointsFor(pact) : [];

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMenuOpen(false);
    try {
      await fn();
      toast(ok);
    } catch (err) {
      toast((err as ApiError).message, 'neutral');
    }
  };

  const onAttention = (it: AttentionItem) => {
    const a = it.action;
    if (!a) return;
    if (a.kind === 'contribute') navigate(`${base}/contribute${a.amount ? `?amount=${a.amount}` : ''}`);
    else if (a.kind === 'participation') setParticipationOpen(true);
    else if (a.kind === 'claim' && a.taskId) void run(() => plan.updateTask.mutateAsync({ id: a.taskId!, assigneeId: 'me' }), 'It’s yours');
    else if (a.kind === 'done' && a.taskId) void run(() => plan.updateTask.mutateAsync({ id: a.taskId!, status: 'done' }), 'Done. Nice.');
    else if (a.kind === 'remind') void run(() => cmd.nudge.mutateAsync(), 'Reminder sent');
    else if (a.kind === 'split') setSplitOpen(true);
    else if (a.kind === 'invite') navigate(`${base}/invite`);
  };

  /* The main action depends on where the Pact is. */
  const actions = (() => {
    if (orders && ['just-you', 'open', 'almost'].includes(stage)) {
      return {
        primary: owed > 0 ? (
          <Button to={`${base}/contribute?amount=${Math.ceil(owed)}`} fullWidth>Pay for orders · {formatNairaCompact(owed)}</Button>
        ) : (
          <Button fullWidth onClick={() => document.getElementById('order-menu')?.scrollIntoView({ behavior: 'smooth' })}>Order something</Button>
        ),
        secondary: <Button to={`${base}/invite`} variant="secondary" fullWidth>Invite people</Button>,
      };
    }
    switch (stage) {
      case 'just-you':
        return { primary: <Button to={`${base}/invite`} fullWidth>Invite people</Button>, secondary: <Button to={`${base}/contribute`} variant="secondary" fullWidth>Add to Pact</Button> };
      case 'almost':
        return {
          primary: <Button to={`${base}/contribute?amount=${Math.ceil(s.remaining)}`} fullWidth>Cover the rest · {formatNairaCompact(s.remaining)}</Button>,
          secondary: isOrganizer ? (
            <Button variant="secondary" fullWidth iconLeft={<Divide />} onClick={() => setSplitOpen(true)}>Split the rest</Button>
          ) : (
            <Button to={`${base}/contribute`} variant="secondary" fullWidth>Another amount</Button>
          ),
        };
      case 'open':
        return {
          primary: <Button to={`${base}/contribute${ask ? `?amount=${Math.ceil(ask)}` : ''}`} fullWidth>{ask ? `Add your share · ${formatNairaCompact(ask)}` : 'Contribute'}</Button>,
          secondary: <Button to={`${base}/invite`} variant="secondary" fullWidth>Invite people</Button>,
        };
      default:
        return null;
    }
  })();

  return (
    <Screen
      topBar={
        <TopBar
          backTo="/app/home"
          title={pact.title}
          trailing={
            stage !== 'invited' && isOpen ? (
              <span className="detail__top-actions">
                <IconButton label="Share invite link" icon={<Share />} to={`${base}/invite`} />
                <IconButton label="More" icon={<Ellipsis />} onClick={() => setMenuOpen(true)} />
              </span>
            ) : undefined
          }
        />
      }
      className="detail"
    >
      <div className="detail__head">
        <CategoryChip category={pact.category} suffix={`by ${organizer}`} />
      </div>

      {stage === 'invited' && (
        <div className="detail__invite">
          <p>
            <strong>{getUser(pact.organizerId).name}</strong> invited you. How do you want to show up?
          </p>
          <div className="detail__invite-actions">
            <Button size="md" variant="secondary" onClick={() => run(() => cmd.leave.mutateAsync().then(() => navigate('/app/home')), 'Invite declined')}>
              Not this time
            </Button>
            <Button size="md" onClick={() => run(async () => { await cmd.accept.mutateAsync(); setParticipationOpen(true); }, `You joined ${pact.title}`)} loading={cmd.accept.isPending}>
              Join
            </Button>
          </div>
        </div>
      )}

      {stage === 'closed' && (
        <Notice tone="neutral" icon={<RotateCcw />}>
          {pact.status === 'cancelled' ? 'The organiser closed this Pact.' : 'The goal wasn’t reached by the deadline.'} What was left went back to where it came from: wallets for members, bank accounts for guests.
        </Notice>
      )}

      {pact.note && <p className="detail__note">“{pact.note}”</p>}

      <div className="detail__ring">
        <SegmentedRing
          shares={sharesOf(pact)}
          target={pact.target}
          size={228}
          stroke={20}
          selected={selected}
          onSelect={setSelected}
          delay={0.15}
          label={`${pact.title}: ${Math.round(s.percent)}% funded`}
        >
          <AnimatePresence mode="wait" initial={false}>
            {selected === GUEST_SHARE_ID ? (
              <motion.div key="guests" className="detail__center" style={chars(formatNaira(guestTotalOf(pact)))} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }} transition={{ duration: 0.18 }}>
                <p className="detail__center-name">Guests</p>
                <RingLine className="detail__center-amount num" deps={[guestTotalOf(pact)]}>{formatNaira(guestTotalOf(pact))}</RingLine>
                <p className="detail__center-meta">by bank transfer</p>
              </motion.div>
            ) : picked ? (
              <motion.div key={picked.userId} className="detail__center" style={chars(formatNaira(picked.contributed))} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }} transition={{ duration: 0.18 }}>
                <Avatar userId={picked.userId} size="md" accent accentColor={colorOf(pact, picked.userId)} label={false} />
                <p className="detail__center-name">{name(picked.userId)}</p>
                <RingLine className="detail__center-amount num" deps={[picked.contributed]}>{formatNaira(picked.contributed)}</RingLine>
                <p className="detail__center-meta num">{formatPercent((picked.contributed / Math.max(1, s.raised)) * 100)} of the total</p>
              </motion.div>
            ) : (
              <motion.div key="total" className="detail__center" style={chars(formatNaira(s.raised))} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }} transition={{ duration: 0.18 }}>
                <RingLine className="detail__center-amount detail__center-amount--total" deps={[s.raised]}>
                  <AnimatedNumber value={s.raised} from={fromRaised ?? 0} />
                </RingLine>
                <RingLine className="detail__center-meta" deps={[s.target, orders]}>
                  {orders ? (s.target ? <>paid of <span className="num">{formatNaira(s.target)}</span> ordered</> : 'No orders yet') : <>of <span className="num">{formatNaira(s.target)}</span></>}
                </RingLine>
                <RingLine className="detail__center-pct num" deps={[s.percent]}>
                  <AnimatedNumber value={s.percent} from={fromRaised !== undefined ? (fromRaised / Math.max(1, s.target)) * 100 : 0} format="percent" /> funded
                </RingLine>
              </motion.div>
            )}
          </AnimatePresence>
        </SegmentedRing>
        {s.raised > 0 && <p className="detail__ring-hint">{picked ? 'Tap the centre to see the total' : 'Tap a colour or a name to see who gave it'}</p>}
      </div>

      <ul className="detail__stats">
        <li className="tint--sun" style={chars(String(s.daysLeft))}>
          <CalendarDays aria-hidden />
          <span>
            <strong className="num">{s.daysLeft}</strong> days left
          </span>
          <small>{formatDate(pact.deadline, { month: 'short', day: 'numeric' })}</small>
        </li>
        <li className="tint--sky" style={chars(String(joined.length))}>
          <Users aria-hidden />
          <span>
            <strong className="num">{joined.length}</strong> people
          </span>
          <small>{invited.length + (pact.pendingPhoneInvites ?? 0) ? `${invited.length + (pact.pendingPhoneInvites ?? 0)} invited` : 'all in'}</small>
        </li>
        <li className="tint--mint" style={chars(formatNairaCompact(s.remaining))}>
          <Target aria-hidden />
          <span>
            <strong className="num">{formatNairaCompact(s.remaining)}</strong>
          </span>
          <small>to go</small>
        </li>
      </ul>

      {next ? (
        <>
          <NextStep item={next} onAction={onAttention} />
          <div className="nextstep-more">
            {next.action?.kind !== 'contribute' && (
              <Button to={`${base}/contribute`} variant="ghost" size="md">
                Add to Pact
              </Button>
            )}
            {next.action?.kind !== 'invite' && (
              <Button to={`${base}/invite`} variant="ghost" size="md">
                Invite people
              </Button>
            )}
          </div>
        </>
      ) : (
        actions && (
          <div className="detail__actions">
            {actions.primary}
            {actions.secondary}
          </div>
        )
      )}
      {!next && stage === 'almost' && !orders && <p className="detail__almost">We’re almost there. {formatNaira(s.remaining)} left.</p>}
      {checkpoints.length > 0 && <OrganizerProgress rows={checkpoints} onInvite={() => navigate(`${base}/invite`)} />}
      <ApprovalCards pact={pact} meId={me} onOpen={setPayout} />
      {stage === 'past-deadline' && (
        <Notice tone="sun" icon={<Scale />}>
          The deadline has passed. Within {MISSED_GOAL_GRACE_DAYS} days the Pact’s rule runs: {pact.missedGoalPolicy === 'refund' ? 'everyone is refunded' : 'what was raised goes to the organiser'}.
        </Notice>
      )}

      {mine && stage !== 'invited' && stage !== 'closed' && (
        <button type="button" className="detail__me" onClick={() => setParticipationOpen(true)}>
          <Avatar userId={me} size="sm" accent accentColor={colorOf(pact, me)} label={false} />
          <span className="detail__me-text">
            <strong>{mine.participation ? participationLabel[mine.participation].long : 'Tell the group how you’re showing up'}</strong>
            <span className="num">{mine.contributed ? `${formatNaira(mine.contributed)} in so far` : 'Nothing added yet'}</span>
          </span>
          <ChevronRight aria-hidden />
        </button>
      )}

      {mine && stage !== 'invited' && stage !== 'closed' && <MyPledge pact={pact} meId={me} onPay={(amount) => navigate(`${base}/contribute?amount=${Math.ceil(amount)}`)} />}

      {attention.filter((i) => i.key !== next?.key).length > 0 && (
        <div className="screen-section">
          <AttentionCard items={attention.filter((i) => i.key !== next?.key)} onAction={onAttention} title={next ? 'Also on the list' : 'Needs attention'} />
        </div>
      )}

      {(budget.length > 0 || (isOrganizer && isOpen && !orders)) && (
        <section className="screen-section" aria-labelledby="the-plan">
          <SectionHeading id="the-plan" title="The plan" />
          {budget.length ? (
            <BudgetList lines={budget} editable={isOrganizer && isOpen} onEdit={(l) => { setLine(l); setLineOpen(true); }} onAdd={() => { setLine(null); setLineOpen(true); }} />
          ) : (
            <button type="button" className="detail__plan-empty" onClick={() => { setLine(null); setLineOpen(true); }}>
              Break the target into what it covers <ChevronRight aria-hidden />
            </button>
          )}
        </section>
      )}

      {orders && (
        <>
          <OrderMenu pact={pact} meId={me} />
          <MyOrders pact={pact} meId={me} />
          <OrderSheetSection pact={pact} meId={me} />
        </>
      )}
      {(canPayVendors(pact) || (pact.payouts ?? []).some((p) => p.kind === 'vendor')) && <PaidFromPact pact={pact} meId={me} onPay={() => setPayOpen(true)} onOpen={setPayout} />}

      {(tasks.length > 0 || (isOpen && stage !== 'invited')) && (
        <section className="screen-section" aria-labelledby="pact-tasks">
          <SectionHeading id="pact-tasks" title={`Tasks${tasks.length ? ` · ${tasks.filter((t) => t.status === 'done').length}/${tasks.length} done` : ''}`} />
          <TaskList pact={pact} tasks={tasks} meId={me} onOpen={(t) => (stage === 'invited' ? undefined : setTask(t))} onAdd={isOpen && stage !== 'invited' ? () => setAddTaskOpen(true) : undefined} />
        </section>
      )}

      <section className="screen-section" aria-labelledby="pact-group">
        <SectionHeading id="pact-group" title="Your group" />
        <ul className="detail__people" aria-label="People in this Pact">
          {joined.map((m) => (
            <li key={m.userId}>
              <button type="button" className={`person ${selected === m.userId ? 'is-selected' : ''}`} onClick={() => setSelected(selected === m.userId ? null : m.userId)} aria-pressed={selected === m.userId}>
                <Avatar userId={m.userId} size="md" accent accentColor={colorOf(pact, m.userId)} label={false} />
                <span className="person__name">{name(m.userId)}</span>
                <span className="person__amount">{bringsOf(pact, m.userId)}</span>
                {m.role === 'co_organizer' && <span className="person__guest">Co-organiser</span>}
                {(() => {
                  const p = pledgeLabel(pact, m.userId);
                  return p && <span className={`person__pledge ${p.late ? 'is-late' : ''}`}>{p.text}</span>;
                })()}
              </button>
            </li>
          ))}
          {invited.map((m) => (
            <li key={m.userId}>
              <span className="person is-pending">
                <Avatar userId={m.userId} size="md" pending label={false} />
                <span className="person__name">{getUser(m.userId).name}</span>
                <span className="person__amount">Invited</span>
              </span>
            </li>
          ))}
          {guests.map((g) => {
            // Organisers can say who a guest really is; everyone else just sees the name.
            const content = (
              <>
                <GuestAvatar name={g.name} />
                <span className="person__name">{g.name.split(' ')[0]}</span>
                <span className="person__amount num">{formatNairaCompact(g.amount)}</span>
                <span className="person__guest">Guest</span>
              </>
            );
            const label = `${g.name}, guest, ${formatNaira(g.amount)} by bank transfer`;
            return (
              <li key={g.name}>
                {runsMoney && (pact.status === 'open' || pact.status === 'funded') ? (
                  <button type="button" className="person" onClick={() => setGuest(g)} aria-label={`${label}. Say who this is`}>
                    {content}
                  </button>
                ) : (
                  <span className="person" role="img" aria-label={label}>
                    {content}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {stage !== 'closed' && stage !== 'invited' && <PayByTransfer pact={pact} meId={me} />}

      {isOpen && (
        <div className="detail__rule">
          <Scale aria-hidden />
          <p>
            <strong>{orders ? 'Pay-by date' : 'If the goal isn’t reached'}</strong>{' '}
            {orders
              ? `by ${formatDate(pact.deadline, { month: 'short', day: 'numeric' })}: unpaid orders are released, and what was paid for goes ahead.`
              : pact.missedGoalPolicy === 'refund'
              ? `by ${formatDate(pact.deadline, { month: 'short', day: 'numeric' })}, everyone is refunded automatically on ${formatDate(addDaysIso(pact.deadline, MISSED_GOAL_GRACE_DAYS), { month: 'short', day: 'numeric' })}.`
              : `by ${formatDate(pact.deadline, { month: 'short', day: 'numeric' })}, what was raised is released to ${organizer}.`}
          </p>
        </div>
      )}

      <section className="screen-section" aria-labelledby="pact-activity">
        <SectionHeading id="pact-activity" title="Activity" />
        {activity.length ? (
          <ul className="activity-list">
            <AnimatePresence initial={false}>
              {activity.map((a) => (
                <motion.li key={a.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={spring.gentle}>
                  <ActivityItem activity={a} viewerId={me} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        ) : (
          <p className="detail__empty">{stage === 'invited' ? 'Join to see what the group has been up to.' : 'Your Pact activity will appear here.'}</p>
        )}
      </section>

      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title={pact.title}>
        <div className="menu">
          <button type="button" className="menu__row" onClick={() => navigate(`${base}/invite`)}>
            <span className="menu__icon tint--sky"><UserPlus /></span>
            <span className="menu__text"><span className="menu__title">Invite people</span></span>
          </button>
          {isOrganizer && s.remaining > 0 && !orders && (
            <button type="button" className="menu__row" onClick={() => { setMenuOpen(false); setSplitOpen(true); }}>
              <span className="menu__icon tint--mint"><Divide /></span>
              <span className="menu__text">
                <span className="menu__title">Split the rest</span>
                <span className="menu__sub">Ask everyone contributing for an equal share of what’s left</span>
              </span>
            </button>
          )}
          {runsMoney && canPayVendors(pact) && (
            <button type="button" className="menu__row" onClick={() => { setMenuOpen(false); setPayOpen(true); }}>
              <span className="menu__icon tint--sun"><Store /></span>
              <span className="menu__text">
                <span className="menu__title">Pay a vendor</span>
                <span className="menu__sub">Straight from the Pact to their bank</span>
              </span>
            </button>
          )}
          {isOrganizer && (
            <button type="button" className="menu__row" onClick={() => { setMenuOpen(false); setCoOpen(true); }}>
              <span className="menu__icon tint--lilac"><ShieldCheck /></span>
              <span className="menu__text">
                <span className="menu__title">Co-organiser</span>
                <span className="menu__sub">{`Payments over ${formatNaira(VENDOR_APPROVAL_THRESHOLD / NGN)} need them to approve`}</span>
              </span>
            </button>
          )}
          {isOrganizer && (
            <button type="button" className="menu__row" onClick={() => run(() => cmd.nudge.mutateAsync(), 'Reminder sent')}>
              <span className="menu__icon tint--sun"><BellRing /></span>
              <span className="menu__text">
                <span className="menu__title">Remind people</span>
                <span className="menu__sub">Everyone who hasn’t added anything yet</span>
              </span>
            </button>
          )}
          {isOrganizer ? (
            <button type="button" className="menu__row menu__row--danger" onClick={() => { setMenuOpen(false); setCancelOpen(true); }}>
              <span className="menu__icon tint--coral"><XCircle /></span>
              <span className="menu__text">
                <span className="menu__title">Close and refund everyone</span>
                <span className="menu__sub">What’s in the Pact goes back to whoever paid it</span>
              </span>
            </button>
          ) : (
            (mine?.contributed ?? 0) === 0 && (
              <button type="button" className="menu__row menu__row--danger" onClick={() => run(() => cmd.leave.mutateAsync().then(() => navigate('/app/home')), 'You left the Pact')}>
                <span className="menu__icon tint--coral"><LogOut /></span>
                <span className="menu__text"><span className="menu__title">Leave this Pact</span></span>
              </button>
            )
          )}
        </div>
      </Modal>

      <ParticipationSheet pact={pact} open={participationOpen} onClose={() => setParticipationOpen(false)} current={mine?.participation ?? null} />
      <TaskSheet pact={pact} task={task ? tasks.find((t) => t.id === task.id) ?? null : null} meId={me} onClose={() => setTask(null)} />
      <AddTaskSheet pact={pact} meId={me} open={addTaskOpen} onClose={() => setAddTaskOpen(false)} />
      <BudgetLineSheet pact={pact} line={line} open={lineOpen} onClose={() => setLineOpen(false)} />
      <SplitSheet pact={pact} open={splitOpen} onClose={() => setSplitOpen(false)} />
      <PayoutSheet pact={pact} payout={payout} meId={me} onClose={() => setPayout(null)} />
      <PayVendorSheet pact={pact} open={payOpen} onClose={() => setPayOpen(false)} onChooseCoOrganizer={() => { setPayOpen(false); setCoOpen(true); }} />
      <CoOrganizerSheet pact={pact} open={coOpen} onClose={() => setCoOpen(false)} />
      <AssignGuestSheet pact={pact} guest={guest} onClose={() => setGuest(null)} />

      <PinSheet
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Close this Pact?"
        description={<>This refunds <span className="num">{formatNaira(pact.poolBalance ?? s.raised)}</span> to the {joined.filter((m) => m.contributed > 0).length + guests.length} people who paid in, and can’t be undone. Enter your PIN to confirm.</>}
        onSubmit={async (pin) => {
          await cancel.mutateAsync({ pin });
          setCancelOpen(false);
          toast('Pact closed. Everyone was refunded.');
        }}
      />
    </Screen>
  );
}
