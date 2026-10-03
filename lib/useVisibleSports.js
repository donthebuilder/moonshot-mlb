'use client'
// WHICH PRODUCTS THIS VISITOR MAY SEE (2026-10-02). The public ones (lib/routes
// SPORT_KEYS), plus a hidden one once its own access route says yes -- BUCKETS
// asks /api/buckets/access (lib/nba/gate.js), once per page load. Until the
// answer arrives a hidden product is not shown: nothing flashes and vanishes.
import { useEffect, useState } from 'react'
import { ALL_SPORT_KEYS, SPORT_KEYS, isHiddenSport } from './routes'

const ACCESS = { nba: '/api/buckets/access' }
const cache = new Map()   // sport -> Promise<boolean>, once per page load
export function canSee(sport) {
  if (!isHiddenSport(sport)) return Promise.resolve(true)
  if (!ACCESS[sport]) return Promise.resolve(false)
  if (!cache.has(sport)) cache.set(sport, fetch(ACCESS[sport], { cache: 'no-store', credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((j) => Boolean(j?.open)).catch(() => false))
  return cache.get(sport)
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
