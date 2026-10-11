// lib/positions.js -- THE POSITION FILTER, ONE PLACE FOR ALL FOUR SPORTS (2026-10-10, Donovan: "we need to be able to
// filter rankings by positions").
//
// WHAT IS HERE. The per-sport spec (display order, groups, the words a tooltip uses) keyed by the registry's sport
// keys (lib/routes.js ALL_SPORT_KEYS, checked by scripts/check-position-filter.mjs), and the pure functions every
// Rankings page shares: canonicalise a position, work out which pills a row answers to, build the options from the
// ROWS ON THE PAGE, match, and read / write the `pos=` address value. No sport ternary anywhere: a sport is a key
// into POSITIONS, and an unknown sport falls back to MOONSHOT's like sportKey() does.
//
// THE OPTIONS ARE DERIVED, NEVER TYPED. `spec.order` only says in what order to draw a position IF the rows have it.
// A position nobody on the page has is not offered (a pill the data cannot back would be a lie), and a position the
// data has that the spec has never heard of (an NFL "EDGE") is offered after the known ones, in the data's own word.
// A group pill (IF, OF, F, G) is offered only when at least two of its members are on the page: with one member it
// would be the same pill twice.
//
// WHERE THE WORDS COME FROM (per sport, how the board names a man):
//   mlb  the league's primary position (statsapi people endpoint: C 1B 2B 3B SS LF CF RF OF DH TWP). The slate file
//        carries none, so the page asks the league once for the ids it shows (lib/alignments usePeople).
//   nfl  the week file's `position` (QB RB WR TE K DEF and, where a board has them, DL LB CB S); the depth ROLES
//        (RB1, WR1, WR2, WR3, TE1 ...) are lib/nfl/roles.js and ride the same pills as a second group.
//   nhl  the skater's positionCode: C, L, R, D (G if a board ever lists one). L and R are drawn LW and RW.
//   nba  ESPN's position abbreviation: PG SG SF PF C, and the generic G and F, which the G and F group pills hold.
//
// A position is a label for the man, not a forecast: filtering by it changes no rank, score, status word or record.

export const POSITIONS = {
  mlb: {
    noun: 'hitter',
    order: ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'TWP', 'P'],
    groups: [{ key: 'IF', members: ['1B', '2B', '3B', 'SS'] }, { key: 'OF', members: ['LF', 'CF', 'RF', 'OF'] }],
    alias: {},
    words: { C: 'Catcher', '1B': 'First base', '2B': 'Second base', '3B': 'Third base', SS: 'Shortstop', LF: 'Left field', CF: 'Center field', RF: 'Right field', OF: 'Outfield: LF, CF, RF', DH: 'Designated hitter', TWP: 'Two-way player', P: 'Pitcher', IF: 'Infield: 1B, 2B, 3B, SS' },
    kind: 'primary position (the league’s record, not tonight’s lineup spot)',
  },
  nfl: {
    noun: 'player',
    order: ['QB', 'RB', 'FB', 'WR', 'TE', 'K', 'P', 'DEF', 'DL', 'DE', 'DT', 'EDGE', 'LB', 'OLB', 'ILB', 'MLB', 'CB', 'DB', 'S', 'FS', 'SS'],
    groups: [],
    alias: {},
    words: { QB: 'Quarterback', RB: 'Running back', FB: 'Fullback', WR: 'Wide receiver', TE: 'Tight end', K: 'Kicker', P: 'Punter', DEF: 'Team defense', DL: 'Defensive line', DE: 'Defensive end', DT: 'Defensive tackle', LB: 'Linebacker', CB: 'Cornerback', S: 'Safety', DB: 'Defensive back', SLOT: 'Receivers whose published slot share is 50% or more of his snaps. A label, not a forecast.' },
    kind: 'position',
  },
  nhl: {
    noun: 'skater',
    order: ['C', 'LW', 'RW', 'D', 'G'],
    groups: [{ key: 'F', members: ['C', 'LW', 'RW'] }],
    alias: { L: 'LW', R: 'RW' },
    words: { C: 'Center', LW: 'Left wing', RW: 'Right wing', D: 'Defence', G: 'Goalie', F: 'Forwards: C, LW, RW' },
    kind: 'position',
  },
  nba: {
    noun: 'player',
    order: ['PG', 'SG', 'G', 'SF', 'PF', 'F', 'C'],
    groups: [{ key: 'G', members: ['PG', 'SG', 'G'] }, { key: 'F', members: ['SF', 'PF', 'F'] }],
    alias: {},
    words: { PG: 'Point guard', SG: 'Shooting guard', SF: 'Small forward', PF: 'Power forward', C: 'Center', G: 'Guards: PG, SG', F: 'Forwards: SF, PF' },
    kind: 'position',
  },
}

export const specOf = (sport) => POSITIONS[String(sport)] || POSITIONS.mlb

/** The row's position in the word the spec uses ('L' -> 'LW'), or '' when it has none. */
export function canonPos(sport, raw) {
  const s = String(raw == null ? '' : raw).trim().toUpperCase()
  if (!s || s === 'NULL' || s === 'UNDEFINED') return ''
  return specOf(sport).alias[s] || s
}

/** Every pill key a position answers to: itself, and each group that holds it. 'PG' -> ['PG', 'G']. */
export function keysFor(sport, canon) {
  if (!canon) return []
  const out = [canon]
  for (const g of specOf(sport).groups) if (g.members.includes(canon) && !out.includes(g.key)) out.push(g.key)
  return out
}

const groupKeys = (sport) => new Set(specOf(sport).groups.map((g) => g.key))

/**
 * The options the page offers. `rows` is the whole pool (decides WHICH pills exist), `countRows` the rows that clear
 * every OTHER filter (decides the numbers, so a pill's count is what tapping it alone would show).
 *   posOf(row)      the raw position
 *   extraOf(row)    optional: more pill keys the row answers to (NFL depth roles)
 *   extraOrder      the order extras are drawn in; extras not in it are not offered
 *   selected        keys already chosen (an address can name one the page no longer has: it stays, with 0, so it can be cleared)
 * -> [{ key, label, count, kind: 'pos' | 'group' | 'role', seg, title }]   (seg changes where the row draws a divider)
 */
export function positionOptions(sport, rows, { posOf, extraOf = null, extraOrder = [], countRows = null, selected = [], pending = null } = {}) {
  const spec = specOf(sport)
  const gset = groupKeys(sport)
  const poolKeys = new Map()   // key -> rows that answer to it in the whole pool
  const poolPos = new Set()
  const tally = (list, into) => {
    for (const r of list || []) {
      const c = canonPos(sport, posOf(r))
      const ks = [...keysFor(sport, c), ...(extraOf ? extraOf(r) || [] : [])]
      for (const k of new Set(ks)) into.set(k, (into.get(k) || 0) + 1)
      if (into === poolKeys && c) poolPos.add(c)
    }
  }
  tally(rows, poolKeys)
  const counts = new Map()
  tally(countRows || rows, counts)
  const out = []
  const push = (key, kind, seg = 'pos') => {
    if (out.some((o) => o.key === key)) return
    out.push({ key, kind, seg, label: key, count: counts.get(key) || 0, title: spec.words[key] || (kind === 'role' ? 'Where TUDDY\u2019s depth chart puts him this week. A label, not a forecast.' : key) })
  }
  // a group is offered when two of its members are on the page, or when its own key is a word the data uses (the
  // league's generic OF, ESPN's generic G and F): then it is real on its own
  const groupOn = (g) => g.members.filter((m) => poolPos.has(m)).length >= 2 || poolPos.has(g.key)
  for (const k of spec.order) {
    const g = spec.groups.find((x) => x.key === k)
    if (g) { if (groupOn(g)) push(k, 'group') } else if (poolKeys.has(k)) push(k, 'pos')
  }
  for (const g of spec.groups) if (groupOn(g)) push(g.key, 'group', 'group')   // groups the order does not place come after the positions
  const known = new Set([...spec.order, ...gset])
  for (const k of [...poolPos].sort()) if (!known.has(k) && !out.some((o) => o.key === k)) push(k, 'pos')
  // PENDING: a position the week's file HAS but the model does not score on this board yet (TUDDY QBs on Anytime TD).
  // Offered with 0 and the page's own sentence as its tooltip, so it can be chosen and the empty state can say why.
  for (const [k, note] of Object.entries(pending || {})) if (!poolKeys.has(k)) { push(k, 'pos'); const o = out.find((x) => x.key === k); if (o) { o.pending = true; o.title = note } }
  for (const k of extraOrder) if (poolKeys.has(k)) push(k, 'role', 'role')
  for (const k of selected) if (!out.some((o) => o.key === k)) push(k, extraOrder.includes(k) ? 'role' : gset.has(k) ? 'group' : 'pos', extraOrder.includes(k) ? 'role' : 'pos')
  return out
}

/** Does the row clear the selection? An empty selection clears everyone. */
export function rowMatches(sport, row, sel, { posOf, extraOf = null }) {
  if (!sel || !sel.length) return true
  const c = canonPos(sport, posOf(row))
  const have = new Set([...keysFor(sport, c), ...(extraOf ? extraOf(row) || [] : [])])
  return sel.some((k) => have.has(k))
}

/** `pos=` value -> keys. Tolerant of a hand-edited address: upper-cased, trimmed, de-duplicated, short words only. */
export function parsePos(str) {
  const out = []
  for (const part of String(str || '').split(',')) {
    const k = part.trim().toUpperCase()
    if (/^[A-Z0-9]{1,6}$/.test(k) && !out.includes(k)) out.push(k)
    if (out.length >= 12) break
  }
  return out
}
export const serializePos = (sel) => (sel || []).join(',')

/** 'RB, WR' for a sentence. */
export const posWords = (sel) => (sel || []).join(', ')

/** The empty-state sentence: 'No RB on the board with these filters.' */
export function emptySentence(sel, noun = 'player') {
  const s = sel || []
  return s.length ? `No ${posWords(s)} on the board with these filters.` : `No ${noun}s on the board with these filters.`
}

/**
 * Board ranks over a WHOLE pool, never over a filtered list: Map(keyOf(row) -> 1-based rank), best first. Equal
 * scores keep the pool's own order (a stable sort), so a filtered subset sorted the same way keeps the same numbers.
 * Filtering hides rows; it does not renumber them.
 */
export function overallRanks(pool, keyOf, scoreOf) {
  const sorted = [...(pool || [])].sort((a, b) => (Number(scoreOf(b)) || 0) - (Number(scoreOf(a)) || 0))
  const m = new Map()
  sorted.forEach((r, i) => { const k = keyOf(r); if (!m.has(k)) m.set(k, i + 1) })
  return m
}
