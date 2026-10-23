'use client'
import { useEffect, useState } from 'react'
import { fmtCountdown } from '../../lib/headlines'
import { SPORT_ACCENT } from '../../lib/sportAccent'

// THE GREETING, EVERY PRODUCT'S HOME (2026-10-22, TUDDY's built first; Donovan: "I still want a greeting ... the headlines and the
// stuff kind of still need to be all in a greeting"). One block: the day (eyebrow), then the next game as "Patriots at Bears · kicks
// off in 7h 54m" (a clock, ticking every 30 s) -- or the day's own line when nothing is still to start -- then a row of small tiles
// (the record, the top score, the slate), then whatever strip the page passes (the headlines + stories). Sport-free: the page hands
// its words. `kick` = { away, home (the names to print), start (ms) } | null; `verb` = 'kicks off' / 'drops the puck' / 'tips off'.
export default function HomeGreeting({ sport, theme: C, numFont, icon = '', eyebrow = '', live = false, kick = null, verb = 'starts', more = 0, lead = '', accentText = '', tiles = [], children = null }) {
  const accent = SPORT_ACCENT[sport] || C.text
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id) }, [])
  const ahead = kick && kick.start > now ? kick.start - now : null
  const when = ahead == null ? '' : ahead < 48 * 3600e3 ? `${verb} in ${fmtCountdown(ahead)}` : new Date(kick.start).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
  const h2 = { margin: 0, fontSize: 20, fontWeight: 900, lineHeight: 1.25, letterSpacing: '-.01em', color: C.text }
  return (
    <section aria-label="Today" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', minWidth: 0, gap: 10, padding: 12, border: `1px solid ${C.border}`, borderRadius: 14, background: C.bg2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.text3, font: `700 11px/1 ${numFont}`, letterSpacing: '.06em', textTransform: 'uppercase' }}>
        {icon ? <span aria-hidden="true">{icon}</span> : null}<span>{eyebrow}</span>{live ? <b style={{ color: accent, fontWeight: 900 }}>● LIVE</b> : null}
      </div>
      {when && !live ? (
        <h2 style={{ ...h2, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span>{kick.away} at {kick.home}</span><span style={{ color: accent }}>{when}</span>
          {more ? <small style={{ flexBasis: '100%', font: `700 11px/1 ${numFont}`, color: C.text3 }}>+{more} more that day</small> : null}
        </h2>
      ) : (
        <h2 style={h2}>{lead}{accentText ? <span style={{ color: accent }}>{' '}{accentText}</span> : null}</h2>
      )}
      {tiles.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))`, gap: 6 }}>
          {tiles.map((t) => {
            const Tag = t.onClick ? 'button' : 'div'
            return (
              <Tag key={t.label} {...(t.onClick ? { type: 'button', onClick: t.onClick, 'data-tile': 'stat' } : {})} title={t.title || undefined}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0, minHeight: 58, padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 10, background: C.bg2, color: 'inherit', textAlign: 'left', cursor: t.onClick ? 'pointer' : 'default', font: 'inherit' }}>
                <small style={{ color: C.text3, font: `900 10px/1 ${numFont}`, letterSpacing: '.08em' }}>{t.label}</small>
                <strong style={{ marginTop: 5, color: t.dim ? C.text3 : accent, font: `900 18px/1 ${numFont}` }}>{t.value}</strong>
                <span style={{ marginTop: 5, color: C.text2, fontSize: 11, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.sub}</span>
              </Tag>
            )
          })}
        </div>
      ) : null}
      {children}
    </section>
  )
}
