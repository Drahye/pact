# PACT demo walkthrough

A 3-minute recorded walkthrough is in [`docs/demo/pact-demo.mp4`](docs/demo/pact-demo.mp4). This page is the talk track for running the same demo live.

## Before you start

```bash
npm run db:reset   # fresh demo data (stop `npm run dev` first)
npm run dev
```

Open `http://localhost:5173/app` in a desktop browser. The phone frame sits in the middle with the demo accounts listed on the left. Everything runs in sandbox mode: SMS codes appear on screen and no real money moves.

| Who | Number | PIN | Role in the story |
| --- | --- | --- | --- |
| Abraham | 0801 000 0001 | 1357 | Organises Sarah's Birthday, verified |
| New friend | any new number, e.g. 0803 555 0142 | you choose | Joins from the invite link |

The organiser's invite link: sign in as Abraham, open Sarah's Birthday, tap **Invite people**, copy the link. Open it in a private window for the friend's side.

## The story (about 5 minutes live)

**The problem (15s).** "When a group pools money, it goes through one person's account and the status lives in a WhatsApp thread. Nobody knows the real total, and one person ends up chasing everyone. PACT makes the goal itself hold the money."

### 1. The invite (friend, private window)
- Open the invite link. *"Anyone can see what it's for, who organised it and how far along it is before signing up."*
- Tap **Sign up to join**, enter the number, tap **Fill it in** on the code. *"Phone number and a one-time code. Nothing else to remember."*
- Enter a first and last name. *"We ask for the name on your bank account so withdrawals never bounce."*
- Create a PIN, twice. *"Every payment needs this. Guessable PINs like 1234 are refused, and five wrong tries pause payments."*
- You land back on the invite. Tap **Join this Pact**.

### 2. The Pact
- *"One goal, one ring. Every colour is a person."* Tap a person to show their share, tap again to go back.
- Scroll to the rule card. *"What happens if the goal is missed is decided at the start, visible to everyone, and runs by itself. Usually a full refund."*

### 3. Paying in
- Tap **Contribute**, then **Cover the rest**. *"New wallet, no money. PACT offers to top up the difference and bring you right back."*
- Tap **Top up**. *"Bank transfer is free; card is 1.5%, shown before paying."* Tap **Pay**.
- Sandbox checkout: *"In production this is Paystack. The wallet is credited only when the processor confirms to our server, never because the app says so."* Tap **I've sent the money**.
- **Continue to contribute**, **Cover the rest**, then press and hold. *"Holding is deliberate: let go early and nothing happens."* Enter the PIN.
- "You're in." *"And that completed the goal. Everyone in the Pact just got notified."* Tap **See it complete**.

### 4. The organiser (Abraham, normal window)
- Sign in as Abraham. Point at the bell. *"Every movement of money shows up here."*
- **Pacts** tab → Sarah's Birthday. *"Only a BVN-verified organiser can release the money."* Tap **Release**, PIN 1357. *"It moves to his wallet and every member is told."*
- Back → **Wallet**. *"Full history; every line has a receipt with a reference."* Tap a row.
- **Withdraw** → **Add a bank account** → Guaranty Trust Bank, `0123456789`. *"The account name is checked: withdrawals only go to an account in your own name."* Save with the PIN.
- Withdraw ₦100,000. *"Flat ₦50 fee, shown up front. If the bank ever returns the transfer, the money and the fee come straight back."*

**Close (15s).** "No treasurer, no spreadsheet, no chasing. The money sits in the Pact, everyone sees it, and the rules run themselves."

## Things worth showing if asked

| Question | Show |
| --- | --- |
| "What if the goal isn't met?" | Create a Pact and point at the two missed-goal rules. Organisers can also close a Pact from the ⋯ menu, which refunds everyone at once. |
| "Is it secure?" | Profile → **PIN and devices**: change PIN, see every signed-in device, sign others out. Then the Security section of the README. |
| "Limits?" | Profile → **Verify your identity**: the three tiers and what BVN unlocks. |
| "Can I remind people?" | As organiser, ⋯ → **Remind people** (once a day per person). |
| "Does it hold up under load / double taps?" | `npm test`: concurrent contributions can't overdraw a wallet, retries never charge twice, forged payment webhooks are rejected. |

## Recording it again

```bash
npm run db:reset && npm run dev        # in one terminal, fresh data
node scripts/demo-video.mjs exports/demo   # in another, writes pact-demo.webm
ffmpeg -i exports/demo/pact-demo.webm -ss 0.8 -c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart docs/demo/pact-demo.mp4
```

The recording changes the data (Sarah's Birthday gets funded and released), so reset again before a live demo.
