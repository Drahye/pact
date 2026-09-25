import { Plus } from 'lucide-react';
import { SectionHeading } from '../../../components/ui/SectionHeading';
import { CARD_FEE_CAP, NGN, TIER_LIMITS, WITHDRAWAL_FEE } from '../../../../shared/policy';

const naira = (kobo: number) => `₦${(kobo / NGN).toLocaleString('en-NG')}`;

const faqs = [
  {
    q: 'Where does the money sit while we save?',
    a: 'In the Pact, not in anyone’s personal account. Wallets and Pact pools are held with our licensed banking and payment partners, separate from PACT’s own money, and every movement is recorded on a double-entry ledger.',
  },
  {
    q: 'What happens if we don’t reach the goal?',
    a: 'The organiser picks the rule when the Pact is created and everyone sees it before paying: either every contribution is refunded to the wallet it came from, or what was raised goes to the organiser. The rule runs automatically a few days after the deadline.',
  },
  {
    q: 'Can the organiser run off with the money?',
    a: `Funds are released only once the goal is reached, and only to an organiser who has verified their BVN. Everyone in the Pact is notified the moment money is released, and withdrawals can only go to a bank account in the organiser’s own name.`,
  },
  {
    q: 'How do I add money?',
    a: `Top up your wallet by bank transfer, which is free, or by debit card, which carries a 1.5% card fee capped at ${naira(CARD_FEE_CAP)}. Then contribute to any Pact you’re in with your four-digit PIN.`,
  },
  {
    q: 'What does it cost?',
    a: `Creating Pacts, inviting people and contributing are free. Withdrawing to your bank costs ${naira(WITHDRAWAL_FEE)}.`,
  },
  {
    q: 'Are there limits?',
    a: `With just your phone number your wallet can hold up to ${naira(TIER_LIMITS[1].maxBalance)}. Verify your BVN, which takes about a minute, to hold up to ${naira(TIER_LIMITS[2].maxBalance)} and release Pact funds as an organiser.`,
  },
];

export function Faq() {
  return (
    <section id="faq" className="section faq" aria-labelledby="faq-title">
      <div className="container faq__inner">
        <SectionHeading id="faq-title" variant="site" eyebrow="Questions" title="Money you can trust with your friends." description="The rules are simple, visible to everyone, and enforced by the product, not by whoever is holding the money." />
        <div className="faq__list">
          {faqs.map((f) => (
            <details key={f.q} className="faq__item">
              <summary>
                <span>{f.q}</span>
                <Plus aria-hidden />
              </summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
