'use client'
import { useEffect, useRef } from 'react'
import { alpha } from '../../lib/scales'
import { teamHref } from '../../lib/routes'

// 📊 PROP BARS -- one bar a game against the line (2026-10-21, Donovan's PropFinder screenshots: "id rather see bars kinda
// like propfinder"). Height = what he did; the bar is lit in the product's accent when he cleared the line, quiet when not;
// the line runs across. Optional per game: `c` = the chance behind the result in the SAME unit (3PA behind 3PM, potential
// assists behind assists), drawn as a hollow bar behind; `rk` = the opponent's rank of 30 at giving the stat up, over the
// bar, lit when `soft`. `sub` = one quiet line under the date (his minutes). Counts only, never a chance in percent.
// Sport-free: the caller passes its games, line, theme and accent. Scrolls in its own box on a phone (bars keep 30px).
//
// ONE BAR CHART FOR EVERY SPORT (2026-10-22, Donovan: "we kind of made a bar chart with the basketball player model ...
// figure out what's missing ... then combine and share and use that"). This is now the chart on every player card:
// MOONSHOT (components/ThresholdGrid), TUDDY (nfl/PropsGrid), LAMP (lamp/goal/GoalRun's grid) and BUCKETS (PlayerBars).
// What it took from MOONSHOT's old ValueBars, so nothing was lost in the swap:
//   avg        the dashed rule at his average over the bars in view (on by default)
//   streak     the run band welded under the bars, one segment per run of clears or misses, its length on runs of 3+
//   selected / onSelect   tap a bar to pin that game (a ring on it); the caller draws the pinned game's line

const H = 132            // the bar area
const BAR_W = 30
const LAB = 58           // the date / club / minutes block under each bar (the club may be a tap target)

export default function PropBars({ games = [], line, C, NUM_FONT, accent, lineWord = '', avg = true, streak = true, selected = null, onSelect = null }) {
  // newest is on the right: open the scroll box there, again whenever the games change
  const box = useRef(null)
  const sig = games.map((g) => g.key).join(',')
  useEffect(() => { const el = box.current; if (el) el.scrollLeft = el.scrollWidth }, [sig])
  if (!games.length) return null
  const top = Math.max(line || 0, ...games.map((g) => Math.max(g.v ?? 0, g.c ?? 0)), 1) * 1.12
  const y = (v) => Math.round((Math.max(0, v) / top) * H)
  const lineY = line != null ? y(line) : null
  const vals = games.map((g) => g.v).filter((v) => v != null && Number.isFinite(Number(v)))
  const avgV = avg && vals.length > 1 ? vals.reduce((a, v) => a + Number(v), 0) / vals.length : null
  // the runs, in the order the bars are drawn (oldest left): one entry per bar
  const runs = (() => {
    const out = new Array(games.length).fill(null)
    let i = 0
    while (i < games.length) {
      const ok = !!games[i].on
      let j = i
      while (j < games.length && !!games[j].on === ok) j++
      for (let k = i; k < j; k++) out[k] = { ok, len: j - i, first: k === i, last: k === j - 1, mid: k === i + ((j - i - 1) >> 1) }
      i = j
    }
    return out
  })()
  const BAND = streak ? 11 : 0
  return (
    <div ref={box} data-bars="" className="dense-scroll" style={{ overflowX: 'auto', paddingBottom: 4 }}>
      <div style={{ position: 'relative', display: 'flex', gap: 4, alignItems: 'flex-end', minWidth: games.length * (BAR_W + 4) + 8, padding: '30px 4px 0' }}>
        {lineY != null && (
          <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: LAB + BAND + lineY, borderTop: `1.5px solid ${accent}`, zIndex: 2, pointerEvents: 'none' }}>
            {lineWord ? <span style={{ position: 'absolute', right: 0, top: -16, font: `800 10px/1 ${NUM_FONT}`, color: accent, background: C.bg, padding: '2px 4px', borderRadius: 4 }}>{lineWord}</span> : null}
          </div>
        )}
        {avgV != null && (
          <div aria-hidden title={`his average: ${avgV.toFixed(1)} a game in view`} style={{ position: 'absolute', left: 0, right: 0, bottom: LAB + BAND + y(avgV), borderTop: `1px dashed ${C.text3}`, zIndex: 1, pointerEvents: 'none' }} />
        )}
        {games.map((g, i) => {
          const isSel = selected != null && selected === g.key
          const rm = streak ? runs[i] : null
          return (
          <div key={g.key || i} title={g.title || ''}
            onClick={onSelect ? () => onSelect(isSel ? null : g.key) : undefined}
            style={{ flex: '1 0 auto', minWidth: BAR_W, maxWidth: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: onSelect ? 'pointer' : 'default' }}>
            <div style={{ position: 'relative', width: '100%', height: H, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
              {g.c != null && g.c > 0 && (
                <div style={{ position: 'absolute', bottom: 0, width: '78%', height: y(g.c), border: `1px solid ${C.text3}`, borderBottom: 'none', borderRadius: '3px 3px 0 0' }}>
                  <span style={{ position: 'absolute', top: 2, left: 0, right: 0, textAlign: 'center', font: `700 10px/1 ${NUM_FONT}`, color: C.text2 }}>{g.c}</span>
                </div>
              )}
              <div style={{ position: 'relative', width: '78%', height: Math.max(y(g.v ?? 0), 2), background: g.on ? accent : C.border2, borderRadius: '3px 3px 0 0', opacity: g.on ? 0.9 : 1, boxShadow: isSel ? `0 0 0 1.5px ${C.text}` : 'none' }}>
                <span style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', font: `900 11px/1 ${NUM_FONT}`, color: g.on ? C.bg : C.text, ...(y(g.v ?? 0) >= 16 ? { top: 3 } : { bottom: '100%', marginBottom: 2, color: C.text }) }}>{g.v ?? '—'}</span>
              </div>
              {g.rk != null && <span style={{ position: 'absolute', bottom: Math.max(y(g.v ?? 0) >= 16 ? y(g.v ?? 0) : y(g.v ?? 0) + 14, g.c ? y(g.c) : 0) + 4, font: `${g.soft ? 900 : 600} 10px/1 ${NUM_FONT}`, color: g.soft ? accent : C.text3 }}>R:{g.rk}</span>}
            </div>
            {streak && (
              // THE RUN BAND: one continuous segment per run, bridged across the gap, its length on the middle bar of 3+
              <div aria-hidden style={{ position: 'relative', width: '100%', height: BAND, marginTop: 2 }}>
                {rm && <div style={{ position: 'absolute', top: 0, bottom: 2, left: rm.first ? 0 : -2, right: rm.last ? 0 : -2,
                  background: rm.ok ? alpha(accent, 0.2) : 'transparent', borderTop: `1.5px solid ${rm.ok ? accent : C.border2}`,
                  borderRadius: `${rm.first ? 3 : 0}px ${rm.last ? 3 : 0}px 0 0` }} />}
                {rm && rm.mid && rm.len >= 3 && <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', font: `900 8px/1 ${NUM_FONT}`, color: rm.ok ? accent : C.text3 }}>{rm.len}</span>}
              </div>
            )}
            <div style={{ height: LAB, paddingTop: 4, textAlign: 'center', font: `600 10px/1.25 ${NUM_FONT}`, color: isSel ? C.text : C.text3, whiteSpace: 'nowrap' }}>
              <div>{g.top}</div>
              <div>{g.bot}</div>
              {g.sub ? <div style={{ color: C.text2 }}>{g.sub}</div> : null}
            </div>
          </div>
          )
        })}
      </div>
    </div>
  )
}

// the club under a bar opens that club's page (every club on the site is a link); the tap never pins the bar under it
export function TeamTap({ sport, code }) {
  const href = code ? teamHref(sport, code) : null
  if (!href) return <>{code || ''}</>
  return <a href={href} className="tap-link" onClick={(e) => e.stopPropagation()} style={{ color: 'inherit', textDecoration: 'none' }}>{code}</a>
}
