'use client'
// WHICH PRODUCTS THIS VISITOR MAY SEE (2026-10-02). The public ones (lib/routes
// SPORT_KEYS), plus a hidden one once its own access route says yes -- BUCKETS
// asks /api/buckets/access (lib/nba/gate.js), once per page load. Until the
// answer arrives a hidden product is not shown: nothing flashes and vanishes.
import { useEffect, useState } from 'react'
import { ALL_SPORT_KEYS, SPORT_KEYS, isHiddenSport } from './routes'

const ACCESS = { nba: '/api/buckets/access' }
const cache = new Map()   // sport -> Promise<{ open, early }>, once per page load
function answer(sport) {
  if (!ACCESS[sport]) return Promise.resolve({ open: false, early: false })
  if (!cache.has(sport)) cache.set(sport, fetch(ACCESS[sport], { cache: 'no-store', credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((j) => ({ open: Boolean(j?.open), early: Boolean(j?.open && j?.early) })).catch(() => ({ open: false, early: false })))
  return cache.get(sport)
}
export function canSee(sport) {
  if (!isHiddenSport(sport)) return Promise.resolve(true)
  return answer(sport).then((a) => a.open)
}
// EARLY ACCESS (2026-10-12): true only when the server says this visitor holds an early-access grant for the hidden product (an admin or a public product: false).
export function isEarly(sport) {
  if (!isHiddenSport(sport)) return Promise.resolve(false)
  return answer(sport).then((a) => a.early)
}

/** The sport keys this visitor may see, in registry order. */
export function useVisibleSports() {
  const [open, setOpen] = useState({})
  useEffect(() => {
    let alive = true
    for (const k of ALL_SPORT_KEYS.filter(isHiddenSport)) canSee(k).then((v) => { if (alive && v) setOpen((o) => ({ ...o, [k]: true })) })
    return () => { alive = false }
  }, [])
  return ALL_SPORT_KEYS.filter((k) => SPORT_KEYS.includes(k) || open[k])
}

/** One hidden product: null while asking, then true / false. */
export function useCanSee(sport) {
  const [v, setV] = useState(isHiddenSport(sport) ? null : true)
  useEffect(() => { let alive = true; canSee(sport).then((x) => { if (alive) setV(x) }); return () => { alive = false } }, [sport])
  return v
}

/**
 * May THIS visitor use a feature of this sport (the Ledger / Watchlist / 📸 / Cards chips and the data they fetch)? A public sport: yes at once. A hidden one
 * (BUCKETS): only after its access route says yes (admin, an early-access grant, or the public switch), so a holder gets the same chips every other sport has
 * and a visitor without access gets none. null while asking (draw nothing, then fill in): never a flash. Use `=== true`.
 */
export function useSportOpen(sport) {
  return useCanSee(sport)
}

/** True when this visitor sees a hidden product through an EARLY-ACCESS grant (the quiet tag). False while asking, and for admins and public products. */
export function useEarly(sport) {
  const [v, setV] = useState(false)
  useEffect(() => { let alive = true; isEarly(sport).then((x) => { if (alive) setV(x) }); return () => { alive = false } }, [sport])
  return v
}
