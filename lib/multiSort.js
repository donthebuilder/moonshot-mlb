// MULTI-SORT AS TIERS (2026-10-07, Donovan: "the second sort should rank WITHIN
// the first sort's top group, not just replace it").
//
// A sort stack is an ordered list of { key, dir }. With ONE key nothing here
// changes anything: the rows go in raw value order, exactly as before. With
// two or more, every key but the last makes TIERS and only the last key orders
// by raw value:
//
//   1st key  -> three tiers: the top ~20% (the cells that glow at rest), the
//               middle, the bottom ~20% (the cells that recede). A column may
//               name its own tier edges with `tiers: [50, 40]` (lower bounds,
//               highest first) -- e.g. a score where 50+ is the group.
//   2nd key  -> orders inside each tier of the 1st (and, if there is a 3rd,
//               makes tiers again inside that tier), and so on.
//   last key -> raw order inside the innermost tier.
//
// A text column's tier is its own value (every team is a tier). A blank value
// always sinks below every tier, whichever way the column points.
//
// Pure functions, no React: scripts/test-multisort.mjs exercises them with TEST data.

export const TIER_SHARE = 0.2

export const isBlank = (v) => v === null || v === undefined || v === '' || v === '—'

const asNum = (v) => (isBlank(v) ? NaN : Number(v))

/** The value at quantile q of an ascending list. */
const at = (sortedNums, q) => sortedNums[Math.min(sortedNums.length - 1, Math.max(0, Math.floor(q * (sortedNums.length - 1))))]

/**
 * tierFn(values, col) -> (value) => tier number (bigger = higher values) or null when blank.
 * Numeric columns get lower-bound edges; anything else is its own tier (the string).
 */
export function tierFn(values, col = {}) {
  const nums = values.map(asNum).filter(Number.isFinite)
  const numeric = nums.length > 0 && nums.length >= values.filter((v) => !isBlank(v)).length * 0.6
  if (!numeric) return (v) => (isBlank(v) ? null : String(v))
  let edges = null
  if (Array.isArray(col.tiers) && col.tiers.length) {
    edges = [...col.tiers].map(Number).filter(Number.isFinite).sort((a, b) => a - b)   // ascending lower bounds
  } else {
    const s = [...nums].sort((a, b) => a - b)
    // too few rows or too few distinct values to call a top and a bottom: each value is its own tier
    if (s.length < 6 || new Set(s).size < 4) return (v) => (isBlank(v) ? null : Number(v))
    const lo = at(s, TIER_SHARE), hi = at(s, 1 - TIER_SHARE)
    edges = hi > lo ? [lo, hi] : null
    if (!edges) return (v) => (isBlank(v) ? null : Number(v))
    // a value AT the low edge is in the middle, a value at the high edge is in the top (the same cut v2's standouts use)
    return (v) => {
      if (isBlank(v)) return null
      const n = Number(v)
      if (!Number.isFinite(n)) return null
      return n >= edges[1] ? 2 : n <= edges[0] ? 0 : 1
    }
  }
  return (v) => {
    if (isBlank(v)) return null
    const n = Number(v)
    if (!Number.isFinite(n)) return null
    let t = 0
    for (const e of edges) if (n >= e) t += 1
    return t
  }
}

/**
 * Build the row comparator for a sort stack.
 *   sort    [{ key, dir: 'desc' | 'asc' }]
 *   rows    every row being sorted (the tier edges come from these)
 *   colOf   key -> column definition (for `tiers`), may return undefined
 * Returns { compare, tierSig } -- tierSig(row) is the string of tiers a row sits
 * in (empty for a single sort), so the table can draw a rule where it changes.
 */
export function buildSorter(sort, rows, colOf = () => undefined) {
  const stack = Array.isArray(sort) ? sort.filter((s) => s && s.key != null) : []
  const last = stack.length - 1
  const tiersOf = stack.map((s, i) => (i < last ? tierFn(rows.map((r) => r[s.key]), colOf(s.key) || {}) : null))
  const cmpTier = (a, b, dir) => {
    // blanks last, always
    if (a === null && b === null) return 0
    if (a === null) return 1
    if (b === null) return -1
    const mul = dir === 'desc' ? -1 : 1
    if (typeof a === 'number' && typeof b === 'number') return (a - b) * mul
    return String(a).localeCompare(String(b)) * mul
  }
  const cmpRaw = (av, bv, dir) => {
    const ab = isBlank(av), bb = isBlank(bv)
    if (ab && bb) return 0
    if (ab) return 1
    if (bb) return -1
    const mul = dir === 'desc' ? -1 : 1
    const an = Number(av), bn = Number(bv)
    if (Number.isFinite(an) && Number.isFinite(bn)) return (an - bn) * mul
    return String(av).localeCompare(String(bv)) * mul
  }
  const compare = (a, b) => {
    for (let i = 0; i < stack.length; i += 1) {
      const { key, dir } = stack[i]
      const r = i < last ? cmpTier(tiersOf[i](a[key]), tiersOf[i](b[key]), dir) : cmpRaw(a[key], b[key], dir)
      if (r !== 0) return r
    }
    return 0
  }
  const tierSig = (row) => (last <= 0 ? '' : stack.slice(0, last).map((s, i) => String(tiersOf[i](row[s.key]))).join('|'))
  return { compare, tierSig }
}

/**
 * One header tap on a sort stack.
 *   extend false  a plain tap: this column alone (flip it if it is already the only one)
 *   extend true   a tap that builds the chain: add it as the next tier; on a column
 *                 already in the chain, desc -> asc -> out
 * A plain tap on the head of a longer chain starts over with that column (the reset the page also offers).
 */
export function nextSort(stack, key, extend) {
  const s = Array.isArray(stack) ? stack : []
  const i = s.findIndex((x) => x.key === key)
  if (!extend) {
    if (i === 0 && s.length === 1) return [{ key, dir: s[0].dir === 'desc' ? 'asc' : 'desc' }]
    return [{ key, dir: 'desc' }]
  }
  if (i < 0) return [...s, { key, dir: 'desc' }]
  const next = [...s]
  if (next[i].dir === 'desc') { next[i] = { key, dir: 'asc' }; return next }
  next.splice(i, 1)
  return next
}

/** The chain in the address: "adj.d,a5.a". Keys that are not in `valid` are dropped. */
export function encodeSort(stack) {
  return (Array.isArray(stack) ? stack : []).map((s) => `${s.key}.${s.dir === 'asc' ? 'a' : 'd'}`).join(',')
}
export function decodeSort(text, valid = null) {
  const out = []
  for (const part of String(text || '').split(',')) {
    const m = /^(.+)\.([ad])$/.exec(part.trim())
    if (!m) continue
    if (valid && !valid.has(m[1])) continue
    if (out.some((x) => x.key === m[1])) continue
    out.push({ key: m[1], dir: m[2] === 'a' ? 'asc' : 'desc' })
  }
  return out
}
