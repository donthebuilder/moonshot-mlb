'use client'
// THE ↻ (2026-10-02): MOONSHOT's Games-tab LiveStamp (components/tabs/
// Games.js) as one control every product's header carries -- a dot, "updated
// 2m ago", and the button. Tapping it refreshes every live view on the page
// (lib/liveRefresh.js); nothing on the site refreshes itself on a timer.
import { useEffect, useState } from 'react'
import { useSportTheme } from './SportTheme'
import { requestLiveRefresh, useLiveRefreshState } from '../lib/liveRefresh'

const ageText = (s) => (s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`)

export default function RefreshStamp({ live = false, compact = false, style = null }) {
  const { C, NUM_FONT, accent } = useSportTheme()
  const { at, pulling } = useLiveRefreshState()
  const [, tick] = useState(0)
  // the label's clock only (no fetch): redraw "updated Xm ago" every 30 s
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(id) }, [])
  const age = Math.max(0, Math.round((Date.now() - at) / 1000))
  const old = age > (live ? 300 : 1800)
  const dot = live ? (old ? C.amber || accent : C.green) : C.text3
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontFamily: NUM_FONT, fontSize: 11, color: C.text3, minWidth: 0, ...style }}>
      {!compact ? <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 999, background: dot, boxShadow: live && !old ? `0 0 6px ${dot}` : 'none', flexShrink: 0 }} /> : null}
      {!compact ? <span style={{ minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: old && live ? C.text2 : C.text3 }}>{live ? 'live · ' : ''}updated {ageText(age)}</span> : null}
      <button type="button" onClick={() => requestLiveRefresh('tap')} disabled={pulling}
        title="Pull the live scores, ledgers and boards on this page again now"
        aria-label={`Refresh live data, updated ${ageText(age)}`}
        style={{ marginLeft: compact ? 0 : 'auto', flexShrink: 0, minHeight: 44, minWidth: 44, padding: '0 14px', borderRadius: 999, cursor: pulling ? 'default' : 'pointer',
          border: `1px solid ${old && live ? accent : C.border2}`, background: 'transparent', color: old && live ? accent : C.text2,
          fontFamily: NUM_FONT, fontSize: 12, fontWeight: 800, opacity: pulling ? 0.6 : 1 }}>
        {pulling ? 'pulling…' : '↻ refresh'}
      </button>
    </div>
  )
}
