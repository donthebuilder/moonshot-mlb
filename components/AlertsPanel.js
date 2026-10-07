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
import RecentAlerts from './RecentAlerts'

// Every group in lib/dash/alerts.js has to appear here or its switches simply
// do not render -- the panel iterates GROUPS, not CATEGORIES. Franchise
// shipped its categories without this line, which left four alerts on with no
// way to turn them off.
const GROUPS = [
  { key: 'Moonshot', label: 'MOONSHOT · MLB' },
  { key: 'Tuddy', label: 'TUDDY · NFL' },
  { key: 'Lamp', label: 'LAMP · NHL' },
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
  // This device's sport choice for the "everyone" alerts (slate homer, TUDDY
  // red zone, LAMP called goal). All three on = every sport = the default.
  const [sports, setSports] = useState(['mlb', 'nfl', 'nhl'])

  useEffect(() => {
    setMounted(true)
    setPerm(permission())
    setHint(installHint())
    try { const saved = JSON.parse(localStorage.getItem('dash_push_sports') || 'null'); if (Array.isArray(saved) && saved.length) setSports(saved) } catch { /* default: all */ }
    currentSubscription().then((sub) => setClosedSite(Boolean(sub)))
    vapidPublicKey().then((key) => setPushReady(Boolean(key)))
  }, [])

  const toggleSport = async (key) => {
    const next = sports.includes(key) ? sports.filter((x) => x !== key) : [...sports, key]
    if (!next.length) return                    // at least one sport stays on
    setSports(next)
    try { localStorage.setItem('dash_push_sports', JSON.stringify(next)) } catch { /* per-device convenience only */ }
    if (closedSite) await subscribePush(next)   // store it server-side for this device
  }

  const toggleClosedSite = async () => {
    setBusy(true)
    setPushNote(null)
    if (closedSite) {
      await unsubscribePush()
      setClosedSite(false)
    } else {
      const res = await subscribePush(sports)
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

  // STEP 2, ONE BUTTON (front door B2, 2026-09-27). "Turn alerts on" (top
  // right) and "Also when the site is closed · Turn on" read like the same
  // switch twice. Now one button walks the device through what it needs --
  // permission, then (signed in, push available) the closed-site subscription
  // -- and the step always says where this device stands.
  const pushable = mounted && pushSupported() && pushReady
  const arm = async () => {
    if (!canNotify()) return
    const iosHint = installHint()
    if (iosHint) { setHint(iosHint); return }
    const granted = perm === 'granted' ? 'granted' : await requestPermission()
    setPerm(granted)
    if (granted !== 'granted') return
    setMaster(true)
    if (pushable && account.signedIn && !closedSite) await toggleClosedSite()
  }
  const turnOff = async () => {
    if (closedSite) await toggleClosedSite()
    setMaster(false)
  }
  // Where this device stands, in words.
  const device = !mounted ? { state: 'checking', word: 'Checking this browser…' }
    : !canNotify() ? { state: 'unsupported', word: 'Not supported in this browser' }
    : perm === 'denied' ? { state: 'blocked', word: 'Blocked in this browser' }
    : perm !== 'granted' || !prefs.on ? { state: 'off', word: 'Off on this device' }
    : pushable && account.signedIn && !closedSite ? { state: 'partial', word: 'On while the site is open' }
    : { state: 'on', word: pushable && closedSite ? 'On ✓ · even with the site closed' : 'On ✓ · while the site is open' }

  const active = presetOf(prefs.events)
  const onCount = CATEGORIES.filter((c) => c.push && prefs.events[c.key]).length
  // What a preset includes, by product ("MOONSHOT 6 · TUDDY 3 · LAMP 1").
  const includes = (p) => GROUPS.map((g) => {
    const n = CATEGORIES.filter((c) => c.group === g.key && p.on.includes(c.key)).length
    return n ? `${g.label.split(' · ')[0]} ${n}` : null
  }).filter(Boolean).join(' · ')

  const row = (cat) => {
    const on = Boolean(prefs.events[cat.key])
    return (
      <li key={cat.key}>
        <button
          type="button"
          onClick={() => setCategory(cat.key, !on)}
          aria-pressed={on}
          className={on ? styles.alertOn : styles.alertOff}
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
      {/* ONE HEADING (front door B1, 2026-09-27): the fold's own summary line
          is the section title. The "ALERTS" eyebrow + "Tell me when." heading
          that sat under it (half hidden by the summary's focus box) are gone;
          the device's state lives in step 2, where it can be acted on. */}
      {hint ? <p className={styles.muted}>{hint}</p> : null}

      {/* ── STEP 1 · WHAT TO SEND ──────────────────────────────────────── */}
      <p className={styles.alertStep}>1 · What to send</p>
      {/* PRESETS (B3): unselected = outlined and clearly tappable, selected =
          the filled orange; each says what it includes, by product. Choosing
          one works before the device is set up -- the choice is saved either
          way. */}
      <div className={styles.presetRow}>
        {PRESETS.map((p) => {
          const isOn = active === p.key
          return (
            <button
              key={p.key}
              type="button"
              className={isOn ? `${styles.presetBtn} ${styles.presetBtnOn}` : styles.presetBtn}
              onClick={() => setPreset(p.key)}
              aria-pressed={isOn}
            >
              <b>{p.label}{isOn ? ' ✓' : ''}</b>
              <small>{includes(p)}</small>
            </button>
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

      {/* SPORTS ON THIS DEVICE: filters only the alerts about nobody in
          particular; the names you follow always come through. */}
      <div className={styles.presetRow} role="group" aria-label="Sports on this device">
        {[['mlb', 'MLB'], ['nfl', 'NFL'], ['nhl', 'NHL']].map(([k, label]) => (
          <button key={k} type="button" aria-pressed={sports.includes(k)}
            className={sports.includes(k) ? `${styles.presetBtn} ${styles.presetBtnOn}` : styles.presetBtn}
            onClick={() => toggleSport(k)}>
            <b>{label}{sports.includes(k) ? ' ✓' : ''}</b>
          </button>
        ))}
      </div>
      <p className={styles.muted} style={{ marginTop: 0 }}>Sports this device hears slate-wide alerts for. Players you follow always come through.</p>

      <button
        type="button"
        className={styles.armBtn}
        onClick={() => setShowAll(!showAll)}
        aria-expanded={showAll}
        style={{ margin: '4px 0 10px', minHeight: 44 }}
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

      {/* ── STEP 2 · THIS DEVICE ─────────────────────────────────────────
          One button, its state always shown (B2): Off -> Allow alerts on this
          device -> On ✓ (and, signed in with push available, on with the
          site closed too -- that subscription sends one straight back). */}
      <p className={styles.alertStep}>2 · This device</p>
      <div className={styles.closedSite}>
        <div>
          <b className={device.state === 'on' ? styles.deviceOn : device.state === 'blocked' ? styles.deviceBad : undefined}>{device.word}</b>
          <small>
            {device.state === 'blocked'
              ? 'This browser blocked alerts for this site. Allow notifications in the site settings (the icon left of the address), then come back and tap again.'
              : device.state === 'unsupported'
                ? (hint || 'This browser can’t show alerts. On an iPhone, add the site to the Home Screen first.')
                : device.state === 'partial'
                  ? 'Alerts show while a tab is open. One more tap and they reach this device with the site closed -- checked every minute during games.'
                  : pushable && !account.signedIn
                    ? 'Alerts show while a tab is open. Sign in above and they can reach this device with the site closed too.'
                    : 'Everything picked in step 1, on this device. Checked every minute during games -- not instantly, nothing here holds a live line to the league.'}
          </small>
        </div>
        {device.state === 'off' || device.state === 'partial' ? (
          <button type="button" onClick={arm} disabled={busy} className={styles.deviceBtn}>
            {busy ? 'Working…' : device.state === 'partial' ? 'Also with the site closed' : 'Allow alerts on this device'}
          </button>
        ) : device.state === 'on' ? (
          <button type="button" onClick={turnOff} disabled={busy} className={styles.deviceOff}>{busy ? 'Working…' : 'Turn off on this device'}</button>
        ) : null}
      </div>
      {pushNote ? <p className={styles.muted}>{pushNote}</p> : null}

      {/* RECENT ALERTS (B4): the last few this account was sent, every sport,
          with the state word; "Show all" opens the rest. Signed in only (the
          log belongs to an account). */}
      <RecentAlerts styles={styles} enabled={mounted && account.signedIn} emptyText="No alerts yet. They'll show here as they're sent." />

      <p className={styles.muted}>
        {account.signedIn
          ? 'These choices are saved to your account. Whether this particular browser is allowed to show notifications is a per-device permission, so each phone or laptop still has to be armed once.'
          : 'Saved on this device. Sign in above and the choices follow you; the permission itself is always per-device.'}
        {' '}{(() => {
          // Front door A6 (2026-09-27): true only while no "everyone" switch
          // (Any slate homer, Any CALLED goal) is on.
          const wide = CATEGORIES.filter((c) => c.scope === 'everyone' && prefs.events?.[c.key]).map((c) => c.label)
          return wide.length
            ? `Nothing arrives about a player you have not followed, except ${wide.join(' and ')} — switched on above, and about everyone.`
            : 'And nothing arrives about a player you have not followed — that gate is separate from every switch on this page.'
        })()}
      </p>
    </div>
  )
}
