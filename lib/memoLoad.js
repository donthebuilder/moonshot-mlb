// KEEP A LOADED READ IN MEMORY FOR A WHILE (2026-10-26, Supabase usage check items A-E).
//
// The pages in SUPABASE-USAGE-2026-10-26.txt re-read history that does not change during the day (finished games, past seasons, locked
// prices) once per query-string variant per edge region. memoLoad() keeps the loaded rows in THIS server instance for `ttlMs` and hands
// the same rows to everyone who asks, then each caller builds its own answer from them. It changes how often the database is read,
// never what a visitor sees.
//
//   const rows = await memoLoad('mlb-openings:2026:2,3', 30 * 60_000, () => readRows(db, 2026, [2, 3]))
//   const night = await memoLoad(`settled:${table}:${d}`, 6 * 3600_000, () => readNight(d), { cost: (rows) => rows.length })
//
// WHY MEMORY AND NOT Next's unstable_cache: Next skips the READ of an unstable_cache that runs inside another unstable_cache's function
// (node_modules/next/dist/server/web/spec-extension/unstable-cache.js, `isNestedUnstableCache`), and /api/card, /api/record/calls and the
// network pulse each wrap their whole build in one. Edge logs, 24 h to 10-26: the "cached for a week" past-night reads ran thousands of
// times. Memory does not care who is calling.
//
// Rules it keeps:
//  - One read at a time per key: callers that arrive while it loads share that read (no stampede on a cold instance).
//  - A failed read is never cached. If there is an older good copy it is served and the error is logged, and the next try is a minute
//    later; with no older copy the error goes to the caller exactly as before.
//  - The returned value is SHARED. Callers must not change it (copy before sorting, as the openings aggregators do).
//  - Bounded two ways, the oldest dropped first: at most MAX_KEYS keys, and at most MAX_COST in total of the `cost` the callers declare
//    (rows, for a table read; a key with no `cost` counts 0). Keys must come from a small fixed set (season, sport, part) or from dates
//    the code itself derived (a lock night), never from free text in the URL. Every sport-night of lock prices is a key (61 on 10-26), and
//    so is every settled night of a record table per filter variant (a season of two sports is ~1,500), which is why the key cap is 2048
//    and not 64: the row budget, not the key count, is what guards memory. An entry bigger than the whole budget is simply not kept.
// Per instance only: a new or cold instance reads once, then serves from memory. Nothing is written anywhere.

const MAX_KEYS = 2048
const MAX_COST = 250_000   // rows held by entries that declare a cost (~0.5 KB a row in memory: ~125 MB at the ceiling)
const RETRY_AFTER_ERROR_MS = 60_000
const store = new Map()   // key -> { at, v, has, p, cost }
let totalCost = 0

function put(key, entry) {
  const old = store.get(key)
  if (old) totalCost -= old.cost
  store.delete(key)   // delete then set keeps the Map in oldest-first order
  store.set(key, entry)
  totalCost += entry.cost
}
function drop(key) {
  const old = store.get(key)
  if (!old) return
  totalCost -= old.cost
  store.delete(key)
}
function trim() {
  for (const [k, e] of store) {
    if (store.size <= MAX_KEYS && totalCost <= MAX_COST) break
    if (!e.p) drop(k)   // a read in flight is never dropped: its callers are waiting on it
  }
}

export async function memoLoad(key, ttlMs, load, { cost } = {}) {
  const now = Date.now()
  const hit = store.get(key)
  if (hit?.has && now - hit.at < ttlMs) return hit.v
  if (hit?.p) return hit.p   // a read is already running for this key: share it

  // the load starts on a microtask, so the in-flight marker below is always in the Map before it can finish or fail
  const p = Promise.resolve().then(load).then(
    (v) => {
      const c = cost ? cost(v) : 0
      if (c > MAX_COST) { drop(key); return v }   // bigger than the whole budget: hand it back, keep nothing, push nothing else out
      put(key, { at: Date.now(), v, has: true, p: null, cost: Number.isFinite(c) && c > 0 ? c : 0 })
      trim()
      return v
    },
    (e) => {
      if (hit?.has) {
        console.error(`[memoLoad] ${key}: reload failed, serving the last good copy (${e?.message || e})`)
        put(key, { at: Date.now() - ttlMs + RETRY_AFTER_ERROR_MS, v: hit.v, has: true, p: null, cost: hit.cost })
        return hit.v
      }
      drop(key)
      throw e
    },
  )
  put(key, { at: hit?.at ?? 0, v: hit?.v, has: Boolean(hit?.has), p, cost: hit?.cost || 0 })
  return p
}

/** Test hook and manual reset: drop one key, or everything. */
export function forgetMemo(key) { if (key == null) { store.clear(); totalCost = 0 } else drop(key) }
