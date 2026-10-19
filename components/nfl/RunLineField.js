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
// COOLER (Donovan 10-18: the run-gap chart "make it cooler", no new chart font, less text under it): each hole is a
// tapered run arrow out of the backfield, its length the yards a carry; a run path curves from the back to it. The
// table rule (skin v2): the best holes glow in the product's accent, the worst recede; no red / green.
//
// cells: { 'left|end': { big, sub, yards (the bar's length, true to scale), thin, title } }
const W = 320
const H = 286   // 270 clipped the back's circle
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
  // standouts: rank the measured holes by yards a carry; top two glow, bottom two recede
  const measured = LANES.filter((k) => cells[k] && !cells[k].thin && Number.isFinite(Number(cells[k].yards))).sort((a, b) => cells[b].yards - cells[a].yards)
  const tier = (k) => { const i = measured.indexOf(k); if (i < 0) return 'thin'; if (i < 2) return 'top'; if (i >= measured.length - 2 && measured.length > 4) return 'low'; return 'mid' }
  const OP = { top: 1, mid: 0.62, low: 0.3, thin: 0.25 }
  const RBX = X0 + STEP * 3, RBY = LOS + 76
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ width: '100%', maxWidth: 440, display: 'block' }}>
      <defs>
        <clipPath id={`c${uid}`}><rect x="0" y="0" width={W} height={H} rx="10" /></clipPath>
        <linearGradient id={`b${uid}`} x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor={hue} stopOpacity="0.05" /><stop offset="0.55" stopColor={hue} stopOpacity="0.55" /><stop offset="1" stopColor={hue} stopOpacity="1" /></linearGradient>
        <filter id={`g${uid}`} x="-50%" y="-20%" width="200%" height="140%"><feGaussianBlur stdDeviation="3.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <g clipPath={`url(#c${uid})`}>
        <rect width={W} height={H} fill={C.turf2} />
        <rect width={W} height={H} fill={C.turf1} opacity="0.55" />
        {[2, 4, 6].filter((k) => k <= top).map((k) => <line key={k} x1="0" x2={W} y1={LOS - 10 - k * per} y2={LOS - 10 - k * per} stroke={C.text} strokeWidth="1" opacity="0.28" />)}
        {[2, 4, 6].filter((k) => k <= top).map((k) => <text key={`t${k}`} x="4" y={LOS - 13 - k * per} fontSize="9.5" fontWeight="800" fontFamily={NUM_FONT} fill={C.text} opacity="0.55">{k}</text>)}
      </g>
      <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="10" fill="none" stroke={C.border2} />

      {/* the defense's front, faint: four down linemen over the gaps, three linebackers behind them */}
      {[X0 + STEP * 1, X0 + STEP * 2.5, X0 + STEP * 3.5, X0 + STEP * 5].map((x) => <text key={`d${x}`} x={x} y={LOS - 14} textAnchor="middle" fontSize="15" fontWeight="900" fill={C.text} opacity="0.22">✕</text>)}
      {[X0 + STEP * 1.5, X0 + STEP * 3, X0 + STEP * 4.5].map((x) => <text key={`l${x}`} x={x} y={LOS - 36} textAnchor="middle" fontSize="15" fontWeight="900" fill={C.text} opacity="0.16">✕</text>)}

      {/* the run paths: from the back, a curve to each hole (drawn first, under the line) */}
      {LANES.map((key) => {
        const x = xOf(key), t = tier(key), on = pickedKey === key
        return <path key={`r${key}`} d={`M ${RBX} ${RBY - 10} Q ${(RBX + x) / 2} ${LOS + 40} ${x} ${LOS - 4}`} fill="none" stroke={on || t === 'top' ? hue : C.text} strokeWidth={on ? 2.5 : 1.5} strokeDasharray={t === 'thin' ? '2 4' : undefined} opacity={on ? 0.95 : t === 'top' ? 0.7 : t === 'thin' ? 0.18 : 0.22} strokeLinecap="round" />
      })}

      {/* the arrows: yards a carry through each hole, a tapered run up the field */}
      {LANES.map((key) => {
        const c = cells[key] || {}
        const x = xOf(key)
        const thin = c.yards == null || c.thin
        const len = thin ? 26 : Math.max(14, c.yards * per)
        const on = pickedKey === key
        const t = tier(key)
        const base = LOS - 6, tip = LOS - len - 10, hw = on ? 12 : 10
        const d = `M ${x - hw} ${base} L ${x - hw * 0.7} ${tip + 12} L ${x} ${tip} L ${x + hw * 0.7} ${tip + 12} L ${x + hw} ${base} Z`
        return (
          <g key={key} opacity={on ? 1 : OP[t]}>
            {thin
              ? <path d={d} fill="none" stroke={C.text} strokeOpacity="0.5" strokeDasharray="3 3" strokeLinejoin="round" />
              : <path d={d} fill={`url(#b${uid})`} stroke={on ? C.text : t === 'top' ? hue : 'none'} strokeWidth={on ? 2 : 1} strokeLinejoin="round" filter={on || t === 'top' ? `url(#g${uid})` : undefined} />}
            <text x={x} y={tip - 6} textAnchor="middle" fontSize={on ? 20 : 17} fontWeight="900" fontFamily={NUM_FONT} fill={on || t === 'top' ? hue : C.text} style={OUT}>{thin ? '—' : c.big ?? '—'}</text>
            {c.sub && <text x={x} y={tip - 26} textAnchor="middle" fontSize="10" fontWeight="800" fontFamily={NUM_FONT} fill={C.text2} style={OUT}>{c.sub}</text>}
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
      <circle cx={X0 + STEP * 3} cy={LOS + 50} r="10" fill={C.turf2} stroke={C.text} strokeWidth="2" opacity="0.95" />
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
