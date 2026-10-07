'use client'
import { useId } from 'react'
import { C, NUM_FONT } from '../../lib/nfl/theme'
import { LANES } from '../../lib/nfl/fieldModel'

// THE RUN HOLES, ON A FIELD OF REAL POSITIONS (2026-10-07, Donovan: "should look
// like actual players ... offensive line gaps A/B/C/D, TE, edge"). The offence is
// drawn at the line of scrimmage as it lines up -- tight end, tackle, guard, centre,
// guard, tackle, tight end -- with the quarterback and back behind, and the defense's
// front faint across from them. Each of the seven holes the data charts sits over
// the man it is named for (nflverse charts a run by the lineman it went over: "end"
// = outside the tackle, by the tight end; "tackle"; "guard"; "middle" = the centre).
// Above each one stands a bar: its length is yards a carry, the number on top is that
// yards a carry, the small line is the carries behind it. A hole with too few carries
// is drawn hollow and says "too few". The gap letters (A between centre and guard, B
// guard-tackle, C tackle-tight end, D outside) are the standard names of the spaces
// between those players, drawn as geometry; the numbers belong to the players.
//
// cells: { 'left|end': { big, sub, yards (the bar's length, true to scale), thin, title } }
const W = 320
const H = 270
const LOS = 188
const STEP = 44
const X0 = 38
const COL = { 'left|end': 0, 'left|tackle': 1, 'left|guard': 2, 'middle|middle': 3, 'right|guard': 4, 'right|tackle': 5, 'right|end': 6 }
const POS = ['TE', 'LT', 'LG', 'C', 'RG', 'RT', 'TE']
const OUT = { paintOrder: 'stroke', stroke: C.bg, strokeWidth: 3.5, strokeLinejoin: 'round' }
const xOf = (key) => X0 + STEP * COL[key]
const GAPS = [['D', X0 - STEP / 2 + 4], ['C', X0 + STEP / 2], ['B', X0 + STEP * 1.5], ['A', X0 + STEP * 2.5], ['A', X0 + STEP * 3.5], ['B', X0 + STEP * 4.5], ['C', X0 + STEP * 5.5], ['D', X0 + STEP * 6.5 + STEP / 2 - 4]]

export default function RunLineField({ cells = {}, pickedKey = null, onPick = null, hue = C.green, label = 'Run holes on the field' }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const maxLen = LOS - 62
  const top = Math.max(6, ...LANES.map((k) => (cells[k]?.thin ? 0 : Number(cells[k]?.yards) || 0)))
  const per = maxLen / top   // pixels a yard, the same for every bar and the yard lines
  const stripes = []
  for (let y = 0; y < H; y += 30) if ((y / 30) % 2 === 0) stripes.push(<rect key={y} x="0" y={y} width={W} height="30" fill={C.text} opacity="0.05" />)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ width: '100%', maxWidth: 440, display: 'block' }}>
      <defs>
        <clipPath id={`c${uid}`}><rect x="0" y="0" width={W} height={H} rx="10" /></clipPath>
        <linearGradient id={`b${uid}`} x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor={hue} stopOpacity="0.15" /><stop offset="1" stopColor={hue} stopOpacity="0.9" /></linearGradient>
      </defs>
      <g clipPath={`url(#c${uid})`}>
        <rect width={W} height={H} fill={C.turf2} />
        <rect width={W} height={H} fill={C.turf1} opacity="0.55" />
        {stripes}
        {[2, 4, 6].filter((k) => k <= top).map((k) => <line key={k} x1="0" x2={W} y1={LOS - 10 - k * per} y2={LOS - 10 - k * per} stroke={C.text} strokeWidth="1" opacity="0.28" />)}
        {[2, 4, 6].filter((k) => k <= top).map((k) => <text key={`t${k}`} x="6" y={LOS - 13 - k * per} fontSize="9.5" fontWeight="800" fontFamily={NUM_FONT} fill={C.text} opacity="0.55">{k} yds</text>)}
      </g>
      <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="10" fill="none" stroke={C.border2} />

      {/* the defense's front, faint: four down linemen over the gaps, three linebackers behind them */}
      {[X0 + STEP * 1, X0 + STEP * 2.5, X0 + STEP * 3.5, X0 + STEP * 5].map((x) => <text key={`d${x}`} x={x} y={LOS - 14} textAnchor="middle" fontSize="15" fontWeight="900" fill={C.text} opacity="0.22">✕</text>)}
      {[X0 + STEP * 1.5, X0 + STEP * 3, X0 + STEP * 4.5].map((x) => <text key={`l${x}`} x={x} y={LOS - 36} textAnchor="middle" fontSize="15" fontWeight="900" fill={C.text} opacity="0.16">✕</text>)}

      {/* the bars: yards a carry through each hole */}
      {LANES.map((key) => {
        const c = cells[key] || {}
        const x = xOf(key)
        const len = c.yards == null || c.thin ? 26 : Math.max(10, c.yards * per)
        const on = pickedKey === key
        return (
          <g key={key}>
            {c.yards == null || c.thin
              ? <rect x={x - 11} y={LOS - len - 10} width="22" height={len} rx="5" fill="none" stroke={C.text} strokeOpacity="0.35" strokeDasharray="3 3" />
              : <rect x={x - 11} y={LOS - len - 10} width="22" height={len} rx="5" fill={`url(#b${uid})`} stroke={on ? C.text : 'none'} strokeWidth="2" style={on ? { filter: `drop-shadow(0 0 5px ${hue})` } : null} />}
            <text x={x} y={LOS - len - 16} textAnchor="middle" fontSize={on ? 20 : 17} fontWeight="900" fontFamily={NUM_FONT} fill={C.text} style={OUT}>{c.thin ? '—' : c.big ?? '—'}</text>
            {c.sub && <text x={x} y={LOS - len - 36} textAnchor="middle" fontSize="10" fontWeight="800" fontFamily={NUM_FONT} fill={c.thin ? C.green : C.text2} style={OUT}>{c.sub}</text>}
          </g>
        )
      })}

      {/* the line of scrimmage and the men on it */}
      <line x1="0" x2={W} y1={LOS} y2={LOS} stroke={C.text} strokeWidth="3" style={{ filter: `drop-shadow(0 0 4px ${hue})` }} />
      {GAPS.map(([t, x], i) => <text key={`g${i}`} x={x} y={LOS + 6} textAnchor="middle" fontSize="10" fontWeight="800" fontFamily={NUM_FONT} fill={hue} opacity="0.9">{t}</text>)}
      {POS.map((t, i) => {
        const x = X0 + STEP * i
        return (
          <g key={`p${i}`}>
            <circle cx={x} cy={LOS + 18} r="11" fill={C.text} fillOpacity={t === 'TE' ? 0.78 : 0.92} stroke={C.bg} strokeWidth="1.5" />
            <text x={x} y={LOS + 22} textAnchor="middle" fontSize="10" fontWeight="900" fontFamily={NUM_FONT} fill={C.bg}>{t}</text>
          </g>
        )
      })}
      <circle cx={X0 + STEP * 3} cy={LOS + 50} r="10" fill="none" stroke={C.text} strokeWidth="2" opacity="0.85" />
      <text x={X0 + STEP * 3} y={LOS + 54} textAnchor="middle" fontSize="10" fontWeight="900" fontFamily={NUM_FONT} fill={C.text}>QB</text>
      <circle cx={X0 + STEP * 3} cy={LOS + 76} r="10" fill={hue} stroke={C.bg} strokeWidth="1.5" />
      <text x={X0 + STEP * 3} y={LOS + 80} textAnchor="middle" fontSize="10" fontWeight="900" fontFamily={NUM_FONT} fill={C.bg}>RB</text>

      {/* the taps: one 44px column per hole, over the whole bar */}
      {LANES.map((key) => {
        const x = xOf(key)
        const c = cells[key] || {}
        return (
          <g key={`t${key}`} role={onPick ? 'button' : undefined} tabIndex={onPick ? 0 : undefined} aria-label={c.title || key} aria-pressed={pickedKey === key}
            onClick={onPick ? () => onPick(key) : undefined} onKeyDown={onPick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(key) } } : undefined}
            style={{ cursor: onPick ? 'pointer' : 'default' }}>
            <rect x={x - STEP / 2} y="6" width={STEP} height={LOS + 38} fill="transparent" />
            <title>{c.title || key}</title>
          </g>
        )
      })}
    </svg>
  )
}
