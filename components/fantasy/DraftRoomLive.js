'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// The draft room is a server component, so this is the only thing keeping ten
// browsers in sync. Two jobs, deliberately decoupled:
//
//   1. REFRESH — runs for the whole life of the draft, including 'setup' and
//      'paused'. It used to run only while live, which meant nine members sat
//      in the lobby and never saw the draft start, and nobody ever saw a
//      resume. That is the first sixty seconds of draft night.
//   2. THE CLOCK — countdown + auto-pick, only while live.
export default function DraftRoomLive({ leagueId, status, deadline, currentPick, tickAction, display = true }) {
  const router = useRouter()
  const [now, setNow] = useState(() => Date.now())
  const firedFor = useRef(null)
  const busy = useRef(false)
  const live = status === 'live'
  const watching = status && status !== 'complete'

  // Keep every client in sync through setup and pause, not just while live.
  useEffect(() => {
    if (!watching) return undefined
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      // Never re-render underneath someone mid-interaction: refreshing while a
      // <select> is open swaps its options and silently changes what they
      // picked. The commissioner's manual assignment is exactly that.
      const active = typeof document !== 'undefined' ? document.activeElement : null
      if (active && ['SELECT','INPUT','TEXTAREA'].includes(active.tagName)) return
      router.refresh()
    }, live ? 5000 : 8000)
    return () => clearInterval(id)
  }, [watching, live, router])

  // A tab that comes back from the background is the staleset one there is.
  useEffect(() => {
    if (!watching) return undefined
    const onVisible = () => { if (document.visibilityState === 'visible') { setNow(Date.now()); router.refresh() } }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [watching, router])

  useEffect(() => {
    if (!live) return undefined
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [live])

  useEffect(() => { firedFor.current = null }, [currentPick])

  const remaining = deadline ? Math.max(0, Math.ceil((new Date(deadline).getTime() - now) / 1000)) : null

  useEffect(() => {
    if (!live || remaining === null || remaining > 0) return
    if (firedFor.current === currentPick || busy.current) return
    firedFor.current = currentPick
    busy.current = true
    Promise.resolve(tickAction(leagueId))
      .then((result) => {
        // A rejected tick used to disarm this client for the rest of the pick.
        // Clock skew or one transient failure could take every foreground tab
        // out of the auto-pick pool and hang the draft.
        if (!result?.ok) firedFor.current = null
      })
      .catch(() => { firedFor.current = null })
      .finally(() => { busy.current = false; router.refresh() })
  }, [live, remaining, currentPick, leagueId, tickAction, router])

  if (!display) return null
  if (!live) {
    return <span>{status === 'paused' ? 'Paused' : status === 'setup' ? 'Not started' : ''}</span>
  }
  // ── #90: WHAT AN EXPIRED PICK SAYS TO SOMEONE WHO CANNOT FIX IT ──────────
  //
  // "Time — auto-picking…" is true for about a second. When the tick fails, or
  // when the only person with a tab open is not the one on the clock, that
  // same red line sits there indefinitely -- which is exactly what a league
  // stared at for a week (#88). A member has no Force button, so the message
  // was both wrong and useless to them.
  //
  // It now tells the truth in two stages. For the first stretch it is a tab
  // ticking, which is what it says. After that the honest statement is that
  // the server clock has it: /api/fantasy/draft-tick runs every five minutes
  // and calls the same RPC, so the pick WILL be made whether or not anybody is
  // watching. That is a thing a member can act on -- by waiting, or by asking
  // the commissioner to force it -- instead of a spinner that means nothing.
  const overdue = deadline ? Math.floor((now - new Date(deadline).getTime()) / 1000) : 0
  const label = remaining === null
    ? 'On the clock'
    : remaining > 0
      ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} on the clock`
      : overdue < 20
        ? 'Time — auto-picking…'
        : 'Time — waiting on the draft clock'

  return (
    <span
      aria-live="polite"
      title={remaining === 0 && overdue >= 20
        ? 'The pick is past its deadline and this tab could not complete it. The server draft clock runs every five minutes and will auto-pick; the commissioner can also force it immediately.'
        : undefined}
      data-expired={remaining === 0 ? 'true' : undefined}
      data-stalled={remaining === 0 && overdue >= 20 ? 'true' : undefined}
      data-urgent={remaining !== null && remaining <= 10 ? 'true' : undefined}
    >
      {label}
    </span>
  )
}
