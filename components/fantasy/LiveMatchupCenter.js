'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import LocalTime from './LocalTime'
// fantasy.module.css is a CSS *module* — class names are hashed at build
// time, so the plain string classNames this component used to render
// ("liveMatchupControl") matched nothing. The section shipped completely
// unstyled: default browser button, no spacing between the GAME CENTER
// kicker and the headline. Import the module and use its exports.
import styles from '../../app/fantasy/fantasy.module.css'

// EGRESS (2026-09-24). This used to POST a full scoring sync AND re-render
// the whole Matchup page (every starter in the league, four weeks of stats,
// an Auth check) every 30 s per open tab, all Sunday -- the likely source of
// the game-day spikes on the Supabase usage chart. Now it asks every 60 s,
// the server starts a real sync at most every 2 minutes (route.js
// MEMBER_SYNC_MIN_MS), and the page only re-renders when that answer says the
// scores are newer than the ones on screen. The button always re-renders.
// LIVE ON YOUR TAP (2026-10-03, the network rule from 10-02: "live in game
// based on personal refresh"). The 60 s auto-ask is gone, as the other
// products' timers went: the scores update when you tap Refresh, and the
// server still starts a real sync at most every 2 minutes however often
// anyone taps. One request per tap, not one a minute per open tab all Sunday.
const newer = (a, b) => Boolean(a) && (!b || new Date(a).getTime() > new Date(b).getTime())

export default function LiveMatchupCenter({ leagueId, live, lastUpdated }) {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)
  const busy = useRef(false)
  const shown = useRef(lastUpdated || null)
  useEffect(() => { shown.current = lastUpdated || null }, [lastUpdated])

  const refresh = useCallback(async ({ force = false } = {}) => {
    if (busy.current) return
    busy.current = true
    setRefreshing(true)
    try {
      const res = await fetch(`/api/fantasy/scoring?leagueId=${encodeURIComponent(leagueId)}`, { method: 'POST', cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (force || newer(body?.completedAt, shown.current)) {
        if (body?.completedAt) shown.current = body.completedAt
        router.refresh()
      }
    } finally {
      busy.current = false
      setRefreshing(false)
    }
  }, [leagueId, router])

  // A tab that comes back to the foreground during a live game asks once --
  // the moment it is looked at again, not on a clock.
  useEffect(() => {
    if (!live) return undefined
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [live, refresh])

  return (
    <section className={`${styles.liveMatchupControl} ${live ? styles.liveMatchupActive : ''}`}>
      <span className={styles.liveMatchupPulse} />
      <div>
        <small>{live ? 'LIVE GAME CENTER' : 'GAME CENTER'}</small>
        <strong>{live ? 'Games are on' : 'Waiting for NFL action'}</strong>
        <em>{lastUpdated ? <>Feed checked <LocalTime value={lastUpdated} /> · tap Refresh for the latest</> : 'Tap Refresh any time for the latest scores'}</em>
      </div>
      <button onClick={() => refresh({ force: true })} disabled={refreshing} type="button" style={{ minHeight: 44 }}>
        {refreshing ? 'Updating…' : '↻ Refresh'}
      </button>
    </section>
  )
}
