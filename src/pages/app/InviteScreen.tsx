import { AnimatePresence, motion } from 'framer-motion';
import { ChatCircleIcon, ChatTextIcon, CheckIcon, CopyIcon, DotsThreeIcon, PhoneIcon, ShareNetworkIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../../api/auth';
import { ApiError } from '../../api/client';
import { useCover, usePact, usePactCommand } from '../../api/hooks';
import { FormSkeleton } from '../../components/app/Skeleton';
import { Burst } from '../../components/pact/Burst';
import { joinedLine, useWelcomeJoiners } from '../../lib/useWelcome';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { TopBar } from '../../components/ui/TopBar';
import { useToast } from '../../components/ui/Toast';
import { getUser } from '../../data/users';
import { pushRecent } from '../../lib/drafts';
import { formatDate, formatNaira } from '../../lib/format';
import { joinedMembers, summarize } from '../../lib/pact';
import { spring } from '../../tokens/tokens';
import { PageHero } from '../../components/objects';
import { Screen } from './Screen';
import './invite.css';

export function InviteScreen() {
  const { id = '' } = useParams();
  const { user, config } = useAuth();
  // Inviting a number that is not on PACT sends a text. With texts switched off (the beta) the way in is the link, so the field is not offered.
  const phoneInvites = !!config?.auth?.phone;
  const q = usePact(id);
  const cmd = usePactCommand(id);
  const cover = useCover(q.data?.pact ?? {});
  const toast = useToast();
  // Arriving straight from creating the Pact: this is the next step of setup, not an optional extra.
  const justCreated = !!(useLocation().state as { created?: boolean } | null)?.created;
  const [copied, setCopied] = useState(false);
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string>();
  const [celebrate, setCelebrate] = useState(false);

  // While this screen is open, someone arriving through the link is welcomed out loud: this is the moment the sender is waiting for.
  useWelcomeJoiners(q.data?.pact, user?.id, (names) => {
    toast(joinedLine(names));
    setCelebrate(true);
    window.setTimeout(() => setCelebrate(false), 1400);
  });

  if (q.isLoading) return <Screen topBar={<TopBar tone="transparent" backTo={`/app/pact/${id}`} />}><FormSkeleton fields={2} label="Loading invite" /></Screen>;
  const pact = q.data?.pact;
  if (!pact) return <Navigate to="/app/home" replace />;

  const joined = joinedMembers(pact);
  const url = `${window.location.origin}/app/join/${pact.inviteCode}`;
  const shortUrl = url.replace(/^https?:\/\//, '');
  const message = `I started “${pact.title}” on PACT so we can do it together. ${formatNaira(summarize(pact).target)} by ${formatDate(pact.deadline, { month: 'short', day: 'numeric' })}, and everyone can see how it is going. Come in: ${url}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard may be blocked: the confirmation still shows */
    }
    setCopied(true);
    toast('Link copied');
    window.setTimeout(() => setCopied(false), 2000);
  };

  const more = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: pact.title, text: message, url });
      } catch {
        /* dismissed */
      }
    } else void copy();
  };

  const invitePhone = async () => {
    const d = phone.replace(/\D/g, '').replace(/^234/, '').replace(/^0/, '');
    if (!/^[789][01]\d{8}$/.test(d)) return setPhoneError('Enter an 11-digit Nigerian number.');
    try {
      await cmd.invite.mutateAsync({ phones: [`0${d}`] });
      pushRecent('invite-phones', { phone: `0${d}` }, (x) => x.phone, 6);
      setPhone('');
      toast('Invite sent');
    } catch (err) {
      setPhoneError((err as ApiError).message);
    }
  };

  const people = [...joined].reverse();

  return (
    <Screen
      topBar={<TopBar tone="transparent" backTo={`/app/pact/${pact.id}`} title={pact.title} />}
      footer={
        <Button variant="secondary" fullWidth to={`/app/pact/${pact.id}`}>
          {justCreated ? 'Go to my Pact' : 'Done'}
        </Button>
      }
      className="invite xhero xhero--lite tint--mint"
    >
      {justCreated && (
        <p className="invite__ready">
          <CheckIcon aria-hidden /> Your Pact is ready.
        </p>
      )}
      <PageHero tint="mint" photo={cover} title={justCreated ? 'Now bring your people in.' : 'Bring your people in.'} subtitle={<>{justCreated ? 'Share the link in your group chat. Anyone with it can see what the Pact is for and join.' : 'Anyone with this link can see what the Pact is for and join it.'}</>} />

      <div className="invite__card">
        <img className="invite__cover" src={cover} alt="" loading="lazy" decoding="async" />
        <div>
          <p className="invite__card-title">{pact.title}</p>
          <p className="invite__card-meta num">
            {formatNaira(summarize(pact).target)} · {joined.length} {joined.length === 1 ? 'person' : 'people'} so far
          </p>
        </div>
      </div>

      <Button fullWidth size="lg" iconLeft={<ShareNetworkIcon />} onClick={more} className="invite__primary">
        Share Pact
      </Button>

      <div className="invite__link">
        <span className="invite__url num">{shortUrl}</span>
        <Button size="md" onClick={copy} iconLeft={copied ? <CheckIcon /> : <CopyIcon />} aria-label="Copy invite link">
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>

      <ul className="invite__share" aria-label="Share to">
        <li>
          <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
            <span className="invite__share-icon invite__share-icon--whatsapp">
              <ChatCircleIcon />
            </span>
            WhatsApp
          </a>
        </li>
        <li>
          <a href={`sms:?&body=${encodeURIComponent(message)}`}>
            <span className="invite__share-icon invite__share-icon--messages">
              <ChatTextIcon />
            </span>
            Messages
          </a>
        </li>
        <li>
          <button type="button" onClick={more}>
            <span className="invite__share-icon invite__share-icon--ink">
              <DotsThreeIcon />
            </span>
            More
          </button>
        </li>
      </ul>

      {phoneInvites && (
      <div className="invite__phone">
        <Input
          label="Or invite by phone number"
          type="tel"
          name="invite-phone"
          autoComplete="off"
          inputMode="tel"
          enterKeyHint="send"
          placeholder="0803 123 4567"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setPhoneError(undefined);
          }}
          leading={<PhoneIcon />}
          error={phoneError}
          hint={pact.pendingPhoneInvites ? `${pact.pendingPhoneInvites} invited by text, waiting to sign up` : 'People not on PACT yet get a text with the link.'}
        />
        <Button size="md" onClick={invitePhone} loading={cmd.invite.isPending}>
          Invite
        </Button>
      </div>
      )}

      <section className="invite__joined" aria-live="polite">
        {celebrate && <Burst />}
        <div className="invite__joined-head">
          <p>
            <strong className="num">{joined.length}</strong> {joined.length === 1 ? 'person has' : 'people have'} joined
          </p>
          {joined.length < 2 && (
            <span className="invite__waiting">
              <span className="invite__pulse" aria-hidden /> Waiting for your first person
            </span>
          )}
        </div>
        <ul className="invite__people">
          <AnimatePresence initial={false}>
            {people.map((m) => (
              <motion.li key={m.userId} layout initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={spring.pop}>
                <Avatar userId={m.userId} size="lg" label={false} accent />
                <span>{m.userId === user?.id ? 'You' : getUser(m.userId).name}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </section>
    </Screen>
  );
}
