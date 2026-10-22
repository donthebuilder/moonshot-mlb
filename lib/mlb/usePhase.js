'use client'
// MLB'S STATE IN THE BROWSER (2026-10-21, BATCH-MLB-OFFSEASON B1): lib/mlb/phase.js mlbPhase for today (Eastern), null while it loads or when the
// schedule can't be read (the page then shows what it always has). ?mlbPhase=offseason on the URL forces the state for a look; a forced OFFSEASON
// still reads the real fall league schedule, so the preview shows what the winter Home will.
import { useEffect, useState } from 'react'
import { etToday } from '../freshness'
import { mlbPhase, forcedPhase, fallLane } from './phase'

export function useMlbPhase() {
  const [phase, setPhase] = useState(null)
  useEffect(() => {
    let alive = true
    const today = etToday()
    const forced = typeof window !== 'undefined' ? forcedPhase(window.location.search, today) : null
    if (forced && forced.phase === 'OFFSEASON') fallLane(today).then((l) => { if (alive) setPhase({ ...forced, ...(l || {}), phase: 'OFFSEASON', forced: true }) })
    else if (forced) setPhase(forced)
    else mlbPhase(today).then((v) => { if (alive) setPhase(v) })
    return () => { alive = false }
  }, [])
  return phase
}
