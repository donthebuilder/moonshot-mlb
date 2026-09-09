'use client'
import { useEffect, useState } from 'react'

// ══ QUIET MODE ══════════════════════════════════════════════════════════════
//
// Donovan, 2026-08-23: "we need a notifications setting somewhere to minimze
// the notis on screen for user." Asked which ones, he picked all of them —
// the ❓ what-am-I-looking-at banners, the pills and toasts, the live up-now /
// on-deck markers — behind one switch.
//
// He is describing the cost of a house rule that is otherwise good. This site
// explains itself relentlessly: every board carries a paragraph on what it
// answers, every legend states its own thresholds, every refusal says why it
// refused. That is exactly right the first ten times you open a page and it is
// noise the two hundredth, and there was no way to turn it down. Measured on
// the Slate tab at 1280px: three stacked explainers — the ❓ banner, "What this
// answers", and the sort caption — before a single game card.
//
// WHAT THIS IS NOT. It is not a "hide the hard parts" mode and it never
// removes a number, a refusal, a sample size or a caveat that changes what a
// figure MEANS. A legend that says "blank = under five attempts" is load-
// bearing; a paragraph that re-describes a board you are already looking at is
// not. The rule for tagging something quiet-note: if hiding it could make a
// number on screen be read as claiming more than it does, it stays.
//
// HOW IT WORKS. One boolean in localStorage, one class on <html>, and the CSS
// in components/MobileCSS.js does the hiding. That means a block opts in with
// a className and nothing else — no hook threaded through forty components,
// no prop drilling, and no re-render storm when the switch flips.
//
//   <div className="quiet-note"> …explainer prose… </div>
//
// Components that need to BEHAVE differently (rather than just disappear) read
// the hook. Everything that only needs to vanish uses the class.

const KEY = 'moonshot_quiet_v1'
const EVT = 'moonshot-quiet-change'

export const readQuiet = () => {
  if (typeof window === 'undefined') return false
  try { return window.localStorage.getItem(KEY) === '1' } catch { return false }
}

/** Paint the root class. Called on read and on every change. */
const paint = (on) => {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('quiet', !!on)
}

export function setQuiet(on) {
  try { window.localStorage.setItem(KEY, on ? '1' : '0') } catch { /* private mode */ }
  paint(on)
  try { window.dispatchEvent(new Event(EVT)) } catch { /* older Safari */ }
}

/**
 * useQuiet — [on, setOn].
 *
 * Starts FALSE on every render path, including the server's, and only reads
 * localStorage in an effect. Reading it during render is a hydration mismatch
 * on a value that differs between the server (no storage) and the client, and
 * this site has paid for that class of bug before.
 */
export function useQuiet() {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const sync = () => { const v = readQuiet(); setOn(v); paint(v) }
    sync()
    window.addEventListener(EVT, sync)
    // Another tab of the same site flipping it should flip this one too.
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return [on, setQuiet]
}
