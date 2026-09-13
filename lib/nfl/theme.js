// NFL palette + tab list.
//
// Same chassis as lib/theme.js — identical greys, identical contrast
// discipline, identical NUM_FONT — but a different accent family, because you
// should be able to tell which sport you're looking at from six feet away
// without reading a word.
//
//   MLB   orange → red      (#f97316 → #ef4444)   a ball leaving the yard
//   NFL   spectral jade → electric cyan (#00e0a4 → #2dc8ff)   signal, not turf
//
// REPAINTED 2026-09-11 (Donovan: "more futuristic, innovate and original" —
// the old accents were #22c55e / #22d3ee, i.e. Tailwind's own green-500 and
// cyan-400, unmodified. Every dark-mode dashboard built on Tailwind defaults
// reaches for exactly that pair, which is the opposite of original no matter
// how it's laid out. Nothing else about the product changed -- every
// component below still just says C.green / C.cyan, so this one file is the
// whole repaint. The relationship the file's own naming promises (green
// stays green-family, cyan stays cyan-family) is kept on purpose: renaming
// the token keys themselves would mean touching call sites in 26 files
// blind, for zero visual benefit over just changing the values here.
//
// The new pair is built to read as LIVE SIGNAL rather than decoration --
// this product's whole job is finding the one soft spot in a defense and
// saying so in one sentence (Games/Matchups' DVP takeaways, The Six's
// headliner) -- a bio-luminescent jade against a near-void background reads
// like something actively tracking, not a status badge borrowed from a
// SaaS admin panel.
//
// The greys are deliberately NOT re-picked. They went through a readability
// pass on 2026-08-08 (both tiers stepped up so text2 clears ~7:1 and text3
// stops being squint-territory at 9px) and that work is sport-agnostic and
// still holds against the new, slightly deeper background below.

export const C = {
  bg: '#050608',
  bg2: '#0c0e14',
  bg3: '#12141e',
  glass: 'rgba(255,255,255,0.045)',
  border: 'rgba(255,255,255,0.09)',
  border2: 'rgba(255,255,255,0.15)',
  text: '#f4f4f5',
  text2: '#b4b4bc',
  text3: '#8b8b95',
  // ── the NFL accents ──
  green: '#00e0a4',     // primary — spectral jade, not Tailwind green-500
  cyan: '#2dc8ff',      // secondary — electric signal-blue, not cyan-400
  lime: '#a3e635',
  yellow: '#facc15',
  red: '#f87171',
  purple: '#a78bfa',
  blue: '#60a5fa',
  orange: '#fb923c',    // kept so shared components that reach for C.orange still resolve
  amber: '#fbbf24',     // the warm end of RAMP — see below
}

// ── THE RAMP ─────────────────────────────────────────────────────────────────
// 2026-09-13, Donovan, on the first pass of the new charts: "the green just
// doesn't offset the orange of the moonshot site."
//
// The fix is not to repaint TUDDY orange — that undoes the whole point of
// 09-11, which was that you can tell the two sports apart from six feet away —
// but the complaint underneath it is real in a second way the eye gets to
// first: a jade→cyan ramp has almost no contrast between adjacent steps, so a
// stacked bar of three components read as one green smear and the site looked
// flatter than the data in it.
//
// So: one shared SEQUENTIAL ramp, warm to cool, amber into jade. It has real
// separation at every step, it warms TUDDY toward MOONSHOT's family without
// becoming it, and it is one array so every ordered scale on the NFL side is
// the same scale. Use it for anything ordered — stacked contributions, meters,
// heat. Do NOT use it for hit/miss: cleared stays jade and missed stays dim,
// because a bettor reads green-vs-grey instantly and no amount of house style
// is worth spending that.
export const RAMP = ['#fbbf24', '#c9d444', '#8fd14f', '#4fcf7d', '#22c9a0', '#00e0a4']

// A colour anywhere along the ramp, t in 0..1 — for scales with more steps
// than the array has stops.
export function rampAt(t) {
  const x = Math.max(0, Math.min(1, Number(t) || 0)) * (RAMP.length - 1)
  return RAMP[Math.round(x)]
}

export const ACCENT = C.green
// The masthead gradient now runs the ramp rather than green→cyan, so the
// wordmark and every ordered chart under it are visibly the same system.
export const GRADIENT = `linear-gradient(120deg, ${RAMP[0]}, ${RAMP[2]}, ${RAMP[5]})`

export const NUM_FONT = "'Roboto Mono','SF Mono','Cascadia Mono',Menlo,Consolas,monospace"

// LEAN ON PURPOSE. The MLB side runs seventeen tabs after two seasons of
// additions; shipping seventeen empty ones here would be cosplay. Five that
// work, and the rest earn their way in during the season.
//
// Research leads after Games because it's the tab that's useful even when the
// model is wrong — and in August, the model is mostly carryover.
export const TABS = [
  ['home',     'Home'],
  ['games',    'Games'],
  // 🎫 Picks (2026-08-15) — seven market ladders, five deep, and the surface
  // you put your own name on. Sits above Boards because Boards is the
  // working-out and this is the answer.
  ['picks',    'Picks'],
  ['boards',   'Boards'],
  ['players',  'Player Portal'],
  ['watchlist','Watchlist'],
  ['research', 'Research'],
  ['matchups', 'Matchups'],
  ['report',   'Report Card'],
  // Accountability (2026-08-24) — the live, in-season sibling of Report
  // Card's pre-season calibration: did the actual published card clear its
  // own bar against real 2026 outcomes, market by market. Sits after Report
  // Card on purpose — calibrated first, then held to it.
  ['accountability', 'Accountability'],
  // Pairs (2026-08-24) — two props from the same slate, sold as one. Same-
  // player multi-market pairs (RB rush yards + anytime TD, QB pass yards +
  // rush yards, and three more) plus one cross-player, same-team case (QB +
  // his own top receiver). See components/nfl/tabs/Pairs.js's header for why
  // this is scoped smaller than MLB's four-file PairBoard/PairMe/
  // PairBuilder/PairTray — no NFL outcome archive exists yet to back a
  // measured cross-player correlation claim.
  ['pairs', 'Pairs'],
  // Live folded into Games (2026-08-24). It shipped as its own tab earlier
  // today, then got folded into Games the same day — the pulse dot, big
  // score line and cyan glow card now live on components/nfl/tabs/Games.js
  // directly instead of behind a second click. components/nfl/tabs/Live.js
  // is kept on disk (unwired) for its field-availability writeup and in case
  // a real live-play feed later wants its own tab back.
  ['guide',    'Guide'],
]

// The seven markets, in board order. Mirrors MARKETS in nfl_scoring.py —
// if you add one there, add it here.
export const MARKETS = [
  ['TD',       'Anytime TD',       '1+ rush or rec TD'],
  ['REC_YDS',  'Receiving yards',  'default bar 40'],
  ['REC',      'Receptions',       'default bar 4'],
  ['RUSH_YDS', 'Rushing yards',    'default bar 50'],
  ['RUSH_ATT', 'Rush attempts',    'default bar 12'],
  ['PASS_YDS', 'Passing yards',    'default bar 225'],
  ['KICK_PTS', 'Kicking points',   'FG×3 + PAT, bar 6'],
]

// Score → grade. THE SAME LADDER AS MLB, deliberately — lib/scoring.js
// gradeFor(): A+ 78 / A 70 / A- 62 / B+ 54 / B 46 / C+ below.
//
// Those cutoffs only mean anything because the NFL score is now built on the
// same distribution as hr_score. It used to be a percentile inside the slate,
// which forced a uniform 0-100 every week: the best goal-line back among six
// teams scored 100 whether he was Bijan Robinson or a backup, and a 100 on a
// three-game preseason card read exactly like a 100 on a full Sunday.
//
// nfl_bot now ranks each component against the whole league, ranks the
// composite against the league's composites, and lands the result at mean 47 /
// sd 11 — measured off a published MLB slate (min ~24, median ~45, max ~57).
// So the numbers transfer: an NFL 78 is as rare as an MLB 78, and a thin card
// scores thin instead of manufacturing an A+ out of whoever showed up.
export function gradeFor(score) {
  const s = Number(score)
  if (!Number.isFinite(s)) return { label: '—', color: C.text3 }
  if (s >= 78) return { label: 'A+', color: C.green }
  if (s >= 70) return { label: 'A',  color: C.green }
  if (s >= 62) return { label: 'A-', color: C.lime }
  if (s >= 54) return { label: 'B+', color: C.lime }
  if (s >= 46) return { label: 'B',  color: C.yellow }
  return { label: 'C+', color: C.text3 }
}
