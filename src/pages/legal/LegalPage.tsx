import { useEffect } from 'react';
import { Footer } from '../../components/site/Footer';
import { SiteNav } from '../../components/site/SiteNav';
import './legal.css';

type Doc = 'terms' | 'privacy';

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
    intro: 'This policy explains what personal data PACT collects, why, and the choices you have. It is a plain-language draft that will be reviewed by counsel against the Nigeria Data Protection Act 2023 before launch.',
    sections: [
      {
        h: 'What we collect',
        p: [
          'Your phone number, name, and, if you verify, your BVN and date of birth. The Pacts you create and join, and your wallet transactions. Device and log data such as IP address and app version, used for security.',
        ],
      },
      {
        h: 'How we use it',
        p: [
          'To run your account and move your money, to show your contributions to the other members of your Pacts, to prevent fraud, and to meet our legal obligations. We do not sell personal data, and we do not use your contacts without your action.',
        ],
      },
      {
        h: 'Who sees what',
        p: [
          'Members of a Pact see your name, photo and contributions to that Pact. Your phone number and wallet balance are never shown to other people. Our payment, banking, identity and SMS partners receive only what they need to provide their service.',
        ],
      },
      {
        h: 'How we protect it',
        p: [
          'Data is encrypted in transit and sensitive fields such as bank account numbers and BVNs are encrypted at rest. PINs are stored as salted hashes that nobody, including PACT staff, can read back.',
        ],
      },
      {
        h: 'Your rights',
        p: [
          'You can ask for a copy of your data, ask us to correct it, or close your account by writing to privacy@pact.africa. Some records must be kept for the period required by financial regulations, even after an account is closed.',
        ],
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
        {c.sections.map((s) => (
          <section key={s.h}>
            <h2>{s.h}</h2>
            {s.p.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </section>
        ))}
      </main>
      <Footer />
    </div>
  );
}
