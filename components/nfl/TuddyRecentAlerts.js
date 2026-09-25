'use client'
// RECENT ALERTS, inside TUDDY (2026-09-24, audit item 20 / brand rule 20).
//
// MOONSHOT's only view of "what actually reached my phone" lives on the
// front door's Alerts panel, mixed across sports. A football visitor never
// sees it. This is the same reader (components/RecentAlerts.js, reading
// dash_push_log through /api/dash/push/log) narrowed to NFL rows and dressed
// in TUDDY's chrome, mounted at the foot of the Watchlist -- the page that
// holds the names the alerts are about. Sent / bundled / dropped, per event;
// nothing here writes.
//
// Signed out it does not pretend: the log belongs to an account, so it says
// so and points at sign-in, with `next` bringing the person straight back.
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../../lib/nfl/theme'
import { useDashAccount } from '../../lib/dash/sync'
import RecentAlerts from '../RecentAlerts'

const LOGIN_HREF = '/login?next=' + encodeURIComponent('/app#sport=nfl&tab=watchlist')

export default function TuddyRecentAlerts() {
  const account = useDashAccount()
  // Mount flag: the account store is client-only, so the first paint on the
  // server has signedIn=false. Rendering the sign-in line there and then the
  // list on the client is one flash the phone does not need.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted || !account.ready) return null

  return (
    <section aria-label="Recent alerts" style={{
      marginTop: 12, padding: '12px 13px', border: `1px solid ${C.border}`, borderRadius: 12,
      background: C.bg2, color: C.text2, fontSize: 12, lineHeight: 1.4,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: account.signedIn ? 0 : 4 }}>
        <span style={{ color: C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.1em', textTransform: 'uppercase' }}>What reached your phone</span>
        <span style={{ color: C.text3, font: `700 8px/1 ${NUM_FONT}` }}>NFL · sent / bundled / dropped</span>
      </div>
      {account.signedIn
        ? <RecentAlerts enabled sport="nfl" emptyWord="touchdown" />
        : <div>
            <b>Recent alerts</b>
            <small style={{ display: 'block', marginTop: 2, color: C.text3 }}>
              The alert log belongs to an account. <a href={LOGIN_HREF} style={{ color: C.green }}>Sign in</a> to see which touchdowns, kickoffs and bar clears were sent to this phone — and which were dropped.
            </small>
          </div>}
    </section>
  )
}
