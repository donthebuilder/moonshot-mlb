export const C = {
  bg: '#09090b',
  bg2: '#111113',
  bg3: '#18181b',
  glass: 'rgba(255,255,255,0.045)',
  border: 'rgba(255,255,255,0.09)',
  border2: 'rgba(255,255,255,0.15)',
  text: '#f4f4f5',
  // READABILITY PASS (2026-08-08, "easier to read for older/younger eyes
  // while keeping it futuristic"): both grey tiers stepped up one notch —
  // text2 was ~7:1 on the darkest cards, text3 ran ~4.2:1 at 9px, which is
  // squint territory. Hierarchy (three tiers) is preserved; each tier just
  // clears more contrast. Style untouched, strain reduced.
  text2: '#b4b4bc',
  text3: '#8b8b95',
  orange: '#f97316',
  yellow: '#f59e0b',
  cyan: '#22d3ee',
  green: '#4ade80',
  red: '#f87171',
  purple: '#a78bfa',
  blue: '#60a5fa',
}
// CHROME PALETTE APPLIED AT MODULE LOAD. C is imported as a plain object by
// ~80 components, so swapping palettes by prop would mean touching all of
// them. Mutating the object once, at import time and before React renders,
// swaps the whole chrome with no component changes and no flash. See
// lib/themes.js for the palettes and scripts/check-themes.mjs for the
// contrast assertion that keeps a new one from undoing the readability pass.
if (typeof window !== 'undefined') {
  try {
    // Imported lazily to keep this module free of a load-order cycle:
    // themes.js must not import theme.js.
    const mod = require('./themes')
    const key = mod.themeFromUrl('ember')
    if (key !== 'ember') Object.assign(C, mod.THEMES[key].C)
  } catch { /* keep the shipped palette */ }
}

export const NUM_FONT = "'Roboto Mono','SF Mono','Cascadia Mono',Menlo,Consolas,monospace"
// All seventeen boards from the Streamlit build, in its order. Longest, Due,
// Pair History and Player are new here -- the Next.js app predates them.
// Order is deliberate: the boards you scan first, then the tools you reach for
// once you have names, then the archive. Scoreboard leads because it's the one
// view with every hitter and every column — you start wide and narrow down.
// Games moved down: it's a per-game read, which is where you go AFTER you know
// who you're interested in, not before.
export const TABS = [
  // Home added 2026-08-08 (Donovan: the site should open "welcoming...
  // living and breathing", not blasting stats). The greeting, tonight at a
  // glance, the bot's record, three doors in. New sessions land here;
  // deep links still restore whatever tab they name.
  ['home',        'Home'],
  ['scoreboard',  'Scoreboard'],
  // Merged 2026-08-04: HR Board + Hits & HRR were the same RankedBoard
  // machinery split across two tabs. One Boards tab, category buttons inside.
  ['board',       'Boards'],
  // Merged 2026-08-04: Longest + Due are two reads on the same question
  // (where is the power hiding) — one tab, toggle inside. Spray left the tab
  // bar the same day: the identical SprayField lives in every player modal,
  // so a whole tab for it was a duplicate with worse access.
  ['longest',     'Power'],
  ['games',       'Games'],
  // 📋 Boxes (2026-08-15) — every game on a date, live or final, with the full
  // box under it. The site could grade against a boxscore and never show you
  // one; "last night's box" was unanswerable here until this tab.
  ['boxes',       'Boxes'],
  // 🔥 Runs (2026-08-15) — active streaks at a bar you pick, with the strip.
  // Hot and cold on the same board, because a drought is a position too.
  ['runs',        'Runs'],
  // 🎤 At the Plate (2026-08-09) — the live batter's zone map + spray chart.
  // Only buildable after the liveSlate fields fix; before that 'who's up'
  // was null on every game.
  ['atplate',     'At the Plate'],
  // Derby benched 2026-08-08 (Donovan: decent concept, wrong execution) —
  // component lives at tabs/Derby.js, deep link #tab=derby still works;
  // re-add the row here when the rework lands.
  ['pitchers',    'Pitchers'],
  ['pairs',       'Pairs'],
  ['pools',       'Pools'],
  // Renamed 2026-08-10: the tab's job is the picks, and "Bot" named the author
  // rather than the contents. The KEY is unchanged, so every deep link, every
  // Discord post and every saved #tab=bot still lands here.
  ['bot',         'Picks'],
  // 🎫 My Picks (2026-08-14) — your card against the bot's, same slots, same
  // bars, graded overnight. Sits next to Picks because it IS Picks, edited.
  ['mypicks',     'My Picks'],
  // 🏷 True Price (2026-08-15) — every pre-game price the bot ever fetched,
  // settled against that night's box. Sits beside My Picks because it answers
  // the question those two tabs raise: fine, you hit 62% — was 62% worth it?
  ['trueprice',   'True Price'],
  ['leaders',     'Leaders'],
  ['player',      'Player'],
  ['watch',       'Watchlist'],
  ['pairhist',    'Pair History'],
  ['results',     'Results'],
  ['guide',       'Guide'],
]
