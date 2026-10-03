'use client'
// THE BELL, EVERY PRODUCT (2026-10-02): TUDDY's AlertBell generalised -- the
// product's own theme (SportTheme), a 44 px target, and turning it on now also
// registers this device for alerts with the site CLOSED (lib/dash/push.js
// subscribePush; before, a bell only granted permission). Signed out, it says
// so plainly. The switch is the same master switch as the front door's Alerts
// panel (lib/dash/alerts.js), so they can never disagree.
import { useEffect, useState } from 'react'
import { useSportTheme } from './SportTheme'
import { requestPermission, ensureWorker, installHint, canNotify } from '../lib/notify'
import { alertPrefs, setAlertMaster, ALERTS_EVENT } from '../lib/dash/alerts'
import { subscribePush } from '../lib/dash/push'

export default function AlertBell({ what = 'your followed players', onHint }) {
  const { C, NUM_FONT, accent } = useSportTheme()
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
    if (on) { setAlertMaster(false); setOn(false); setHint(''); return }
    if (!canNotify()) { setHint('This browser has no notifications.'); return }
    const ios = installHint()
    if (ios) { setHint(ios); onHint?.(ios); return }
    const perm = await requestPermission()
    if (perm !== 'granted') { setHint('Notifications were not allowed.'); return }
    setAlertMaster(true); setOn(true)
    const r = await subscribePush().catch(() => null)
    setHint(r?.ok ? 'On, with the site closed too.' : r?.reason === 'signed-out' ? 'On while the site is open. Sign in to get them with the site closed too.' : 'On while the site is open.')
  }

  return (
    <span style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <button type="button" onClick={toggle}
        title={on ? `Alerts on for ${what}. Tap to turn off.` : `Turn on alerts for ${what}`}
        aria-pressed={on} aria-label={on ? 'Turn alerts off' : 'Turn alerts on'}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 14px', borderRadius: 999, cursor: 'pointer',
          background: on ? `${accent}18` : 'transparent', border: `1px solid ${on ? accent : C.border2}`,
          color: on ? accent : C.text2, fontFamily: NUM_FONT, fontSize: 12, fontWeight: 800 }}>
        <span aria-hidden="true" style={{ fontSize: 14 }}>{on ? '🔔' : '🔕'}</span>
        {on ? 'Alerts on' : 'Turn alerts on'}
      </button>
      {hint ? <span role="status" style={{ fontSize: 11, color: C.text3, lineHeight: 1.4, maxWidth: 260 }}>{hint}</span> : null}
    </span>
  )
}
