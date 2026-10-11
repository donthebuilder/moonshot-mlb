
// ── ONE COLUMN-SET SWITCH FOR EVERY SPORT'S STAT TABLES (Wave 4, 2026-10-11) ──
// MOONSHOT's Rankings has had All / What I read / Short list since 10-07 (lib/boardColumns.js
// COLUMN_VIEWS, `cols=` in the address). TUDDY, LAMP and BUCKETS get the same three sets, built
// once here instead of three times:
//
//   lean  "Short list"   the key columns: who, the score, the why, the status word, a rate or two.
//                        The default on a phone.
//   read  "What I read"  lean plus the analyst set: the parts of the score, the form, the price.
//   all   "All"          every column the table has (the full set of lib/boardColumns.js,
//                        lib/nfl/boardColumns.js, lib/nhl/boardColumns.js). The default on a desktop.
//
// A column says which set it first appears in with `cset: 'lean' | 'read'`; no tag = All only. So
// lean is a subset of read, which is a subset of all, by construction (`applyColumnSet` keeps a
// column when its tag is at or below the chosen set). Identity columns (the sticky name, rank, club,
// opponent, the star, the status word) are in every set. Nothing is removed from a table: All is
// the table as it was. Every column keeps its own `group`; hiding columns never re-groups.
//
// The choice rides the address as `cols=lean|read|all` (Back and shared links restore it), and is
// remembered per device and per sport in localStorage (try/catch: private mode just forgets).
// MOONSHOT's own control is left as it is; it reads the same `cols=` values.

export const COLUMN_SETS = [
  { key: 'lean', label: 'Short list', title: 'The key columns: the score, why, the status word and a rate or two' },
  { key: 'read', label: 'What I read', title: 'The short list plus the columns I read: the parts of the score, form, the price' },
  { key: 'all', label: 'All', title: 'Every column the table has, in its group' },
]
const RANK = { lean: 0, read: 1, all: 2 }
export const columnSetKey = (v) => (v === 'lean' || v === 'read' || v === 'all' ? v : null)

const IDENTITY_KEYS = new Set(['rank', 'nightRank', 'name', 'pos', 'team', 'tm', 'opp', 'oppTxt', 'watched', 'game'])
/** a column every set keeps: the row's identity, its star, its status word */
export const isIdentityColumn = (c) => Boolean(c && (c.sticky || c.action || c.fold || c.teamMark || c.subOnly || c.statusCol || IDENTITY_KEYS.has(c.key)))

/** columns -> the columns of one set. `all` (or no set) returns the input untouched. */
export function applyColumnSet(columns, set) {
  const k = columnSetKey(set)
  if (!Array.isArray(columns) || !k || k === 'all') return columns
  return columns.filter((c) => isIdentityColumn(c) || (c.cset != null && RANK[c.cset] != null && RANK[c.cset] <= RANK[k]))
}

/** does this table carry any set tag (so a switch means something)? */
export const hasColumnSets = (columns) => Array.isArray(columns) && columns.some((c) => c && (c.cset === 'lean' || c.cset === 'read'))

/** tag columns by key without rewriting their definitions: { lean: [...keys], read: [...keys] }. A column that already says `cset` keeps it. */
export function tagColumnSets(columns, { lean = [], read = [] } = {}) {
  const L = new Set(lean), R = new Set(read)
  return columns.map((c) => (c.cset ? c : L.has(c.key) ? { ...c, cset: 'lean' } : R.has(c.key) ? { ...c, cset: 'read' } : c))
}
