import { Check, Copy, Link2, MessageCircle, MessageSquare, MoreHorizontal } from 'lucide-react';
import { Chip, Face, kobo, seg, StatusBar, Swap, AppBar } from './demoKit';
import { getUser } from '../../../data/users';

const rows = [
  { id: 'david', at: 0.16, chip: <Chip tone="mint">Money · {kobo(80)}</Chip> },
  { id: 'maya', at: 0.3, chip: <Chip tone="mint">Money · {kobo(120)}</Chip> },
  { id: 'daniel', at: 0.46, chip: <Chip tone="sky">Task · Book venue</Chip> },
  { id: 'kemi', at: 0.62, chip: <Chip tone="sun">Both · {kobo(50)} + Cake</Chip> },
  { id: 'femi', at: 0.78, chip: <Chip tone="quiet">I’m in, deciding</Chip> },
];

/** Scene 2: the link goes out, people arrive and each picks how they will show up. */
export function InviteDemo({ t }: { t: number }) {
  const joined = 3 + rows.filter((r) => t >= r.at).length;
  const copied = t >= 0.08;
  return (
    <div className="d-screen">
      <StatusBar />
      <AppBar title="Sarah’s Birthday" />
      <div className="d-invite">
        <h4 className="d-form__h">Bring your people in.</h4>
        <p className="d-form__sub">Anyone with this link can join and choose how they’ll show up.</p>

        <div className="d-linkcard">
          <span className="d-linkcard__url">
            <Link2 /> pact.app/sarahs-bday
          </span>
          <span className={`d-btn d-btn--sm ${copied ? 'is-done' : ''}`}>
            <Swap k={copied ? 'c' : 'n'}>
              {copied ? (
                <>
                  <Check /> Copied
                </>
              ) : (
                <>
                  <Copy /> Copy link
                </>
              )}
            </Swap>
          </span>
        </div>
        <div className="d-share">
          <span>
            <i className="d-share__wa">
              <MessageCircle />
            </i>
            WhatsApp
          </span>
          <span>
            <i className="d-share__sm">
              <MessageSquare />
            </i>
            Messages
          </span>
          <span>
            <i className="d-share__more">
              <MoreHorizontal />
            </i>
            More
          </span>
        </div>

        <div className="d-joined">
          <p className="d-joined__h">
            <Swap k={joined}>
              <b className="num">{joined}</b>
            </Swap>{' '}
            people have joined
          </p>
          <ul>
            {[{ id: 'sarah', chip: <Chip tone="mint">Organiser</Chip>, at: -1 }, ...rows].map((r) => {
              const p = seg(t, r.at - 0.02, r.at + 0.06);
              return (
                <li key={r.id} className="d-person" style={{ opacity: p, transform: `translateY(${(1 - p) * 14}px)`, maxHeight: p ? 56 : 0 }}>
                  <Face id={r.id} size="sm" />
                  <b>{getUser(r.id).name}</b>
                  {r.chip}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <div className="d-foot">
        <span className="d-btn d-btn--block d-btn--ghost">
          Done
        </span>
      </div>
    </div>
  );
}
