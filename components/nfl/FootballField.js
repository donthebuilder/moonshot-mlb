'use client'
import { useId } from 'react'
import { C, NUM_FONT } from '../../lib/nfl/theme'
import { CHALK, CHALK_SOFT, HEAT, SIDES, DEPTHS, LANES } from '../../lib/nfl/fieldModel'

// 🏈 THE FIELD, DRAWN (2026-09-30, Donovan: "make something I can visually
// understand, football field wise ... I want to be able to see the field,
// that's how I understand sports"). Football's spray field: the offence goes
// UP the page like the spray chart's ball leaves home plate, the line of
// scrimmage near the foot, the end zone at the top, chalk every five yards,
// hash marks, and the thing being measured painted ON the grass --
//
//   mode 'pass'     the twelve pass zones (left / middle / right x deep /
//                   mid / quick / behind the line) as painted regions
//   mode 'rush'     the seven run holes at the line (end / tackle / guard /
//                   middle, each side), each an arrow the length of its
//                   yards a carry, painted by its heat, the five linemen drawn
//   (mode 'redzone' was removed 2026-10-01, BATCH-2D-CORE: it spread touches
//   across the field at side-to-side spots never published. Per-touch red
//   zone is RedZoneStrip -- one lane per player, the yard line the fact.)
//
// cells:  { zoneKey: { big, small, heat 0-1 | null, title } } (pass / rush)
// Heat is MatchupMap's one scale (DASH orange at an alpha); the turf and the
// chalk are MatchupMap's too, so every football picture on the site is one
// drawing. Tap a zone / hole / dot -> onPick(key).
const W = 300
const TURF_TOP = C.turf1
const TURF_BOT = C.turf2
const X = { left: 0, middle: W / 3, right: (2 * W) / 3 }
// Pass bands, top to bottom (px): end zone, deep 20+, mid 10-19, quick 0-9, behind.
const PB = { ez: [0, 24], deep: [24, 104], mid: [104, 164], short: [164, 224], behind: [224, 256] }
const PASS_H = 256
const LOS_P = PB.short[1]
// Run holes across the line, left to right, and where each one sits.
const HOLE_X = { 'left|end': 0.1, 'left|tackle': 0.26, 'left|guard': 0.39, 'middle|middle': 0.5, 'right|guard': 0.61, 'right|tackle': 0.74, 'right|end': 0.9 }
const RUSH_H = 230
const LOS_R = 186

function Turf({ id, h }) {
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={TURF_TOP} />
          <stop offset="100%" stopColor={TURF_BOT} />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={W} height={h} rx="8" fill={`url(#${id})`} stroke={C.border} />
    </>
  )
}

// Chalk every `px` from the line upward, a hash pair on every line.
function Chalk({ from, to, step, labels = [] }) {
  const out = []
  let i = 0
  for (let y = from; y >= to; y -= step, i += 1) {
    out.push(<line key={`l${y}`} x1="0" x2={W} y1={y} y2={y} stroke={i % 2 ? CHALK_SOFT : CHALK} strokeWidth="1" />)
    out.push(<line key={`h1${y}`} x1={W * 0.36} x2={W * 0.36} y1={y - 2} y2={y + 2} stroke={CHALK} strokeWidth="1" />)
    out.push(<line key={`h2${y}`} x1={W * 0.64} x2={W * 0.64} y1={y - 2} y2={y + 2} stroke={CHALK} strokeWidth="1" />)
  }
  labels.forEach(([y, t]) => out.push(
    <text key={`t${y}`} x="6" y={y - 3} fill={C.text3} fontSize="8" fontFamily={NUM_FONT} fontWeight="700">{t}</text>,
  ))
  return out
}

const fill = (heat) => (heat == null ? 'transparent' : HEAT(0.12 + heat * 0.7))

export default function FootballField({ mode = 'pass', cells = {}, onPick = null, pickedKey = null, maxWidth = 420, endZoneLabel = 'END ZONE' }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const tap = (key) => (onPick ? { onClick: () => onPick(key), style: { cursor: 'pointer' } } : {})

  if (mode === 'pass') {
    return (
      <svg viewBox={`0 0 ${W} ${PASS_H}`} role="img" aria-label="Pass zones on the field" style={{ width: '100%', maxWidth, display: 'block' }}>
        <Turf id={`t${uid}`} h={PASS_H} />
        <rect x="1" y="1" width={W - 2} height={PB.ez[1] - 1} rx="7" fill={CHALK_SOFT} />
        <text x={W / 2} y={16} fill={C.text3} fontSize="8" fontFamily={NUM_FONT} fontWeight="800" textAnchor="middle" letterSpacing="2">{endZoneLabel}</text>
        <Chalk from={LOS_P} to={PB.deep[0]} step={20} labels={[[PB.short[0], '10'], [PB.mid[0], '20'], [PB.deep[0] + 40, '30']]} />
        <line x1="0" x2={W} y1={LOS_P} y2={LOS_P} stroke={C.cyan} strokeOpacity="0.7" strokeWidth="1.5" />
        <text x={W - 6} y={LOS_P - 3} fill={C.cyan} fontSize="7.5" fontFamily={NUM_FONT} fontWeight="800" textAnchor="end">LINE</text>
        {DEPTHS.flatMap((d) => SIDES.map((s) => {
          const key = `${s}|${d}`
          const c = cells[key] || {}
          const [y0, y1] = PB[d]
          const x0 = X[s]
          const on = pickedKey === key
          return (
            <g key={key} {...tap(key)}>
              <title>{c.title || key}</title>
              <rect x={x0 + 3} y={y0 + 3} width={W / 3 - 6} height={y1 - y0 - 6} rx="6"
                style={{ fill: fill(c.heat) }} stroke={on ? C.text : CHALK_SOFT} strokeWidth={on ? 1.6 : 1} />
              {c.big != null && <text x={x0 + W / 6} y={(y0 + y1) / 2 + (c.small ? -1 : 4)} fill={C.text} fontSize="13" fontWeight="900" fontFamily={NUM_FONT} textAnchor="middle">{c.big}</text>}
              {c.small != null && <text x={x0 + W / 6} y={(y0 + y1) / 2 + 12} fill={C.text2} fontSize="8.5" fontFamily={NUM_FONT} textAnchor="middle">{c.small}</text>}
            </g>
          )
        }))}
      </svg>
    )
  }

  if (mode === 'rush') {
    const maxLen = LOS_R - 34
    return (
      <svg viewBox={`0 0 ${W} ${RUSH_H}`} role="img" aria-label="Run holes at the line" style={{ width: '100%', maxWidth, display: 'block' }}>
        <Turf id={`t${uid}`} h={RUSH_H} />
        {/* chalk for the look only: an arrow's length is its heat, not yards */}
        <Chalk from={LOS_R} to={20} step={30} />
        <line x1="0" x2={W} y1={LOS_R} y2={LOS_R} stroke={C.cyan} strokeOpacity="0.7" strokeWidth="1.5" />
        {/* the five linemen, the ball between the guards */}
        {[0.33, 0.42, 0.5, 0.58, 0.67].map((f) => (
          <rect key={f} x={W * f - 6} y={LOS_R + 3} width="12" height="9" rx="2" fill="none" stroke={C.text3} strokeWidth="1" />
        ))}
        <circle cx={W * 0.5} cy={LOS_R + 22} r="4" fill={C.text3} />
        {LANES.map((key) => {
          const c = cells[key] || {}
          const x = W * HOLE_X[key]
          const len = Math.max(10, Math.min(1, (c.len ?? 0.2)) * maxLen)
          const col = c.heat == null ? CHALK : HEAT(0.35 + c.heat * 0.65)
          const on = pickedKey === key
          return (
            <g key={key} {...tap(key)}>
              <title>{c.title || key}</title>
              <rect x={x - 17} y={LOS_R - maxLen - 6} width="34" height={maxLen + 8} fill="transparent" />
              <line x1={x} y1={LOS_R - 2} x2={x} y2={LOS_R - len} stroke={col} strokeWidth={on ? 9 : 7} strokeLinecap="round" />
              <polygon points={`${x - 8},${LOS_R - len + 4} ${x + 8},${LOS_R - len + 4} ${x},${LOS_R - len - 8}`} style={{ fill: col }} />
              {on && <circle cx={x} cy={LOS_R - len - 2} r="13" fill="none" stroke={C.text} strokeWidth="1.2" />}
              {c.big != null && <text x={x} y={LOS_R - len - 14} fill={C.text} fontSize="10" fontWeight="900" fontFamily={NUM_FONT} textAnchor="middle">{c.big}</text>}
              {c.small != null && <text x={x} y={LOS_R + 40} fill={C.text3} fontSize="7" fontFamily={NUM_FONT} textAnchor="middle">{c.small}</text>}
            </g>
          )
        })}
      </svg>
    )
  }

  return null   // unknown mode: draw nothing rather than guess
}
