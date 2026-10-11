// THE CLOSED SET OF AVAILABILITY STATUSES, IN ONE LOOKUP (2026-10-10, Donovan: "we need injury reports too,
// that has to be on point"). Every sport's raw word is mapped here and nowhere else; a word this table does
// not know is NOT guessed -- the entry is dropped and counted (normalise.js `skipped`).
//
//   OUT           ruled out for the game / listed Out by the league's report. Never named, never posted.
//   DOUBTFUL      NFL's "unlikely to play" (about a 25% chance). Treated like OUT for NEW picks and posts (see
//                 BLOCKS below) and worded "doubtful", never "out".
//   QUESTIONABLE  might not play. Not blocked; named only with the word beside the name, else held (namingChecks).
//   DAY_TO_DAY    ESPN's word for a minor, game-time call (NHL / NBA / MLB). Same handling as QUESTIONABLE.
//   IL            injured list / injured reserve / suspension: not available at all. Treated like OUT.
//
// A chip is information only: it never changes a score, a status word (CALLED / ON THE BOARD / NOT ON THE
// BOARD come from lib/callStatus.js) or a locked row.

export const INJURY_STATUSES = ['OUT', 'DOUBTFUL', 'QUESTIONABLE', 'DAY_TO_DAY', 'IL']

export const STATUS_INFO = {
  OUT:          { word: 'Out',          chip: 'OUT', rank: 0, tone: 'red',   blocks: true,  explain: 'Ruled out. He is not playing in this game.' },
  IL:           { word: 'Injured list', chip: 'IL',  rank: 1, tone: 'red',   blocks: true,  explain: 'On the injured list, injured reserve or suspended. He is not available.' },
  DOUBTFUL:     { word: 'Doubtful',     chip: 'D',   rank: 2, tone: 'amber', blocks: true,  explain: 'Doubtful: unlikely to play. We treat him as out for new picks and posts.' },
  QUESTIONABLE: { word: 'Questionable', chip: 'Q',   rank: 3, tone: 'amber', blocks: false, explain: 'Questionable: might not play. Check again near game time.' },
  DAY_TO_DAY:   { word: 'Day-to-day',   chip: 'DTD', rank: 4, tone: 'amber', blocks: false, explain: 'Day-to-day: a game-time call. Check again near game time.' },
}

/** Statuses that keep a man out of every NEW pick, card and post. The rule, stated once. */
export const BLOCKS = new Set(Object.keys(STATUS_INFO).filter((k) => STATUS_INFO[k].blocks))

const key = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// raw word (lower-cased, punctuation squeezed) -> status. ESPN's own words, as probed 2026-10-10:
//   NFL  Out, Questionable, Doubtful, Injured Reserve, (Active = not on the report)
//   NHL  Out, Day-To-Day, Injured Reserve, Suspension
//   MLB  Out, Day-To-Day, 7/10/15/60-Day IL, suspension, paternity
//   NBA  Out, Day-To-Day
const RAW = {
  'out': 'OUT',
  'doubtful': 'DOUBTFUL',
  'questionable': 'QUESTIONABLE',
  'day to day': 'DAY_TO_DAY',
  'injured reserve': 'IL',
  '7 day il': 'IL', '10 day il': 'IL', '15 day il': 'IL', '60 day il': 'IL',
  'suspension': 'IL', 'suspended': 'IL',
  'paternity': 'OUT',   // the paternity list: he is away from the club for the game
}

/** ESPN's raw status word -> one of INJURY_STATUSES, or null (Active, or a word we do not know: never guessed). */
export function classify(raw) {
  return RAW[key(raw)] || null
}

/** Words that mean "healthy": dropped without being counted as unknown. */
const HEALTHY = new Set(['active', ''])
export const isHealthy = (raw) => HEALTHY.has(key(raw))
