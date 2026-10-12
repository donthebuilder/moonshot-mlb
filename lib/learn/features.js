// PICK-TIME FEATURES ONLY (2026-10-12, accuracy loop). Pure.
//
// The loop learns from what the model KNEW when it locked, never from what happened. Two guards live here so
// no adapter can get around them:
//   1. a row counts only if its lock stamp is BEFORE the start (first pitch / kickoff / puck drop): sanitizeRows
//   2. a feature is a number under the stored pregame blocks (legs / pct / context / components / scores);
//      a key that names an outcome is dropped even if an adapter hands it in: numericFeatures
//
// A LearnRow (what every adapter in lib/learn/rows/ returns):
//   { sport, market, unit, date, id, name, team, opp, version, status, produced, score, features, lockedAt, startAt }
//   unit      the sortable grading unit: a night ('2026-10-05') or an NFL week ('2026-w05')
//   date      the game's own date, YYYY-MM-DD (the week key for rolling-by-week)
//   status    'called' | 'board' | 'off' -- from lib/callStatus, never re-derived here
//   produced  true when he cleared the market's bar (the grader's own word)

// keys that are results (or ids), never inputs. Anchored: `recent_hard_hit_rate` is an input, `hit` is a result.
const OUTCOME_KEY = /^(goals?|hit|hits|value|actual|dressed|graded|graded_at|result|outcome|went_yard|home_runs?|runs|rbi|total_bases|tds?|points?|assists?|void|is_final|line_hit|line_hit_.*)$/i
const ID_KEY = /(^|_)(season|id|pk)$|^(curSeason|prevSeason|gamePk|playerId)$/i

// keys that ARE the selection (how a row came to be called) or the model's own answer: comparing the called set on
// them just reads the call rule back. Dropped from every comparison; the model's `score` rides on the row, not in features.
const SELECTION_KEY = /^(rank|rank_in_game|nightRank|night_rank|slot|role|tier|score|probability)$|probab|^scores?\./i
export const isSelectionKey = (k) => SELECTION_KEY.test(String(k))
export const isOutcomeKey = (k) => OUTCOME_KEY.test(String(k))
export const isIdKey = (k) => ID_KEY.test(String(k))

/**
 * Flatten pregame blocks into { name: number }. `blocks` is an array of [prefix, object]; a boolean becomes 0/1;
 * strings, nulls, arrays and nested objects are skipped. A key naming an outcome or an id is dropped.
 */
export function numericFeatures(blocks) {
  const out = {}
  for (const [prefix, obj] of blocks || []) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) continue
    for (const [k, v] of Object.entries(obj)) {
      if (isOutcomeKey(k) || isIdKey(k)) continue
      const x = typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'number' ? v : null
      if (x == null || !Number.isFinite(x)) continue
      out[prefix ? `${prefix}.${k}` : k] = x
    }
  }
  return out
}

/** True when the lock stamp is strictly before the start. */
export const isPregame = (row) => Number.isFinite(row?.lockedAt) && Number.isFinite(row?.startAt) && row.lockedAt < row.startAt

/** Keep the pregame rows, count the rest. Also strips any outcome-named key an adapter let through. */
export function sanitizeRows(rows) {
  const keep = []
  let late = 0
  for (const r of rows || []) {
    if (!isPregame(r)) { late += 1; continue }
    const f = {}
    for (const [k, v] of Object.entries(r.features || {})) {
      const base = k.includes('.') ? k.split('.').pop() : k
      if (!isOutcomeKey(base) && !isSelectionKey(base) && !isSelectionKey(k) && Number.isFinite(v)) f[k] = v
    }
    keep.push({ ...r, features: f })
  }
  return { rows: keep, lateExcluded: late }
}

/** Every feature name present in at least `minShare` of the rows (a feature a model only sometimes stores is not compared). */
export function featureNames(rows, minShare = 0.5) {
  const seen = new Map()
  for (const r of rows) for (const k of Object.keys(r.features || {})) seen.set(k, (seen.get(k) || 0) + 1)
  return [...seen.entries()].filter(([, c]) => c >= minShare * rows.length).map(([k]) => k).sort()
}
