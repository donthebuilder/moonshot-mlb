'use client'
import { useEffect } from 'react'

// Opens the <details id={id}> when the address says #id -- on load and when
// the hash changes (a link to it on the same page). A folded section that a
// link points at must open when you arrive; browsers don't do it for a
// <details> on their own (measured 2026-09-26 on the front door's #alerts).
// `also`: more anchors INSIDE the fold that open it too (the sign-up fold
// holds #sign-in and #create-account); the page lands on the anchor asked for.
export default function OpenOnHash({ id, also = [] }) {
  const key = also.join(',')
  useEffect(() => {
    const open = () => {
      const want = window.location.hash.slice(1)
      if (!want || (want !== id && !key.split(',').includes(want))) return
      const el = document.getElementById(id)
      if (el && 'open' in el) { el.open = true; (document.getElementById(want) || el).scrollIntoView({ block: 'start' }) }
    }
    open()
    window.addEventListener('hashchange', open)
    return () => window.removeEventListener('hashchange', open)
  }, [id, key])
  return null
}
