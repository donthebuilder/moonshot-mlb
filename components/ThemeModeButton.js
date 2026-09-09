'use client'
import { useEffect, useState } from 'react'
import { C } from '../lib/theme'
import { themeFromUrl, isLight, toggleLightDark } from '../lib/themes'

// ☀️/🌙 LIGHT · DARK — the actual ask (2026-08-18).
//
// Donovan: "can you just make a quick light and dark mode type thing." The
// site already had a chrome-palette system (lib/themes.js: ember/mono/steel/
// regal) but every one of those is dark, and there was no button anywhere —
// only a ?theme= URL param or hand-editing localStorage. This is the missing
// piece: one button, sun or moon depending on where you are, that flips
// between "light" and whichever dark palette you had (see toggleLightDark's
// "remembers the last dark theme" note in lib/themes.js).
//
// WHY THIS RELOADS THE PAGE instead of updating state in place: C is a
// plain object mutated once at module load (see lib/theme.js's comment on
// why) and read directly by ~80 components at render time — it is not
// React state and nothing here re-renders when it changes. A reload is the
// only way to make ~80 components repaint with the new palette without
// rewriting every one of them onto a context/hook. It's a light switch, not
// a live preview — one click, one flash, done. Sits beside PaletteButton in
// the header, since it's the same kind of control: a view setting.
export default function ThemeModeButton() {
  // Read the live setting after mount, not during SSR — window/localStorage
  // don't exist on the server and guessing wrong here would mean the button
  // shows the wrong icon for a moment on every load.
  const [light, setLight] = useState(false)
  useEffect(() => { setLight(isLight(themeFromUrl('ember'))) }, [])

  return (
    <button
      type="button"
      onClick={toggleLightDark}
      title={light ? 'Switch to dark mode' : 'Switch to light mode'}
      aria-label={light ? 'Switch to dark mode' : 'Switch to light mode'}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: 8, cursor: 'pointer',
        background: 'transparent', border: `1px solid ${C.border}`,
        color: C.text3, fontSize: 13, flexShrink: 0,
      }}
    >
      {light ? '🌙' : '☀️'}
    </button>
  )
}
