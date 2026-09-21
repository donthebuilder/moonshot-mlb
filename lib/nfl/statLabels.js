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
