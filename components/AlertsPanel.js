'use client'

// The Alerts settings, on the front door.
//
// Everything it controls already existed (components/MiniWire.js has fired
// these since 2026-08-06); what didn't exist was any way to see the rules or
// change one without turning the whole bell off. See lib/dash/alerts.js for
// the store and for why the master switch is still `wire_notif`.
//
// SAYS WHAT IT CANNOT DO. Three limits, all real, all stated on the page
// rather than discovered: with the site closed only homers and touchdowns
// arrive, and only every ten minutes (2026-08-30 — the first sentence used to
// read "nothing arrives with the site fully closed", which the panel's own
// "Also when the site is closed" block below has contradicted since push
// shipped on 08-28); iOS
// grants notifications only to a site added to the Home Screen; and the
// permission itself is per-browser, so arming this phone says nothing about
// the laptop. The choice of WHICH alerts you want does follow the account —
// that part is worth syncing, and it is.

import { useEffect, useState } from 'react'

import { CATEGORIES, useAlertPrefs } from '../lib/dash/alerts'
import { useDashAccount } from '../lib/dash/sync'
import { canNotify, installHint, permission, requestPermission } from '../lib/notify'
import { currentSubscription, pushSupported, subscribePush, unsubscribePush, vapidPublicKey } from '../lib/dash/push'

export default function AlertsPanel({ styles }) {
  const { prefs, setMaster, setCategory } = useAlertPrefs()
  const account = useDashAccount()
  const [perm, setPerm] = useState('default')
  const [hint, setHint] = useState(null)
  // MOUNTED, and it is load-bearing. This renders on the server, where there
  // is no Notification API, so canNotify() is false and the button would say
  // "Not supported here". The effect below re-checks on the client — but if
  // permission() also returns 'default' there, setPerm sets the same value,
  // React bails out of the re-render, and the wrong button stays on screen on
  // a perfectly capable browser. A flag that always changes forces the one
  // re-render this needs.
  const [mounted, setMounted] = useState(false)
  const [closedSite, setClosedSite] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pushNote, setPushNote] = useState(null)
  const [pushReady, setPushReady] = useState(false)

  useEffect(() => {
    setMounted(true)
    setPerm(permission())
    setHint(installHint())
    currentSubscription().then((sub) => setClosedSite(Boolean(sub)))
    vapidPublicKey().then((key) => setPushReady(Boolean(key)))
  }, [])

  const toggleClosedSite = async () => {
    setBusy(true)
    setPushNote(null)
    if (closedSite) {
      await unsubscribePush()
      setClosedSite(false)
    } else {
      const res = await subscribePush()
      if (res.ok) setClosedSite(true)
      else setPushNote(
        res.reason === 'signed-out' ? 'Sign in first — a subscription belongs to an account.'
          : res.reason === 'permission' ? 'Allow notifications above first.'
          : res.reason === 'not-configured' ? 'Push keys are not set on this deploy yet.'
          : res.reason === 'unsupported' ? 'This browser has no push support.'
          : 'That did not take — try again in a moment.',
      )
    }
    setBusy(false)
  }

  const arm = async () => {
    if (!canNotify()) return
    const iosHint = installHint()
    if (iosHint) { setHint(iosHint); return }
    const granted = await requestPermission()
    setPerm(granted)
    if (granted === 'granted') setMaster(true)
  }

  const armed = prefs.on && perm === 'granted'

  return (
    <div className={styles.alerts}>
      <div className={styles.alertsHead}>
        <div>
          <p className={styles.kicker}>ALERTS</p>
          <h2>{armed ? 'Armed.' : 'Tell me when.'}</h2>
        </div>
        {perm === 'granted' ? (
          <button type="button" className={styles.armBtn} onClick={() => setMaster(!prefs.on)} aria-pressed={prefs.on}>
            {prefs.on ? 'Turn alerts off' : 'Turn alerts on'}
          </button>
        ) : (
          <button type="button" className={styles.armBtn} onClick={arm} disabled={mounted && !canNotify()}>
            {!mounted || canNotify() ? 'Allow notifications' : 'Not supported in this browser'}
          </button>
        )}
      </div>

      {hint ? <p className={styles.muted}>{hint}</p> : null}

      {['mlb', 'nfl'].map((sport) => (
        <div key={sport}>
          <p className={styles.alertGroup}>{sport === 'mlb' ? 'MOONSHOT · MLB' : 'TUDDY · NFL'}</p>
          <ul className={styles.alertList}>
            {CATEGORIES.filter((cat) => cat.sport === sport).map((cat) => {
          const on = Boolean(prefs.events[cat.key])
          return (
            <li key={cat.key}>
              <button
                type="button"
                onClick={() => setCategory(cat.key, !on)}
                aria-pressed={on}
                className={on ? styles.alertOn : ''}
                disabled={!prefs.on}
              >
                <b>{cat.label}</b>
                <small>{cat.detail}</small>
                <em>{on ? 'ON' : 'OFF'}</em>
              </button>
              {cat.live && on ? <span className={styles.alertNote}>reaches you even with the site open</span> : null}
            </li>
              )
            })}
          </ul>
        </div>
      ))}

      {mounted && pushSupported() && pushReady ? (
        <div className={styles.closedSite}>
          <div>
            <b>Also when the site is closed</b>
            <small>
              Homers and touchdowns for players you follow, pushed to this device with no tab
              open. Checked every ten minutes during games — not instantly, because nothing here
              holds a live line to the league.
            </small>
          </div>
          <button
            type="button"
            onClick={toggleClosedSite}
            disabled={busy || !prefs.on || perm !== 'granted' || !account.signedIn}
            aria-pressed={closedSite}
            className={closedSite ? styles.alertOn : ''}
          >{busy ? 'Working…' : closedSite ? 'ON · this device' : 'Turn on'}</button>
        </div>
      ) : null}
      {pushNote ? <p className={styles.muted}>{pushNote}</p> : null}

      <p className={styles.muted}>
        {account.signedIn
          ? 'These choices are saved to your account. Whether this particular browser is allowed to show notifications is a per-device permission, so each phone or laptop still has to be armed once.'
          : 'Saved on this device. Sign in above and the choices follow you; the permission itself is always per-device.'}
        {' '}With the site closed, only what you switch on above arrives — everything else needs a tab open somewhere.
      </p>
    </div>
  )
}
