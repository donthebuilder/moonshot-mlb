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

## Git and shipping
- Never `git add -A` or `git add .` (ARCHIVE/ is huge and there are secrets
  nearby). Stage explicit paths only.
- Never `git stash`. Never `--amend` a commit that might be pushed.
- Before any push: `npm run build` is clean, `node scripts/check-routes.mjs`
  passes, and Donovan has said yes to pushing.
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
