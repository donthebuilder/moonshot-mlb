'use client'
import { useState, useEffect } from 'react'
import { useSport } from '../lib/sport'
import { themeFromUrl } from '../lib/themes'
import { applyTheme, C } from '../lib/theme'
import Dashboard from './Dashboard'
import NflDashboard from './nfl/NflDashboard'
import LampDashboard from './lamp/LampDashboard'

// One switch, two dashboards.
//
// Kept as its own file rather than a branch inside Dashboard so the MLB shell
// stays exactly what it was — this is additive, and a season's worth of MLB
// work shouldn't gain a conditional at the top of it to make room for August.

// ── WHERE THE CHROME PALETTE ACTUALLY GETS APPLIED (2026-08-18) ────────────
// See lib/theme.js's applyTheme() for WHY this doesn't happen at module load
// anymore (short version: it crashed hydration on a real light-theme load).
// This effect fires once, after this component's first hydration has already
// committed cleanly against the server's always-ember HTML. If the saved theme
// is non-default, applyTheme mutates C and `pass` flips so everything under
// here recomputes its inline styles from the now-correct C.
//
// ── IT USED TO BE A key=, WHICH IS A REMOUNT (2026-09-02, finding #48) ─────
//
// `<Dashboard key={pass} />` does not re-render the dashboard: it throws the
// old one away and mounts a new one. Every DOM node under it is replaced, and
// a click that lands in that window hits a node that is about to stop
// existing -- so it does nothing, and the second click works. That is exactly
// the shape of #48, "the first interaction on a control is swallowed,
// site-wide", reproduced on three unrelated components. It fires on every
// load for anyone whose theme is not ember, which is anyone who has ever
// pressed the light-mode button.
//
// A remount was never needed. Nothing here is memoised (no React.memo
// anywhere in components/), so bumping state in this parent re-renders the
// whole subtree and every inline style is recomputed from the new C -- the
// same uniform repaint, without discarding the DOM, the scroll position, or
// the click. `pass` is still read, as a plain value rather than a key, so the
// re-render is a real one and not elided.
//
// It is still a plain post-mount re-render, never a hydration diff, so it
// cannot hit the failure mode lib/theme.js's note describes. And the common
// case (ember) still does nothing at all: applyTheme returns false, pass
// stays 0, nothing re-renders.
// ── NO PRODUCT UNTIL THE ADDRESS HAS BEEN READ (2026-09-26) ──────────────
// A hash never reaches the server, so the server -- and hydration, which must
// match it -- rendered MOONSHOT for every /app link; useSport() then read
// #sport=nhl in an effect and swapped. Measured with a phone's CPU (6x) and
// network: a cold LAMP or TUDDY link showed MOONSHOT for 1.0-1.2 s, the
// "3-7 s" reported on a real phone. Now the server and the first client
// commit render a neutral shell; by the next commit useSport() has read the
// hash, so the product that mounts is the one the link named -- MOONSHOT's
// dashboard never mounts on a LAMP link. Costs MOONSHOT itself one commit.
function Shell() {
  return (
    <div aria-busy="true" style={{ minHeight: '100vh', background: C.bg }}>
      <span style={{ position: 'absolute', left: -9999 }}>Loading…</span>
    </div>
  )
}

export default function SportRoot() {
  const sport = useSport()
  const [pass, setPass] = useState(0)
  const [ready, setReady] = useState(false)
  useEffect(() => { setReady(true) }, [])
  useEffect(() => {
    try {
      const key = themeFromUrl('ember')
      if (applyTheme(key)) setPass((n) => n + 1)
    } catch { /* stay on pass 0 */ }
  }, [])
  // `pass` is passed down rather than used as a key: it changes identity on
  // the repaint pass, which is what makes the re-render observable, while the
  // component instance and its DOM survive.
  // Three shells, one switch (2026-09-25: LAMP). MOONSHOT stays the default.
  if (!ready) return <Shell />
  if (sport === 'nfl') return <NflDashboard palettePass={pass} />
  if (sport === 'nhl') return <LampDashboard palettePass={pass} />
  return <Dashboard palettePass={pass} />
}
