// KEEP A LOADED READ IN MEMORY FOR A WHILE (2026-10-26, Supabase usage check items A-E).
//
// The pages in SUPABASE-USAGE-2026-10-26.txt re-read history that does not change during the day (finished games, past seasons, locked
// prices) once per query-string variant per edge region. memoLoad() keeps the loaded rows in THIS server instance for `ttlMs` and hands
// the same rows to everyone who asks, then each caller builds its own answer from them. It changes how often the database is read,
// never what a visitor sees.
//
//   const rows = await memoLoad('mlb-openings:2026:2,3', 30 * 60_000, () => readRows(db, 2026, [2, 3]))
//
// Rules it keeps:
//  - One read at a time per key: callers that arrive while it loads share that read (no stampede on a cold instance).
//  - A failed read is never cached. If there is an older good copy it is served and the error is logged, and the next try is a minute
//    later; with no older copy the error goes to the caller exactly as before.
//  - The returned value is SHARED. Callers must not change it (copy before sorting, as the openings aggregators do).
//  - Bounded: at most MAX_KEYS keys, the oldest dropped first. Keys must come from a small fixed set (season, sport, part), never from
//    free text in the URL.
// Per instance only: a new or cold instance reads once, then serves from memory. Nothing is written anywhere.

const MAX_KEYS = 64
const RETRY_AFTER_ERROR_MS = 60_000
const store = new Map()   // key -> { at, v, has, p }

export async function memoLoad(key, ttlMs, load) {
  const now = Date.now()
  const hit = store.get(key)
  if (hit?.has && now - hit.at < ttlMs) return hit.v
  if (hit?.p) return hit.p   // a read is already running for this key: share it

  const p = (async () => {
    try {
      const v = await load()
      store.delete(key)   // re-insert so the Map keeps oldest-first order
      store.set(key, { at: Date.now(), v, has: true, p: null })
      while (store.size > MAX_KEYS) store.delete(store.keys().next().value)
      return v
    } catch (e) {
      if (hit?.has) {
        console.error(`[memoLoad] ${key}: reload failed, serving the last good copy (${e?.message || e})`)
        store.set(key, { at: Date.now() - ttlMs + RETRY_AFTER_ERROR_MS, v: hit.v, has: true, p: null })
        return hit.v
      }
      store.delete(key)
      throw e
    }
  })()
  store.set(key, { at: hit?.at ?? 0, v: hit?.v, has: Boolean(hit?.has), p })
  return p
}

/** Test hook and manual reset: drop one key, or everything. */
export function forgetMemo(key) { if (key == null) store.clear(); else store.delete(key) }
