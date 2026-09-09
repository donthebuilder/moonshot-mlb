'use client'
// One poller for the live snapshot, owned by the shell, shared by every tab.
//
// NflWire.js keeps its own loop because it diffs consecutive snapshots and
// owns the fired-key set; both loops go through fetchNflLive()'s 30s TTL, so
// two callers cost one request. This one exists so the TABS can read the
// snapshot: before it, nothing but the Wire ever saw a live score.
//
// Polls only when worthPolling() says so and the tab is visible -- a Tuesday
// costs nothing, and a hidden tab stops after its current tick.
import { useEffect, useState } from 'react'
import { fetchNflLive } from './liveSlate'
import { worthPolling } from './liveMerge'

const POLL_MS = 30000

export function useNflLive(data) {
  const [snap, setSnap] = useState(null)
  const games = data?.games
  useEffect(() => {
    if (!worthPolling(games)) { return undefined }
    let alive = true
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return
      fetchNflLive().then((s) => { if (alive && s) setSnap(s) }).catch(() => {})
    }
    tick()
    const id = setInterval(tick, POLL_MS)
    // Coming back to the tab should not wait out the rest of an interval.
    const onVis = () => { if (!document.hidden) tick() }
    document.addEventListener('visibilitychange', onVis)
    return () => { alive = false; clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [games])
  return snap
}
