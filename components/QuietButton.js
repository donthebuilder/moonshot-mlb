'use client'
import { C } from '../lib/theme'
import { alpha } from '../lib/scales'
import { useQuiet } from '../lib/quiet'

// 🔕 THE ONE SWITCH (2026-08-23).
//
// Donovan: "we need a notifications setting somewhere to minimze the notis on
// screen for user." It sits beside the palette and theme buttons because it is
// the same KIND of setting — how the site looks at you, not what it thinks —
// and because that group is already the place people go to change the view.
//
// The label says what it does in the state it is in, not what it is called:
// on the loud side it offers quiet, on the quiet side it offers the guides
// back. A toggle that reads as its own name leaves you guessing which way it
// is pointing.
export default function QuietButton() {
  // `flip`, not `setQuiet` — lib/quiet.js exports a module-level setQuiet(),
  // and a local binding with the same name is exactly the shadowing that
  // scripts/check-undefined.mjs exists to catch. It caught it here.
  const [quiet, flip] = useQuiet()
  return (
    <button
      onClick={() => flip(!quiet)}
      aria-pressed={quiet}
      title={quiet
        ? 'Quiet mode is ON — the explainer banners, the “what this answers” notes and the live at-the-plate markers are hidden. Every number, legend threshold and refusal is still on screen. Tap to bring the guides back.'
        : 'Quiet mode — hide the explainer banners, the “what this answers” notes and the live at-the-plate markers. Nothing that changes what a number MEANS is hidden; the legends and the refusals stay.'}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        height: 32, minHeight: 32, width: 34, borderRadius: 8, cursor: 'pointer',
        fontSize: 14, lineHeight: 1,
        border: `1px solid ${quiet ? alpha(C.orange, 0.5) : C.border}`,
        background: quiet ? alpha(C.orange, 0.12) : 'transparent',
        color: quiet ? C.orange : C.text3,
      }}
    >{quiet ? '🔕' : '🔔'}</button>
  )
}
