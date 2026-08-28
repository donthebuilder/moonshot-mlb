'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// The draft room is a server component, so without this the board, the team on
// the clock and the pick list stayed frozen until someone hit reload — and the
// "timer" only ever ran when a human clicked a button.
export default function DraftRoomLive({ leagueId, status, deadline, currentPick, tickAction }) {
  const router = useRouter()
  const [now, setNow] = useState(() => Date.now())
  const firedFor = useRef(null)
  const busy = useRef(false)
  const live = status === 'live'

  useEffect(() => {
    if (!live) return undefined
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [live])

  useEffect(() => {
    if (!live) return undefined
    const id = setInterval(() => router.refresh(), 5000)
    return () => clearInterval(id)
  }, [live, router])

  useEffect(() => { firedFor.current = null }, [currentPick])

  const remaining = deadline ? Math.max(0, Math.ceil((new Date(deadline).getTime() - now) / 1000)) : null

  useEffect(() => {
    if (!live || remaining === null || remaining > 0) return
    if (firedFor.current === currentPick || busy.current) return
    firedFor.current = currentPick
    busy.current = true
    Promise.resolve(tickAction(leagueId))
      .catch(() => {})
      .finally(() => { busy.current = false; router.refresh() })
  }, [live, remaining, currentPick, leagueId, tickAction, router])

  if (!live) return null
  const label = remaining === null
    ? 'On the clock'
    : remaining > 0
      ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} on the clock`
      : 'Time — auto-picking…'

  return (
    <span aria-live="polite" data-expired={remaining === 0 ? 'true' : undefined} data-urgent={remaining !== null && remaining <= 10 ? 'true' : undefined}>
      {label}
    </span>
  )
}
