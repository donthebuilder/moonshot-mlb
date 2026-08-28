'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import LocalTime from './LocalTime'

const REFRESH_SECONDS = 30

export default function LiveMatchupCenter({ leagueId, live, lastUpdated }) {
  const router = useRouter()
  const [seconds, setSeconds] = useState(REFRESH_SECONDS)
  const [refreshing, setRefreshing] = useState(false)
  const busy = useRef(false)

  const refresh = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setRefreshing(true)
    try {
      await fetch(`/api/fantasy/scoring?leagueId=${encodeURIComponent(leagueId)}`, { method: 'POST', cache: 'no-store' })
      router.refresh()
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
    <section className={`liveMatchupControl ${live ? 'liveMatchupActive' : ''}`}>
      <span className="liveMatchupPulse" />
      <div>
        <small>{live ? 'LIVE GAME CENTER' : 'GAME CENTER'}</small>
        <strong>{live ? 'Fantasy scores are updating' : 'Waiting for NFL action'}</strong>
        <em>{lastUpdated ? <>Feed checked <LocalTime value={lastUpdated} /></> : 'Refresh any time — auto-updates start at kickoff'}</em>
      </div>
      <button onClick={refresh} disabled={refreshing} type="button">
        {refreshing ? 'Updating…' : live ? `Refresh · ${seconds}s` : 'Refresh now'}
      </button>
    </section>
  )
}
