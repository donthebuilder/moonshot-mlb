// THE PER-GAME STAT VOCABULARY — one table, both surfaces.
//
// Same split, same reason, as lib/nfl/scoreLabels.js: a plain object with no
// React in it, so a server-rendered surface can import it without tripping the
// 'use client' boundary, and so there is exactly ONE definition of what a stat
// is called instead of two drifting copies.
//
// THE DRIFT THIS FIXES, measured against the live payload on 2026-09-20.
// The player card printed the raw payload keys -- TGT, SEP, YACOE -- while
// tabs/StatPortal.js kept a private STAT_LABELS map that expanded them. Two
// vocabularies for the same 23 numbers, and the private one had already gone
// stale in both directions:
//
//   SEVEN live keys had no label there and fell through to the bare
//   abbreviation on the page whose whole job is being the readable one:
//   20+, FGM, PAT, PATD, RYOE, SEP, YACOE
//
//   TWO labels pointed at keys the bot no longer publishes: FGATT, KICK
//
// That is what a second copy costs. The card never noticed because it was not
// using the map at all.
//
// PER GAME, AND SAID SO. Every one of these is a per-game rate except the
// counting stats the payload sends as totals, so the label carries "/ game"
// only where it is true rather than as decoration.
export const STAT_LABELS = {
  // receiving
  'TGT': 'Targets / game',
  'TGT%': 'Target share',
  'REC': 'Receptions / game',
  'RECYD': 'Receiving yds / game',
  'AIRYD': 'Air yds / game',
  'WOPR': 'WOPR',
  'SEP': 'Separation (yds)',
  'YACOE': 'YAC over expected',
  // rushing
  'CAR': 'Carries / game',
  'RUYD': 'Rushing yds / game',
  'RYOE': 'Rush yds over expected',
  // scoring opportunity
  'RZ': 'Red-zone opp / game',
  'GL': 'Goal-line opp / game',
  'xTD': 'Expected TD / game',
  'TD': 'TD / game',
  'TDoE': 'TD over expected',
  '20+': 'Plays of 20+ yds',
  // passing
  'PAYD': 'Passing yds / game',
  'PATD': 'Passing TD / game',
  'ATT': 'Attempts / game',
  'CPOE': 'Completion % over expected',
  // kicking
  'FGM': 'FG made / game',
  'PAT': 'Extra points / game',
}

/** The label for a stat key, falling back to the key itself. */
export const statLabel = (key) => STAT_LABELS[key] || key

// ── HOW A STAT READS (2026-09-27, the phone pass on TUDDY's player card) ──
// One formatter for the card and the profile, so a number reads the same
// wherever it is. A share key ("TGT%") published as a 0-1 fraction reads as a
// percent (0.351 -> "35.1%"); under 1 gets two decimals, not three; the rest
// one. Whole numbers stay whole.
export function statFmt(key, value) {
  const v = Number(value)
  if (value === null || value === undefined || value === '' || !Number.isFinite(v)) return '—'
  if (String(key).endsWith('%') && Math.abs(v) <= 1) return `${(v * 100).toFixed(1)}%`
  if (Number.isInteger(v)) return String(v)
  return Math.abs(v) < 1 ? v.toFixed(2) : v.toFixed(1)
}

// A surname that isn't a suffix: "Kenneth Walker III" -> "Walker" (the
// card's rungs printed "III").
const SUFFIX = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v'])
export function surname(name) {
  const parts = String(name || '').trim().split(/\s+/)
  while (parts.length > 1 && SUFFIX.has(parts[parts.length - 1].toLowerCase())) parts.pop()
  return parts[parts.length - 1] || ''
}
