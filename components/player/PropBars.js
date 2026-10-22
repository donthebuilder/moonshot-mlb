'use client'
import { useEffect, useRef } from 'react'

// 📊 PROP BARS -- one bar a game against the line (2026-10-21, Donovan's PropFinder screenshots: "id rather see bars kinda
// like propfinder"). Height = what he did; the bar is lit in the product's accent when he cleared the line, quiet when not;
// the line runs across. Optional per game: `c` = the chance behind the result in the SAME unit (3PA behind 3PM, potential
// assists behind assists), drawn as a hollow bar behind; `rk` = the opponent's rank of 30 at giving the stat up, over the
// bar, lit when `soft`. `sub` = one quiet line under the date (his minutes). Counts only, never a chance in percent.
// Sport-free: the caller passes its games, line, theme and accent. Scrolls in its own box on a phone (bars keep 30px).

const H = 132            // the bar area
const BAR_W = 30
const LAB = 58           // the date / club / minutes block under each bar (the club may be a tap target)

export default function PropBars({ games = [], line, C, NUM_FONT, accent, lineWord = '' }) {
  // newest is on the right: open the scroll box there, again whenever the games change
  const box = useRef(null)
  const sig = games.map((g) => g.key).join(',')
  useEffect(() => { const el = box.current; if (el) el.scrollLeft = el.scrollWidth }, [sig])
  if (!games.length) return null
  const top = Math.max(line || 0, ...games.map((g) => Math.max(g.v ?? 0, g.c ?? 0)), 1) * 1.12
  const y = (v) => Math.round((Math.max(0, v) / top) * H)
  const lineY = line != null ? y(line) : null
  return (
    <div ref={box} className="dense-scroll" style={{ overflowX: 'auto', paddingBottom: 4 }}>
      <div style={{ position: 'relative', display: 'flex', gap: 4, alignItems: 'flex-end', minWidth: games.length * (BAR_W + 4) + 8, padding: '30px 4px 0' }}>
        {lineY != null && (
          <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: LAB + lineY, borderTop: `1.5px solid ${accent}`, zIndex: 2, pointerEvents: 'none' }}>
            {lineWord ? <span style={{ position: 'absolute', right: 0, top: -16, font: `800 10px/1 ${NUM_FONT}`, color: accent, background: C.bg, padding: '2px 4px', borderRadius: 4 }}>{lineWord}</span> : null}
          </div>
        )}
        {games.map((g, i) => (
          <div key={g.key || i} title={g.title || ''} style={{ flex: '1 0 auto', minWidth: BAR_W, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ position: 'relative', width: '100%', height: H, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
              {g.c != null && g.c > 0 && (
                <div style={{ position: 'absolute', bottom: 0, width: '78%', height: y(g.c), border: `1px solid ${C.text3}`, borderBottom: 'none', borderRadius: '3px 3px 0 0' }}>
                  <span style={{ position: 'absolute', top: 2, left: 0, right: 0, textAlign: 'center', font: `700 10px/1 ${NUM_FONT}`, color: C.text2 }}>{g.c}</span>
                </div>
              )}
              <div style={{ position: 'relative', width: '78%', height: Math.max(y(g.v ?? 0), 2), background: g.on ? accent : C.border2, borderRadius: '3px 3px 0 0', opacity: g.on ? 0.9 : 1 }}>
                <span style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', font: `900 11px/1 ${NUM_FONT}`, color: g.on ? C.bg : C.text, ...(y(g.v ?? 0) >= 16 ? { top: 3 } : { bottom: '100%', marginBottom: 2, color: C.text }) }}>{g.v ?? '—'}</span>
              </div>
              {g.rk != null && <span style={{ position: 'absolute', bottom: Math.max(y(g.v ?? 0), g.c ? y(g.c) : 0) + 16, font: `${g.soft ? 900 : 600} 10px/1 ${NUM_FONT}`, color: g.soft ? accent : C.text3 }}>R:{g.rk}</span>}
            </div>
            <div style={{ height: LAB, paddingTop: 4, textAlign: 'center', font: `600 10px/1.25 ${NUM_FONT}`, color: C.text3, whiteSpace: 'nowrap' }}>
              <div>{g.top}</div>
              <div>{g.bot}</div>
              {g.sub ? <div style={{ color: C.text2 }}>{g.sub}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
