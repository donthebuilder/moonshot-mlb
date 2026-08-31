'use client'

// THE PAGE BEHIND THE MODAL KEPT SCROLLING.
//
// 2026-08-31, Donovan: "sometimes when i have a player up it will scroll the
// page behind it and not the modal."
//
// Not sometimes -- always, under two conditions, and the two are why it read
// as intermittent. Every overlay on this site is a fixed backdrop with a card
// inside it at `maxHeight: 90vh; overflowY: auto`, and nothing anywhere ever
// stopped the document underneath from scrolling. So:
//
//   · a drag that STARTS on the backdrop, or on any part of the card that is
//     not the scroller, moves the page; and
//   · a drag inside the scroller moves the page the instant the scroller hits
//     its own top or bottom, because scrolling chains to the nearest ancestor
//     that can still move. On a short card that is immediately.
//
// Which is why a long player card felt fine and a short one felt broken.
//
// THE FIX HAS TO BE `position: fixed` ON THE BODY, not `overflow: hidden`.
// iOS Safari ignores overflow:hidden on the body for touch scrolling -- this
// is long-standing and not a bug anybody is going to fix. Pinning the body and
// offsetting it by the current scroll position is the only thing that actually
// holds, and it is why the scroll position has to be saved and restored by
// hand: a fixed body forgets where it was.
//
// REFERENCE COUNTED, because these stack. Opening Compare from inside a player
// card mounts a second overlay while the first is still up; the naive version
// unlocks on the inner one's unmount and the page starts moving again behind a
// modal that is still open. Only the outermost lock and unlock do anything.

import { useEffect } from 'react'

let depth = 0
let savedY = 0
let savedStyle = null

function lock() {
  if (typeof document === 'undefined') return
  depth += 1
  if (depth > 1) return
  savedY = window.scrollY || window.pageYOffset || 0
  const b = document.body.style
  savedStyle = { position: b.position, top: b.top, left: b.left, right: b.right, width: b.width, overflow: b.overflow }
  b.position = 'fixed'
  b.top = `-${savedY}px`
  b.left = '0'
  b.right = '0'
  b.width = '100%'
  b.overflow = 'hidden'
}

function unlock() {
  if (typeof document === 'undefined') return
  depth = Math.max(0, depth - 1)
  if (depth > 0 || !savedStyle) return
  const b = document.body.style
  b.position = savedStyle.position
  b.top = savedStyle.top
  b.left = savedStyle.left
  b.right = savedStyle.right
  b.width = savedStyle.width
  b.overflow = savedStyle.overflow
  savedStyle = null
  // Instant, not smooth: the page was never visibly anywhere else, and a
  // smooth restore reads as the site scrolling itself after you close a card.
  window.scrollTo(0, savedY)
}

/**
 * Hold the page still while something is open on top of it.
 *
 * @param active  false is a no-op, so this can sit at the top of a component
 *                that decides later whether it is showing anything. Hooks
 *                cannot go after an early return.
 */
export default function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return undefined
    lock()
    return unlock
  }, [active])
}
