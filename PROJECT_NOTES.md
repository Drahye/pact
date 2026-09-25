# PACT: Project Notes

**Plan it together. Fund it together.**
PACT is a social fintech concept for groups moving money toward one shared goal: a trip, a birthday gift, a wedding contribution, rent, an event. The coded implementation is the source of truth for every exported screen and for the style guide.

## Deliverables

Everything is in **`exports/pact-29-screens.zip`**: 29 self-contained HTML files plus an `index.html`. Styles, fonts and images are inlined, so every file opens offline.

| # | Screens | Brief item |
|---|---|---|
| 01–20 | Every app state: Welcome (and join sheet), Home, Pacts, Profile, Create (empty, errors, invite sheet, filled), new Pact detail, Invite with people joining, Pact Detail (and tap-a-colour), Invite, Contribute (and cover the rest), Confirmation, Activity, Completed (and contributions sheet) | Core mobile app screens, in a phone frame |
| 21–24 | Landing page and download page, each as a separate desktop (1440px) and mobile (390px) layout | Responsive landing page |
| 25–29 | Style guide: foundations and variables, then components and their variants (buttons and inputs; progress and people; cards, feed and navigation; feedback and marketing) | Style guide with components and variables |
| · | This document | Written rationale |

PNG versions of the app states are in `exports/screens-png/`. The live build runs the interactions (gestures, 3D, scroll animation) that static files can't: `npm run dev`, then `/`, `/app`, `/download` and `/styleguide`. `npm run export:screens` regenerates the zip.

```bash
npm install && npm run dev   # / website · /app prototype · /download · /styleguide
```

## Product concept

When a group pools money, it usually moves through one person's bank account while the status lives in a group chat. Nobody knows the real total or who has paid, and one person ends up chasing everyone.

PACT makes the **shared goal** the central object. A Pact has four parts: the goal (what and how much), the people, the contributions, and the deadline. Every screen either creates a Pact, moves it forward, or shows its state. The core loop is Create, Invite, Contribute, Track, Complete. There are deliberately no bank accounts, cards, loans, investments or dashboards.

## What was kept

- **The brief's core loop and screen set.** Nine connected screens: Welcome, Home, Create Pact, Pact Detail, Invite, Contribute, Confirmation, Activity and Completed. There is no onboarding carousel, and no Profile or settings build-out.
- **Curved, minimal, iOS-leaning language.** 20 to 28px radii, pill controls, a warm off-white background, deep ink type, one typeface (Geist), minimal shadows, and no glass or blur anywhere.
- **Large financial numbers as anchors.** ₦320,000, 64% and 12 days are always the biggest things on the screen.
- **One primary action per screen**, always the green pill.
- **One showcase Pact** (Sarah's Birthday, ₦320,000 of ₦500,000, 8 people, 12 days left) runs through the app and the website, so the two read as one product.
- **Naira throughout**, with no real institutions and no invented licences or certifications.

## What was changed, and why

| Change | Why |
|---|---|
| **The app is a working product, not mockups.** Every screen reads from one store. Creating a Pact adds it to Home. Contributing updates the totals, the ring and the feed. Reaching 100% turns the Pact into its completed state. | Screens show real states. The flow can be clicked end to end and was tested by an automated walkthrough. |
| **Every colour is someone.** Each person owns one identity colour, and progress is drawn as contributor segments (a ring and a bar). On Pact Detail you can tap a colour to see who gave it. | This answers "who has paid?" at a glance, which is the question groups actually argue about. |
| **Press and hold to contribute.** Your share previews in your colour before you confirm, and letting go early cancels. | Money needs a deliberate gesture. It prevents accidental payments without adding a confirmation screen. |
| **Primary action adapts.** A new Pact with only you in it makes Invite the primary action. | Contributing alone to an empty Pact is not the useful next step. |
| **"Cover the rest"** on Contribute. | Gives the last contributor a one-tap way to finish the goal. |
| **Plans have a tint and icon**, with optional plan chips on Create. | Pacts stay easy to tell apart in a list, and Create still takes three details. |
| **The website shows the app.** How a Pact works is told through real app screens with a spotlight, the gallery uses live snapshots, and the hero and the app's Welcome share one 3D payment scene. | Visitors learn the product from the product, and both surfaces look like one system. |
| **The contribution section is hands-on.** Pick who is paying, press and hold, and watch their colour grow in the ring. | "Everyone contributes, everyone sees it" becomes something the visitor does, not reads. |
| **One conversion.** Every call to action says "Get the app" and leads to `/download`. It auto-detects iPhone or Android, shows a QR code, and gives an honest "on the way" message with a link to the web app. | One clear goal, and no fake store listing for a concept. |
| **Removed repetition.** The separate Activity section was cut from the landing page. | The hero feed and the contribution section already show who added what. |

## Responsive approach

Desktop (1440) and mobile (390) are two compositions of the same story, not one layout scaled down. The table below shows how each section changes.

| Section | Desktop | Mobile |
|---|---|---|
| Navigation | Floating pill with links and "Get the app" | Logo and "Get the app" only |
| Hero | Centred two-line headline; full-width 3D stage with the live feed card overlaid | Three-line headline and stacked full-width buttons; the 3D dial gets its own area with the feed below |
| App gallery | Section pins and the phones travel sideways as you scroll | Native swipe carousel with snap points |
| How a Pact works | Steps scroll while a pinned phone swaps to each real screen | Swipeable step cards, each with its own phone and spotlight |
| Contributing | Controls on the left, large ring on the right | Ring first, controls below |
| Goal reached | Ring beside the amount; members in one row | Ring above the amount; members in a 4×2 grid |
| Clarity | Gapless 4×2 bento | Stacked cards |

Touch targets are at least 44px, and there is no horizontal scroll at 390, 430, 768, 1024, 1280 or 1440 (each checked with an automated overflow scan).

## Design system

All values live in `src/styles/tokens.css` and are shown on `/styleguide`.

- **Colour.** Paper background `#F6F4EF`, ink `#0F1713`, accent green `#3DD68C` (with ink text for 9:1 contrast), green text `#137A4A`, mint `#E3F7EC`, and muted red `#B44A42`. Each person has an identity colour, and plans have soft tints (sun, coral, sky, lilac, pink, mint).
- **Type.** Geist only, with tabular numerals. Text sizes are 12, 14, 16, 18, 22, 28, 40, 56 and 88px; number sizes are 22, 32, 44, 64 and 96px.
- **Space, radius and grid.** A 4pt spacing scale; radii of 8, 12, 16, 20, 24, 28, 36 and full; a 12-column grid with a 24px gap; breakpoints at 480, 768, 1024, 1280 and 1440.
- **Borders, shadows and motion.** Hairline borders; four low, warm shadows plus a focus ring; ease-out motion at 150, 250, 450 and 800ms, with spring presets.
- **Components.** Buttons, the hold button, icon buttons, inputs, the amount input, segmented controls, badges, avatars and avatar groups, the progress bar and ring, the segmented ring and bar, category icons and chips, activity items, Pact cards, the featured Pact card, the top bar, the tab bar, bottom sheets, toasts, the phone frame and the store buttons.

## Accessibility

- Semantic landmarks, labelled controls and visible focus rings.
- AA contrast on all text tokens, including meta text.
- Progress bars and rings expose their values; animated numbers announce only their final value.
- Bottom sheets trap focus and close on Escape.
- The hold button also confirms with a single key press.
- `prefers-reduced-motion` settles every animation, stops the loops, and shows static states.

## AI use disclosure

PACT was designed and developed with AI-assisted workflows. Claude Code was used to translate the product concept and design direction into the working interface, components, interactions and responsive layouts. That covered the design tokens, the data model and state, the WebGL payment scene, the GSAP scroll choreography, the gesture interactions, the style guide page, and the automated capture and testing scripts used to verify every breakpoint and export the screens. Human direction was used for product strategy, UX decisions, visual direction and refinement, including each round of feedback that shaped the colourful identity system, the app-screen storytelling and the hands-on contribution section.
