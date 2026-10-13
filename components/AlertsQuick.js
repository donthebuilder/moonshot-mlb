'use client'
import { useState } from 'react'

import { PRESETS, presetOf, useAlertPrefs } from '../lib/dash/alerts'
import { armThisDevice, useDeviceAlerts } from '../lib/dash/armDevice'
import { useDashAccount } from '../lib/dash/sync'
import { installHintText } from '../lib/copy/notifications'

// ALERTS, SMALL (2026-10-13; permission and settings UX). The one body shared by the "Get alerts for the players you follow?" sheet (components/AlertsAsk.js) and the
// Alerts line on the watchlist and the binder (components/AlertsEntry.js): the preset (Essentials / Following closely / Off), Pause tonight, and the one-tap
// "turn on for this device". The full list of switches lives on the front door (/#alerts); this is the short way to the same settings, not a second copy of them.
// Phone first: every control is 44px tall, the text is 12px or more, nothing is hover-only.

const SHOWN = ['essentials', 'closely', 'off']
const WORDS = {
  unsupported: 'This browser cannot show alerts.',
  blocked: 'Alerts are blocked for this site. Allow notifications in the browser’s site settings, then tap again.',
  denied: 'No problem. You can turn them on later from Alerts.',
  'open-only': 'Alerts are on while the site is open. Sign in to get them with it closed too.',
  on: 'Alerts are on for this device.',
}

export default function AlertsQuick({ C, accent, NUM_FONT, onDone = null, framed = false }) {
  const { prefs, setMaster, setPreset, setPause } = useAlertPrefs()
  const account = useDashAccount()
  const device = useDeviceAlerts(prefs.on)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const active = presetOf(prefs.events)
  const paused = Number(prefs.pausedUntil) > Date.now()
  const btn = (on) => ({
    minHeight: 44, padding: '8px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
    border: `1px solid ${on ? accent : C.border}`, background: on ? `color-mix(in srgb, ${accent} 14%, transparent)` : C.bg2, color: on ? accent : C.text2,
    fontFamily: 'inherit', fontWeight: 700, fontSize: 12, lineHeight: 1.3,
  })

  // A preset is a choice; choosing one other than Off on a device that is not armed arms it in the same tap (the permission prompt needs this very tap).
  const choose = async (key) => {
    setPreset(key)
    setNote('')
    if (key === 'off' || prefs.on && device.state === 'on') return
    setBusy(true)
    const r = await armThisDevice(setMaster)
    setBusy(false)
    setNote(r.step === 'ios' ? (r.hint || installHintText()) : WORDS[r.step] || '')
    device.refresh()
    if (r.ok && r.step === 'on' && onDone) onDone(r)
  }

  return (
    <div style={framed ? { padding: 10, border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2 } : undefined}>
      <div role="group" aria-label="How much to hear" style={{ display: 'grid', gap: 6 }}>
        {SHOWN.map((k) => {
          const p = PRESETS.find((x) => x.key === k)
          if (!p) return null
          const on = active === k
          return (
            <button key={k} type="button" aria-pressed={on} disabled={busy} onClick={() => choose(k)} style={btn(on)}>
              <span style={{ display: 'block', fontFamily: NUM_FONT, fontWeight: 800, letterSpacing: '.03em' }}>{p.label}{on ? ' ✓' : ''}</span>
              <span style={{ display: 'block', marginTop: 2, color: C.text3, fontWeight: 500, fontSize: 12, lineHeight: 1.35 }}>{p.detail}</span>
            </button>
          )
        })}
      </div>
      <button type="button" aria-pressed={paused} onClick={() => setPause(!paused)} style={{ ...btn(paused), marginTop: 6, width: '100%', fontFamily: NUM_FONT, fontWeight: 800 }}>
        {paused ? 'Paused until 6 am ET. Tap to resume.' : 'Pause tonight (quiet until 6 am ET)'}
      </button>
      {device.state === 'blocked' || device.state === 'unsupported' || device.state === 'ios' ? (
        <p style={{ margin: '8px 0 0', color: C.text2, fontSize: 12, lineHeight: 1.45 }}>{device.state === 'ios' ? installHintText() : WORDS[device.state]}</p>
      ) : null}
      {note ? <p role="status" style={{ margin: '8px 0 0', color: C.text2, fontSize: 12, lineHeight: 1.45 }}>{note}</p> : null}
      {!account.signedIn && account.ready && account.configured ? (
        <p style={{ margin: '8px 0 0', color: C.text3, fontSize: 12, lineHeight: 1.45 }}>Alerts to a closed site need a free account.</p>
      ) : null}
      <a href="/#alerts" style={{ display: 'flex', alignItems: 'center', minHeight: 44, color: accent, font: `800 12px/1 ${NUM_FONT}`, letterSpacing: '.04em', textDecoration: 'none' }}>All alert settings ›</a>
    </div>
  )
}
