// NFL palette + tab list.
//
// Same chassis as lib/theme.js — identical greys, identical contrast
// discipline, identical NUM_FONT — but a different accent family, because you
// should be able to tell which sport you're looking at from six feet away
// without reading a word.
//
//   MLB   orange → red      (#f97316 → #ef4444)   a ball leaving the yard
//   NFL   emerald → cyan    (#22c55e → #22d3ee)   field turf, stadium light
//
// The greys are deliberately NOT re-picked. They went through a readability
// pass on 2026-08-08 (both tiers stepped up so text2 clears ~7:1 and text3
// stops being squint-territory at 9px) and that work is sport-agnostic.

export const C = {
  bg: '#09090b',
  bg2: '#111113',
  bg3: '#18181b',
  glass: 'rgba(255,255,255,0.045)',
  border: 'rgba(255,255,255,0.09)',
  border2: 'rgba(255,255,255,0.15)',
  text: '#f4f4f5',
  text2: '#b4b4bc',
  text3: '#8b8b95',
  // ── the NFL accents ──
  green: '#22c55e',     // primary — replaces MLB's orange everywhere
  cyan: '#22d3ee',      // secondary — the gradient's far end
  lime: '#a3e635',
  yellow: '#facc15',
  red: '#f87171',
  purple: '#a78bfa',
  blue: '#60a5fa',
  orange: '#fb923c',    // kept so shared components that reach for C.orange still resolve
}

export const ACCENT = C.green
export const GRADIENT = `linear-gradient(90deg, ${C.green}, ${C.cyan})`

export const NUM_FONT = "'Roboto Mono','SF Mono','Cascadia Mono',Menlo,Consolas,monospace"

// LEAN ON PURPOSE. The MLB side runs seventeen tabs after two seasons of
// additions; shipping seventeen empty ones here would be cosplay. Five that
// work, and the rest earn their way in during the season.
//
// Research leads after Games because it's the tab that's useful even when the
// model is wrong — and in August, the model is mostly carryover.
export const TABS = [
  ['games',    'Games'],
  ['boards',   'Boards'],
  ['research', 'Research'],
  ['report',   'Report Card'],
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

// Score → grade. Same four-tier shape the MLB board uses so the two sides
// read alike, with the NFL accents.
export function gradeFor(score) {
  const s = Number(score)
  if (!Number.isFinite(s)) return { label: '—', color: C.text3 }
  if (s >= 85) return { label: 'A', color: C.green }
  if (s >= 70) return { label: 'B', color: C.lime }
  if (s >= 55) return { label: 'C', color: C.yellow }
  return { label: 'D', color: C.text3 }
}
