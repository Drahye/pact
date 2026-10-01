import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy, Ellipsis, MessageCircle, MessageSquareText, Phone, Share2 } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../../api/auth';
import { ApiError } from '../../api/client';
import { usePact, usePactCommand } from '../../api/hooks';
import { FormSkeleton } from '../../components/app/Skeleton';
import { CategoryIcon } from '../../components/pact/category';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { TopBar } from '../../components/ui/TopBar';
import { useToast } from '../../components/ui/Toast';
import { getUser } from '../../data/users';
import { pushRecent } from '../../lib/drafts';
import { formatNaira } from '../../lib/format';
import { joinedMembers, summarize } from '../../lib/pact';
import { spring } from '../../tokens/tokens';
import { Screen } from './Screen';
import './invite.css';

export function InviteScreen() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const q = usePact(id);
  const cmd = usePactCommand(id);
  const toast = useToast();
  // Arriving straight from creating the Pact: this is the next step of setup, not an optional extra.
  const justCreated = !!(useLocation().state as { created?: boolean } | null)?.created;
  const [copied, setCopied] = useState(false);
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string>();

  if (q.isLoading) return <Screen topBar={<TopBar backTo={`/app/pact/${id}`} />}><FormSkeleton fields={2} label="Loading invite" /></Screen>;
  const pact = q.data?.pact;
  if (!pact) return <Navigate to="/app/home" replace />;

  const joined = joinedMembers(pact);
  const url = `${window.location.origin}/app/join/${pact.inviteCode}`;
  const shortUrl = url.replace(/^https?:\/\//, '');
  const message = `Join "${pact.title}" on PACT. We’re putting ${formatNaira(summarize(pact).target)} together and everyone can see the progress: ${url}`;

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
      topBar={<TopBar backTo={`/app/pact/${pact.id}`} title={pact.title} />}
      footer={
        <Button variant="secondary" fullWidth to={`/app/pact/${pact.id}`}>
          {justCreated ? 'Go to my Pact' : 'Done'}
        </Button>
      }
      className="invite"
    >
      {justCreated && (
        <p className="invite__ready">
          <Check aria-hidden /> Your Pact is ready.
        </p>
      )}
      <h1 className="large-title invite__title">{justCreated ? 'Now bring your people in.' : 'Bring your people in.'}</h1>
      <p className="screen-lede">
        {justCreated ? 'Share the link in your group chat. Anyone with it can see what the Pact is for and join.' : 'Anyone with this link can see what the Pact is for and join it.'}
      </p>

      <div className="invite__card">
        <CategoryIcon category={pact.category} size="lg" />
        <div>
          <p className="invite__card-title">{pact.title}</p>
          <p className="invite__card-meta num">
            {formatNaira(summarize(pact).target)} · {joined.length} {joined.length === 1 ? 'person' : 'people'} so far
          </p>
        </div>
      </div>

      <Button fullWidth size="lg" iconLeft={<Share2 />} onClick={more} className="invite__primary">
        Share Pact
      </Button>

      <div className="invite__link">
        <span className="invite__url num">{shortUrl}</span>
        <Button size="md" onClick={copy} iconLeft={copied ? <Check /> : <Copy />} aria-label="Copy invite link">
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>

      <ul className="invite__share" aria-label="Share to">
        <li>
          <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
            <span className="invite__share-icon invite__share-icon--whatsapp">
              <MessageCircle />
            </span>
            WhatsApp
          </a>
        </li>
        <li>
          <a href={`sms:?&body=${encodeURIComponent(message)}`}>
            <span className="invite__share-icon invite__share-icon--messages">
              <MessageSquareText />
            </span>
            Messages
          </a>
        </li>
        <li>
          <button type="button" onClick={more}>
            <span className="invite__share-icon invite__share-icon--ink">
              <Ellipsis />
            </span>
            More
          </button>
        </li>
      </ul>

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
          leading={<Phone />}
          error={phoneError}
          hint={pact.pendingPhoneInvites ? `${pact.pendingPhoneInvites} invited by text, waiting to sign up` : 'People not on PACT yet get a text with the link.'}
        />
        <Button size="md" onClick={invitePhone} loading={cmd.invite.isPending}>
          Invite
        </Button>
      </div>

      <section className="invite__joined" aria-live="polite">
        <div className="invite__joined-head">
          <p>
            <strong className="num">{joined.length}</strong> {joined.length === 1 ? 'person has' : 'people have'} joined
          </p>
          {joined.length < 2 && (
            <span className="invite__waiting">
              <span className="invite__pulse" aria-hidden /> Waiting for people
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
