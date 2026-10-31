# PACT: Written Rationale

**Plan it together. Fund it together.**

PACT is a social fintech concept for groups moving money toward one shared goal: a trip, a birthday gift, a wedding contribution, rent, an event. Someone creates a Pact, sets a target and a deadline, invites people, and everyone contributes until the goal reaches 100%.

The design question was: *how do I help a group of people move money toward one shared goal with as little friction as possible?* The answer was to make the shared goal, the Pact, the only central object, and to give every member the same view of it.

---

## What I kept

**The core loop and a small, honest screen set.** Create a Pact, invite people, contribute, track progress, reach 100%, complete. The app is nine connected screens (Welcome, Home, Create Pact, Pact Detail, Invite, Contribute, Confirmation, Activity, Completed). There is no onboarding carousel, and none of the banking features the brief ruled out: no accounts, no cards, no loans, no dashboards.

**The visual direction from the brief.** Curved and minimal with an iOS lean: 20 to 28px radii, pill-shaped controls, a warm off-white background, deep ink text, one typeface (Geist), hairline borders, and minimal shadows. There is no glassmorphism anywhere, no blur and no frosted surfaces.

**Large numbers as the anchor.** ₦320,000, 64% and 12 days left are always the most prominent things on a screen, because the state of the money is the reason people open the app.

**One primary action per screen**, always the same green pill with ink text.

**Fresh green used with discipline.** Green means progress, positive states, the primary action and completion. It never decorates.

**One showcase Pact across both surfaces.** Sarah's Birthday (₦320,000 of ₦500,000, 8 people, 12 days left) appears in the app, on the landing page and in the style guide, so the two parts of the submission read as one product.

**Nigerian context.** Naira throughout, local names and occasions (owambe included), no real institutions, and no invented licences or certifications.

---

## What I changed

1. **Progress is drawn as people, not as a single bar.** Each person owns an identity colour. Rings and bars are made of contributor segments, avatars carry the same colour, and on Pact Detail you can tap a colour to see who gave it.
2. **Contributing is press and hold.** Your share previews in your colour before you confirm. The button fills as you hold, and letting go early cancels.
3. **The primary action adapts to the Pact's state.** A new Pact with only you in it makes "Invite people" the primary action instead of "Contribute". Contribute also offers "Cover the rest", so the last person can finish the goal in one tap.
4. **Plans have a tint and an icon** (gift, trip, event, wedding, home), with optional plan chips on Create that follow the Pact's name until you pick one.
5. **The landing page is built from the app.** "How a Pact works" is told through the real app screens with a spotlight on the relevant part. The gallery uses live snapshots. The hero and the app's Welcome screen share one 3D scene of friends paying into the goal.
6. **The contribution section is hands-on.** Visitors pick who is paying, choose an amount, press and hold, and watch that person's colour grow in the ring.
7. **One conversion goal.** Every call to action says "Get the app" and leads to a download page with App Store and Google Play buttons, platform detection and a QR code.
8. **The hero copy was sharpened** from "Money works better together." to "Plan it together. Fund it together." The original line stays as the tagline on the app's Welcome screen and in the footer.
9. **Repetition was removed.** A separate Activity section on the landing page was cut, and em dashes were removed from all product copy for a plainer voice.

---

## Why

- **Clarity.** "Who has paid?" is the question groups actually argue about. Drawing money as people answers it at a glance, without a list or a table. The same order everywhere (amount, target, progress, time, people, activity) means that once you can read one Pact, you can read any Pact.
- **Trust in money moments.** A deliberate hold gesture prevents accidental payments without adding a confirmation screen. Showing your share before you send removes the doubt about what will happen.
- **Less friction.** Adapting the primary action and offering "Cover the rest" put the most useful next step in front of the user, so the flow moves forward without them having to think about it.
- **Recognition.** Plan tints make Pacts easy to tell apart in a list without adding more text.
- **Conversion.** Visitors learn the product from the product itself. The hero shows money landing within seconds, the how-it-works section uses real screens, and the contribution section lets people try the core action. A single, consistent call to action means there is only one thing to do next.
- **Honesty.** PACT is a concept, so the store buttons open an "on the way" message with a link to the working web app, rather than a fake store listing.

---

## Responsive approach

Desktop (1440px) and mobile (390px) are two compositions of the same story, not one layout scaled down. On desktop the page uses a 12-column grid, wide type and horizontal compositions: a pinned phone swaps screens as the steps scroll, the app gallery travels sideways, the contribution controls sit beside a large ring, and the Clarity section is a gapless bento. On mobile everything becomes a single column: navigation reduces to the logo and one button, the call-to-action buttons go full width, the steps and gallery become swipeable cards, the ring leads with the controls below it, and cards stack. Touch targets are at least 44px, and there is no horizontal scroll at 390, 430, 768, 1024, 1280 or 1440px.

---

## AI use disclosure

PACT was designed and developed with AI-assisted workflows. **Claude Code** was used to translate the product concept and design direction into the working interface, components, interactions and responsive layouts. This covered:

- the design token system and the component library
- the data model and app state
- all nine app screens as a working prototype
- the WebGL payment scene, GSAP scroll animation and gesture interactions
- the landing, download and style guide pages
- the scripts that tested every breakpoint and exported the screens

Claude Code also proposed several design solutions that were adopted during review, including the identity-colour system, the contributor-segmented rings, hold-to-send and "Cover the rest".

**Human direction** was used for product strategy, UX decisions, visual direction and refinement. That included the original brief and design principles, and each round of feedback: the push toward an immersive, colourful and 3D landing page, telling "How a Pact works" through app screens, reimagining the contribution section, removing repetition and em dashes, the store buttons, and the final hero copy. Every screen was reviewed and accepted by a human before submission.
