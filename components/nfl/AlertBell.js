'use client'
// 🔔 The alerts opt-in, on TUDDY's header.
//
// The NFL alert pipeline was complete end to end (lib/dash/pushRules.js
// kick/red/td/bar rules, lib/dash/alerts.js Tuddy categories, NflWire firing
// them) except for the one thing a user can see: nothing on the NFL side ever
// asked for notification permission. The only bell lived in MOONSHOT's
// MiniWire, so a football-only visitor had no way in short of finding the
// /dash Alerts panel. Same switch as that bell -- setAlertMaster -- so the
// two can never disagree.
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../../lib/nfl/theme'
import { requestPermission, ensureWorker, installHint, canNotify } from '../../lib/notify'
import { alertPrefs, setAlertMaster, ALERTS_EVENT } from '../../lib/dash/alerts'

export default function AlertBell({ onHint }) {
  const [on, setOn] = useState(false)
  const [hint, setHint] = useState('')
  const read = () => setOn(Boolean(alertPrefs().on && canNotify() && Notification.permission === 'granted'))
  useEffect(() => {
    read()
    if (canNotify() && Notification.permission === 'granted') ensureWorker()
    window.addEventListener(ALERTS_EVENT, read)
    return () => window.removeEventListener(ALERTS_EVENT, read)
  }, [])

  const toggle = async () => {
    if (on) { setAlertMaster(false); setOn(false); return }
    if (!canNotify()) { setHint('This browser has no notifications.'); return }
    const ios = installHint()
    if (ios) { setHint(ios); onHint?.(ios); return }
    const perm = await requestPermission()
    if (perm === 'granted') { setAlertMaster(true); setOn(true); setHint('') }
    else setHint('Notifications were not allowed.')
  }

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button type="button" onClick={toggle}
        title={on ? 'Alerts on — touchdowns, kickoffs and bar clears for your names. Click to turn off.' : 'Turn on alerts for your pinned and followed players'}
        aria-pressed={on} aria-label={on ? 'Turn alerts off' : 'Turn alerts on'}
        style={{ display: 'flex', alignItems: 'center', gap: 5, height: 28, padding: '0 8px', borderRadius: 8, cursor: 'pointer',
          background: on ? 'rgba(34,197,94,.08)' : 'transparent', border: `1px solid ${on ? 'rgba(34,197,94,.4)' : C.border}`,
          color: on ? C.green : C.text3, font: `800 9px/1 ${NUM_FONT}` }}>
        <span style={{ fontSize: 12 }}>{on ? '🔔' : '🔕'}</span>
        <span className="nfl-bell-word">{on ? 'alerts on' : 'alerts'}</span>
      </button>
      {hint && <span role="status" style={{ position: 'absolute', top: '110%', right: 0, zIndex: 50, width: 220, padding: '8px 10px', borderRadius: 8, background: C.bg2, border: `1px solid ${C.border2}`, color: C.text2, fontSize: 10, lineHeight: 1.4 }}>{hint}</span>}
      <style>{`@media(max-width:560px){.nfl-bell-word{display:none}}`}</style>
    </span>
  )
}
