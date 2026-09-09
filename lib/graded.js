// ONE ROW PER PLAYER OUT OF THE GRADED FILE.
//
// WHY THIS EXISTS — the bug it keeps fixing.
//
// results_live.json / graded_results_YYYY-MM-DD.json publish ONE ROW PER PICK
// CATEGORY, not one row per player. A hitter the bot designates in two
// categories (TOP *and* HR is the common one) gets TWO graded slots, and both
// carry the SAME actual line: same actual_hr, same actual_hits, same
// actual_tb. That is correct for the file — each row is a pick being graded
// against its own bar — and it is a trap for every consumer that walks the
// slots and aggregates PER PLAYER:
//
//   · counting homers            → his one homer counted twice, night total inflated
//   · counting flagged slots     → his ⭐ counted twice, every flag's rate skewed
//   · Map.set(pid, row)          → last category silently wins, first is lost
//   · a per-player streak/history → one night becomes two entries in the sequence
//
// It has now caused bugs in at least three components (the homer ledger's
// night total, the storyline tracker's ✅ join, the slate diff's category
// changes), which is why the rule lives in one place instead of being
// re-derived at each call site.
//
// THE RULE: one row per player_id, carrying the MAX of every actual_* field
// across his rows. Max rather than first-wins because the two rows are only
// *supposed* to be identical — mid-grading, one category can be a step ahead
// of the other, and the higher number is the one that already happened.
//
// WHAT THIS IS NOT FOR: anything aggregating PER CATEGORY. Category hit rates,
// the pick scorecard, the per-tier tables, "how many HR picks cleared" — those
// are questions about picks, and a player picked twice genuinely is two picks.
// Dedupe when the subject of the sentence is a PLAYER; don't when it's a PICK.

const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }

// Fields merged by max. actual_* is the whole outcome line; the got_*/is_final
// flags are outcome facts too and are 0/1, so max is a logical OR on them.
const MAX_FIELDS = [
  'actual_hr', 'actual_hits', 'actual_ab', 'actual_tb', 'actual_rbi', 'actual_runs',
  'actual_bb', 'actual_so', 'actual_pa', 'actual_doubles', 'actual_triples', 'hrr_total',
  'got_hr', 'got_base_hit', 'got_xbh', 'is_final',
]

// Pull the slot array off whatever shape the payload arrived in.
export function gradedSlots(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.graded_slots)) return payload.graded_slots
  if (Array.isArray(payload?.results)) return payload.results
  return []
}

// → one row per player_id, in first-seen order, with the max of every actual_*
// field. Rows with no player_id can't be joined to anything and are passed
// through individually rather than collapsed into one anonymous bucket.
export function dedupeGraded(slots) {
  const list = Array.isArray(slots) ? slots : gradedSlots(slots)
  const byPid = new Map()
  const out = []
  list.forEach((s) => {
    if (!s || typeof s !== 'object') return
    const pid = Number(s.player_id)
    if (!Number.isFinite(pid) || !pid) { out.push(s); return }
    const prev = byPid.get(pid)
    if (!prev) {
      const copy = { ...s }
      byPid.set(pid, copy)
      out.push(copy)
      return
    }
    MAX_FIELDS.forEach((k) => {
      if (s[k] == null && prev[k] == null) return
      prev[k] = Math.max(num(prev[k]), num(s[k]))
    })
    // Category-specific fields are UNIONED, first non-null wins. The rows are
    // not interchangeable: top_beat_game only rides on the TOP row, so if his
    // HR row happened to come first, a naive first-wins merge would delete the
    // only field that grades the TOP designation. Filling blanks can't
    // overwrite anything the base row already said.
    Object.keys(s).forEach((k) => {
      if (prev[k] === undefined || prev[k] === null) prev[k] = s[k]
    })
  })
  return out
}

// The same thing, keyed for lookup: Map<player_id (number), merged row>.
// Rows with no player_id are dropped here — they have no key to be found by.
export function gradedByPid(slots) {
  const m = new Map()
  dedupeGraded(slots).forEach((s) => {
    const pid = Number(s?.player_id)
    if (Number.isFinite(pid) && pid) m.set(pid, s)
  })
  return m
}
