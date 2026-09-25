import { motion, useReducedMotion } from 'framer-motion';
import { Check, CheckCheck, ShieldCheck, Wallet } from 'lucide-react';
import { MemorySection } from '../../components/pact/Memory';
import { useAuth } from '../../api/auth';
import { usePactAction } from '../../api/hooks';
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
import type { Activity, Pact } from '../../data/types';
import { getUser } from '../../data/users';
import { formatNaira } from '../../lib/format';
import { joinedMembers, sharesOf, summarize } from '../../lib/pact';
import { formatNairaCompact } from '../../lib/format';
import { ease, spring } from '../../tokens/tokens';
import { Screen } from './Screen';
import './completed.css';

export function CompletedScreen({ pact, activity = [] }: { pact: Pact; activity?: Activity[] }) {
  const reduce = useReducedMotion();
  const { user } = useAuth();
  const toast = useToast();
  const CURRENT_USER_ID = user?.id ?? '';
  const [open, setOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const release = usePactAction(pact.id, 'release');
  const s = summarize(pact);
  const isOrganizer = pact.organizerId === CURRENT_USER_ID;
  const released = pact.status === 'released';
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
          {isOrganizer && !released ? (
            canRelease ? (
              <Button fullWidth iconLeft={<Wallet />} onClick={() => setReleaseOpen(true)}>
                Release {formatNaira(pact.poolBalance ?? s.raised)} to your wallet
              </Button>
            ) : (
              <Button fullWidth iconLeft={<ShieldCheck />} to="/app/profile/verify">
                Verify your BVN to release funds
              </Button>
            )
          ) : (
            <Button to="/app/create" fullWidth>
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
          <SegmentedRing shares={sharesOf(pact)} target={pact.target} size={168} stroke={16} delay={0.2} label="Fully funded">
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
            100% funded
          </Badge>
          <h1 className="completed__title">We did it.</h1>
          <p className="completed__amount">
            <AnimatedNumber value={s.raised} from={s.raised * 0.86} />
          </p>
          <p className="completed__line">
            {pact.title} is fully funded.
            {released
              ? ` The money was released to ${isOrganizer ? 'your wallet' : getUser(pact.organizerId).name}.`
              : isOrganizer
                ? ' Release it to your wallet whenever you’re ready.'
                : ` ${getUser(pact.organizerId).name} will release the funds.`}
          </p>
        </motion.div>
      </div>

      <span className="completed__float completed__float--a" aria-hidden />
      <span className="completed__float completed__float--b" aria-hidden />
      <span className="completed__float completed__float--c" aria-hidden />
      <section className="completed__people" aria-label={`${members.length} {members.length === 1 ? "person" : "people"} made this happen`}>
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
              <span className="completed__share num" style={{ color: getUser(m.userId).color }}>
                {formatNairaCompact(m.contributed)}
              </span>
            </motion.li>
          ))}
        </ul>
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

      <div className="completed__memory">
        <MemorySection pact={pact} meId={CURRENT_USER_ID} />
      </div>

      {released && isOrganizer && (
        <Notice tone="accent" icon={<Wallet />}>
          The funds are in your wallet. Withdraw them to your bank from the Wallet tab.
        </Notice>
      )}

      <PinSheet
        open={releaseOpen}
        onClose={() => setReleaseOpen(false)}
        title="Release the funds"
        description={<><span className="num">{formatNaira(pact.poolBalance ?? s.raised)}</span> moves from {pact.title} into your wallet. Everyone in the Pact is told.</>}
        onSubmit={async (pin) => {
          await release.mutateAsync({ pin });
          setReleaseOpen(false);
          toast('Funds released to your wallet');
        }}
      />

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
