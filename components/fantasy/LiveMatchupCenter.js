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
const REFRESH_SECONDS = 60

const newer = (a, b) => Boolean(a) && (!b || new Date(a).getTime() > new Date(b).getTime())

export default function LiveMatchupCenter({ leagueId, live, lastUpdated }) {
  const router = useRouter()
  const [seconds, setSeconds] = useState(REFRESH_SECONDS)
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
      setSeconds(REFRESH_SECONDS)
    } finally {
      busy.current = false
      setRefreshing(false)
    }
  }, [leagueId, router])

  // Auto-refresh only while something is actually live, and never fire the
  // network call from inside a state updater (React may run it twice, which
  // meant two full scoring syncs per tick).
  useEffect(() => {
    if (!live) return undefined
    setSeconds(REFRESH_SECONDS)
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      setSeconds((value) => (value <= 1 ? REFRESH_SECONDS : value - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [live])

  useEffect(() => {
    if (!live) return
    if (seconds === REFRESH_SECONDS && !busy.current) return
    if (seconds > 1) return
    refresh()
  }, [live, seconds, refresh])

  return (
    <section className={`${styles.liveMatchupControl} ${live ? styles.liveMatchupActive : ''}`}>
      <span className={styles.liveMatchupPulse} />
      <div>
        <small>{live ? 'LIVE GAME CENTER' : 'GAME CENTER'}</small>
        <strong>{live ? 'Fantasy scores are updating' : 'Waiting for NFL action'}</strong>
        <em>{lastUpdated ? <>Feed checked <LocalTime value={lastUpdated} /></> : 'Refresh any time — auto-updates start at kickoff'}</em>
      </div>
      <button onClick={() => refresh({ force: true })} disabled={refreshing} type="button">
        {refreshing ? 'Updating…' : live ? `Refresh · ${seconds}s` : 'Refresh now'}
      </button>
    </section>
  )
}
