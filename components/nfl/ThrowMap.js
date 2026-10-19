'use client'
// THE THROW MAP (Donovan 10-19, thirteen rounds on the Chart Lab: "where they throw, who's there target-wise, then show
// something if the defense is weak there / the offense goes there a lot"; "a real field ... no glowing ... subtle and
// symmetrical"; "not every box needs the receiver's name"). The game page's passing field, from behind the quarterback:
//   the field   a real one in yards (-5 to 35): 5-yard mowing stripes, yard lines every 5, hashes, numbers outside
//   the ground  a quiet contour terrain: a smooth bump at each area's centre as tall as its share of the offense's
//               targets, summed, drawn as five faint bands and their isolines (higher ground = more throws)
//   the defense a thin dashed green box where it gives up 10%+ more yards a target than the league; solid when it is
//               also an area the offense throws to a lot (15%+): attack here
//   the labels  every area: its share; the top receiver's name only where it matters (10%+ of the throws, or weak)
// Tap an area: who gets the ball there, four rows then All N. Numbers: lib/nfl/throwMap.js.
import { useEffect, useMemo, useRef, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../lib/nfl/theme'
import { throwMap, throwFlags } from '../../lib/nfl/throwMap'
import { usePreview, ShowMoreButton } from '../ListPreview'
import TeamMark from '../TeamMark'
import Tap from '../Tap'
import { Kicker } from './GameOffDef'
import dynamic from 'next/dynamic'

// the 3D (10-19, the shared hills): the same areas lifted on TUDDY's 3D field; loaded only when opened
const GameArena = dynamic(() => import('./GameArena'), { ssr: false })

const RW = ['behind', 'short', 'mid', 'deep'], CL = ['left', 'middle', 'right']
const YARD = { behind: [-5, 0], short: [0, 10], mid: [10, 20], deep: [20, 35] }
const Y0 = -5, Y1 = 35
const esc = (v) => String(v).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
const lastN = (n) => { const s = String(n || '').split(' ').slice(-1)[0]; return s.length > 10 ? `${s.slice(0, 9)}.` : s }
const areaName = (k) => { const [c, r] = k.split('|'); return r === 'behind' ? `Screens ${c}` : `${r[0].toUpperCase()}${r.slice(1)} ${c}` }
const shortName = (n) => String(n || '').replace(/^(\S)\S*\s+/, '$1. ')

function fieldSvg(map, W, pick, def) {
  const Hh = Math.round(W * 1.12)
  const nearY = Hh - 12, farY = 22, cx = W / 2
  const t = (y) => (y - Y0) / (Y1 - Y0)
  const yOf = (y) => nearY - (nearY - farY) * (1 - Math.pow(1 - t(y), 1.25))
  const sc = (y) => 1 - 0.42 * t(y)
  const halfW = (y) => (W * 0.43) * sc(y)
  const xOf = (u, y) => cx + (u - 0.5) * 2 * halfW(y)
  const poly = (u0, u1, y0, y1) => `${xOf(u0, y0)},${yOf(y0)} ${xOf(u1, y0)},${yOf(y0)} ${xOf(u1, y1)},${yOf(y1)} ${xOf(u0, y1)},${yOf(y1)}`
  let g = `<rect width="${W}" height="${Hh}" rx="12" fill="${C.bg2}"/>`
  for (let y = Y0; y < Y1; y += 5) g += `<polygon points="${poly(0, 1, y, y + 5)}" fill="${((y - Y0) / 5) % 2 ? C.mow2 : C.mow1}"/>`
  g += `<defs><linearGradient id="tmFade" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${C.turfShade}" stop-opacity="0"/><stop offset="1" stop-color="${C.turfShade}" stop-opacity=".34"/></linearGradient></defs>`
  g += `<polygon points="${poly(0, 1, Y0, Y1)}" fill="url(#tmFade)"/>`
  for (let y = Y0; y <= Y1; y += 5) if (y) g += `<line x1="${xOf(0, y)}" y1="${yOf(y)}" x2="${xOf(1, y)}" y2="${yOf(y)}" stroke="${C.text}" stroke-opacity="${y % 10 ? 0.3 : 0.55}" stroke-width="${((y % 10 ? 0.9 : 1.4) * sc(y)).toFixed(2)}"/>`
  for (let y = Y0 + 1; y < Y1; y++) if (y % 5) [0.06, 0.94, 0.4, 0.6].forEach((u) => { const w2 = (u < 0.1 || u > 0.9 ? 3.5 : 2.5) * sc(y); g += `<line x1="${xOf(u, y) - w2}" y1="${yOf(y)}" x2="${xOf(u, y) + w2}" y2="${yOf(y)}" stroke="${C.text}" stroke-opacity=".28" stroke-width="${(0.9 * sc(y)).toFixed(2)}"/>` })
  ;[10, 20, 30].forEach((y) => { const fs = (10.5 * sc(y) + 1).toFixed(1); g += `<text x="${xOf(0, y) - 4}" y="${yOf(y) + 3}" text-anchor="end" font-size="${fs}" font-weight="700" fill="${C.text}" fill-opacity=".4" font-family="${NUM_FONT}">${y}</text><text x="${xOf(1, y) + 4}" y="${yOf(y) + 3}" font-size="${fs}" font-weight="700" fill="${C.text}" fill-opacity=".4" font-family="${NUM_FONT}">${y}</text>` })
  g += `<line x1="${xOf(0, 0)}" y1="${yOf(0)}" x2="${xOf(1, 0)}" y2="${yOf(0)}" stroke="${C.losBlue}" stroke-width="2.2"/>`
  g += `<polygon points="${poly(0, 1, Y0, Y1)}" fill="none" stroke="${C.text}" stroke-opacity=".75" stroke-width="2"/>`
  g += `<text x="${cx}" y="14" text-anchor="middle" font-size="9.5" font-weight="800" fill="${C.text3}" letter-spacing="2" font-family="${NUM_FONT}">${esc(def)} END ZONE ↑</text>`
  // the terrain, on a grid that inverts the perspective so the bands lie flat on the grass
  if (typeof document !== 'undefined') {
    const cen = []
    RW.forEach((r) => CL.forEach((c, ci) => { const [a0, a1] = YARD[r]; cen.push({ u: (ci + 0.5) / 3, y: (a0 + a1) / 2, s: map.zones[`${c}|${r}`]?.share || 0 }) }))
    const peak = Math.max(1, ...cen.map((c) => c.s))
    const dens = (u, y) => cen.reduce((n, c) => n + (c.s / peak) * Math.exp(-(((u - c.u) ** 2) / (2 * 0.1 ** 2) + ((y - c.y) ** 2) / (2 * 3.6 ** 2))), 0)
    const yTab = []; for (let i = 0; i <= 400; i++) { const yy = Y0 + ((Y1 - Y0) * i) / 400; yTab.push([yOf(yy), yy]) }
    const yardOf = (py) => { for (let i = 1; i < yTab.length; i++) if (yTab[i][0] <= py) { const [p0, y0] = yTab[i - 1], [p1, y1] = yTab[i]; return y0 + (y1 - y0) * ((p0 - py) / ((p0 - p1) || 1)) } return Y1 }
    const STEP = 3, gw = Math.ceil(W / STEP) + 1, gh = Math.ceil(Hh / STEP) + 1, grid = new Float32Array(gw * gh).fill(-1)
    let vmax = 0
    for (let j = 0; j < gh; j++) { const py = j * STEP; if (py > yOf(Y0) || py < yOf(Y1)) continue; const yy = yardOf(py), hw = halfW(yy); for (let i = 0; i < gw; i++) { const u = (i * STEP - cx) / (2 * hw) + 0.5; if (u < 0 || u > 1) continue; const v = dens(u, yy); grid[j * gw + i] = v; if (v > vmax) vmax = v } }
    const LV = [0.16, 0.32, 0.48, 0.64, 0.8].map((q) => q * vmax)
    const cv = document.createElement('canvas'); cv.width = gw; cv.height = gh
    const c2 = cv.getContext('2d')
    if (c2) {
      const img = c2.createImageData(gw, gh)
      for (let k = 0; k < gw * gh; k++) { const v = grid[k]; if (v < 0) continue; let b = 0; while (b < LV.length && v >= LV[b]) b++; img.data[k * 4] = 255; img.data[k * 4 + 1] = 255; img.data[k * 4 + 2] = 255; img.data[k * 4 + 3] = Math.round(b * 0.045 * 255) }
      c2.putImageData(img, 0, 0)
      g += `<image href="${cv.toDataURL()}" x="0" y="0" width="${gw * STEP}" height="${gh * STEP}" preserveAspectRatio="none"/>`
    }
    const at = (i, j) => grid[j * gw + i]
    LV.forEach((lv, li) => {
      let dp = ''
      for (let j = 0; j < gh - 1; j++) for (let i = 0; i < gw - 1; i++) {
        const a0 = at(i, j), a1 = at(i + 1, j), a2 = at(i + 1, j + 1), a3 = at(i, j + 1)
        if (a0 < 0 || a1 < 0 || a2 < 0 || a3 < 0) continue
        const cc = (a0 >= lv ? 8 : 0) | (a1 >= lv ? 4 : 0) | (a2 >= lv ? 2 : 0) | (a3 >= lv ? 1 : 0)
        if (cc === 0 || cc === 15) continue
        const x = i * STEP, y = j * STEP, L = (p, q) => (lv - p) / ((q - p) || 1e-6)
        const T = [x + STEP * L(a0, a1), y], R = [x + STEP, y + STEP * L(a1, a2)], B = [x + STEP * L(a3, a2), y + STEP], Lf = [x, y + STEP * L(a0, a3)]
        const seg = { 1: [Lf, B], 2: [B, R], 3: [Lf, R], 4: [T, R], 5: [Lf, T, B, R], 6: [T, B], 7: [Lf, T], 8: [Lf, T], 9: [T, B], 10: [T, R, Lf, B], 11: [T, R], 12: [Lf, R], 13: [B, R], 14: [Lf, B] }[cc]
        for (let q = 0; q < seg.length; q += 2) dp += `M${seg[q][0].toFixed(1)} ${seg[q][1].toFixed(1)}L${seg[q + 1][0].toFixed(1)} ${seg[q + 1][1].toFixed(1)}`
      }
      g += `<path d="${dp}" fill="none" stroke="${C.text}" stroke-opacity="${(0.22 + li * 0.08).toFixed(2)}" stroke-width="0.9"/>`
    })
  }
  // the defense and the tapped area: thin boxes; a tap target over each area; the labels, the same in every area
  let labels = ''
  RW.forEach((r) => CL.forEach((c, ci) => {
    const k = `${c}|${r}`, z = map.zones[k]
    if (!z) return
    const f = throwFlags(z), [a0, a1] = YARD[r]
    if (pick === k) g += `<polygon points="${poly(ci / 3 + 0.012, (ci + 1) / 3 - 0.012, a0 + 0.25, a1 - 0.25)}" fill="${C.text}" fill-opacity=".06" stroke="${C.text}" stroke-opacity=".85" stroke-width="1"/>`
    if (f.weak) g += `<polygon points="${poly(ci / 3 + 0.035, (ci + 1) / 3 - 0.035, a0 + 0.8, a1 - 0.8)}" fill="none" stroke="${C.green}" stroke-opacity=".9" stroke-width="1.2"${f.atk ? '' : ' stroke-dasharray="3 3"'}/>`
    g += `<polygon data-z="${k}" points="${poly(ci / 3, (ci + 1) / 3, a0, a1)}" fill="transparent" style="cursor:pointer"><title>${esc(areaName(k))}: ${z.share}% of the throws</title></polygon>`
    if (!z.share) return
    const ym = (a0 + a1) / 2, s2 = sc(ym), fs = Math.max(10, 12.5 * s2 * (W / 360)), x = xOf((ci + 0.5) / 3, ym), y = yOf(ym)
    const top = z.who[0], named = top && (z.share >= 10 || f.weak)
    labels += `<text x="${x}" y="${(named ? y - 1 : y + fs * 0.35).toFixed(1)}" text-anchor="middle" font-size="${(fs + 1).toFixed(1)}" font-weight="900" fill="${f.weak ? C.green : C.text}" stroke="${C.turf2}" stroke-width="3" paint-order="stroke" font-family="${NUM_FONT}" pointer-events="none">${z.share}%</text>`
    if (named) labels += `<text x="${x}" y="${(y + fs + 1).toFixed(1)}" text-anchor="middle" font-size="${(fs - 1.5).toFixed(1)}" font-weight="700" fill="${C.text}" fill-opacity=".88" stroke="${C.turf2}" stroke-width="3" paint-order="stroke" pointer-events="none">${esc(lastN(top.player.name))} ${top.tgt}</text>`
  }))
  return { svg: `<svg viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}" role="img" aria-label="Where they throw, on the field">${g}${labels}</svg>`, Hh }
}

export default function ThrowMap({ matchup, players, game, onPlayerClick = null, onRun = null }) {
  const [off, setOff] = useState(game.away)
  const def = off === game.away ? game.home : game.away
  const map = useMemo(() => throwMap({ matchup, players, off, def }), [matchup, players, off, def])
  const box = useRef(null)
  const [W, setW] = useState(0)
  useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const best = useMemo(() => {
    if (!map) return null
    const zs = Object.entries(map.zones)
    return (zs.find(([, z]) => throwFlags(z).atk) || [...zs].sort((a, b) => b[1].share - a[1].share)[0])[0]
  }, [map])
  const [pickRaw, setPick] = useState(null)
  const [three, setThree] = useState(false)
  const pick = pickRaw && map?.zones[pickRaw] ? pickRaw : best
  const drawn = useMemo(() => (map && W > 0 ? fieldSvg(map, W, pick, def) : null), [map, W, pick, def])
  const z = map && pick ? map.zones[pick] : null
  const pv = usePreview(z?.who || [])
  if (!map) return null
  const f = z ? throwFlags(z) : {}
  const pill = (on) => ({ minHeight: 0, padding: '6px 11px', borderRadius: 999, cursor: 'pointer', font: `800 12px/1 ${NUM_FONT}`, background: 'transparent', border: `1px solid ${on ? C.text2 : C.border2}`, color: on ? C.text : C.text2, display: 'inline-flex', alignItems: 'center', gap: 6 })
  const tag = f.atk ? 'ATTACK HERE' : f.weak ? `${def} WEAK HERE · +${z.weak}%` : f.tough ? `${def} TOUGH HERE · ${z.weak}%` : z?.share >= 15 ? 'THEY GO HERE A LOT' : null
  return (
    <section aria-label="Where they throw" style={{ marginBottom: 16 }}>
      <Kicker>WHERE THEY THROW</Kicker>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 6 }}>
        {[game.away, game.home].map((t) => (
          <button key={t} type="button" className="tap-box" aria-pressed={t === off} onClick={() => { setOff(t); setPick(null); pv.open && pv.toggle() }} style={pill(t === off)}>
            <TeamMark sport="nfl" abbr={t} variant="logo" px={14} />{t} ball
          </button>
        ))}
        <button type="button" className="tap-box" aria-pressed={three} onClick={() => setThree((v) => !v)} style={{ ...pill(three), marginLeft: 'auto' }}>3D</button>
        {onRun ? <button type="button" className="tap-box" onClick={onRun} style={pill(false)}>Run ›</button> : null}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', font: `700 11px/1.2 ${NUM_FONT}`, color: C.text2, marginBottom: 6 }}>
        <span>higher ground = more throws</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i aria-hidden="true" style={{ width: 11, height: 11, border: `1.5px dashed ${C.green}`, borderRadius: 2 }} />{def} weak</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i aria-hidden="true" style={{ width: 11, height: 11, border: `1.5px solid ${C.green}`, borderRadius: 2 }} />attack</span>
      </div>
      {three ? <div style={{ marginBottom: 8 }}><GameArena hills={{ zones: Object.fromEntries(Object.entries(map.zones).map(([k, z]) => [k, { share: z.share, weak: throwFlags(z).weak }])) }} title={`${off} throws vs ${def}`} /></div> : null}
      <div ref={box} onClick={(e) => { const k = e.target?.closest?.('[data-z]')?.getAttribute('data-z'); if (k) { setPick(k); pv.open && pv.toggle() } }}
        style={{ width: '100%', minHeight: drawn ? drawn.Hh : 280 }} dangerouslySetInnerHTML={drawn ? { __html: drawn.svg } : undefined} />
      {z ? (
        <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', alignItems: 'baseline' }}>
            <b style={{ font: `900 15px/1.1 ${NUM_FONT}`, color: C.text }}>{areaName(pick)}</b>
            <span style={{ fontSize: TYPE.label, color: C.text2 }}>{z.share}% of {off}&apos;s throws{z.weak != null ? ` · ${def} ${z.weak > 0 ? '+' : ''}${z.weak}% yds a throw vs the league` : ''}</span>
            {tag ? <span style={{ font: `900 10.5px/1 ${NUM_FONT}`, letterSpacing: '.05em', padding: '5px 7px', borderRadius: 6, border: `1px solid ${f.weak ? C.green : C.border2}`, color: f.weak ? C.green : C.text2 }}>{tag}</span> : null}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
            {pv.shown.map((w, i) => (
              <div key={w.player.player_id} style={{ display: 'grid', gridTemplateColumns: '14px minmax(0,1fr) auto', gap: 6, alignItems: 'baseline', padding: '7px 0', borderTop: `1px solid ${C.border}` }}>
                <span style={{ font: `800 11px/1 ${NUM_FONT}`, color: C.text3 }}>{i + 1}</span>
                <b style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: C.text }}>{onPlayerClick ? <Tap onClick={() => onPlayerClick(w.player, 'TD')}>{shortName(w.player.name)}</Tap> : shortName(w.player.name)}</b>
                <span style={{ font: `900 15px/1 ${NUM_FONT}`, color: C.text }}>{w.tgt}<small style={{ font: `700 10px/1 ${NUM_FONT}`, color: C.text3 }}> tgt</small></span>
              </div>
            ))}
          </div>
          <ShowMoreButton open={pv.open} restN={pv.restN} toggle={pv.toggle} total={pv.total} />
        </div>
      ) : null}
      <p style={{ margin: '6px 0 0', fontSize: 11, color: C.text3, lineHeight: 1.4 }}>Weak = {def} give up 10%+ more yards a throw there than the league; attack = weak and 15%+ of the throws. Screens = behind the line; short 0-9 yds, mid 10-19, deep 20+. This season.</p>
    </section>
  )
}
