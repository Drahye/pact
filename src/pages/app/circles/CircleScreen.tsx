import { Ellipsis, Plus, Share2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useCircle, useEnsureInvite, useLeaveCircle, useRemoveMember, useResetInvite, useUpdateCircle } from '../../../api/circles';
import { ApiError } from '../../../api/client';
import { usePacts } from '../../../api/hooks';
import { useCircleAsks } from '../../../api/asks';
import { AskCard } from '../../../components/ask/AskCard';
import { PlanCard } from '../../../components/plan/PlanBits';
import { useCirclePlans } from '../../../api/plans';
import { useCircleSplits } from '../../../api/splits';
import { SplitCard } from '../../../components/split/SplitBits';
import { useAuth } from '../../../api/auth';
import { ErrorState, Notice } from '../../../components/app/States';
import { PactDetailSkeleton } from '../../../components/app/Skeleton';
import { CircleBadge } from '../../../components/circle/CircleBadge';
import { EmojiPicker, TintPicker } from '../../../components/circle/IdentityPicker';
import { PactCard } from '../../../components/pact/PactCard';
import { useCreateSheet } from '../../../components/create/CreateSheet';
import { Avatar } from '../../../components/ui/Avatar';
import { AvatarGroup } from '../../../components/ui/AvatarGroup';
import { Button } from '../../../components/ui/Button';
import { IconButton } from '../../../components/ui/IconButton';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { SectionHeading } from '../../../components/ui/SectionHeading';
import { TopBar } from '../../../components/ui/TopBar';
import { useToast } from '../../../components/ui/Toast';
import { getUser } from '../../../data/users';
import { shareCircle } from '../../../lib/circleShare';
import { Screen } from '../Screen';
import '../../../components/ask/ask.css';
import '../../../components/circle/circle.css';

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
  const [draft, setDraft] = useState({ name: '', emoji: '', tint: 'mint' as 'mint' });

  if (circle.isLoading) return <Screen topBar={<TopBar backTo="/app/circles" />}><PactDetailSkeleton label="Loading Circle" /></Screen>;
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
  const close = () => setSheet(null);

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
      <header className="ch">
        <CircleBadge emoji={c.emoji} tint={c.tint} size="xl" />
        <h1 className="large-title ch__name">{c.name}</h1>
        <p className="ch__meta">{people(c.memberCount)}</p>
        <AvatarGroup userIds={c.members.map((m) => m.userId)} total={c.memberCount} size="md" max={6} />
        <Button variant="secondary" iconLeft={<Share2 />} onClick={invite} loading={ensure.isPending}>
          Invite people
        </Button>
      </header>

      <section className="screen-section" aria-labelledby="happening">
        <SectionHeading id="happening" title="What’s happening" />
        {(splits.data?.length ?? 0) > 0 && (
          <ul className="list-stack" aria-label="Splits">
            {splits.data!.map((x) => (
              <li key={x.id}>
                <SplitCard split={x} from="circle" />
              </li>
            ))}
          </ul>
        )}
        {(plans.data?.length ?? 0) > 0 && (
          <ul className="list-stack" aria-label="Plans">
            {plans.data!.map((x) => (
              <li key={x.id}>
                <PlanCard plan={x} from="circle" />
              </li>
            ))}
          </ul>
        )}
        {(asks.data?.filter((x) => !x.planId).length ?? 0) > 0 && (
          <ul className="list-stack" aria-label="Questions">
            {asks.data!.filter((x) => !x.planId).map((x) => (
              <li key={x.id}>
                <AskCard ask={x} from="circle" />
              </li>
            ))}
          </ul>
        )}
        {mine.length > 0 && (
          <div className="list-stack">
            {mine.map((p) => (
              <PactCard key={p.id} pact={p} to={`/app/pact/${p.id}`} />
            ))}
          </div>
        )}
        {!asks.isLoading && !plans.isLoading && !splits.isLoading && !(asks.data?.length) && !(plans.data?.length) && !(splits.data?.length) && !mine.length ? (
          <div className="quick">
            <p className="quick__title">What are you trying to figure out?</p>
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
            <Button variant="secondary" iconLeft={<Plus />} onClick={() => create.open({ from: 'circle', circleId: c.id })}>
              More ways to start
            </Button>
          </div>
        ) : (
          <div className="ch__start">
            <p className="ch__start-title">Start something else together</p>
            <p className="ch__start-body">Ask the group, make a plan, split an expense, or turn something serious into a Pact.</p>
            <Button iconLeft={<Plus />} onClick={() => create.open({ from: 'circle', circleId: c.id })}>
              Create something
            </Button>
          </div>
        )}
        <ul className="ch__feed" aria-label="Circle activity">
          {c.activity.map((a) => (
            <li key={`${a.type}-${a.actorId}-${a.at}`}>
              <Avatar userId={a.actorId} size="sm" label={false} />
              <span>{a.type === 'created' ? `${who(a.actorId)} started ${c.name}.` : `${who(a.actorId)} joined ${c.name}.`}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="screen-section" aria-labelledby="members">
        <SectionHeading id="members" title={`Members · ${c.memberCount}`} />
        <ul className="ch__members">
          {c.members.map((m) => (
            <li key={m.userId}>
              <Avatar userId={m.userId} size="md" label={false} />
              <span className="ch__member-name">{who(m.userId)}</span>
              {m.role === 'owner' && <span className="ch__owner">Owner</span>}
              {isOwner && m.role !== 'owner' && (
                <button type="button" className="ch__remove" aria-label={`Remove ${getUser(m.userId).name}`} onClick={() => (setTarget(m.userId), setSheet('remove'))}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

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
