import { AnimatePresence, motion } from 'framer-motion';
import { BellRing, CalendarDays, Ellipsis, LogOut, RotateCcw, Scale, Share, Target, UserPlus, Users, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../api/auth';
import { ApiError } from '../../api/client';
import { usePactAction, usePactCommand } from '../../api/hooks';
import { PinSheet } from '../../components/app/PinSheet';
import { Notice } from '../../components/app/States';
import { AnimatedNumber } from '../../components/pact/AnimatedNumber';
import { CategoryChip } from '../../components/pact/category';
import { SegmentedRing } from '../../components/pact/SegmentedRing';
import { ActivityItem } from '../../components/ui/ActivityItem';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { Modal } from '../../components/ui/Modal';
import { SectionHeading } from '../../components/ui/SectionHeading';
import { TopBar } from '../../components/ui/TopBar';
import { useToast } from '../../components/ui/Toast';
import type { Activity, Pact } from '../../data/types';
import { getUser } from '../../data/users';
import { formatDate, formatNaira, formatNairaCompact, formatPercent } from '../../lib/format';
import { addDaysIso } from '../../lib/dates';
import { invitedMembers, joinedMembers, sharesOf, summarize } from '../../lib/pact';
import { spring } from '../../tokens/tokens';
import { MISSED_GOAL_GRACE_DAYS } from '../../../shared/policy';
import { Screen } from './Screen';
import './detail.css';

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
  const cmd = usePactCommand(pact.id);
  const cancel = usePactAction(pact.id, 'cancel');

  const s = summarize(pact);
  const joined = joinedMembers(pact);
  const invited = invitedMembers(pact);
  const isOrganizer = pact.organizerId === me;
  const isInvited = pact.viewer?.status === 'invited';
  const isOpen = pact.status === 'open';
  const closed = pact.status === 'cancelled' || pact.status === 'refunded';
  const pastDeadline = isOpen && s.daysLeft === 0 && new Date(`${pact.deadline}T23:59:59`) < new Date();
  const myContribution = pact.members.find((m) => m.userId === me)?.contributed ?? 0;
  const organizer = isOrganizer ? 'you' : getUser(pact.organizerId).name;
  const justYou = joined.length === 1 && s.raised === 0;
  const base = `/app/pact/${pact.id}`;
  const name = (id: string) => (id === me ? 'You' : getUser(id).name);
  const picked = selected ? pact.members.find((m) => m.userId === selected) : null;
  const share = pact.viewer?.suggestedShare ?? 0;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMenuOpen(false);
    try {
      await fn();
      toast(ok);
    } catch (err) {
      toast((err as ApiError).message, 'neutral');
    }
  };

  const contribute = (
    <Button to={`${base}/contribute`} variant={justYou ? 'secondary' : 'primary'} fullWidth>
      {share > 0 && pact.splitMode === 'equal' ? `Add your share · ${formatNairaCompact(share)}` : 'Contribute'}
    </Button>
  );
  const invite = (
    <Button to={`${base}/invite`} variant={justYou ? 'primary' : 'secondary'} fullWidth>
      Invite people
    </Button>
  );

  return (
    <Screen
      topBar={
        <TopBar
          backTo="/app/home"
          title={pact.title}
          trailing={
            isInvited ? undefined : isOpen ? (
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

      {isInvited && (
        <div className="detail__invite">
          <p>
            <strong>{getUser(pact.organizerId).name}</strong> invited you to this Pact.
          </p>
          <div className="detail__invite-actions">
            <Button size="md" variant="secondary" onClick={() => run(() => cmd.leave.mutateAsync().then(() => navigate('/app/home')), 'Invite declined')}>
              Decline
            </Button>
            <Button size="md" onClick={() => run(() => cmd.accept.mutateAsync(), `You joined ${pact.title}`)} loading={cmd.accept.isPending}>
              Join
            </Button>
          </div>
        </div>
      )}

      {closed && (
        <Notice tone="neutral" icon={<RotateCcw />}>
          {pact.status === 'cancelled' ? 'The organiser closed this Pact.' : 'The goal wasn’t reached by the deadline.'} Every contribution went back to the wallet it came from.
        </Notice>
      )}

      {pact.note && <p className="detail__note">“{pact.note}”</p>}

      <div className="detail__ring">
        <SegmentedRing
          shares={sharesOf(pact)}
          target={pact.target}
          size={236}
          stroke={20}
          selected={selected}
          onSelect={setSelected}
          delay={0.15}
          label={`${pact.title}: ${Math.round(s.percent)}% funded`}
        >
          <AnimatePresence mode="wait" initial={false}>
            {picked ? (
              <motion.div key={picked.userId} className="detail__center" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }} transition={{ duration: 0.18 }}>
                <Avatar userId={picked.userId} size="md" accent label={false} />
                <p className="detail__center-name">{name(picked.userId)}</p>
                <p className="detail__center-amount num">{formatNaira(picked.contributed)}</p>
                <p className="detail__center-meta num">{formatPercent((picked.contributed / Math.max(1, s.raised)) * 100)} of the total</p>
              </motion.div>
            ) : (
              <motion.div key="total" className="detail__center" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }} transition={{ duration: 0.18 }}>
                <p className="detail__center-amount detail__center-amount--total">
                  <AnimatedNumber value={s.raised} from={fromRaised ?? 0} />
                </p>
                <p className="detail__center-meta">
                  of <span className="num">{formatNaira(s.target)}</span>
                </p>
                <p className="detail__center-pct num">
                  <AnimatedNumber value={s.percent} from={fromRaised !== undefined ? (fromRaised / s.target) * 100 : 0} format="percent" /> funded
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </SegmentedRing>
        {!justYou && <p className="detail__ring-hint">{picked ? 'Tap the centre to see the total' : 'Tap a colour to see who gave it'}</p>}
      </div>

      <ul className="detail__stats">
        <li className="tint--sun">
          <CalendarDays aria-hidden />
          <span>
            <strong className="num">{s.daysLeft}</strong> days left
          </span>
          <small>{formatDate(pact.deadline, { month: 'short', day: 'numeric' })}</small>
        </li>
        <li className="tint--sky">
          <Users aria-hidden />
          <span>
            <strong className="num">{joined.length}</strong> people
          </span>
          <small>{invited.length + (pact.pendingPhoneInvites ?? 0) ? `${invited.length + (pact.pendingPhoneInvites ?? 0)} invited` : 'all in'}</small>
        </li>
        <li className="tint--mint">
          <Target aria-hidden />
          <span>
            <strong className="num">{formatNairaCompact(s.remaining)}</strong>
          </span>
          <small>to go</small>
        </li>
      </ul>

      <ul className="detail__people" aria-label="People in this Pact">
        {joined.map((m) => (
          <li key={m.userId}>
            <button type="button" className={`person ${selected === m.userId ? 'is-selected' : ''}`} onClick={() => setSelected(selected === m.userId ? null : m.userId)} aria-pressed={selected === m.userId}>
              <Avatar userId={m.userId} size="md" accent label={false} />
              <span className="person__name">{name(m.userId)}</span>
              <span className="person__amount num">{m.contributed ? formatNairaCompact(m.contributed) : 'None yet'}</span>
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
      </ul>

      {isOpen && !isInvited && !pastDeadline && (
        <div className="detail__actions">
          {justYou ? (
            <>
              {invite}
              {contribute}
            </>
          ) : (
            <>
              {contribute}
              {invite}
            </>
          )}
        </div>
      )}
      {pastDeadline && (
        <Notice tone="sun" icon={<Scale />}>
          The deadline has passed. Within {MISSED_GOAL_GRACE_DAYS} days the Pact’s rule runs: {pact.missedGoalPolicy === 'refund' ? 'everyone is refunded' : 'what was raised goes to the organiser'}.
        </Notice>
      )}

      {isOpen && (
        <div className="detail__rule">
          <Scale aria-hidden />
          <p>
            <strong>If the goal isn’t reached</strong>{' '}
            {pact.missedGoalPolicy === 'refund'
              ? `by ${formatDate(pact.deadline, { month: 'short', day: 'numeric' })}, everyone is refunded automatically on ${formatDate(addDaysIso(pact.deadline, MISSED_GOAL_GRACE_DAYS), { month: 'short', day: 'numeric' })}.`
              : `by ${formatDate(pact.deadline, { month: 'short', day: 'numeric' })}, what was raised is released to ${organizer}.`}
            {myContribution > 0 && <> You’ve put in <span className="num">{formatNaira(myContribution)}</span>.</>}
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
          <p className="detail__empty">Contributions and new members will show up here.</p>
        )}
      </section>

      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title={pact.title}>
        <div className="menu">
          <button type="button" className="menu__row" onClick={() => navigate(`${base}/invite`)}>
            <span className="menu__icon tint--sky"><UserPlus /></span>
            <span className="menu__text"><span className="menu__title">Invite people</span></span>
          </button>
          {isOrganizer && (
            <button type="button" className="menu__row" onClick={() => run(async () => { const r = await cmd.nudge.mutateAsync(); return r; }, 'Reminder sent')}>
              <span className="menu__icon tint--sun"><BellRing /></span>
              <span className="menu__text">
                <span className="menu__title">Remind people</span>
                <span className="menu__sub">Everyone who hasn’t contributed yet</span>
              </span>
            </button>
          )}
          {isOrganizer ? (
            <button type="button" className="menu__row menu__row--danger" onClick={() => { setMenuOpen(false); setCancelOpen(true); }}>
              <span className="menu__icon tint--coral"><XCircle /></span>
              <span className="menu__text">
                <span className="menu__title">Close and refund everyone</span>
                <span className="menu__sub">Every contribution goes back to its wallet</span>
              </span>
            </button>
          ) : (
            myContribution === 0 && (
              <button type="button" className="menu__row menu__row--danger" onClick={() => run(() => cmd.leave.mutateAsync().then(() => navigate('/app/home')), 'You left the Pact')}>
                <span className="menu__icon tint--coral"><LogOut /></span>
                <span className="menu__text"><span className="menu__title">Leave this Pact</span></span>
              </button>
            )
          )}
        </div>
      </Modal>

      <PinSheet
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Close this Pact?"
        description={<>This refunds <span className="num">{formatNaira(s.raised)}</span> to {joined.filter((m) => m.contributed > 0).length} people and can’t be undone. Enter your PIN to confirm.</>}
        onSubmit={async (pin) => {
          await cancel.mutateAsync({ pin });
          setCancelOpen(false);
          toast('Pact closed. Everyone was refunded.');
        }}
      />
    </Screen>
  );
}
