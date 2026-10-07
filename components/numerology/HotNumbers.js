'use client'
import { useEffect, useState } from 'react'
import { universal } from '../../lib/numerology/core'

// HOT NUMBERS (2026-09-27, BATCH-NUMEROLOGY step 6b). Two shapes:
//   full     the Numerology page: TODAY's three values most above chance
//            and TRENDING over the window, each "3 · 5 TDs vs 2.1 expected"
//   compact  the product's home: ONE line under the calls --
//            "TONIGHT'S NUMBERS · UNIVERSAL DAY 3 · HOT 3 · 8 · 11 · TRENDING 5",
//            tapping opens the Numerology page. Not in the header (the plan).
// Reads /api/numerology/hot. Nothing until a night is recorded, and it says so.
// What one recorded unit is called, per sport (football plays by game day).
const NIGHT_WORD = { nfl: 'game day' }
const fmtDay = (d) => String(d || '').slice(5).replace('-', '/').replace(/^0/, '')

export default function HotNumbers({ sport, date, theme: C, numFont, accent, compact = false, onOpen = null, eventWord = 'events' }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    let alive = true
    fetch(`/api/numerology/hot?sport=${encodeURIComponent(sport)}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive) setData(j) }).catch(() => {})
    return () => { alive = false }
  }, [sport])
  const u = date ? universal(date) : null
  // Tonight's live count (so far) leads until tonight is graded.
  const live = data?.live?.hot?.length ? data.live : null
  const hot = live ? live.hot : data?.today?.hot || []
  const trend = data?.trending || []
  const short = (r) => String(r.value)
  if (compact) {
    if (!u) return null
    return (
      <button type="button" onClick={onOpen || undefined} aria-label="Tonight's numbers — open the Numerology page"
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 44, padding: '6px 12px', border: `1px solid ${C.border}`, borderRadius: 10, background: C.bg2, color: C.text2, fontFamily: numFont, fontSize: 12, textAlign: 'left', cursor: onOpen ? 'pointer' : 'default', overflow: 'hidden', whiteSpace: 'nowrap' }}>
        <b style={{ color: accent, fontSize: 11, letterSpacing: '.08em' }}>NUMBERS</b>
        <span>UD <b style={{ color: C.text }}>{u.day.value}</b></span>
        {hot.length ? <span>· HOT <b style={{ color: C.text }}>{hot.map(short).join(' · ')}</b></span> : null}
        {trend[0] ? <span>· TRENDING <b style={{ color: C.text }}>{short(trend[0])}</b></span> : null}
        {onOpen ? <span style={{ marginLeft: 'auto', color: C.text3 }}>›</span> : null}
      </button>
    )
  }
  if (!data?.configured) return null
  const line = (r) => (
    <li key={`${r.kind}|${r.value}`} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '4px 0', borderTop: `1px solid ${C.border}`, fontSize: 12 }}>
      <b style={{ fontFamily: numFont, fontSize: 18, color: C.text, minWidth: 34 }}>{r.value}</b>
      <span style={{ color: C.text2 }}>{r.label}</span>
      <span style={{ marginLeft: 'auto', fontFamily: numFont, color: C.text3 }}>{r.events} {eventWord} vs {Number(r.expected).toFixed(1)} expected</span>
    </li>
  )
  return (
    <section aria-label="Hot numbers" style={{ padding: '11px 12px', border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2 }}>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.1em', color: accent, fontFamily: numFont, marginBottom: 4 }}>HOT NUMBERS</div>
      {live && (
        <>
          <div style={{ fontSize: 11, color: C.text3, marginTop: 4 }}>TONIGHT · SO FAR · {live.events} {eventWord} · replaced by the graded night after the final</div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{live.hot.map(line)}</ul>
        </>
      )}
      {!data.nights ? (
        // HOT-NUMBERS-FIX item 4: say which night is first and when it fills in.
        <div style={{ fontSize: 12, color: C.text3, marginTop: live ? 8 : 0 }}>{data.first
          ? <>First {NIGHT_WORD[sport] || 'night'} on record: {data.first.teams.length && data.first.teams.length <= 4 ? data.first.teams.join(' · ') : `${data.first.players} players`}, {data.first.day === date ? 'tonight' : fmtDay(data.first.day)}. Fills in after the final{live ? '; the count above is live' : ''}.</>
          : <>No night recorded yet. The first graded {NIGHT_WORD[sport] || 'night'} fills this in: which jersey, root, life path, name value or first letter the {eventWord} landed on, against chance.</>}</div>
      ) : (
        <>
          <div style={{ fontSize: 11, color: C.text3, marginTop: live ? 8 : 4 }}>{live ? 'LAST GRADED' : 'TODAY'}{data.today?.day ? ` · ${fmtDay(data.today.day)}` : ''}</div>
          {(data.today?.hot || []).length ? <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{data.today.hot.map(line)}</ul> : <div style={{ fontSize: 12, color: C.text3 }}>Nothing ran above chance.</div>}
          <div style={{ fontSize: 11, color: C.text3, marginTop: 8 }}>TRENDING · last {data.windowDays} days · {data.nights} night{data.nights === 1 ? '' : 's'}{data.rebuiltNights ? ` (${data.rebuiltNights} rebuilt after the fact, not frozen pregame)` : ''}</div>
          {trend.length ? <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{trend.map(line)}</ul> : <div style={{ fontSize: 12, color: C.text3 }}>Nothing ran above chance.</div>}
        </>
      )}
      <div style={{ marginTop: 6, fontSize: 11, color: C.text3 }}>Expected = the value&apos;s share of everyone who played. Pattern watching, never part of a score.</div>
    </section>
  )
}
