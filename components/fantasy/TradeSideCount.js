'use client'

import { useEffect, useRef, useState } from 'react'

// How many you have picked, and the ceiling you did not know about.
//
// propose_fantasy_trade rejects anything outside 1-5 players a side, and the
// builder gave no count and no hint -- you could tick eight men and only find
// out on submit, with the whole selection still to redo. This is the count and
// the limit, said before you press the button.
//
// It reads the checkboxes out of the DOM rather than owning them, on purpose:
// the lists are server-rendered and carry player headshots from a 75 KB id map
// that must not reach the browser. Lifting them into client state to get a
// number would ship that map. A change listener on the enclosing form costs
// nothing and leaves the markup exactly where it was.
export default function TradeSideCount({ name, max = 5 }) {
  const anchor = useRef(null)
  const [count, setCount] = useState(0)

  useEffect(() => {
    const form = anchor.current?.closest('form')
    if (!form) return undefined
    const recount = () => setCount(form.querySelectorAll(`input[name="${name}"]:checked`).length)
    recount()
    form.addEventListener('change', recount)
    return () => form.removeEventListener('change', recount)
  }, [name])

  return (
    <b ref={anchor} data-over={count > max ? 'true' : undefined} data-none={count === 0 ? 'true' : undefined}>
      {count === 0 ? `pick 1–${max}` : `${count} of ${max}`}
    </b>
  )
}
