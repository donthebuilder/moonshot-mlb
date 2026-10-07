'use client'
import { useId } from 'react'
import { C, NUM_FONT } from '../../lib/nfl/theme'

// THE COVERAGE SHELLS, DRAWN AS THE DEFENDERS (2026-10-07, Donovan: "the coverage
// explorer likewise -- look like actual players"). The secondary lined up for the
// shell picked: the deep men with the part of the field each one owns shaded, the
// underneath men in their zones, or -- for the man shells -- a line from each
// defender to the receiver he follows. The picture is the textbook alignment of
// the shell (it is a diagram, not a measurement); the NUMBER on it is real: the
// share of the league's charted snaps played in that shell (nfl_matchup.json
// coverage_team, weighted by each club's charted snaps).
//
//   deep:  [x centre, width]  the shaded deep zones (their defenders stand in them)
//   under: [x, y]             underneath defenders (zone men), dots
//   man:   [x, y]             receivers the man defenders follow (drawn as triangles)
const W = 320
const H = 250
const LOS = 200
const DEEP_Y = 62
export const SHELL_SHAPE = {
  C0: { deep: [], under: [[40, 168], [280, 168], [100, 150], [220, 150], [160, 120]], man: [[24, 196], [296, 196], [88, 196], [232, 196], [160, 196]], word: 'No deep safety: everyone follows a receiver.' },
  C1: { deep: [[160, 300]], under: [[40, 168], [280, 168], [100, 150], [220, 150]], man: [[24, 196], [296, 196], [88, 196], [232, 196]], word: 'One deep safety; the rest follow a receiver.' },
  C2: { deep: [[80, 160], [240, 160]], under: [[40, 164], [280, 164], [100, 140], [160, 140], [220, 140]], man: [], word: 'Two safeties each take half of the deep field; five zones underneath.' },
  C3: { deep: [[53, 106], [160, 106], [267, 106]], under: [[40, 164], [280, 164], [110, 140], [210, 140]], man: [], word: 'Three deep thirds; four zones underneath.' },
  C4: { deep: [[40, 80], [120, 80], [200, 80], [280, 80]], under: [[100, 144], [160, 144], [220, 144]], man: [], word: 'Four deep quarters; three zones underneath.' },
  C6: { deep: [[40, 80], [120, 80], [240, 160]], under: [[40, 164], [280, 164], [100, 144], [190, 144]], man: [], word: 'Quarters on one side, a half on the other.' },
}

export default function CoverageShellField({ shell = 'C3', hue = C.green, big = '', sub = '' }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const s = SHELL_SHAPE[shell]
  if (!s) return null
  const stripes = []
  for (let y = 0; y < H; y += 30) if ((y / 30) % 2 === 0) stripes.push(<rect key={y} x="0" y={y} width={W} height="30" fill={C.text} opacity="0.05" />)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${shell} alignment: ${s.word}`} style={{ width: '100%', maxWidth: 440, display: 'block' }}>
      <defs><clipPath id={`c${uid}`}><rect x="0" y="0" width={W} height={H} rx="10" /></clipPath></defs>
      <g clipPath={`url(#c${uid})`}>
        <rect width={W} height={H} fill={C.turf2} />
        <rect width={W} height={H} fill={C.turf1} opacity="0.55" />
        {stripes}
        {s.deep.map(([cx, w], i) => <rect key={`z${i}`} x={cx - w / 2 + 2} y="8" width={w - 4} height={LOS - 66} rx="8" fill={hue} fillOpacity="0.2" stroke={hue} strokeOpacity="0.7" strokeDasharray="4 3" />)}
      </g>
      <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="10" fill="none" stroke={C.border2} />
      <line x1="0" x2={W} y1={LOS} y2={LOS} stroke={C.text} strokeWidth="3" style={{ filter: `drop-shadow(0 0 4px ${hue})` }} />
      {/* man shells: the line from each defender to the receiver he follows */}
      {s.man.map(([rx, ry], i) => {
        const d = s.under[i]
        return d ? <line key={`m${i}`} x1={d[0]} y1={d[1]} x2={rx} y2={ry} stroke={hue} strokeWidth="2" strokeOpacity="0.75" strokeDasharray="5 3" /> : null
      })}
      {/* the receivers: the offence's skill men on the line */}
      {[24, 88, 160, 232, 296].map((x) => <path key={`r${x}`} d={`M${x},${LOS + 4} l8,15 h-16 z`} fill={C.text} fillOpacity="0.8" />)}
      {/* deep defenders stand in their zones; underneath men are dots */}
      {s.deep.map(([cx], i) => <g key={`d${i}`}><circle cx={cx} cy={DEEP_Y} r="11" fill={hue} stroke={C.bg} strokeWidth="1.5" /><text x={cx} y={DEEP_Y + 4} textAnchor="middle" fontSize="10" fontWeight="900" fontFamily={NUM_FONT} fill={C.bg}>S</text></g>)}
      {s.under.map(([x, y], i) => <g key={`u${i}`}><circle cx={x} cy={y} r="9" fill="none" stroke={hue} strokeWidth="2.5" /><text x={x} y={y + 3.5} textAnchor="middle" fontSize="9" fontWeight="900" fontFamily={NUM_FONT} fill={C.text}>{y > 160 ? 'CB' : 'LB'}</text></g>)}
      <text x={W / 2} y="30" textAnchor="middle" fontSize="30" fontWeight="900" fontFamily={NUM_FONT} fill={C.text} style={{ paintOrder: 'stroke', stroke: C.bg, strokeWidth: 4, strokeLinejoin: 'round' }}>{big}</text>
      {sub && <text x={W / 2} y="46" textAnchor="middle" fontSize="11" fontWeight="800" fontFamily={NUM_FONT} fill={C.text2} style={{ paintOrder: 'stroke', stroke: C.bg, strokeWidth: 3, strokeLinejoin: 'round' }}>{sub}</text>}
    </svg>
  )
}
