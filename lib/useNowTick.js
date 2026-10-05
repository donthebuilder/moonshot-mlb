'use client'
import { useEffect, useState } from 'react'

// A CLOCK THAT MOVES (2026-10-05 scan). `useMemo(() => Date.now(), [data])` froze
// "not kicked off" at the moment the slate loaded: a board left open past
// kickoff still listed the game as ahead. This re-reads the clock every minute
// while the page is open -- no network, just a re-render -- and when the tab
// comes back from the background.
export function useNowTick(ms = 60000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const id = setInterval(tick, ms)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick) }
  }, [ms])
  return now
}
