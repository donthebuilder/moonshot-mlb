'use client'
// HOW MANY CARDS ARE NEW IN MY BINDER (the NEW badge on the Binder entry in the More drawer and on the Watchlist link).
// One read, only when `active` (the drawer is open, or the watchlist is on screen): the cards of the players I follow (/api/card/binder, kept five minutes on the CDN),
// compared with the cards I have already seen (localStorage, lib/cards/binder.js SEEN_KEY: works signed out). Kept ten minutes in sessionStorage so opening the drawer
// again does not ask again. No polling, no timer. The FIRST visit has nothing to compare with, so nothing is NEW. STAR cards and up only: a plain goal never raises the badge.
import { useEffect, useState } from 'react'
import { useFollowing } from '../../lib/dash/follow'
import { SEEN_KEY, parseSeen, newCount } from '../../lib/cards/binder'

const MEMO = 'dash_binder_new_v1'
const TTL = 10 * 60e3

export default function useBinderNew(active = true) {
  const fol = useFollowing(null)
  const [n, setN] = useState(0)
  const follows = fol.rows.filter((r) => ['mlb', 'nhl', 'nfl'].includes(r.sport)).slice(0, 40).map((r) => `${r.sport}:${r.id}`).sort().join(',')
  useEffect(() => {
    if (!active || !follows) { setN(0); return undefined }
    let on = true
    const seen = (() => { try { return parseSeen(localStorage.getItem(SEEN_KEY)) } catch { return null } })()
    if (!seen) { setN(0); return undefined }
    const count = (cards) => newCount(cards, seen, { minTier: 'star' })
    try {
      const m = JSON.parse(sessionStorage.getItem(MEMO) || 'null')
      if (m && m.follows === follows && Date.now() - m.at < TTL && Array.isArray(m.cards)) { setN(count(m.cards)); return undefined }
    } catch { /* no memo */ }
    fetch(`/api/card/binder?follows=${encodeURIComponent(follows)}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!on || !j) return
      const cards = (j.cards || []).filter((c) => c.tier !== 'base').map((c) => ({ moment: c.moment, id: c.id, tier: c.tier }))
      try { sessionStorage.setItem(MEMO, JSON.stringify({ at: Date.now(), follows, cards })) } catch { /* ignore */ }
      setN(count(cards))
    }).catch(() => {})
    return () => { on = false }
  }, [active, follows])
  return n
}
