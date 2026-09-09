'use client'

// The Alerts settings, on the front door.
//
// Twenty-three switches now, where there were eight, so the panel's job
// changed: it is no longer a list, it is a way of NOT reading a list. Three
// presets carry the common answers with their nightly cost written on them,
// and the full set is underneath for anyone who wants it.
//
// THE ONE DIVISION THAT MATTERS. Every category is either something that can
// reach a phone with nothing open, or something that needs a tab somewhere.
// That is the distinction people actually care about and the one they cannot
// discover by trying, so the two are drawn as separate lists with their own
// headings rather than a footnote. Three categories sit on the wrong side of
// it on purpose -- "at the plate" expires faster than the cron runs, and the
// two bar categories grade against the bot's own role for that player
// tonight, which the sender does not read -- and saying so is better than
// letting somebody switch them on and wait.
//
// STILL SAYS WHAT IT CANNOT DO. iOS grants notifications only to a site added
// to the Home Screen, and the permission is per-browser, so arming this phone
// says nothing about the laptop. The CHOICE of which alerts you want does
// follow the account; the permission never can.

import { useEffect, useState } from 'react'

import { CATEGORIES, PRESETS, presetOf, useAlertPrefs } from '../lib/dash/alerts'
import { useDashAccount } from '../lib/dash/sync'
import { canNotify, installHint, permission, requestPermission } from '../lib/notify'
import { currentSubscription, pushSupported, subscribePush, unsubscribePush, vapidPublicKey } from '../lib/dash/push'

// Every group in lib/dash/alerts.js has to appear here or its switches simply
// do not render -- the panel iterates GROUPS, not CATEGORIES. Franchise
// shipped its categories without this line, which left four alerts on with no
// way to turn them off.
const GROUPS = [
  { key: 'Moonshot', label: 'MOONSHOT · MLB' },
  { key: 'Tuddy', label: 'TUDDY · NFL' },
  { key: 'Franchise', label: 'FRANCHISE · FANTASY' },
]

// Loudest first, inside each list. The number is the same priority the sender
// sorts on when more happens in one minute than a lock screen should carry,
// so the order on this page is the order things actually survive in.
const byPriority = (a, b) => (a.priority - b.priority) || a.label.localeCompare(b.label)

export default function AlertsPanel({ styles }) {
  const { prefs, setMaster, setCategory, setPreset } = useAlertPrefs()
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
  const [showAll, setShowAll] = useState(false)

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
      if (res.ok) { setClosedSite(true); setPushNote('Sent one to this device — it should be on your screen now.') }
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
  const active = presetOf(prefs.events)
  const onCount = CATEGORIES.filter((c) => c.push && prefs.events[c.key]).length

  const row = (cat) => {
    const on = Boolean(prefs.events[cat.key])
    return (
      <li key={cat.key}>
        <button
          type="button"
          onClick={() => setCategory(cat.key, !on)}
          aria-pressed={on}
          className={on ? styles.alertOn : styles.alertOff}
          disabled={!prefs.on}
        >
          <b>{cat.label}</b>
          <small>{cat.detail}</small>
          <em>{on ? '● ON' : '○ OFF'}</em>
          {/* #53: this note used to render as a sibling of the card, hanging in
              the gap below it and knocking the grid's rhythm off under Homers,
              Any slate homer, At the plate and Touchdowns. It describes the
              switch, so it belongs inside the switch. */}
          {cat.scope === 'everyone' && on ? (
            <small className={styles.alertNoteIn}>the whole slate, not just your names — this one is loud</small>
          ) : cat.live && on ? (
            <small className={styles.alertNoteIn}>reaches you even with the site open</small>
          ) : null}
        </button>
      </li>
    )
  }

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

      {/* ── PRESETS ──────────────────────────────────────────────────────
          Every one of them says what it costs a night before you pick it.
          Nobody has ever wanted "more notifications"; they want to know how
          many, and that is the only number on these buttons. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '12px 0 4px' }}>
        {/* #50: these were .armBtn, which is filled with the accent and
            outlined in it, so all three rendered as selected simultaneously --
            including when the state beside them read "your own mix · 27 on",
            meaning NONE of them was active. Three lit buttons for a state
            where none should be lit. Own classes now: quiet by default, filled
            only for the one that is actually on. */}
        {PRESETS.map((p) => {
          const isOn = active === p.key
          return (
            <button
              key={p.key}
              type="button"
              className={isOn ? `${styles.presetBtn} ${styles.presetBtnOn}` : styles.presetBtn}
              onClick={() => setPreset(p.key)}
              aria-pressed={isOn}
              disabled={!prefs.on}
            >{p.label}</button>
          )
        })}
        {active === 'custom' ? (
          <span className={styles.alertNote} style={{ alignSelf: 'center' }}>your own mix · {onCount} on</span>
        ) : null}
      </div>
      <p className={styles.muted} style={{ marginTop: 0 }}>
        {active === 'custom'
          ? 'Switched on one at a time. Pick a preset above to start over.'
          : PRESETS.find((p) => p.key === active)?.detail}
      </p>

      <button
        type="button"
        className={styles.armBtn}
        onClick={() => setShowAll(!showAll)}
        aria-expanded={showAll}
        style={{ margin: '4px 0 10px' }}
      >{showAll ? 'Hide the full list' : `Show all ${CATEGORIES.length} switches`}</button>

      {showAll ? GROUPS.map((g) => {
        const mine = CATEGORIES.filter((c) => c.group === g.key)
        const pushes = mine.filter((c) => c.push).sort(byPriority)
        const inApp = mine.filter((c) => !c.push).sort(byPriority)
        return (
          <div key={g.key}>
            <p className={styles.alertGroup}>{g.label}</p>

            <p className={styles.muted} style={{ margin: '2px 0 4px' }}>Reaches your phone with nothing open</p>
            <ul className={styles.alertList}>{pushes.map(row)}</ul>

            {inApp.length ? (
              <>
                <p className={styles.muted} style={{ margin: '10px 0 4px' }}>
                  Needs a tab open somewhere — these cannot be pushed, and why is worth knowing
                </p>
                <ul className={styles.alertList}>{inApp.map(row)}</ul>
              </>
            ) : null}
          </div>
        )
      }) : null}

      {mounted && pushSupported() && pushReady ? (
        <div className={styles.closedSite}>
          <div>
            <b>Also when the site is closed</b>
            <small>
              Everything switched on above, pushed to this device with no tab open. Checked
              every minute during games — not instantly, because nothing here holds a live line
              to the league. Turning it on sends one straight back so you know it worked.
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
        {' '}And nothing arrives about a player you have not followed — that gate is separate from every switch on this page.
      </p>
    </div>
  )
}
