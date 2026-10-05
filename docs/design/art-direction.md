# Art direction + typography pass

## Phase 1: audit of what is there (2026-10-05, measured)

**Typeface.** Geist Variable, self-hosted (`@fontsource-variable/geist`). It is a variable font, so weight can be set to any value
between 100 and 900. No font change is needed: the problem is how the weights and sizes are used, not the face. (Fallback stack
already in `--font-sans`.)

**Weight.** 274 `font-weight` declarations in app CSS: 171 semibold (62%), 73 medium, 26 bold, 4 hard-coded 700. Titles, object
names, buttons, kickers, counts, labels and section headings are nearly all 600. With one dominant weight, scale has to do all the
work and it does not: page title 1.875 to 2.25rem, object title 1.1875rem, section title 1.125rem. Section and object titles are
within 6% of each other in size and identical in weight.

**Scale.** 64 distinct `font-size` values in app CSS; 16 uppercase rules in 12 files (every object kicker is uppercase).
Support text is 0.875rem and meta 0.75rem: small for a calm body role.

**Surfaces.** Most things are a rounded rectangle with a tint gradient and a ring. Needs You is a stack of identical tinted cards;
Circle "Happening now" is a stack of white cards; Pact is one large pastel card plus a flat green "Next step" card; creation steps
are bordered fields over rows of bordered chips. Radii are meaningful for the five object shapes (`--shape-*`) but 67 plain `50%`
and 55 `radius-full` pills dominate.

**Actions.** One default `Button` is a black pill; 23 full-width and many inline ones render as black pills, including every
contextual action in Needs You ("Open task", "Mark done", "I'll do it"). Secondary is a white pill. There is no quiet text action
used for the second and third things on a screen.

**Strongest screens (guide the pass):** Circle header (people plate), the converted/hero Plan top, CompletionState (completed
Pact), Coming up date rows. **Weakest:** Pact detail (one big pastel card, two side-by-side pills that wrap), Needs You after the
first item, creation steps (form feel), Me stats grid.

## Phase 2: proposed adjustment

**Roles** (`--t-*`, classes in `type.css`):
| Role | Size | Weight | Line | Tracking | Use |
|---|---|---|---|---|---|
| Numeric display | clamp(2.75rem, 13vw, 3.5rem) | 640 | 0.96 | -0.05em | dates, amounts, ring centre. Never wraps |
| Page title | clamp(2rem, 9vw, 2.5rem) | 610 | 1.08 | -0.042em | greeting, Circle, Plan, Pact, Me |
| Section title | 1rem | 580 | 1.4 | -0.01em | Needs you, People, Activity |
| Object title | 1.1875rem | 560 | 1.22 | -0.02em | inside rows and objects |
| Body | 1rem | 400 | 1.55 | -0.005em | explanation |
| Support | 0.9375rem | 400 | 1.4 | 0 | second line of a row |
| Meta | 0.8125rem | 450 | 1.3 | 0 | dates, counts |
| Overline | 0.6875rem uppercase | 600 | 1 | 0.08em | rare: kickers become sentence case |
Weights are lowered at the token level (`--weight-medium` 470, `--weight-semibold` 570, `--weight-bold` 660) so the 274 existing
declarations get lighter together; large type gets its contrast from size and spacing, not weight.

**Surfaces.** A card is for something you act on in place. Everything else sits on the page, separated by a hairline and space.
Tint appears as a wash behind a hero and as a small mark in the kicker, not as the body of every row.

**Actions.** One solid action per screen (green: commitment, joining, adding money). Lists use quiet pills or text with an arrow.
Black is for confirm moments only.

**Signatures.** Circle: faces, with a dashed "+" slot for the next person. Plan: the date at display scale, "48 days to go",
people carrying their RSVP state as a ring. Pact: the progress ring, drawn differently when started, progressing, funded.
Me: a history of what you made happen, before anything administrative. Ask and Split are out of scope in this pass.

**Motion.** Only where it explains: RSVP and vote selection (already springs), ring fill, ring close on funded, avatar entry. Reduced
motion removes movement but keeps every state.
