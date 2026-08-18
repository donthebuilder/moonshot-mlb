'use client'
import { useState, useEffect } from 'react'
import { useSport } from '../lib/sport'
import { themeFromUrl } from '../lib/themes'
import { applyTheme } from '../lib/theme'
import Dashboard from './Dashboard'
import NflDashboard from './nfl/NflDashboard'

// One switch, two dashboards.
//
// Kept as its own file rather than a branch inside Dashboard so the MLB shell
// stays exactly what it was — this is additive, and a season's worth of MLB
// work shouldn't gain a conditional at the top of it to make room for August.

// ── WHERE THE CHROME PALETTE ACTUALLY GETS APPLIED (2026-08-18) ────────────
// See lib/theme.js's applyTheme() for WHY this doesn't happen at module load
// anymore (short version: it crashed hydration on a real light-theme load).
// This effect fires once, after this component's first hydration has already
// committed cleanly against the server's always-ember HTML. If the saved
// theme is non-default, applyTheme mutates C, then `pass` flips so Dashboard
// (and everything under it) remounts and recomputes every inline style from
// the now-correct C in one uniform pass — a plain re-render, not a hydration
// diff, so it can't hit the same failure mode. Scoped to only fire on a
// non-default theme, so the common case (ember, the overwhelming majority of
// visits) never remounts at all: pass stays 0, key never changes.
export default function SportRoot() {
  const sport = useSport()
  const [pass, setPass] = useState(0)
  useEffect(() => {
    try {
      const key = themeFromUrl('ember')
      if (applyTheme(key)) setPass(1)
    } catch { /* stay on pass 0 */ }
  }, [])
  return sport === 'nfl' ? <NflDashboard key={pass} /> : <Dashboard key={pass} />
}
