// ONE READ FOR TWO READERS (2026-10-10, Wave 3 data diet).
//   sharedRead(key, run, ttlMs = 2000) -> Promise
// Two components on one page that ask for the same file each used to make their own request. Readers that ask for the same key
// while the first is in flight, or within `ttlMs` of it landing, share that one answer. Same rule as lib/useLiveFetch.js getJSON,
// for the readers that are not LAMP routes. The answer is read-only for its callers (each one only picks fields off it); a failed
// read is forgotten at once, so the next caller asks again.
const hits = new Map() // key -> { p: Promise, at: number|null }

export function sharedRead(key, run, ttlMs = 2000) {
  const hit = hits.get(key)
  if (hit && (hit.at == null || Date.now() - hit.at < ttlMs)) return hit.p
  const entry = { p: null, at: null }
  entry.p = Promise.resolve().then(run).then(
    (v) => { entry.at = Date.now(); return v },
    (e) => { if (hits.get(key) === entry) hits.delete(key); throw e },
  )
  hits.set(key, entry)
  return entry.p
}

/** GET a JSON route once for every reader on the page: the parsed body, or null when it is not ok or not there. */
export const sharedJSON = (url) => sharedRead(url, () => fetch(url).then((r) => (r.ok ? r.json() : null)))

/** fetch() for readers that ask for the same URL in the same beat (2026-10-13, speed batch). While the first request is
 *  in flight, a second caller gets a clone of the SAME response instead of making its own request; the moment it lands the
 *  entry is forgotten (no cache, no TTL), so a later read asks again exactly as a plain fetch would. Each caller gets its
 *  own Response (clone), so `.ok`, `.json()` and `.text()` behave as ever. What it removes: React StrictMode's second
 *  effect run in `next dev` (a 959 KB graded night read twice) and two components asking for one file together. */
const flying = new Map() // `${url}|${cache}` -> Promise<Response>
export function sharedFetch(url, init = {}) {
  // a cache-busting `t=<ms>` differs between two callers in the same beat; it is not part of the question being asked
  const key = `${String(url).replace(/([?&])t=[0-9]+/, '$1t')}|${init.cache || ''}`
  let p = flying.get(key)
  if (!p) {
    p = fetch(url, init)
    flying.set(key, p)
    const done = () => { if (flying.get(key) === p) flying.delete(key) }
    p.then(done, done)
  }
  return p.then((r) => r.clone())
}
