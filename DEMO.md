# PACT demo walkthrough

A 2½-minute recorded walkthrough is in [`docs/demo/pact-demo.mp4`](docs/demo/pact-demo.mp4). This page is the talk track for running the same demo live.

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

**The problem (15s).** "Group plans die in the group chat. Nobody knows what the money covers, who has paid, or who's doing what, and one person ends up chasing everyone. PACT puts the people, the money, the tasks and the deadline in one place."

### 1. The invite (friend, private window)
- Open the invite link. *"Anyone can see what it's for and how far along it is before signing up."*
- Scroll to **How do you want to show up?** *"Money is one way. Taking a task is another. Or both, or 'I'm in, I'll confirm later'."* Pick **Contributing and taking a task**, then **Sign up to join**.
- Enter the number, tap **Fill it in**, add a name, create a PIN twice. *"Every payment needs this PIN. Guessable ones are refused."*
- You land back on the invite with your choice remembered. Tap **Join this Pact**.

### 2. The plan
- *"One goal, one ring. Every colour is someone's part."* Tap a name to see their share.
- **Needs attention**: *"PACT surfaces what's missing so nobody has to chase."* Tap **I'll do it** on "Find a photographer". *"That counts as showing up too."*
- Scroll to **The plan**: *"What the money covers. Raised money fills the lines in order, so you can see Dinner and Cake are covered and Photography isn't."*
- **Tasks**: tap one to show the sheet (claim, progress, done; the organiser can assign).

### 3. Paying in
- **Contribute**, then **Cover the rest**. *"No wallet balance? Pay straight into the Pact."* Tap **Pay ₦180,000 by transfer or card**.
- *"Transfer is free; card shows its fee first."* Tap **Pay**. On the sandbox checkout: *"In production this is Paystack. Nothing counts until the processor confirms to our server."* Tap **I've sent the money**.
- "You're in." Then **Back to the Pact**: *"We did it. Nine people, one plan."*
- To show the wallet path instead: top up first, then press and hold to contribute and confirm with the PIN. *"Holding is deliberate; let go early and nothing happens."*

### 4. The organiser (Abraham, normal window)
- Sign in as Abraham. **Home** shows what needs him across all his Pacts.
- **Pacts** → Sarah's Birthday. *"Only a BVN-verified organiser can release the money."* Tap **Release**, PIN 1357.
- Near the end of Tasks, as organiser: **Split the rest** on an open Pact asks everyone for an equal share. *"It's a note, never a charge."*

### 5. The memory
- On the completed Pact: **Add the memory**, a line about how it went, and a photo. *"Photos are checked, re-encoded and stripped of location data. Only people in the Pact can see them."*

**Close (15s).** "Plan it, fund it, split the work, and keep the memory. Make it happen together."

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
