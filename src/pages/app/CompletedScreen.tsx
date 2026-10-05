import { motion, useReducedMotion } from 'framer-motion';
import { Check, CheckCheck, Clock, ShieldCheck, Wallet } from 'lucide-react';
import { MemorySection } from '../../components/pact/Memory';
import { useAuth } from '../../api/auth';
import { usePactAction, usePactMoney } from '../../api/hooks';
import { PinSheet } from '../../components/app/PinSheet';
import { Notice } from '../../components/app/States';
import { useToast } from '../../components/ui/Toast';
import { useState } from 'react';
import { AnimatedNumber } from '../../components/pact/AnimatedNumber';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { SegmentedRing } from '../../components/pact/SegmentedRing';
import { TopBar } from '../../components/ui/TopBar';
import type { Activity, Pact, PactPayout } from '../../data/types';
import { moneyOf, progressOf } from '../../lib/execution';
import { bringsParts } from '../../lib/plan';
import { PinnedCard, ThreadSheet } from './detail/Conversation';
import { ApprovalCards, coOrganizerOf, PaidFromPact, PayoutSheet } from './detail/Money';
import { ActivityItem } from '../../components/ui/ActivityItem';
import { isOrderPact, MyOrders, OrderMenu, OrderSheetSection } from './detail/Orders';
import './detail/money.css';
import './detail/execution.css';
import { getUser } from '../../data/users';
import { formatNaira } from '../../lib/format';
import { colorOf, joinedMembers, sharesOf, summarize } from '../../lib/pact';
import { ease, spring } from '../../tokens/tokens';
import { Screen } from './Screen';
import './completed.css';
import { useStartPactPath } from '../../lib/startPact';

export function CompletedScreen({ pact, activity = [] }: { pact: Pact; activity?: Activity[] }) {
  const startPath = useStartPactPath();
  const reduce = useReducedMotion();
  const { user } = useAuth();
  const toast = useToast();
  const CURRENT_USER_ID = user?.id ?? '';
  const [open, setOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const release = usePactAction(pact.id, 'release');
  const money = usePactMoney(pact.id);
  const [payout, setPayout] = useState<PactPayout | null>(null);
  const co = coOrganizerOf(pact);
  const coName = co ? getUser(co).name : null;
  const request = pact.releaseRequest ?? null;
  const s = summarize(pact);
  const isOrganizer = pact.organizerId === CURRENT_USER_ID;
  const released = pact.status === 'released';
  const m = moneyOf(pact);
  const prog = progressOf(pact);
  // Completing moves no money: what is left waits here until the organiser releases it.
  const leftover = !released ? m.left : 0;
  const showRelease = isOrganizer && leftover > 0;
  const canRelease = (user?.kycTier ?? 1) >= 2;
  const members = [...joinedMembers(pact)].sort((a, b) => b.contributed - a.contributed);
  const contributions = activity.filter((a) => a.type === 'contribution').length || members.filter((m) => m.contributed > 0).length;
  const doneTasks = (pact.tasks ?? []).filter((t) => t.status === 'done');
  const name = (id: string) => (id === CURRENT_USER_ID ? 'You' : getUser(id).name);
  const rise = (delay: number) =>
    reduce ? {} : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.55, ease: ease.out, delay } };

  return (
    <Screen
      tone="mint"
      topBar={<TopBar backTo="/app/home" tone="transparent" />}
      footer={
        <>
          {showRelease ? (
            request ? (
              <Button fullWidth variant="secondary" iconLeft={<Clock />} loading={money.declineRelease.isPending} onClick={() => money.declineRelease.mutateAsync(undefined).then(() => toast('Request withdrawn'))}>
                Waiting for {coName ?? 'your co-organiser'} · withdraw request
              </Button>
            ) : canRelease ? (
              <Button fullWidth iconLeft={<Wallet />} onClick={() => setReleaseOpen(true)}>
                {coName ? `Ask ${coName} to release ${formatNaira(leftover)}` : `Release the ${formatNaira(leftover)} that’s left`}
              </Button>
            ) : (
              <Button fullWidth iconLeft={<ShieldCheck />} to="/app/profile/verify">
                Verify your identity to release what’s left
              </Button>
            )
          ) : (
            <Button to={startPath()} fullWidth>
              Create another Pact
            </Button>
          )}
          <Button variant="secondary" fullWidth onClick={() => setOpen(true)}>
            View contributions
          </Button>
        </>
      }
      className="completed"
    >
      <div className="completed__hero">
        <div className="completed__ring">
          {!reduce && <span className="completed__halo" aria-hidden />}
          <SegmentedRing shares={sharesOf(pact)} target={pact.target} size={168} stroke={16} delay={0.2} label="How the group funded this Pact">
            <motion.span
              className="completed__check"
              initial={reduce ? false : { scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ ...spring.pop, delay: 0.9 }}
              aria-hidden
            >
              <Check strokeWidth={3} />
            </motion.span>
          </SegmentedRing>
        </div>

        <motion.div className="completed__copy" {...rise(0.4)}>
          <Badge tone="accent" dot>
            Completed
          </Badge>
          <h1 className="completed__title">We made it happen.</h1>
          <p className="completed__amount">
            <AnimatedNumber value={s.raised} from={s.raised * 0.86} />
          </p>
          <p className="completed__line">
            {pact.title} happened. {formatNaira(s.raised)} came together{m.used > 0 ? ` and ${formatNaira(m.used)} went to the plan` : ''}.
            {released
              ? ` What was left, ${formatNaira(m.released)}, went to ${isOrganizer ? 'your wallet' : getUser(pact.organizerId).name}.`
              : request
                ? ` ${isOrganizer ? 'You’ve' : `${getUser(pact.organizerId).name} has`} asked to release the ${formatNaira(leftover)} that’s left. ${coName ? `${co === CURRENT_USER_ID ? 'You' : coName} approve${co === CURRENT_USER_ID ? '' : 's'} it.` : ''}`
                : leftover > 0
                  ? ` ${formatNaira(leftover)} is still in the Pact.`
                  : ''}
          </p>
        </motion.div>
      </div>

      <span className="completed__float completed__float--a" aria-hidden />
      <span className="completed__float completed__float--b" aria-hidden />
      <span className="completed__float completed__float--c" aria-hidden />
      <section className="completed__people" aria-label={`${members.length} ${members.length === 1 ? 'person' : 'people'} made this happen`}>
        <p className="completed__people-label">
          {members.length} {members.length === 1 ? "person" : "people"} made this happen
        </p>
        <ul>
          {members.map((m, i) => (
            <motion.li
              key={m.userId}
              initial={reduce ? false : { opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...spring.pop, delay: 1 + i * 0.06 }}
            >
              <Avatar userId={m.userId} size="md" label={false} accent />
              <span>{name(m.userId)}</span>
              <span className="completed__share" style={{ ['--c' as string]: colorOf(pact, m.userId) }}>
                {(() => {
                  const b = bringsParts(pact, m.userId);
                  return (
                    <>
                      {b.amount && <span className="completed__share-amount num">{b.amount}</span>}
                      {b.task && <span className="completed__share-task">{b.task}</span>}
                      {b.note && <span className="completed__share-task">{b.note}</span>}
                    </>
                  );
                })()}
              </span>
            </motion.li>
          ))}
        </ul>
        <Button variant="secondary" size="md" to={`/app/recap/pact/${pact.id}`} className="completed__recap">
          View recap
        </Button>
      </section>

      <section className="completed__summary" aria-labelledby="came-together">
        <h2 id="came-together" className="section-heading__title">
          What came together
        </h2>
        <dl className="exec__review">
          <div>
            <dt>Raised</dt>
            <dd className="num">{formatNaira(m.raised)}</dd>
          </div>
          <div>
            <dt>Used for the plan</dt>
            <dd className="num">{formatNaira(m.used)}</dd>
          </div>
          {released ? (
            <div>
              <dt>Released</dt>
              <dd className="num">{formatNaira(m.released)}</dd>
            </div>
          ) : (
            <div>
              <dt>Still in the Pact</dt>
              <dd className="num">{formatNaira(leftover)}</dd>
            </div>
          )}
          {prog.lines.total > 0 && (
            <div>
              <dt>Plan items paid</dt>
              <dd className="num">
                {prog.lines.done} of {prog.lines.total}
              </dd>
            </div>
          )}
        </dl>
      </section>

      <ul className="completed__stats">
        <li>
          <strong className="num">{members.length}</strong>
          <span>{members.length === 1 ? 'person' : 'people'}</span>
        </li>
        <li>
          <strong className="num">{contributions}</strong>
          <span>{contributions === 1 ? 'contribution' : 'contributions'}</span>
        </li>
        <li>
          <strong className="num">{doneTasks.length}</strong>
          <span>{doneTasks.length === 1 ? 'task done' : 'tasks done'}</span>
        </li>
      </ul>

      {doneTasks.length > 0 && (
        <section className="completed__tasks" aria-labelledby="done-tasks">
          <h2 id="done-tasks" className="section-heading__title">
            What got done
          </h2>
          <ul>
            {doneTasks.map((t) => (
              <li key={t.id}>
                <CheckCheck aria-hidden />
                <span>{t.title}</span>
                {t.assigneeId && <small>{name(t.assigneeId)}</small>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="completed__money">
        <ApprovalCards pact={pact} meId={CURRENT_USER_ID} onOpen={setPayout} />
        {isOrderPact(pact) && (
          <>
            <OrderSheetSection pact={pact} meId={CURRENT_USER_ID} />
            <MyOrders pact={pact} meId={CURRENT_USER_ID} />
            <OrderMenu pact={pact} meId={CURRENT_USER_ID} />
          </>
        )}
        <PaidFromPact pact={pact} meId={CURRENT_USER_ID} onPay={() => undefined} onOpen={setPayout} hidePayCta />
      </div>

      {(pact.pinned || activity.length > 0) && (
        <section className="completed__talk" aria-labelledby="what-was-said">
          <h2 id="what-was-said" className="section-heading__title">
            Along the way
          </h2>
          <PinnedCard pact={pact} meId={CURRENT_USER_ID} onOpen={(a) => setThreadId(a.id)} />
          <ul className="activity-list">
            {activity
              .filter((a) => a.type !== 'left')
              .slice(0, 6)
              .map((a) => (
                <li key={a.id}>
                  <ActivityItem activity={a} viewerId={CURRENT_USER_ID} onOpen={(x) => setThreadId(x.id)} />
                </li>
              ))}
          </ul>
        </section>
      )}

      <div className="completed__memory">
        <MemorySection pact={pact} meId={CURRENT_USER_ID} />
      </div>

      {released && isOrganizer && (
        <Notice tone="accent" icon={<Wallet />}>
          What was left is in your wallet. Withdraw it to your bank from the Wallet tab.
        </Notice>
      )}

      <PinSheet
        open={releaseOpen}
        onClose={() => setReleaseOpen(false)}
        title={coName ? 'Ask for the release' : 'Release what’s left'}
        description={
          coName ? (
            <><span className="num">{formatNaira(leftover)}</span> moves to your wallet once {coName} approves. Everyone in the Pact is told.</>
          ) : (
            <><span className="num">{formatNaira(leftover)}</span> moves from {pact.title} into your wallet. Everyone in the Pact is told.</>
          )
        }
        onSubmit={async (pin) => {
          await release.mutateAsync({ pin });
          setReleaseOpen(false);
          toast(coName ? `Sent to ${coName} to approve` : 'Funds released to your wallet');
        }}
      />
      <PayoutSheet pact={pact} payout={payout} meId={CURRENT_USER_ID} onClose={() => setPayout(null)} />
      <ThreadSheet pact={pact} activityId={threadId} meId={CURRENT_USER_ID} onClose={() => setThreadId(null)} />

      <Modal open={open} onClose={() => setOpen(false)} title="Contributions" description={`${formatNaira(s.raised)} from ${members.length} people`}>
        <ul className="contributions">
          {members.map((m) => (
            <li key={m.userId}>
              <Avatar userId={m.userId} size="md" label={false} accent />
              <span className="contributions__name">{m.userId === CURRENT_USER_ID ? 'You' : getUser(m.userId).fullName}</span>
              <span className="contributions__amount num">{formatNaira(m.contributed)}</span>
            </li>
          ))}
        </ul>
      </Modal>
    </Screen>
  );
}
