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
// ── NINE TABS (2026-08-16, the approved consolidation) ──────────────────────
//
// Donovan: "honestly the site needs to be cleaned up and if merging tabs is
// what will do it but yeah" → a written plan → "yes do your thing get
// started." The rule the plan runs on: A TAB IS A QUESTION YOU ARRIVE WITH; A
// VIEW IS AN ANSWER you switch between once you're there. Before this pass
// the site was really 25 surfaces — 17 tabs plus 8 orphan routes reachable
// only by URL — because there was no rule for what deserved a tab.
//
// The nine questions, and what each tab absorbed:
//   Home      what's happening right now        (+ Scoreboard, + boxes)
//   Boards    who should I back, ranked         (+ Power, + due/longest/spray
//                                                 orphans, Patterns already in)
//   Games     what does one game look like      (+ At the Plate as Live mode)
//   Pitchers  what are the arms doing           (unchanged — earns its slot)
//   Picks     what does the bot actually say    (unchanged)
//   Combos    what combination bet do I build   (Pairs + Pools + pairhist)
//   Odds      what does the book charge         (+ True Price, its one home)
//   You       how am I doing, who am I watching (My Picks + Watchlist)
//   Results   has any of this been right        (+ Leaders)
//
// EVERY OLD KEY STILL ROUTES. Dashboard keeps alias routes for scoreboard,
// boxes, atplate, longest, due, hitshrr, pairs, pools, pairhist, mypicks,
// watch, trueprice, leaders, player, guide, spray, derby, runs — each opens
// the new host on the right view (or the standalone component where that is
// the safer render). Nothing was deleted; keys left this ROW, not the site.
// Guide is reachable from Home's "New here?" card and the Boards "how to
// read this site" pill, plus #tab=guide directly.
export const TABS = [
  ['home',        '🏠 Home'],
  // 'Charts', was 'Boards' (2026-08-17, "boards should be called like charts
  // or something else"). Key unchanged — every deep link holds.
  ['board',       '📊 Charts'],
  // ── SLATE IS BACK IN THE BAR (2026-08-17) ─────────────────────────────────
  // Donovan: "i dont like how the scoreboard is not easily accessible." The
  // consolidation folded the full-slate table into the Boards group as a link,
  // which made the single most-used table on the site two hops deep. A tab is a
  // question you arrive with — "show me every hitter tonight" is one — so it
  // earns the slot back. The route already existed; only this entry was gone.
  ['scoreboard',  '🧮 Slate'],
  ['games',       '🎮 Games'],
  ['pitchers',    '⚾ Pitchers'],
  // Renamed 2026-08-10: the tab's job is the picks, and "Bot" named the
  // author rather than the contents. Key unchanged — every deep link holds.
  ['bot',         '🎯 Picks'],
  ['combos',      '🎟 Combos'],
  ['odds',        '💵 Odds'],
  ['you',         '⭐ You'],
  ['results',     '🧾 Results'],
]
