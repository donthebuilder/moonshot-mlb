'use client'
import { useId } from 'react'
import { C, NUM_FONT } from '../../lib/nfl/theme'

// THE PASS AREAS, SMALL (Donovan 10-19: the Throw map "way too big and doesn't fit the site vibe ... model everything
// we've added onto the old style of the matchup chart ... league and team views ... the small one is good ... fit the
// names"). The run holes' sibling (components/nfl/RunLineField.js): the same small field, the same turf, the same table
// rule (the best areas in the product's accent, the worst recede, no glow). From behind the quarterback, the twelve
// areas the data charts: left / middle / right x screens (behind the line), short (0-9), mid (10-19), deep (20+).
// Each area: its number, then a name or a count under it; the name is cut to what the area can hold. The Throw map's
// defense marks stay: a thin dashed green box where the defense is weak, solid where the offense also goes a lot.
//
// cells: { 'left|short': { big, sub, name, n (his count, said after the name when it fits), value (ranks the areas), thin, weak, atk, title } }
const W = 320
const X0 = 24, CW = (W - X0 - 6) / 3
const ROWS = [['deep', 16, 66], ['mid', 66, 116], ['short', 116, 170], ['behind', 170, 216]]   // [depth, top y, bottom y]
const LOS = 170
const H = 246
const SIDES = ['left', 'middle', 'right']
const OUT = { paintOrder: 'stroke', stroke: C.turf2, strokeWidth: 3, strokeLinejoin: 'round' }
// THE NAME FITS (10-19, "try best to fit the name"): the name and its count at 10.5px; else a little smaller (to 9px);
// else the name alone; only then cut. 0.6em is the average glyph width of the system sans at these sizes.
const fitName = (name, n, px) => {
  const room = px - 8, w = (t, fs) => t.length * fs * 0.6
  for (const t of n != null ? [`${name} ${n}`, name] : [name]) for (const fs of [10.5, 10, 9.5, 9]) if (w(t, fs) <= room) return { t, fs }
  const k = Math.max(3, Math.floor(room / (9 * 0.6))); return { t: `${name.slice(0, k - 1)}.`, fs: 9 }
}

export default function PassAreaField({ cells = {}, pickedKey = null, onPick = null, hue = C.green, label = 'Pass areas on the field' }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const keys = ROWS.flatMap(([d]) => SIDES.map((s) => `${s}|${d}`))
  const measured = keys.filter((k) => cells[k] && !cells[k].thin && Number.isFinite(Number(cells[k].value))).sort((a, b) => cells[b].value - cells[a].value)
  const tier = (k) => { const i = measured.indexOf(k); if (i < 0) return 'thin'; if (i < 2) return 'top'; if (i >= measured.length - 2 && measured.length > 5) return 'low'; return 'mid' }
  const OP = { top: 1, mid: 0.8, low: 0.42, thin: 0.32 }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ width: '100%', maxWidth: 440, display: 'block' }}>
      <defs><clipPath id={`p${uid}`}><rect x="0" y="0" width={W} height={H} rx="10" /></clipPath></defs>
      <g clipPath={`url(#p${uid})`}>
        <rect width={W} height={H} fill={C.turf2} />
        <rect width={W} height={H} fill={C.turf1} opacity="0.55" />
        {/* the field: yard lines at 10 and 20, the hashes down the two inside lines, the line of scrimmage */}
        {[[66, '20'], [116, '10']].map(([y, t]) => (
          <g key={t}>
            <line x1={X0} x2={W} y1={y} y2={y} stroke={C.text} strokeWidth="1" opacity="0.3" />
            <text x="4" y={y + 3.5} fontSize="10" fontWeight="800" fontFamily={NUM_FONT} fill={C.text} opacity="0.5">{t}</text>
          </g>
        ))}
        {[1, 2].map((i) => <line key={`h${i}`} x1={X0 + CW * i} x2={X0 + CW * i} y1="16" y2={LOS + 46} stroke={C.text} strokeWidth="1" strokeDasharray="2 5" opacity="0.28" />)}
      </g>
      <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="10" fill="none" stroke={C.border2} />
      <text x="4" y={LOS + 26} fontSize="9.5" fontWeight="800" fontFamily={NUM_FONT} fill={C.text} opacity="0.5">SCR</text>

      {ROWS.map(([d, y0, y1]) => SIDES.map((s, si) => {
        const k = `${s}|${d}`, c = cells[k] || {}, x0 = X0 + CW * si, t = tier(k), on = pickedKey === k
        const cx = x0 + CW / 2, h = y1 - y0, small = h < 50
        const fs = t === 'top' || on ? 17 : 15
        const nm = c.name ? fitName(String(c.name), c.n, CW) : null
        const line2 = nm ? nm.t : c.sub
        const yBig = line2 ? y0 + h / 2 - (small ? 1 : 2) : y0 + h / 2 + fs * 0.36
        return (
          <g key={k} opacity={on ? 1 : OP[t]}>
            {on && <rect x={x0 + 2} y={y0 + 2} width={CW - 4} height={h - 4} rx="5" fill={C.text} fillOpacity="0.07" stroke={C.text} strokeOpacity="0.85" />}
            {c.weak && <rect x={x0 + 5} y={y0 + 5} width={CW - 10} height={h - 10} rx="4" fill="none" stroke={hue} strokeWidth="1.2" strokeDasharray={c.atk ? undefined : '3 3'} />}
            <text x={cx} y={yBig} textAnchor="middle" fontSize={fs} fontWeight="900" fontFamily={NUM_FONT} fill={c.weak || t === 'top' ? hue : C.text} style={OUT}>{c.thin || c.big == null ? '—' : c.big}</text>
            {line2 && !c.thin ? <text x={cx} y={yBig + (small ? 13 : 15)} textAnchor="middle" fontSize={nm ? nm.fs : 10} fontWeight={nm ? 700 : 800} fontFamily={nm ? undefined : NUM_FONT} fill={nm ? C.text : C.text2} style={OUT}>{line2}</text> : null}
          </g>
        )
      }))}

      {/* the line of scrimmage, the quarterback behind it */}
      <line x1={X0} x2={W} y1={LOS} y2={LOS} stroke={C.losBlue} strokeWidth="2.2" />
      <circle cx={X0 + CW * 1.5} cy={H - 15} r="10" fill={C.turf2} stroke={C.text} strokeWidth="2" opacity="0.95" />
      <text x={X0 + CW * 1.5} y={H - 11} textAnchor="middle" fontSize="10" fontWeight="900" fontFamily={NUM_FONT} fill={C.text}>QB</text>

      {/* the taps: one per area, the whole area */}
      {ROWS.map(([d, y0, y1]) => SIDES.map((s, si) => {
        const k = `${s}|${d}`, c = cells[k] || {}
        return (
          <g key={`t${k}`} role={onPick ? 'button' : undefined} tabIndex={onPick ? 0 : undefined} aria-label={c.title || k} aria-pressed={pickedKey === k}
            onClick={onPick ? () => onPick(k) : undefined} onKeyDown={onPick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(k) } } : undefined}
            style={{ cursor: onPick ? 'pointer' : 'default' }}>
            <rect x={X0 + CW * si} y={y0} width={CW} height={d === 'behind' ? H - y0 : y1 - y0} fill="transparent" />
            <title>{c.title || k}</title>
          </g>
        )
      }))}
    </svg>
  )
}

export const AREA_KEYS = ['deep', 'mid', 'short', 'behind'].flatMap((d) => SIDES.map((s) => `${s}|${d}`))
export const areaName = (k) => { const [c, r] = k.split('|'); return r === 'behind' ? `Screens ${c}` : `${r[0].toUpperCase()}${r.slice(1)} ${c}` }
export const areaShort = (k) => { const [c, r] = k.split('|'); return `${{ left: 'L', middle: 'M', right: 'R' }[c]} ${{ behind: 'SCR', short: 'SHORT', mid: 'MID', deep: 'DEEP' }[r]}` }
