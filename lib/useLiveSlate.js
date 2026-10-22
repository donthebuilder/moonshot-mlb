'use client'
// MLB's live lines for a board (lib/liveSlate fetchLiveSlate: one cached read, 15 s TTL, shared with the player card's
// stamp, Boxes and the wire). No timer: it re-reads on a ↻ or a return to the tab (lib/liveRefresh), like every live view.
// `on` false (no slate today / the offseason) asks for nothing.
import { useEffect, useState } from 'react'
import { fetchLiveSlate } from './liveSlate'
import { onLiveRefresh } from './liveRefresh'

export function useLiveSlate(on = true) {
  const [snap, setSnap] = useState(null)
  useEffect(() => {
    if (!on) return undefined
    let alive = true
    const pull = () => fetchLiveSlate().then((s) => { if (alive) setSnap(s || null) }).catch(() => {})
    pull()
    const off = onLiveRefresh(pull)
    return () => { alive = false; off() }
  }, [on])
  return snap
}
