'use client'
import { C as NFL_C, NUM_FONT as NFL_NUM } from '../../lib/nfl/theme'

// THIS SEASON | LAST SEASON | LAST 2 -- one row of three big buttons. Rendered only
// when the log holds more than one season (lib/nfl/seasonWindow.js); the years it
// stands for sit under the row so nothing is a guess.
// GENERALISED (BUCKETS, 2026-10-07): another product passes its own theme / accent / year words; with none
// of them this is TUDDY's toggle, unchanged (green, the NFL fonts, bare years).
export default function SeasonToggle({ options, value, onChange, theme = NFL_C, numFont = NFL_NUM, accent = null, yearLabel = null }) {
  const C = theme, NUM_FONT = numFont, on_ = accent || C.green
  if (!options?.length) return null
  const cur = options.find((o) => o.key === value) || options[0]
  return (
    <div style={{ margin: '0 0 12px' }}>
      <div role="group" aria-label="Season" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {options.map((o) => {
          const on = o.key === cur.key
          return (
            <button key={o.key} type="button" aria-pressed={on} onClick={() => onChange(o.key)} style={{
              minHeight: 44, padding: '0 14px', borderRadius: 10, cursor: 'pointer', fontFamily: NUM_FONT,
              fontSize: 12, fontWeight: 800, letterSpacing: '.05em', whiteSpace: 'nowrap',
              border: `1px solid ${on ? on_ : C.border}`, background: on ? `${on_}22` : 'transparent',
              color: on ? on_ : C.text2,
            }}>{o.label}</button>
          )
        })}
      </div>
      <div style={{ fontFamily: NUM_FONT, fontSize: 12, color: C.text3, marginTop: 6 }}>
        {[...cur.years].reverse().map((y) => (yearLabel ? yearLabel(y) : y)).join(' + ')} games
      </div>
    </div>
  )
}
