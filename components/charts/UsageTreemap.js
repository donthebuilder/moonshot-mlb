'use client'
// WHO GETS THE BALL, AS AREA (2026-10-19, Donovan picked T1 off the TUDDY Chart Lab: "one team, by position", on the
// team page). Shared: a sport passes its players ({ id, name, group, role, weeks }), its count chips and its groups;
// the layout is lib/charts/treemap.js. Each box's area is his share of the club's count; the club is split by group
// first (RB / WR / TE / QB for TUDDY). The quiet rule: neutral boxes; the product's accent only where he has had more
// of it over the club's last three games than over the season; less of it lately recedes. No glow. Tap a box: his
// line under the chart, and his page from there.
import { useMemo, useState } from 'react'
import { squarify, usageShares } from '../../lib/charts/treemap'
import { alpha } from '../../lib/scales'

const W = 358, H = 280, LAB = 14, G = 3
const MIN_TAP = 36   // viewBox units; the chart draws ~0.92x at a 360-wide phone, so 36 is ~33px there
const pct = (v) => `${Math.round(v * 100)}%`
const shortN = (n) => { const p = String(n || '').split(' '); return p.length > 1 ? `${p[0][0]}. ${p.slice(1).join(' ')}` : String(n || '') }
const fits = (t, w, fs) => t.length * fs * 0.6 <= w - 10

export default function UsageTreemap({ usage, metrics, groups, theme, onOpen = null, title = 'Who gets the ball' }) {
  const { C, NUM_FONT, accent } = theme
  const [mk, setMk] = useState(metrics[0].key)
  const metric = metrics.find((m) => m.key === mk) || metrics[0]
  const rows = useMemo(() => (usage ? usageShares(usage.players, metric.key, usage.late) : []), [usage, metric.key])
  const [pickId, setPick] = useState(null)
  const pick = rows.find((p) => p.id === pickId) || rows[0] || null
  if (!usage || !rows.length) return null
  const total = rows.reduce((a, p) => a + p.v, 0)
  const gs = groups.map((g) => ({ g, ps: rows.filter((p) => p.group === g) })).map((x) => ({ ...x, v: x.ps.reduce((a, p) => a + p.v, 0) })).filter((x) => x.v > 0)
  const soft = alpha(accent, 0.16)
  const chip = (on) => ({ minHeight: 0, padding: '6px 11px', borderRadius: 999, cursor: 'pointer', font: `800 12px/1 ${NUM_FONT}`, background: on ? alpha(accent, 0.12) : 'transparent', border: `1px solid ${on ? accent : C.border2}`, color: on ? accent : C.text2 })
  const wk = usage.weeks.length ? `weeks ${usage.weeks[0]}-${usage.weeks[usage.weeks.length - 1]}` : 'season'
  return (
    <section aria-label={title} style={{ margin: '0 0 16px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', margin: '0 0 8px' }}>
        <b style={{ font: `900 12px/1 ${NUM_FONT}`, letterSpacing: '.1em', color: C.text2, flexBasis: '100%', marginBottom: 2 }}>{title.toUpperCase()}</b>
        {metrics.map((m) => <button key={m.key} type="button" className="tap-box" aria-pressed={m.key === mk} onClick={() => setMk(m.key)} style={chip(m.key === mk)}>{m.label}</button>)}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: each player's share of the club's ${metric.unit}`} style={{ width: '100%', maxWidth: 520, display: 'block' }}>
        {squarify(gs, 0, 0, W, H).map((g) => (
          <g key={g.g}>
            <text x={g.x + 4} y={g.y + 11} fontSize="10" fontWeight="800" fontFamily={NUM_FONT} fill={C.text3} letterSpacing="1">{g.w > 60 ? `${g.g} ${pct(g.v / total)}` : g.w > 18 ? g.g : ''}</text>
            {squarify(g.ps, g.x, g.y + LAB, g.w, Math.max(1, g.h - LAB)).map((p) => {
              const x = p.x + G / 2, y = p.y + G / 2, w = Math.max(0, p.w - G), h = Math.max(0, p.h - G), on = pick?.id === p.id
              const fs = Math.min(15, Math.max(11, Math.sqrt(w * h) / 7))
              const nm = [shortN(p.name), p.name.split(' ').slice(1).join(' ') || p.name].find((t) => fits(t, w, 11))   // B. Robinson where it fits, so two Robinsons stay two
              // A sliver (a 1% bench man) is too small for a thumb on both sides (under 32px at 360 wide): it stays drawn, but is not a
              // tap target of its own, so a tap never lands on the wrong man (audit 2026-10-20).
              const tap = Math.max(w, h) >= MIN_TAP
              return (
                <g key={p.id} {...(tap ? { role: 'button', tabIndex: 0, 'aria-label': `${p.name}: ${pct(p.sh)} of the club's ${metric.unit}`, 'aria-pressed': on,
                  onClick: () => setPick(p.id), onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPick(p.id) } } } : { 'aria-hidden': true })}
                  style={{ cursor: tap ? 'pointer' : 'default' }} opacity={p.tr < 0 && !on ? 0.5 : 1}>
                  <rect x={x} y={y} width={w} height={h} rx="4" fill={p.tr > 0 ? soft : C.bg3} stroke={on ? C.text : p.tr > 0 ? accent : C.border2} strokeWidth={on ? 1.5 : 1} />
                  {w > 44 && h > 30 ? <>
                    <text x={x + 6} y={y + fs + 4} fontSize={fs} fontWeight="800" fontFamily={NUM_FONT} fill={p.tr > 0 ? accent : C.text}>{pct(p.sh)}</text>
                    {nm && h > fs + 20 ? <text x={x + 6} y={y + fs + 18} fontSize="11" fontWeight="700" fill={C.text2}>{nm}</text> : null}
                  </> : w > 26 && h > 16 ? <text x={x + 4} y={y + 13} fontSize="10" fontWeight="800" fontFamily={NUM_FONT} fill={C.text2}>{pct(p.sh)}</text> : null}
                  <title>{`${p.name} · ${p.role} · ${p.v} ${metric.unit} · ${pct(p.sh)}`}</title>
                </g>
              )
            })}
          </g>
        ))}
      </svg>
      {pick ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 8px', alignItems: 'baseline', marginTop: 8, font: `700 12px/1.4 ${NUM_FONT}`, color: C.text2 }}>
          {onOpen ? <button type="button" className="tap-box" onClick={() => onOpen(pick)} style={{ minHeight: 0, padding: 0, border: 0, background: 'none', cursor: 'pointer', font: `800 13px/1.3 ${NUM_FONT}`, color: C.text, textDecoration: 'underline', textUnderlineOffset: 3 }}>{pick.name}</button> : <b style={{ color: C.text }}>{pick.name}</b>}
          <span>{pick.role} · {pick.v} {metric.unit} · <b style={{ color: C.text }}>{pct(pick.sh)}</b>{pick.sh3 != null ? <> · last 3: <span style={{ color: pick.tr > 0 ? accent : undefined }}>{pct(pick.sh3)}{pick.tr > 0 ? ' ↑' : pick.tr < 0 ? ' ↓' : ''}</span></> : null}</span>
        </div>
      ) : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 6, font: `700 11px/1.3 ${NUM_FONT}`, color: C.text3 }}>
        {usage.late?.length ? <>   {/* the trend key only where there are game-by-game counts (BUCKETS' page has season lines only) */}
          <span><i aria-hidden="true" style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, border: `1px solid ${accent}`, background: soft, marginRight: 5, verticalAlign: -1 }} />more of it, last 3</span>
          <span><i aria-hidden="true" style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, border: `1px solid ${C.border2}`, background: C.bg3, opacity: 0.5, marginRight: 5, verticalAlign: -1 }} />less</span>
        </> : null}
        <span>{usage.season} {wk}</span>
      </div>
    </section>
  )
}
