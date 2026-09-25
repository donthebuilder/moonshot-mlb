'use client'

// RECENT ALERTS -- what this account's phones were actually sent (2026-09-14).
//
// The audit found the one thing nobody could see: the quiet lanes DROP an
// event that loses its slot, and the only record was a counter in the cron's
// JSON return. This reads dash_push_log back (app/api/dash/push/log) and shows
// each event with its outcome, so "I turned on multi-hit and never got one"
// has an answer on the page instead of in a database.
//
// Phone-first: five rows by default, the rest behind one tap. Anything that
// adds scroll on a phone is a problem (Donovan, standing rule).
//
// 2026-09-24: also mounted inside TUDDY (components/nfl/TuddyRecentAlerts.js),
// so `sport` narrows the read to one product and `styles` is optional -- the
// front door passes its CSS module, an in-app host passes nothing and wraps
// the list in its own chrome. `emptyWord` is the product's own word for a
// followed event ("homer" on the front door, "touchdown" in TUDDY).

import { useEffect, useState } from 'react'

const PREVIEW = 5

const OUTCOME = {
  sent: { word: 'sent', tone: 'ok' },
  bundled: { word: 'bundled', tone: 'ok' },
  dropped: { word: 'dropped', tone: 'warn' },
  failed: { word: 'failed', tone: 'bad' },
}

const when = (iso) => {
  const t = Date.parse(iso || '')
  if (!Number.isFinite(t)) return ''
  const mins = Math.round((Date.now() - t) / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.round(mins / 60)
  if (hrs < 48) return `${hrs}h`
  return `${Math.round(hrs / 24)}d`
}

export default function RecentAlerts({ styles = null, enabled, sport = null, emptyWord = 'homer' }) {
  const [rows, setRows] = useState(null)
  const [reason, setReason] = useState(null)
  const [all, setAll] = useState(false)

  useEffect(() => {
    if (!enabled) return
    let live = true
    const url = sport ? `/api/dash/push/log?sport=${encodeURIComponent(sport)}` : '/api/dash/push/log'
    fetch(url, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (live) { setRows(Array.isArray(j?.rows) ? j.rows : []); setReason(j?.reason || null) } })
      .catch(() => { if (live) { setRows([]); setReason('fetch-failed') } })
    return () => { live = false }
  }, [enabled, sport])

  if (!enabled) return null

  // One line per event, not per device: two phones on one account would
  // otherwise show every homer twice. Keep the loudest outcome (a drop on one
  // device is worth knowing even if the other got it).
  const seen = new Map()
  for (const r of rows || []) {
    const prev = seen.get(r.event_key)
    if (!prev || (r.outcome === 'dropped' && prev.outcome !== 'dropped')) seen.set(r.event_key, r)
  }
  const list = [...seen.values()]
  const dropped = list.filter((r) => r.outcome === 'dropped').length
  const shown = all ? list : list.slice(0, PREVIEW)

  return (
    <div className={styles?.closedSite} style={{ display: 'block' }}>
      <b>Recent alerts</b>
      <small style={{ display: 'block', marginTop: 2 }}>
        {rows === null
          ? 'Loading…'
          : !list.length
            ? (reason === 'no-table' ? 'Not recording yet.' : `Nothing sent to this account yet — the first followed ${emptyWord} will show up here.`)
            : `Last ${list.length}${dropped ? ` · ${dropped} dropped for losing the 10- or 30-minute window` : ''}`}
      </small>
      {shown.length ? (
        <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gap: 4 }}>
          {shown.map((r) => {
            const o = OUTCOME[r.outcome] || { word: r.outcome, tone: 'ok' }
            return (
              <li key={`${r.event_key}:${r.endpoint_hash}`} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12, lineHeight: 1.35 }}>
                <span style={{ opacity: .55, minWidth: 28, fontVariantNumeric: 'tabular-nums' }}>{when(r.at)}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <b>{r.title}</b>{r.body ? <span style={{ opacity: .7 }}> · {r.body}</span> : null}
                </span>
                <em style={{
                  fontStyle: 'normal', fontSize: 10, letterSpacing: '.04em', textTransform: 'uppercase',
                  opacity: o.tone === 'ok' ? .55 : 1,
                  color: o.tone === 'warn' ? 'var(--warn, #d9a520)' : o.tone === 'bad' ? 'var(--bad, #e5484d)' : 'inherit',
                }}>{o.word}</em>
              </li>
            )
          })}
        </ul>
      ) : null}
      {list.length > PREVIEW ? (
        <button type="button" className={styles?.armBtn} style={styles ? { marginTop: 8 } : { marginTop: 8, padding: '6px 10px', border: '1px solid currentColor', borderRadius: 8, background: 'transparent', color: 'inherit', font: 'inherit', fontSize: 11, cursor: 'pointer' }} onClick={() => setAll(!all)} aria-expanded={all}>
          {all ? 'Show fewer' : `Show all ${list.length}`}
        </button>
      ) : null}
    </div>
  )
}
