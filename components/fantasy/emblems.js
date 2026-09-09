// ── TEAM EMBLEMS ────────────────────────────────────────────────────────────
//
// Donovan: "give a few logos and colors for people to pick from for their
// teams." The colours already existed; this is the other half.
//
// DRAWN, NOT EMOJI. An emoji renders as a different picture on every operating
// system, arrives full-colour so it cannot take the team's own colour, and sits
// badly next to a monospace UI. These are eight paths on a 24x24 grid that
// inherit `currentColor`, so a team's mark is its emblem IN its colour and the
// medallion keeps working at 16px in a waiver list and 38px in a page header.
//
// A SLUG IS STORED, NOT THE ART. fantasy_teams.emblem holds 'bolt', and the
// check constraint on that column names the same eight. Changing a drawing
// later is a code change, not a data migration, and an emblem this file has
// never heard of degrades to the monogram rather than to a blank square.
export const EMBLEMS = [
  ['bolt',   'Bolt',   'M13 2 4 14h6l-1 8 9-12h-6l1-8Z'],
  ['flame',  'Flame',  'M12 2c1 4-3 5-3 9a3 3 0 0 0 6 0c0-1-.5-2-1-3 2 1 4 3 4 6a6 6 0 0 1-12 0c0-5 6-6 6-12Z'],
  ['shield', 'Shield', 'M12 2 4 5v7c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V5l-8-3Z'],
  ['star',   'Star',   'M12 2 15 9l7 .6-5.3 4.6 1.6 7L12 17.6 5.7 21.2l1.6-7L2 9.6 9 9l3-7Z'],
  ['skull',  'Skull',  'M12 2a8 8 0 0 0-8 8c0 3 1.5 4.5 3 5.5V19a1 1 0 0 0 1 1h1v-2h2v2h2v-2h2v2h1a1 1 0 0 0 1-1v-3.5c1.5-1 3-2.5 3-5.5a8 8 0 0 0-8-8ZM9 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm6 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z'],
  ['crown',  'Crown',  'M3 7l4 5 5-8 5 8 4-5-2 12H5L3 7Zm2 14h14v2H5v-2Z'],
  ['anchor', 'Anchor', 'M11 2h2v4h3v2h-3v10.9A7 7 0 0 0 19.9 13H18l3-4 3 4h-1.9A9 9 0 0 1 12 22a9 9 0 0 1-9.1-9H1l3-4 3 4H5.1A7 7 0 0 0 11 18.9V8H8V6h3V2Z'],
  ['horns',  'Horns',  'M2 6c3 0 5 2 6 5 1.5-1 3-1 4 0 1-3 3-5 6-5 0 5-2 8-5 9l1 5h-8l1-5C4 14 2 11 2 6Z'],
]

const BY_KEY = new Map(EMBLEMS.map(([key, label, path]) => [key, { key, label, path }]))

/** The stored slug, or null for anything this file does not draw. */
export function cleanEmblem(value) {
  const key = String(value || '').trim().toLowerCase()
  return BY_KEY.has(key) ? key : null
}

export function emblemPath(value) {
  return BY_KEY.get(cleanEmblem(value))?.path || null
}
