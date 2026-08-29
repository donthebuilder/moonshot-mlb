'use client'

// What this browser is holding, and the way to empty it.
//
// The synced keys are the account's copy; this is the LOCAL copy of the same
// things, plus the device-only settings that deliberately never sync (theme,
// palette, where you dragged the nav). Two honest reasons for it to exist:
//
//   1. "Is it actually saving?" is a fair question with no answer anywhere
//      else on the site. A count you can look at beats a promise.
//   2. A shared or borrowed browser needs a way out that is not "clear your
//      whole browser history".
//
// CLEARING IS LOCAL AND ONLY LOCAL. It empties this browser; the account keeps
// everything, and signing in again pulls it straight back. That is said on the
// button itself, because "clear" reads as "delete forever" and here it is not.
// The one case where it IS destructive — signed out, this browser is the only
// copy — is the case the confirmation names.

import { useEffect, useState } from 'react'

import { useDashAccount } from '../lib/dash/sync'

// The keys the site writes. Grouped, because "17 items" means nothing while
// "watchlist, picks, notes" means something.
const GROUPS = [
  { label: 'Watchlist and Following', keys: ['mlb_watchlist_v1', 'tuddy_watchlist_v1', 'dash_follow_v1'] },
  { label: 'Your picks', keys: ['my_picks_v1', 'nfl_my_picks_v1'] },
  { label: 'Watchlist record', keys: ['watch_ledger_v1'] },
  { label: 'Player notes', keys: ['moonshot_player_notes_v1'] },
  { label: 'Alert choices', keys: ['dash_alerts_v1', 'wire_notif'] },
  { label: 'This device only (theme, layout)', keys: ['moonshot_theme_v1', 'ms_spotlight_v2', 'moonshot_quiet_v1', 'dash-network-nav-v1', 'home_view', 'moonshot_sport_v1'] },
]

const sizeOf = (key) => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? raw.length : 0
  } catch { return 0 }
}

export default function DeviceData({ styles }) {
  const account = useDashAccount()
  const [rows, setRows] = useState([])
  const [cleared, setCleared] = useState(false)

  const read = () => setRows(GROUPS.map((group) => ({
    label: group.label,
    keys: group.keys,
    bytes: group.keys.reduce((sum, key) => sum + sizeOf(key), 0),
    present: group.keys.filter((key) => sizeOf(key) > 0).length,
  })))

  useEffect(() => { read() }, [])

  const clear = () => {
    const warning = account.signedIn
      ? 'Empty this browser? Your account keeps everything — it comes back next time you sign in here.'
      : 'You are signed out, so this browser is the ONLY copy of these lists. Emptying it deletes them for good. Continue?'
    if (!window.confirm(warning)) return
    GROUPS.forEach((group) => group.keys.forEach((key) => {
      try { localStorage.removeItem(key) } catch { /* ignore */ }
    }))
    try { localStorage.removeItem('dash_sync_meta_v1') } catch { /* ignore */ }
    read()
    setCleared(true)
  }

  const total = rows.reduce((sum, row) => sum + row.bytes, 0)

  return (
    <div className={styles.deviceData}>
      <ul>
        {rows.map((row) => (
          <li key={row.label}>
            <span>{row.label}</span>
            <b>{row.present ? `${(row.bytes / 1024).toFixed(1)} KB` : 'empty'}</b>
          </li>
        ))}
      </ul>
      <p className={styles.muted}>
        {total ? `${(total / 1024).toFixed(1)} KB in this browser. ` : 'Nothing saved in this browser yet. '}
        {account.signedIn
          ? 'Everything above the last row is also on your account.'
          : 'Signed out, so this browser is the only copy.'}
      </p>
      <button type="button" onClick={clear} className={styles.danger}>
        {cleared ? 'Emptied' : 'Empty this browser'}
      </button>
    </div>
  )
}
