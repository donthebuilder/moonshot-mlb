'use client'
import { useId } from 'react'
import { C, NUM_FONT } from '../../lib/nfl/theme'
import { nflTones } from '../../lib/nfl/teamColors'
import { nflNickname } from '../../lib/nfl/teams'
import { nflTeamLogo, nflHeadshot } from '../../lib/nfl/nflAssets'
import { fieldSpots, FM } from '../../lib/nfl/fieldMen'
import { SIDES, DEPTHS, LANES } from '../../lib/nfl/fieldModel'

// THE BROADCAST FIELD (2026-10-06, Donovan: "it just looks wack, give it some real
// style" -- a telestrator / Next Gen Stats look, simple and large). One field:
// dark turf with faint mowing stripes, crisp white yard lines and big yard numbers,
// the line of scrimmage bold, the end zone painted in the OFFENSE's colours with
// its name in it. The zones are soft glows (intensity = the number's weight), the
// route / lane arrows are thick telestrator strokes (thickness = share), and the
// one number a zone carries is large with a dark outline so it reads on any glow.
// Same zones and numbers as FootballField: only the drawing differs.
//
// cells: { zoneKey: { heat 0-1 | null, big, pips, w 0-1 (arrow thickness), arrow bool } }
const W = 300
const EZ = 36
const PB = { deep: [EZ, 116], mid: [116, 176], short: [176, 236], behind: [236, 268] }
const LOS = 236
const PASS_H = 268
const FOOT = 26
const X = { left: 0, middle: W / 3, right: (2 * W) / 3 }
const START = { left: 96, middle: 150, right: 204 }
// rush: the line of scrimmage low, seven gaps across
const R_H = 250
const R_LOS = 206
const GAP_X = { 'left|end': 28, 'left|tackle': 70, 'left|guard': 112, 'middle|middle': 150, 'right|guard': 188, 'right|tackle': 230, 'right|end': 272 }
const GAP_WORDS = { 'left|end': ['left', 'edge'], 'left|tackle': ['left', 'tackle'], 'left|guard': ['left', 'guard'], 'middle|middle': ['', 'middle'], 'right|guard': ['right', 'guard'], 'right|tackle': ['right', 'tackle'], 'right|end': ['right', 'edge'] }

const OUTLINE = { paintOrder: 'stroke', stroke: C.bg, strokeWidth: 3.5, strokeLinejoin: 'round' }

function Turf({ h, ez, ezName, id, rush }) {
  const [col] = nflTones(ezName)
  const stripes = []
  for (let y = rush ? 0 : EZ; y < h; y += 30) if (((y - EZ) / 30) % 2 === 0) stripes.push(<rect key={y} x="0" y={y} width={W} height={30} fill={C.text} opacity="0.06" />)
  return (
    <>
      <defs><clipPath id={`c${id}`}><rect x="0" y="0" width={W} height={h} rx="10" /></clipPath></defs>
      <g clipPath={`url(#c${id})`}>
        <rect x="0" y="0" width={W} height={h} fill={C.turf2} />
        <rect x="0" y="0" width={W} height={h} fill={C.turf1} opacity="0.55" />
        {stripes}
        {ez && (
          <>
            <rect x="0" y="0" width={W} height={EZ} fill={`color-mix(in srgb, ${col} 72%, ${C.bg})`} />
            <line x1="0" x2={W} y1={EZ} y2={EZ} stroke={C.text} strokeWidth="2" opacity="0.9" />
            {/* the end zone names the club the way the site does everywhere: its LOGO, then the nickname (2026-10-15; was the bare code "SEA" in letters) */}
            {(() => {
              const nick = nflNickname(ezName)
              const logo = nflTeamLogo(ezName, 28)
              const w = (logo ? 34 : 0) + nick.length * 15
              const x0 = (W - w) / 2
              return (
                <>
                  {logo && <image href={logo} x={x0} y={(EZ - 28) / 2} width="28" height="28"><title>{ezName}</title></image>}
                  <text x={x0 + (logo ? 34 : 0)} y={EZ / 2 + 7} textAnchor="start" fontSize="19" fontWeight="900" fontFamily={NUM_FONT} letterSpacing="3" fill={C.text} style={OUTLINE}>{nick}</text>
                </>
              )
            })()}
          </>
        )}
      </g>
      <rect x="0.5" y="0.5" width={W - 1} height={h - 1} rx="10" fill="none" stroke={C.border2} />
    </>
  )
}

// yard lines every 10 yards (6 units a yard here), numbers big at both edges
function YardLines({ from, to, labels }) {
  const out = []
  for (let y = from; y >= to; y -= 60) {
    out.push(<line key={y} x1="0" x2={W} y1={y} y2={y} stroke={C.text} strokeWidth="1.2" opacity="0.5" />)
    for (let k = 1; k < 10; k += 1) {
      const yy = y - k * 6
      if (yy <= to) break
      for (const x of [W * 0.36, W * 0.64]) out.push(<line key={`${y}${k}${x}`} x1={x - 2.5} x2={x + 2.5} y1={yy} y2={yy} stroke={C.text} strokeWidth="1" opacity="0.28" />)
    }
  }
  labels.forEach(([y, t]) => {
    for (const x of [16, W - 16]) out.push(<text key={`${t}${x}`} x={x} y={y + 5} textAnchor="middle" fontSize="15" fontWeight="900" fontFamily={NUM_FONT} fill={C.text} opacity="0.55">{t}</text>)
  })
  return out
}

function Pips({ n, x, y, ink }) {
  const k = Math.min(4, n || 0)
  if (!k) return null
  return Array.from({ length: k }).map((_, i) => <circle key={i} cx={x + (i - (k - 1) / 2) * 9} cy={y} r="3.4" fill={ink} stroke={C.bg} strokeWidth="1" />)
}

// a thick telestrator stroke with a soft glow underneath and a rounded head
function Arrow({ d, w, col, tip, id }) {
  return (
    <g>
      <path d={d} fill="none" stroke={col} strokeOpacity="0.28" strokeWidth={w + 8} strokeLinecap="round" />
      <path d={d} fill="none" stroke={col} strokeWidth={w} strokeLinecap="round" markerEnd={`url(#h${id})`} />
      {tip}
    </g>
  )
}

// THE MEN (2026-10-17, path item 3): the players of lib/nfl/whoLines.js drawn ON the field, at the spots of lib/nfl/fieldMen.js. A face in a club-coloured ring
// (dashed = placed by his role, not by his own numbers), his name and slot under it; a transparent r=18 circle is the 44px tap. Painted last, so a face tap wins over the zone under it.
function Men({ spots, uid, onPlayer }) {
  if (!spots.length) return null
  return (
    <g data-layer="men">
      {spots.map((m, i) => {
        const [club] = nflTones(m.team)
        const ring = m.kind === 'def' ? C.text2 : club
        const dashed = m.basis === 'role' || m.basis === 'chart'
        const url = m.espn_id ? nflHeadshot(m.espn_id, 64, 64) : null
        const word = m.word || m.role
        const open = onPlayer && m.row ? () => onPlayer(m.row) : null
        return (
          <g key={`${m.kind}${m.id}`} role={open ? 'button' : 'img'} tabIndex={open ? 0 : undefined} aria-label={`${m.name}, ${word}${dashed ? ', by role' : ''}${open ? '. Open his card' : ''}`}
            style={open ? { cursor: 'pointer' } : undefined} onClick={open || undefined} onKeyDown={open ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } } : undefined}>
            <title>{`${m.name} · ${word}${dashed ? ' (by role)' : ''}`}</title>
            <defs><clipPath id={`f${uid}${i}`}><circle cx={m.x} cy={m.y} r={FM.R} /></clipPath></defs>
            <circle cx={m.x} cy={m.y} r={FM.R + 2} fill={C.bg2} stroke={ring} strokeWidth={dashed ? 1.6 : 2.6} strokeDasharray={dashed ? '3 2.5' : undefined} />
            <text x={m.x} y={m.y + 4} textAnchor="middle" fontSize="11" fontWeight="900" fontFamily={NUM_FONT} fill={C.text2}>{(m.last || m.name || '?').slice(0, 2).toUpperCase()}</text>
            {url && <image href={url} x={m.x - FM.R} y={m.y - FM.R} width={FM.R * 2} height={FM.R * 2} preserveAspectRatio="xMidYMin slice" clipPath={`url(#f${uid}${i})`} />}
            <text x={m.x} y={m.y + FM.R + 11} textAnchor="middle" fontSize="9" fontWeight="900" fontFamily={NUM_FONT} fill={C.text} style={OUTLINE}>{(m.last || '').toUpperCase()}</text>
            <text x={m.x} y={m.y + FM.R + 20} textAnchor="middle" fontSize="8.5" fontWeight="800" fontFamily={NUM_FONT} fill={ring === C.text2 ? C.text2 : C.text} style={OUTLINE}>{word}</text>
            {open && <circle cx={m.x} cy={m.y} r="18" fill="transparent" />}
          </g>
        )
      })}
    </g>
  )
}

export default function BroadcastField({ mode = 'pass', cells = {}, hue = C.green, core = false, ringKey = null, offTeam = '', maxWidth = 440, label = '', onZone = null, pickedZone = null, men = [], defMen = [], onPlayer = null }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const defs = (
    <defs>
      <radialGradient id={`g${uid}`}><stop offset="0" stopColor={hue} stopOpacity="1" /><stop offset="0.5" stopColor={hue} stopOpacity="0.62" /><stop offset="1" stopColor={hue} stopOpacity="0" /></radialGradient>
      <radialGradient id={`k${uid}`}><stop offset="0" stopColor={C.text} stopOpacity="0.9" /><stop offset="1" stopColor={C.text} stopOpacity="0" /></radialGradient>
      <marker id={`h${uid}`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="2.4" markerHeight="2.4" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L10,5 L0,10 z" fill={hue} /></marker>
    </defs>
  )
  const fade = <style>{`@keyframes bfIn{from{opacity:0}to{opacity:1}} .bf-in{animation:bfIn .3s ease-out}`}</style>

  if (mode === 'pass') {
    const spots = fieldSpots({ men, defMen, pass: true })
    const baseH = PASS_H + FOOT
    // room below the line for the two backfield rows and the names under them
    const H = spots.length ? Math.max(baseH, Math.max(...spots.map((q) => q.y + FM.R + 46))) : baseH
    const zones = DEPTHS.flatMap((d) => SIDES.map((s) => ({ key: `${s}|${d}`, s, d })))
    return (
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label || 'Pass zones on the field'} style={{ width: '100%', maxWidth, display: 'block' }}>
        {defs}{fade}
        <Turf h={H} ez ezName={offTeam} id={uid} />
        <YardLines from={LOS} to={EZ} labels={[[176, '10'], [116, '20'], [56, '30']]} />
        <g className="bf-in" key={mode + Object.values(cells).map((c) => c.heat).join()}>
          {zones.map(({ key, s, d }) => {
            const c = cells[key] || {}
            const [y0, y1] = PB[d]
            const cx = X[s] + W / 6
            const cy = (y0 + y1) / 2
            if (c.heat == null) return null
            const rx = W / 6 + 12, ry = (y1 - y0) / 2 + 12
            return (
              <g key={key}>
                <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#g${uid})`} opacity={0.3 + 0.7 * c.heat} />
                {core && ringKey === key && <ellipse cx={cx} cy={cy} rx={rx * 0.5} ry={ry * 0.5} fill={`url(#k${uid})`} opacity="0.22" />}
              </g>
            )
          })}
          {zones.map(({ key, s, d }) => {
            const c = cells[key] || {}
            if (!c.arrow) return null
            const [y0, y1] = PB[d]
            const tx = X[s] + W / 6, ty = (y0 + y1) / 2 + 8
            const sx = tx + (150 - tx) * 0.3, sy = LOS - 4
            const ey = ty + 14
            return <Arrow key={`a${key}`} id={uid} col={hue} w={4 + 7 * (c.w || 0)} d={`M${sx},${sy} Q${sx + (tx - sx) * 0.1},${(sy + ey) / 2 + 6} ${tx},${ey}`} />
          })}
        </g>
        {zones.map(({ key, s, d }) => {
          const c = cells[key] || {}
          const [y0, y1] = PB[d]
          const cx = X[s] + W / 6, cy = (y0 + y1) / 2
          const on = ringKey === key
          const lit = c.heat != null
          return (
            <g key={`t${key}`}>
              <rect x={X[s] + 2} y={y0 + 1} width={W / 3 - 4} height={y1 - y0 - 2} rx="8" fill="none" stroke={C.text} strokeOpacity={on ? 0 : 0.07} />
              {on && <rect x={X[s] + 3} y={y0 + 2} width={W / 3 - 6} height={y1 - y0 - 4} rx="9" fill="none" stroke={C.text} strokeWidth="3" style={{ filter: `drop-shadow(0 0 5px ${hue})` }} />}
              {c.big != null && <text x={cx + (spots.length && d === 'short' ? (s === 'left' ? 26 : s === 'right' ? -26 : 0) : 0)} y={spots.length && d === 'short' ? y0 + 17 : cy + (d === 'behind' ? 6 : c.pips ? 2 : 7)} textAnchor="middle" fontSize={on ? 24 : 18} fontWeight="900" fontFamily={NUM_FONT} fill={lit || on ? C.text : C.text2} style={OUTLINE}>{c.big}</text>}
              {d !== 'behind' && !(spots.length && d === 'short') && <Pips n={c.pips} x={cx} y={cy + 17} ink={C.text} />}
              {pickedZone === key && <rect x={X[s] + 1} y={y0} width={W / 3 - 2} height={y1 - y0} rx="9" fill="none" stroke={C.text} strokeWidth="2" strokeDasharray="5 4" />}
              {onZone && <rect x={X[s]} y={y0} width={W / 3} height={y1 - y0} fill="transparent" role="button" tabIndex={0} aria-label={`${c.title || key}. Who gets the ball here`} style={{ cursor: 'pointer' }} onClick={() => onZone(key)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onZone(key) } }} />}
              <title>{c.title || key}</title>
            </g>
          )
        })}
        <line x1="0" x2={W} y1={LOS} y2={LOS} stroke={C.text} strokeWidth="3.2" style={{ filter: `drop-shadow(0 0 4px ${C.green})` }} />
                {['LEFT', 'MIDDLE', 'RIGHT'].map((t, i) => <text key={t} x={W / 6 + (i * W) / 3} y={H - 8} textAnchor="middle" fontSize="11" fontWeight="800" fontFamily={NUM_FONT} fill={C.text2} letterSpacing="1.5">{t}</text>)}
        <Men spots={spots} uid={uid} onPlayer={onPlayer} />
      </svg>
    )
  }

  const maxLen = R_LOS - EZ - 34
  const rspots = fieldSpots({ men, defMen: [], pass: false })
  const rBase = R_H + FOOT + 12
  const RH = rspots.length ? Math.max(rBase, Math.max(...rspots.map((q) => q.y + FM.R + 46))) : rBase
  return (
    <svg viewBox={`0 0 ${W} ${RH}`} role="img" aria-label={label || 'Run lanes on the field'} style={{ width: '100%', maxWidth, display: 'block' }}>
      {defs}{fade}
      <Turf h={RH} ez ezName={offTeam} id={uid} />
      <YardLines from={R_LOS} to={EZ} labels={[[R_LOS - 60, '10'], [R_LOS - 120, '20']]} />
      <g className="bf-in" key={mode + Object.values(cells).map((c) => c.heat).join()}>
        {LANES.map((key) => {
          const c = cells[key] || {}
          if (c.heat == null) return null
          const x = GAP_X[key], len = 40 + (maxLen - 40) * c.heat
          return <ellipse key={key} cx={x} cy={R_LOS - len} rx="34" ry={Math.max(30, len * 0.5)} fill={`url(#g${uid})`} opacity={0.25 + 0.75 * c.heat} />
        })}
        {LANES.map((key) => {
          const c = cells[key] || {}
          if (!c.arrow) return null
          const x = GAP_X[key], len = 40 + (maxLen - 40) * (c.heat || 0)
          const bend = (x - 150) * 0.12
          return <Arrow key={`a${key}`} id={uid} col={hue} w={4 + 9 * (c.w || 0)} d={`M${150 + (x - 150) * 0.35},${R_LOS + 10} Q${x - bend},${R_LOS - len * 0.45} ${x},${R_LOS - len}`} />
        })}
      </g>
      <line x1="0" x2={W} y1={R_LOS} y2={R_LOS} stroke={C.text} strokeWidth="3.2" style={{ filter: `drop-shadow(0 0 4px ${C.green})` }} />
      {LANES.map((key) => {
        const c = cells[key] || {}
        const x = GAP_X[key], len = c.heat == null ? 24 : 40 + (maxLen - 40) * c.heat
        const on = ringKey === key
        const [a, b] = GAP_WORDS[key]
        return (
          <g key={`t${key}`}>
            {on && <circle cx={x} cy={R_LOS - len - 4} r="22" fill="none" stroke={C.text} strokeWidth="3" style={{ filter: `drop-shadow(0 0 5px ${hue})` }} />}
            {c.big != null && <text x={x} y={R_LOS - len + (on ? -1 : 2)} textAnchor="middle" fontSize={on ? 19 : 16} fontWeight="900" fontFamily={NUM_FONT} fill={c.heat != null ? C.text : C.text2} style={OUTLINE}>{c.big}</text>}
            {a && <text x={x} y={R_LOS + 22} textAnchor="middle" fontSize="10.5" fontWeight="800" fontFamily={NUM_FONT} fill={C.text2}>{a}</text>}
            <text x={x} y={R_LOS + (a ? 35 : 28)} textAnchor="middle" fontSize="10.5" fontWeight="800" fontFamily={NUM_FONT} fill={C.text2}>{b}</text>
            {pickedZone === key && <rect x={x - 21} y={EZ + 4} width="42" height={R_LOS - EZ - 8} rx="9" fill="none" stroke={C.text} strokeWidth="2" strokeDasharray="5 4" />}
            {onZone && <rect x={x - 21} y={EZ} width="42" height={R_LOS - EZ + 40} fill="transparent" role="button" tabIndex={0} aria-label={`${c.title || key}. Who gets the ball here`} style={{ cursor: 'pointer' }} onClick={() => onZone(key)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onZone(key) } }} />}
            <title>{c.title || key}</title>
          </g>
        )
      })}
      <Men spots={rspots} uid={uid} onPlayer={onPlayer} />
    </svg>
  )
}
