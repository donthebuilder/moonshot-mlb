@AGENTS.md

# DASH Network site — rules for Claude Code

This repo is the DASH Network site (Next.js on Vercel, Supabase). Three
products share one shell: MOONSHOT (MLB home runs), TUDDY (NFL touchdowns),
LAMP (NHL goals). FRANCHISE (fantasy) also lives here; another workflow owns
it, so stay out of it unless asked. The Python bot repo
(~/MLB-HR-DASHBOARD-STREAMLIT) is separate. It publishes the JSON this site
reads, via its `data` branch.

## Start of every session
1. Read `.claude-notes/NOW.md` (current state), then `.claude-notes/ADDENDUM.txt`
   (the batch list). Both are gitignored local notes.
2. `git fetch && git status && git log origin/main..HEAD --oneline`.
   If there are uncommitted changes you didn't make, find out what they are
   and tell Donovan before shipping anything.
3. Do ONE batch. Use plan mode first: name the files you'll touch and how
   you'll prove it works. Take the batch all the way to done before
   touching anything else.

## How to work
- Trace source → transformation → state → output before changing code.
  Fix problems where they start, not downstream.
- Never invent data: no made-up stats, scores, odds, results or examples in
  production code. Test data is labelled as test data.
- Model records are never rewritten. A new model is a new `model_version`
  with new rows. Nothing pregame is written at or after first pitch,
  kickoff or puck drop.
- The labels CALLED / ON THE BOARD / NOT ON THE BOARD come from one place
  per sport: `lib/callStatus.js` (MLB, NFL) and `lib/nhl/goalModel.js`
  `scoreNight` (NHL). Never re-derive them in a component.
- Sports are listed in ONE place: the registry in `lib/routes.js`
  (TABLE / BRAND / sportKey). Don't write a new `sport === 'nfl' ? … : …`
  ternary. `node scripts/check-routes.mjs` must stay green.
- Dates: key everything on the game's own date, never the ET wall clock.
- Every navigation path is a feature: a wrong destination, stale state,
  broken deep link or wrong back button is a bug even if the data is right.

## Design
- Tables lead. No card layout as the default or above a table
  (exceptions by name: MLB PropsGrid, NFL Boards).
- MOONSHOT's current look is the reference. Don't restyle it.
- Phone first (390px). Anything that adds scroll on a phone needs a reason.
  Long lists preview a few rows.
- Stat tables carry the full column set (`lib/boardColumns.js`), except
  FRANCHISE.
- No new hex literals in .js files. Import the product's theme token
  instead. `node scripts/check-scales.mjs` counts them.
- Accents come from each product's theme (lib/sportAccent.js SPORT_ACCENT,
  SportTheme), never typed. Status words come from lib/callStatus
  STATUS_WORD and render through components/CallStatusBadge.js.
- FRANCHISE's components stay in FRANCHISE: nothing outside app/fantasy
  imports components/fantasy/ (check-routes fails on it).
- Tables (DenseTable skin v2, 2026-10-01): no cell washes at rest -- only
  the column you sort by is graded. No new fonts: hierarchy comes from
  weight and size in the system sans and NUM_FONT. Every table's columns
  carry a `group`, in order.
- The 3D views (stadium / zone / arena) are loaded with `next/dynamic`, so a
  grep for their importers returns nothing. That does not mean they are dead.

- MOONSHOT's components are the base for everything (Donovan, 2026-09-28).
  A new page, a new sport, or a new sport's twin of an existing page is built
  FROM the MOONSHOT component that already does that job (hero, chip rows,
  Filters, board table + heat, B2B-style watch box, player tile/card, ledger
  sections, face), passing the sport's data, words and accent colour. Do not
  rebuild a look-alike by eye. If the MOONSHOT component can't take the new
  sport as-is, generalise it (props / lookups) and keep MOONSHOT pixel-identical.
  New sport-only pieces only when MOONSHOT has nothing for that job, and name
  why in the commit. See .claude-notes/PARITY-ALL-PAGES-PLAN.md.

## Mobile is a testable product feature
Every screen is a phone screen first. A page is not done because it
renders. It's done when it passes the phone checks below at 390×844
(plus 360×780 and 430×932 for anything with a table, a chart or a
fixed bar). Each of these is a production bug even when the data is right:
- **Bleed:** anything wider than the screen. Sideways page scroll, text
  or a table cut off at the edge, a chip row pushing the layout.
- **Clipping:** a name, number or label cut off, overlapped, or
  squeezed into "…" when there was room to show it.
- **Collisions:** the fixed bottom bar or header covering content, a
  button or the last row of a list. A sheet or modal taller than the
  screen with no way to scroll it. A toast covering a control.
- **Tap targets:** anything tappable under 44×44 px, or two targets
  so close that a thumb hits the wrong one.
- **Readability:** body text under 12px, numbers under 11px, or contrast
  below WCAG AA on the dark theme. Exception (Donovan, 2026-10-01): in
  a table on a portrait phone (<= 430px), numbers >= 10px.
- **Scroll cost:** a change that pushes the first useful row lower
  needs a reason. Long lists preview a few rows ("+N more"). Measure the
  first-row y before and after, and write it in the commit.
- **Wide tables:** they scroll inside their own box (sticky first
  column), never the whole page. The DenseTable phone density is the
  standard.
- **Hover-only meaning:** anything that only explains itself on hover
  must also work on tap (lib/explain.js pattern).
- **Keyboard:** the on-screen keyboard must not cover the input
  you're typing in (search, login, sign-up).
- **Navigation on a phone:** every tap lands on the right page with the
  right sport, tab, filter and player. Back returns where you were.
  A shared link opens the same thing on a phone as on desktop.
  (Same rule as the navigation rule, measured on the phone.)
- **Safe areas:** nothing under the iPhone notch or home bar
  (env(safe-area-inset-*)).
- **Landscape:** a phone turned sideways doesn't break the layout
  (the bottom bar still fits, and sheets still scroll).
Before any push that touches UI: run `node scripts/check-mobile.mjs`
on the pages you changed. It must be green.

## Git and shipping
- Never `git add -A` or `git add .` (ARCHIVE/ is huge and there are secrets
  nearby). Stage explicit paths only.
- Never `git stash`. Never `--amend` a commit that might be pushed.
- Before any push: `npm run build` is clean, `node scripts/check-routes.mjs`
  passes, and Donovan has said yes to pushing. A push that touches UI also
  runs `node scripts/check-mobile.mjs --pages "<the pages you changed>"`
  (against `npx next start` or `--base https://dashnetwork.vercel.app`);
  no ERROR lines. And `node scripts/check-clickable.mjs --pages "<the pages
  you changed>"`: every player name, team and game is a link (0 not tappable).
- No temporary or debug routes left in `app/api/`. They deploy publicly.
- SQL: write the migration file and hand it to Donovan. He runs it in the
  Supabase SQL editor. The SQL runs BEFORE the code that needs it ships.
  Afterwards, prove it ran with a query (probe).
- Secrets: never print `.env*` values and never commit env files.
- Cost matters: no new polling, crons or stored data without a purpose.

## End of every session
Rewrite `.claude-notes/NOW.md` (keep it short): what shipped (commit hashes,
pushed or not), SQL still owed, what to check live, the next batch, and a
running list of things found but not fixed.
