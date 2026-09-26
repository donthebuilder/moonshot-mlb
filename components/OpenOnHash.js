'use client'
import { useEffect } from 'react'

// Opens the <details id={id}> when the address says #id -- on load and when
// the hash changes (a link to it on the same page). A folded section that a
// link points at must open when you arrive; browsers don't do it for a
// <details> on their own (measured 2026-09-26 on the front door's #alerts).
export default function OpenOnHash({ id }) {
  useEffect(() => {
    const open = () => {
      if (window.location.hash !== `#${id}`) return
      const el = document.getElementById(id)
      if (el && 'open' in el) { el.open = true; el.scrollIntoView({ block: 'start' }) }
    }
    open()
    window.addEventListener('hashchange', open)
    return () => window.removeEventListener('hashchange', open)
  }, [id])
  return null
}
