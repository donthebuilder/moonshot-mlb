'use client'
import { useEffect, useState } from 'react'
import { C as MLB_C, NUM_FONT as MLB_NUM } from '../lib/theme'

// ── THE DATE SWITCH, ONE CONTROL FOR BOTH PRODUCTS (2026-09-18) ────────────
// Donovan, with both headers side by side: "there should be zero difference,
// besides it being moonshot and tuddy. instead of today and tomrrow for nfl
// add this week and next week."
//
// This was MOONSHOT's own DateMode, defined privately inside Header.js. TUDDY
// had nothing in that corner at all -- it carried a freshness stamp instead,
// which has moved into the ticker as a BUILT pill, where MOONSHOT has always
// kept it. Same component, same markup, same .date-mode-switch/.date-badge
// classes MobileCSS already targets; only the two segment labels differ:
//
//   MOONSHOT   Today / Tmrw          (today_slim.json / tomorrow_slim.json)
//   TUDDY      This week / Next week (nfl_week.json / nfl_next_week.json)
//
// `theme`/`numFont` are optional props defaulting to MOONSHOT's, the same
// sport-adapter pattern ScoreRail, PageHeader and TickerPill use.

export default function DateMode({
  label,
  value,
  onChange,
  options,
  theme = null,
  numFont = null,
}) {
  const T = theme || MLB_C
  const NF = numFont || MLB_NUM
  // The clock is the second line of the badge on both products. It ticks on
  // its own rather than riding a data refresh, so a header sitting open
  // overnight doesn't claim it is still yesterday.
  const [time, setTime] = useState('')
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    tick()
    const id = setInterval(tick, 30000)
    return () => clearInterval(id)
  }, [])

  const seg = ({ key, text, color }) => {
    const on = value === key
    return (
      <button key={key} onClick={() => onChange?.(key)} aria-pressed={on} style={{
        padding: '4px 10px', fontSize: 10.5, fontWeight: 800, cursor: 'pointer', border: 'none',
        background: on ? color : 'transparent', color: on ? T.bg : T.text3,
        transition: 'background .12s, color .12s', borderRadius: 999,
      }}>{text}</button>
    )
  }

  return (
    <div className="date-mode-switch" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div className="date-badge" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.1 }}>
        <span style={{ fontSize: 11.5, color: T.text2, fontFamily: NF, fontWeight: 800 }}>{label}</span>
        <span style={{ fontSize: 9.5, color: T.text3, fontFamily: NF }}>{time}</span>
      </div>
      <div style={{ display: 'flex', padding: 2, borderRadius: 999, border: `1px solid ${T.border}`, background: T.glass, gap: 2 }}>
        {(options || []).map(seg)}
      </div>
    </div>
  )
}
