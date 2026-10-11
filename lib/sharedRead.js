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
