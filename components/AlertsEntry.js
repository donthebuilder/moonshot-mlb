'use client'
import { useState } from 'react'

import { PRESETS, presetOf, useAlertPrefs } from '../lib/dash/alerts'
import AlertsQuick from './AlertsQuick'

// THE ALERTS LINE, ON THE WATCHLIST AND THE BINDER (2026-10-13; the audit: alerts were only reachable from the front door). One quiet line that says where alerts stand
// ("Alerts: Essentials", "Alerts: off") and opens, in place, the short chooser (components/AlertsQuick.js). Closed it is one 44px line, no taller than the
// Clear all button it sits beside, so it adds no scroll to a phone.
export default function AlertsEntry({ C, accent, NUM_FONT }) {
  const { prefs } = useAlertPrefs()
  const [open, setOpen] = useState(false)
  const key = presetOf(prefs.events)
  const word = !prefs.on ? 'off on this device' : (PRESETS.find((p) => p.key === key)?.label || 'your own mix')
  return (
    <div data-alerts-entry style={{ minWidth: 0 }}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 4px', background: 'transparent', border: 0, cursor: 'pointer', color: C.text2, font: `800 12px/1 ${NUM_FONT}`, letterSpacing: '.03em' }}>
        <span aria-hidden="true">🔔</span>
        <span>Alerts: <b style={{ color: accent }}>{word}</b></span>
        <span aria-hidden="true" style={{ color: C.text3 }}>{open ? '▴' : '▾'}</span>
      </button>
      {open ? <div style={{ marginTop: 4 }}><AlertsQuick C={C} accent={accent} NUM_FONT={NUM_FONT} framed /></div> : null}
    </div>
  )
}
