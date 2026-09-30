# PACT demo walkthrough

A 2½-minute recorded walkthrough is in [`docs/demo/pact-demo.mp4`](docs/demo/pact-demo.mp4). This page is the talk track for running the same demo live.

## Before you start

Live, against your normal dev stack:

```bash
npm run db:reset   # fresh demo data (stop `npm run dev` first)
npm run dev
```

Open `http://localhost:5173/app` in a desktop browser. The phone frame sits in the middle with the demo accounts listed on the left. Everything runs in sandbox mode: SMS codes appear on screen and no real money moves.

| Who | Number | PIN | Role in the story |
| --- | --- | --- | --- |
| Abraham | 0801 000 0001 | 1357 | Organiser, BVN-verified |
| Ngozi | 0803 555 0142 (a new number) | you choose | Joins from the invite link |

The organiser's invite link is on the invite screen after creating a Pact. Open it in a private window for the friend's side.

## The story (about 8 minutes live)

**The problem (15s).** "Group plans die in the group chat. Nobody knows what the money covers, who has paid, or who's doing what, and one person ends up chasing everyone. PACT puts the people, the money, the tasks and the deadline in one place."

The recorded video follows this order, in eight chapters. The talk track below matches it.

### 1. Plan it together (Abraham)
- Sign in: number, one-time code. *"The code fills itself in (Android reads it straight from the SMS)."* Tap **Pacts**: *"While things load you see the shape of the page, not a spinner."*
- **Create a Pact**: name, **Trip**, a quick date chip. Switch to **Budget**: *"Break the target into what it covers."* Fill three lines; the target adds up. Pick tasks from the chips. **Invite people** and add a number: *"Numbers not on PACT get a text."*
- **Reload the page.** *"Nothing is lost."* The banner reads "We kept what you'd filled in", with **Start over**. *"Every form and sheet saves itself on this device, per person, and sign-out wipes it."*
- **Create Pact**.

### 2. Bring people in, and let them pay
- On the Pact, **Get an account number for this Pact**. *"Friends pay from any bank app. No download, no signup."*
- **Test a transfer** (sandbox stands in for the bank): a name that isn't a member, ₦60,000. *"He shows up as a guest; the organiser can match him to a member later."*

### 3. A friend joins (Ngozi, from the invite)
- Open the invite link. *"Anyone can see what it's for and how far along it is."* Pick **Contributing and taking a task**, **Sign up to join**, number, code, name, PIN.
- On the Pact: the ring, **Needs attention** (**I'll do it** on a task), **The plan** filling line by line.
- **Pledge a date**: an amount and *In 3 days*. *"PACT reminds you, so nobody chases."* Then **Pay now**: pay straight into the Pact by transfer or card, no wallet balance needed. On the sandbox checkout, **I've sent the money**.

### 4. Finish the goal (Abraham)
- The ring shows Tunde as a guest and Ngozi in. **Contribute**, press and hold from the wallet, PIN. *"Holding is deliberate; let go early and nothing happens."* "You're in", then the completed Pact.

### 5. Pay vendors from the Pact
- **Pay a vendor from the Pact**: what it's for, ₦90,000. Close the sheet, reopen it: *"It kept what you typed."* Pick a bank, type the account number: *"PACT asks the bank who owns it, so a typo can't send money to a stranger."* Pay with the PIN. Over ₦200,000 in a day needs a co-organiser.
- **Release** what's left to the wallet (only a BVN-verified organiser can).

### 6. Wallet and security
- **Wallet**: history loads as a skeleton. **Withdraw** → **Add a bank account**: the bank confirms the name matches yours. Withdraw ₦50,000 with the PIN; the fee is shown first.
- **Profile → PIN and devices**: every signed-in device, sign others out, change the PIN.

### 7. Take orders
- **Create a Pact → Take orders**: an item, its price, sizes and stock. *"The total is whatever people order."* Open it, **Order**, pick a size and quantity, then **Pay for orders**.

### 8. The memory
- On the completed Pact: **Add the memory**, a line and a photo. *"Photos are checked, re-encoded and stripped of location data. Only people in the Pact can see them."*

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

The recording runs its own copy of the app on separate ports and a throwaway database, so it never touches your dev data and can be repeated:

```bash
scripts/demo-stack.sh                                            # API :8788, web :5174, fresh seeded data
DEMO_BASE=http://localhost:5174 node scripts/demo-video.mjs exports/demo   # about 7 minutes → pact-demo.webm
ffmpeg -i exports/demo/pact-demo.webm -ss 0.8 -c:v libx264 -crf 22 -pix_fmt yuv420p -movflags +faststart docs/demo/pact-demo.mp4
scripts/demo-stack.sh stop
```

`DEMO_SPEED=0.4` runs the same script faster (no useful video) to check it still passes after a change. The script signs up Ngozi with a fixed number, so run `scripts/demo-stack.sh` again between recordings.
