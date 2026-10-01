import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Footer } from '../../components/site/Footer';
import { SiteNav } from '../../components/site/SiteNav';
import './legal.css';

type Doc = 'terms' | 'privacy' | 'refunds' | 'cookies';

const UPDATED = 'September 25, 2026';

const content: Record<Doc, { title: string; intro: string; sections: { h: string; p: string[] }[] }> = {
  terms: {
    title: 'Terms of Service',
    intro: 'These terms explain how PACT works, what we do with your money, and what we expect from you. Please read them before you create or join a Pact.',
    sections: [
      {
        h: '1. What PACT is',
        p: [
          'PACT lets groups pool money toward a shared goal. You keep a wallet, and you contribute from it to Pacts you have joined. Every member of a Pact can see every contribution.',
          'PACT is a technology service, not a bank. Before real money moves, wallet balances and Pact funds will be held with a licensed banking or payment partner, separate from PACT’s own money. Until then PACT runs in sandbox mode. PACT does not lend, invest or pay interest on your balance.',
        ],
      },
      {
        h: '2. Your account',
        p: [
          'You need a Nigerian mobile number to sign up, and you must be 18 or older. You are responsible for keeping your phone, SMS codes and transaction PIN private. PACT staff will never ask for your PIN or a code.',
          'Limits on how much you can hold, add and withdraw depend on your verification level. We may ask for more information before raising limits or releasing funds, as required by Nigerian regulations.',
        ],
      },
      {
        h: '3. Pacts and their rules',
        p: [
          'The organiser sets the goal, the deadline and the rule for a missed goal when the Pact is created. That rule is shown to everyone before they contribute and cannot be changed later.',
          'When a Pact is fully funded, the organiser can release the pool to their wallet. If the deadline passes before the goal is met, the Pact’s rule is applied automatically: either every contribution is refunded to the wallet it came from, or what was raised is released to the organiser.',
          'An organiser can close an open Pact at any time, which refunds every contribution. Contributions cannot otherwise be withdrawn from a Pact once made.',
        ],
      },
      {
        h: '4. Fees',
        p: [
          'Creating Pacts, joining them and contributing is free. Bank-transfer top-ups are free. Card top-ups carry a 1.5% card fee, capped at ₦2,000, shown before you pay. Withdrawals to your bank cost ₦50. We will tell you before any fee changes.',
        ],
      },
      {
        h: '5. Things you must not do',
        p: [
          'Do not use PACT for anything illegal, to collect money under false pretences, to launder money, or to pay for prohibited goods. We may freeze accounts and report activity to the authorities where the law requires it.',
        ],
      },
      {
        h: '6. When things go wrong',
        p: [
          'If a payment fails or a transfer is returned, the money goes back to your wallet. If you think a transaction is wrong, contact support@pact.africa within 30 days and we will investigate.',
        ],
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    intro: 'This policy explains what personal data PACT collects, why, how long it is kept, who it is shared with, and the choices you have. It is a plain-language draft that will be reviewed by counsel against the Nigeria Data Protection Act 2023 before launch.',
    sections: [
      {
        h: 'What we collect',
        p: [
          'Your phone number, first and last name, and the transaction PIN you choose (stored only as a one-way hash that nobody can read back).',
          'If you verify your identity: your BVN and date of birth. We keep the last four digits of your BVN, a one-way fingerprint to stop one BVN being used on two accounts, and an encrypted copy for regulatory checks.',
          'The Pacts you create and join: names, goals, budget lines, tasks, how you’re taking part, your contributions, and any memory note or photos the organiser adds.',
          'Wallet activity: top-ups, contributions, refunds and withdrawals. Bank accounts you add for withdrawals: bank name, the account holder’s name and the account number, which is encrypted.',
          'Security data: the device type and IP address of each signed-in session, and a log of security events such as sign-ins, PIN changes and failed attempts.',
          'We don’t ask for your contacts, your location, your email address or demographic details. Photos are stripped of location and other metadata when they’re uploaded.',
        ],
      },
      {
        h: 'Why we use it',
        p: [
          'To run your account and move your money as you instruct, to show your part in a Pact to the other people in it, to keep your account secure, to prevent fraud, and to meet legal and regulatory obligations such as identity checks and record keeping. We don’t sell personal data and we don’t use it for advertising.',
        ],
      },
      {
        h: 'Who sees what',
        p: [
          'People in a Pact see your name, photo, colour, how you’re taking part, your contributions to that Pact and the tasks you’ve taken on. Anyone with a Pact’s invite link sees only its name, goal, progress, deadline, number of people and the organiser’s first name.',
          'Your phone number, wallet balance, bank details and BVN are never shown to other people.',
        ],
      },
      {
        h: 'Services that process data for us',
        p: [
          'Payments (Paystack, once live): card and bank-transfer payments and withdrawals. Paystack handles card details directly; PACT never sees or stores full card numbers.',
          'Text messages (Termii, once live): your phone number and the content of sign-in and invite messages.',
          'Identity verification: a provider still being selected will receive your BVN, name and date of birth to confirm who you are.',
          'Hosting and database: a provider still being selected will store the data described here, in encrypted form where noted.',
          'The website and app load no analytics, advertising or tracking services. Fonts and images are served from PACT’s own servers.',
          'PACT does keep simple product statistics on its own servers, for example how many invite links led to someone joining. They use scrambled identifiers instead of your name or number, never contain PINs, bank details or messages, and are not shared with anyone.',
        ],
      },
      {
        h: 'How long we keep it',
        p: [
          'Sign-in codes are deleted after two days, and old sign-in tokens after two days once replaced. Security logs are kept to protect accounts and investigate abuse. Product statistics are deleted after 18 months.',
          'While your account is open, we keep your data so the product works. If you close your account, your name, photo, PIN and bank details are erased. Transaction records, identity-check records and security logs are kept for as long as financial and anti-money-laundering rules require (we expect this to be at least five years, subject to legal review), then deleted.',
          'Memory photos stay until the organiser removes them.',
        ],
      },
      {
        h: 'Your rights',
        p: [
          'You can download a copy of your data from Profile, and close your account from Profile at any time once your wallet is empty and no open Pact holds your money.',
          'You can also ask us to correct your data, object to how it’s used, or ask questions about this policy by writing to privacy@pact.africa.',
        ],
      },
      {
        h: 'Children',
        p: ['PACT is for people aged 18 and over. We don’t knowingly collect data from anyone younger. If you believe a child has an account, contact us and we’ll close it.'],
      },
      {
        h: 'Security',
        p: [
          'Data is encrypted in transit, sensitive fields are encrypted at rest, and access inside PACT is restricted and logged. No system is perfectly secure; if something goes wrong that affects you, we’ll tell you and the regulator as the law requires.',
        ],
      },
    ],
  },
  refunds: {
    title: 'Refund Policy',
    intro: 'How money comes back to you on PACT. Refunds go to the wallet the money came from; you can withdraw your wallet balance to your bank at any time.',
    sections: [
      {
        h: 'When a Pact doesn’t reach its goal',
        p: [
          'Every Pact has a rule, set when it’s created and shown to everyone before they contribute. If the rule is “refund everyone”, every contribution goes back to the wallet it came from automatically, three days after the deadline.',
          'If the rule is “keep what was raised”, what came in is released to the organiser instead. Check the rule on the Pact before you contribute.',
        ],
      },
      {
        h: 'When the organiser closes a Pact',
        p: ['An organiser can close an open Pact at any time. Every contribution is refunded to the wallet it came from, in full.'],
      },
      {
        h: 'Once a Pact is released',
        p: [
          'When a Pact reaches its goal and the organiser releases the funds, the money belongs to the organiser for the purpose the group agreed. PACT can’t reverse a release. Disagreements about how the money was used are between the members, but tell us if you believe something fraudulent happened and we’ll investigate.',
        ],
      },
      {
        h: 'Top-ups and withdrawals',
        p: [
          'If a top-up is credited to the wrong amount, twice, or not at all, contact support@pact.africa within 30 days and we’ll correct it with the payment processor.',
          'Card top-up fees are passed on from the card processor. They’re refunded only if the top-up itself is reversed.',
          'If a withdrawal fails or the bank returns it, the full amount and the ₦50 fee come back to your wallet automatically.',
        ],
      },
      {
        h: 'Direct payments into a Pact',
        p: ['If you pay straight into a Pact and it fills up or closes before your payment is confirmed, the money is kept in your wallet instead, and you’re told.'],
      },
    ],
  },
  cookies: {
    title: 'Cookie Policy',
    intro: 'PACT uses one cookie, and it’s necessary to keep you signed in. There are no analytics, advertising or tracking cookies, so there’s nothing to accept or reject.',
    sections: [
      {
        h: 'The cookie',
        p: [
          'pact_rt: keeps you signed in on this device for up to 30 days (ending sooner if you don’t use PACT for 14 days). It can’t be read by the page’s scripts, it’s only sent to PACT’s own sign-in endpoint, and it’s deleted when you sign out.',
        ],
      },
      {
        h: 'Other storage in your browser',
        p: [
          'The app remembers a few choices on your device: whether you’ve hidden your balance, that you’re signed in (so it knows to restore your session), sign-in progress while you wait for a code, and how you chose to join a Pact while you sign up. None of these leave your device, and clearing your browser data removes them.',
        ],
      },
      {
        h: 'If this changes',
        p: ['If PACT ever adds analytics or other non-essential cookies, we’ll ask for your consent first, with rejecting as easy as accepting, and update this page.'],
      },
    ],
  },
};

export function LegalPage({ doc }: { doc: Doc }) {
  const c = content[doc];
  useEffect(() => {
    document.title = `${c.title} · PACT`;
    window.scrollTo(0, 0);
  }, [c.title]);
  return (
    <div className="legal">
      <SiteNav />
      <main className="legal__main">
        <p className="legal__updated">Last updated {UPDATED}</p>
        <h1 className="legal__title">{c.title}</h1>
        <p className="legal__intro">{c.intro}</p>
        <nav className="legal__nav" aria-label="Legal">
          {(['terms', 'privacy', 'refunds', 'cookies'] as Doc[]).map((d) => (
            <Link key={d} to={`/${d}`} aria-current={d === doc ? 'page' : undefined}>
              {content[d].title}
            </Link>
          ))}
        </nav>
        {c.sections.map((s) => (
          <section key={s.h}>
            <h2>{s.h}</h2>
            {s.p.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </section>
        ))}
        <section>
          <h2>Contact</h2>
          <p>Support: support@pact.africa · Privacy: privacy@pact.africa · Security: security@pact.africa</p>
          <p>Company details (registered name, number and address) will be published here before PACT handles real money.</p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
