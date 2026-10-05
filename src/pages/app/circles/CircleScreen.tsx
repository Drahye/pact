import { ChevronRight, Ellipsis, Plus, Settings2, Share2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useCircle, useEnsureInvite, useLeaveCircle, useRemoveMember, useResetInvite, useUpdateCircle } from '../../../api/circles';
import { ApiError } from '../../../api/client';
import { usePacts } from '../../../api/hooks';
import { goingText } from '../../../lib/planDates';
import { useCircleAsks } from '../../../api/asks';
import { useCirclePlans } from '../../../api/plans';
import { useCircleSplits } from '../../../api/splits';
import { useAuth } from '../../../api/auth';
import { ErrorState, Notice } from '../../../components/app/States';
import { Bone } from '../../../components/app/Skeleton';
import { CircleSkeleton } from '../../../components/app/DetailSkeletons';
import { CircleAsk, CirclePact, CirclePlan, CircleSplit } from '../../../components/circle/CircleObjects';
import { EmojiPicker, TintPicker } from '../../../components/circle/IdentityPicker';
import { ActivityRow, CircleTile, ComingUpRow } from '../../../components/objects';
import { useCreateSheet } from '../../../components/create/CreateSheet';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { IconButton } from '../../../components/ui/IconButton';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { SectionHeading } from '../../../components/ui/SectionHeading';
import { TopBar } from '../../../components/ui/TopBar';
import { useToast } from '../../../components/ui/Toast';
import { getUser } from '../../../data/users';
import { shareCircle } from '../../../lib/circleShare';
import { peopleLine } from '../../../lib/peopleLine';
import { Screen } from '../Screen';
import '../../../components/ask/ask.css';
import '../../../components/circle/circle.css';
import '../object-detail.css';
import './circle-detail.css';

const today = () => `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
/** "Today", "Tomorrow", then the weekday for this week, then the date (the same words Home uses for Coming up). */
const whenLabel = (date: string) => {
  const d = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(today())) / 86_400_000);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  const at = new Date(`${date}T12:00:00`);
  return d < 7 ? at.toLocaleDateString('en-US', { weekday: 'long' }) : at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;
type Sheet = null | 'menu' | 'edit' | 'leave' | 'remove' | 'reset';

/** One Circle: who is in it, what is happening, and a way to start something together. */
export function CircleScreen() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const circle = useCircle(id);
  const pacts = usePacts();
  const asks = useCircleAsks(id);
  const plans = useCirclePlans(id);
  const splits = useCircleSplits(id);
  const create = useCreateSheet();
  const ensure = useEnsureInvite(id);
  const reset = useResetInvite(id);
  const update = useUpdateCircle(id);
  const leave = useLeaveCircle(id);
  const remove = useRemoveMember(id);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [draft, setDraft] = useState({ name: '', emoji: '', tint: 'mint' as 'mint' });

  if (circle.isLoading) return <Screen topBar={<TopBar backTo="/app/circles" />}><CircleSkeleton /></Screen>;
  if (circle.error || !circle.data) {
    const gone = (circle.error as ApiError)?.status === 404;
    return (
      <Screen topBar={<TopBar backTo="/app/circles" />}>
        <ErrorState message={gone ? 'This Circle isn’t available. You may have left it, or the link has changed.' : undefined} onRetry={gone ? undefined : () => circle.refetch()} />
      </Screen>
    );
  }
  const c = circle.data;
  const isOwner = c.role === 'owner';
  const mine = (pacts.data ?? []).filter((p) => p.circleId === c.id);
  const who = (uid: string) => (uid === user?.id ? 'You' : getUser(uid).name);
  const loaded = !asks.isLoading && !plans.isLoading && !splits.isLoading;

  // What is happening now: an Ask, a Plan that is waiting on your answer, a Pact, a Split. Everything else is Upcoming or Recent.
  const openAsks = (asks.data ?? []).filter((x) => !x.planId && x.status === 'open').sort((a, b) => Number(a.answered) - Number(b.answered));
  const livePlans = (plans.data ?? []).filter((x) => x.status === 'planning' || x.status === 'confirmed');
  const needPlans = livePlans.filter((x) => !x.mine && !x.pactId);
  const livePacts = mine.filter((p) => p.status === 'open' || p.status === 'funded');
  const openSplits = (splits.data ?? []).filter((x) => x.status === 'open').sort((a, b) => Number(!!b.mine && !b.mine.isPayer && b.mine.status === 'owed') - Number(!!a.mine && !a.mine.isPayer && a.mine.status === 'owed'));
  const current: { key: string; node: ReactNode }[] = [
    ...openAsks.map((x) => ({ key: `a-${x.id}`, node: <CircleAsk ask={x} /> })),
    ...needPlans.map((x) => ({ key: `l-${x.id}`, node: <CirclePlan plan={x} /> })),
    ...livePacts.map((p) => ({ key: `p-${p.id}`, node: <CirclePact pact={p} /> })),
    ...openSplits.map((x) => ({ key: `s-${x.id}`, node: <CircleSplit split={x} /> })),
  ];
  const upcoming = livePlans.filter((x) => !needPlans.includes(x) && !x.pactId).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));

  // Recent: what finished, and who arrived, newest first.
  const recent: { key: string; at: string; actorId?: string; kind: 'ask' | 'plan' | 'split' | 'circle'; text: string; to?: string }[] = [
    ...(asks.data ?? []).filter((x) => !x.planId && x.status !== 'open').map((x) => ({ key: `a-${x.id}`, at: x.createdAt, kind: 'ask' as const, text: `${x.title} · ${x.headline}`, to: `/app/asks/${x.id}?from=circle` })),
    ...(splits.data ?? []).filter((x) => x.status !== 'open').map((x) => ({ key: `s-${x.id}`, at: x.settledAt ?? x.createdAt, kind: 'split' as const, text: x.status === 'settled' ? `${x.title} is all settled` : `${x.title} was cancelled`, to: `/app/splits/${x.id}?from=circle` })),
    ...(plans.data ?? []).filter((x) => x.status === 'done' || x.status === 'cancelled').map((x) => ({ key: `l-${x.id}`, at: x.createdAt, kind: 'plan' as const, text: x.status === 'done' ? `${x.title} happened` : `${x.title} was cancelled`, to: `/app/plans/${x.id}?from=circle` })),
    ...c.activity.map((a) => ({ key: `c-${a.type}-${a.actorId}-${a.at}`, at: a.at, actorId: a.actorId, kind: 'circle' as const, text: a.type === 'created' ? `${who(a.actorId)} started ${c.name}` : `${who(a.actorId)} joined ${c.name}` })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const all = showAll;
  const setAll = setShowAll;

  const empty = loaded && !asks.data?.length && !plans.data?.length && !splits.data?.length && !mine.length;
  const needCount = openAsks.filter((x) => !x.answered).length + openSplits.filter((x) => x.mine && !x.mine.isPayer && x.mine.status === 'owed').length + needPlans.length;
  const close = () => setSheet(null);
  const start = (e: { currentTarget: HTMLElement }) => create.open({ from: 'circle', circleId: c.id, origin: e.currentTarget.getBoundingClientRect() });

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

  const invite = async () => {
    let token = c.invite?.token ?? null;
    if (!token) {
      try {
        token = (await ensure.mutateAsync()).data.invite?.token ?? null;
      } catch (e) {
        return toast((e as ApiError).message, 'neutral');
      }
    }
    if (!token) return;
    const r = await shareCircle(token, c.name);
    if (r === 'copied') toast('Link copied');
    else if (r === 'failed') toast('Couldn’t share. Try again.', 'neutral');
  };

  return (
    <Screen
      topBar={
        <TopBar
          backTo="/app/circles"
          title={c.name}
          trailing={
            <span className="detail__top-actions">
              <IconButton label="Invite people" icon={<Share2 />} onClick={invite} />
              <IconButton label="More" icon={<Ellipsis />} onClick={() => setSheet('menu')} />
            </span>
          }
        />
      }
    >
      <div className="od-circle">
        <CircleTile
          density="header"
          name={c.name}
          emoji={c.emoji}
          tint={c.tint}
          meta={peopleLine(c.members.map((m) => m.userId), user?.id, { names: 3 }) || people(c.memberCount)}
          peopleIds={c.members.map((m) => m.userId)}
          total={c.memberCount}
          live={needCount > 0}
          signal={needCount ? `${needCount} ${needCount === 1 ? 'thing needs' : 'things need'} you` : empty ? 'Nothing yet. Start something.' : 'Nothing waiting on you'}
        >
          <button type="button" className="od-circle__slot" onClick={invite} disabled={ensure.isPending} aria-label="Invite someone to this Circle">
            <span className="od-circle__slot-mark" aria-hidden>
              <Plus />
            </span>
            <span>Invite</span>
          </button>
        </CircleTile>

        {!loaded && (
          <section className="screen-section" aria-label="Loading what is happening">
            <Bone w="100%" h={104} style={{ borderRadius: '20px 20px 20px 8px' }} />
          </section>
        )}

        {empty ? (
          <section className="screen-section od-circle__start" aria-labelledby="ch-start">
            <SectionHeading id="ch-start" title="Start here" />
            <p className="od-note">No plans yet. Start with something your people want to do.</p>
            <div className="ca__chips">
              <Link className="ca__chip" to={`/app/asks/new?circle=${c.id}&type=attendance&title=${encodeURIComponent('Who’s free this weekend?')}`}>
                Who’s free?
              </Link>
              <Link className="ca__chip" to={`/app/asks/new?circle=${c.id}&type=choice&title=${encodeURIComponent('Where should we go?')}`}>
                Where should we go?
              </Link>
              <Link className="ca__chip" to={`/app/asks/new?circle=${c.id}&type=choice&title=${encodeURIComponent('What should we buy?')}`}>
                What should we buy?
              </Link>
              <Link className="ca__chip" to={`/app/asks/new?circle=${c.id}`}>
                Ask something else
              </Link>
            </div>
            <Button variant="secondary" iconLeft={<Plus />} onClick={start}>
              More ways to start
            </Button>
          </section>
        ) : (
          loaded && (
            <>
              <section className="screen-section" aria-labelledby="ch-current">
                <SectionHeading id="ch-current" title="Happening now" />
                {current.length > 0 ? (
                  <ul className="od-circle__stack" aria-label="Happening now">
                    {current.map((x) => (
                      <li key={x.key}>{x.node}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="od-note">Nothing is open right now.</p>
                )}
                <Button variant="secondary" iconLeft={<Plus />} onClick={start} className="od-circle__more">
                  Start something
                </Button>
              </section>

              {upcoming.length > 0 && (
                <section className="screen-section" aria-labelledby="ch-upcoming">
                  <SectionHeading id="ch-upcoming" title="Upcoming" />
                  <ul className="od-ruled">
                    {upcoming.map((x) => (
                      <li key={x.id}>
                        <ComingUpRow when={x.date ? whenLabel(x.date) : 'Soon'} date={x.date} today={!!x.date && whenLabel(x.date) === 'Today'} title={x.title} meta={`${x.pactId ? 'Now a Pact' : goingText(x.counts)}${x.location ? ` · ${x.location}` : ''}`} to={`/app/plans/${x.id}?from=circle`} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {recent.length > 0 && (
                <section className="screen-section" aria-labelledby="ch-recent">
                  <SectionHeading id="ch-recent" title="Recent" />
                  <ul className="od-ruled" aria-label="Circle activity">
                    {(all ? recent : recent.slice(0, 5)).map((r) => (
                      <li key={r.key}>
                        <ActivityRow actorId={r.actorId} kind={r.kind} at={r.at} text={r.text} to={r.to} />
                      </li>
                    ))}
                  </ul>
                  {recent.length > 5 && !all && (
                    <button type="button" className="od-circle__all" onClick={() => setAll(true)}>
                      Show {recent.length - 5} more
                    </button>
                  )}
                </section>
              )}
            </>
          )
        )}

        <section className="screen-section" aria-labelledby="members">
          <SectionHeading id="members" title={`People · ${c.memberCount}`} />
          <ul className="od-people">
            {c.members.map((m) => (
              <li key={m.userId}>
                <Avatar userId={m.userId} size="lg" label={false} />
                <span className="od-people__name">
                  {who(m.userId)}
                  {m.role === 'owner' && <span className="od-people__role">Started it</span>}
                </span>
                {isOwner && m.role !== 'owner' && (
                  <button type="button" className="od-people__remove" aria-label={`Remove ${getUser(m.userId).name}`} onClick={() => (setTarget(m.userId), setSheet('remove'))}>
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="od-circle__settings" aria-label="Circle settings">
          <button type="button" className="od-circle__settings-btn" onClick={() => setSheet('menu')}>
            <Settings2 aria-hidden />
            <span>
              Circle settings
              <small>{isOwner ? 'Edit, reset the invite link, leave' : 'Leave this Circle'}</small>
            </span>
            <ChevronRight aria-hidden />
          </button>
        </section>
      </div>

      <Modal open={sheet === 'menu'} onClose={close} title={c.name}>
        <div className="menu">
          {isOwner && (
            <button type="button" className="menu__row" onClick={() => (setDraft({ name: c.name, emoji: c.emoji, tint: c.tint as 'mint' }), setSheet('edit'))}>
              <span className="menu__text"><span className="menu__title">Edit Circle</span><span className="menu__sub">Name, emoji and colour</span></span>
            </button>
          )}
          {isOwner && (
            <button type="button" className="menu__row" onClick={() => setSheet('reset')}>
              <span className="menu__text"><span className="menu__title">Reset invite link</span><span className="menu__sub">Turns the old link off</span></span>
            </button>
          )}
          <button type="button" className="menu__row menu__row--danger" onClick={() => setSheet('leave')}>
            <span className="menu__text"><span className="menu__title">Leave Circle</span></span>
          </button>
        </div>
      </Modal>

      <Modal
        open={sheet === 'edit'}
        onClose={close}
        title="Edit Circle"
        footer={
          <Button
            fullWidth
            loading={update.isPending}
            disabled={!draft.name.trim()}
            onClick={async () => (await act(() => update.mutateAsync({ name: draft.name.trim(), emoji: draft.emoji, tint: draft.tint }), 'Saved')) && close()}
          >
            Save
          </Button>
        }
      >
        <div className="ch__edit">
          <Input label="Circle name" value={draft.name} maxLength={40} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <EmojiPicker value={draft.emoji} onChange={(emoji) => setDraft({ ...draft, emoji })} />
          <TintPicker value={draft.tint} onChange={(tint) => setDraft({ ...draft, tint: tint as 'mint' })} />
        </div>
      </Modal>

      <Modal
        open={sheet === 'leave'}
        onClose={close}
        title={`Leave ${c.name}?`}
        description={isOwner && c.memberCount > 1 ? 'You started this Circle, so it stays with you while other people are in it.' : 'You can rejoin later with an invite link.'}
        footer={
          <Button
            fullWidth
            variant="secondary"
            loading={leave.isPending}
            disabled={isOwner && c.memberCount > 1}
            onClick={async () => {
              if (await act(() => leave.mutateAsync(), 'You left the Circle')) navigate('/app/circles', { replace: true });
            }}
          >
            Leave Circle
          </Button>
        }
      >
        {isOwner && c.memberCount > 1 && <Notice tone="sun">Remove the other members first, or keep the Circle.</Notice>}
      </Modal>

      <Modal
        open={sheet === 'remove'}
        onClose={close}
        title={target ? `Remove ${getUser(target).name}?` : 'Remove?'}
        description="They’ll lose access to this Circle. They can rejoin with a link, so reset the link if you want to be sure."
        footer={
          <Button fullWidth variant="secondary" loading={remove.isPending} onClick={async () => target && (await act(() => remove.mutateAsync(target), 'Removed')) && close()}>
            Remove
          </Button>
        }
      >
        <span />
      </Modal>

      <Modal
        open={sheet === 'reset'}
        onClose={close}
        title="Reset the invite link?"
        description="The current link stops working at once, and you get a new one to share."
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
