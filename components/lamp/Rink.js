'use client'
import { useId, useState } from 'react'
import { C, NUM_FONT, rampAt } from '../../lib/nhl/theme'

// 🏒 THE RINK (lamp research step 3, 2026-09-26). One attacking half seen
// from above, net on the right, drawn in the league's own feet: blue line
// at x=25, faceoff dots at x=69 / y=±22, goal line at x=89, boards rounded
// at 28 ft. The slot (lib/nhl/shotMap.js SLOT) is shaded so the slot share
// beside the map is visibly the shaded box. Two views of the same shots:
//   DOTS  every recent attempt -- goals filled lamp-red, on-net ice, misses
//         and blocks hollow
//   HEAT  the zone grid, each cell shaded on LAMP's ramp by its attempts
// Every shot is already normalised to attack this net (the route does it).
const X0 = 25; const W = 75; const H = 85
const sx = (x) => x - X0
const sy = (y) => 42.5 - y

// TAP A SHOT (2026-09-29, the spray-chart pass): `shots` (the filtered recent
// list, defaulting to map.recent) are drawn; `onPick(shot)` / `onPickCell`
// open the detail card beside the rink. Each dot gets a wider invisible hit
// circle -- SprayField's lesson: a 1-foot dot is not a thumb target.
// `view` / `onView` (2026-10-01, BATCH-2D-CORE): the caller can hold the
// DOTS/HEAT state so its legend (ChartLegend) is built from what is drawn.
// VS LEAGUE (2026-10-01, 2D TOP TIER 2): each zone shaded by HIS share of
// the attempts there minus the LEAGUE's share (percentage points), from the
// same grid. A zone needs VS_MIN of his attempts to be inked -- fewer and the
// difference is noise, so it is left blank.
export const VS_MIN = 5
// A FIXED scale, not each map's own max: a 2-point gap must not look as loud
// as a 20-point one. Full colour at VS_FULL points.
export const VS_FULL = 0.08
export const vsAlpha = (d, k = 0.55) => 0.1 + k * Math.min(1, Math.abs(d) / VS_FULL)
export const vsText = (d) => { const v = Math.round(d * 1000) / 10; return v === 0 ? '0' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}` }
/** his grid + the league's -> per cell { mine, lg, d } in shares (0..1); null when no league */
export function vsCells(grid, league) {
  if (!grid || !league?.grid) return null
  const tot = (g) => g.flat().reduce((n, c) => n + c.att, 0)
  const a = tot(grid), b = tot(league.grid)
  if (!a || !b) return null
  return grid.map((row, r) => row.map((cell, c) => ({ att: cell.att, mine: cell.att / a, lg: league.grid[r][c].att / b, d: cell.att / a - league.grid[r][c].att / b })))
}

export default function Rink({ map, slot, gridSpec, height = 300, shots = null, onPick = null, onPickCell = null, picked = null, view: viewProp = null, onView = null, extraView = null, league = null, vsMin = VS_MIN }) {
  const clipId = `rink-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const [viewOwn, setViewOwn] = useState('dots')
  const view = viewProp || viewOwn
  const setView = onView || setViewOwn
  const drawn = shots || map?.recent || []
  if (!map) return null
  const max = Math.max(1, ...map.grid.flat().map((c) => c.att))
  const cw = (gridSpec.x1 - gridSpec.x0) / gridSpec.cols; const ch = (gridSpec.y1 - gridSpec.y0) / gridSpec.rows
  const line = C.border2
  const vs = view === 'vs' ? vsCells(map.grid, league) : null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
      <div role="group" aria-label="Map view" style={{ display: 'inline-flex', gap: 4 }}>
        {(league ? ['dots', 'heat', 'vs'] : ['dots', 'heat']).map((v) => (
          <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v}
            style={{ padding: '4px 10px', borderRadius: 7, cursor: 'pointer', font: `800 9px/1 ${NUM_FONT}`, letterSpacing: '.08em', border: `1px solid ${view === v ? C.ice : C.border2}`, background: view === v ? `${C.ice}1f` : 'transparent', color: view === v ? C.ice : C.text3 }}>
            {v === 'vs' ? 'VS LEAGUE' : v.toUpperCase()}
          </button>
        ))}
        {/* the caller's extra view (ShotPanel's 🏟 ARENA, BATCH-NHL-3D) */}
        {extraView}
      </div>
      <svg viewBox={`-1 -1 ${W + 2} ${H + 2}`} role="img" aria-label={`Shot map: ${map.attempts} attempts, ${map.goals} goals`}
        style={{ height, width: 'auto', maxWidth: '100%', display: 'block' }}>
        <path d={`M0,0 H${W - 28} A28,28 0 0 1 ${W},28 V${H - 28} A28,28 0 0 1 ${W - 28},${H} H0 Z`} fill={C.bg2} stroke={line} strokeWidth="0.6" />
        <rect x={sx(slot.x0)} y={sy(slot.y)} width={slot.x1 - slot.x0} height={slot.y * 2} fill={`${C.ice}14`} />
        {/* DISTANCE ARCS (2026-09-30, "like the spray chart"): SprayField
            draws fixed-feet arcs from home plate so a dot's position reads as a
            distance; these are fixed-feet arcs from the net, 20 / 40 / 60 ft,
            clipped to the rink, labelled on the centre line. */}
        <clipPath id={clipId}><path d={`M0,0 H${W - 28} A28,28 0 0 1 ${W},28 V${H - 28} A28,28 0 0 1 ${W - 28},${H} H0 Z`} /></clipPath>
        <g clipPath={`url(#${clipId})`}>
          {[20, 40, 60].map((r) => (
            <circle key={r} cx={sx(89)} cy={sy(0)} r={r} fill="none" stroke={line} strokeWidth="0.3" strokeDasharray="1.2 1.4" />
          ))}
        </g>
        {[20, 40, 60].map((r) => (
          <text key={`t${r}`} x={sx(89 - r)} y={sy(0) - 1} fill={C.text3} fontSize="3" fontFamily={NUM_FONT} textAnchor="middle">{r} ft</text>
        ))}
        {view === 'heat' && map.grid.map((row, r) => row.map((cell, c) => cell.att ? (
          <rect key={`${r}-${c}`} x={sx(gridSpec.x0 + c * cw)} y={r * ch} width={cw} height={ch} fill={rampAt(cell.att / max)} opacity={0.18 + 0.6 * (cell.att / max)}>
            <title>{`${cell.att} attempts · ${cell.sog} on net · ${cell.g} goals`}</title>
          </rect>
        ) : null))}
        {vs && vs.map((row, r) => row.map((v, c) => v.att >= vsMin ? (
          <g key={`vs${r}-${c}`}>
            <rect x={sx(gridSpec.x0 + c * cw)} y={r * ch} width={cw} height={ch} fill={v.d >= 0 ? C.lamp : C.ice} opacity={vsAlpha(v.d)}>
              <title>{`${Math.round(v.mine * 100)}% of the attempts here · the league ${Math.round(v.lg * 100)}%`}</title>
            </rect>
            <text x={sx(gridSpec.x0 + c * cw + cw / 2)} y={r * ch + ch / 2 + 1.4} fill={C.text} fontSize="4" fontWeight="800" fontFamily={NUM_FONT} textAnchor="middle" pointerEvents="none">
              {vsText(v.d)}
            </text>
          </g>
        ) : null))}
        {vs && onPickCell && map.grid.map((row, r) => row.map((cell, c) => vs[r][c].att >= vsMin ? (
          <rect key={`vhit-${r}-${c}`} x={sx(gridSpec.x0 + c * cw)} y={r * ch} width={cw} height={ch} fill="transparent" style={{ cursor: 'pointer' }}
            onClick={() => onPickCell({ ...cell, r, c, vs: vs[r][c] })} />
        ) : null))}
        {view === 'heat' && onPickCell && map.grid.map((row, r) => row.map((cell, c) => cell.att ? (
          <rect key={`hit-${r}-${c}`} x={sx(gridSpec.x0 + c * cw)} y={r * ch} width={cw} height={ch} fill="transparent" style={{ cursor: 'pointer' }}
            onClick={() => onPickCell({ ...cell, r, c })} />
        ) : null))}
        <line x1="0.4" y1="0" x2="0.4" y2={H} stroke={C.ice} strokeOpacity="0.55" strokeWidth="1" />
        <line x1={sx(89)} y1="3" x2={sx(89)} y2={H - 3} stroke={C.lamp} strokeOpacity="0.5" strokeWidth="0.35" />
        {[22, -22].map((y) => (
          <g key={y}>
            <circle cx={sx(69)} cy={sy(y)} r="15" fill="none" stroke={line} strokeWidth="0.35" />
            <circle cx={sx(69)} cy={sy(y)} r="0.9" fill={C.lamp} fillOpacity="0.7" />
          </g>
        ))}
        <path d={`M${sx(89)},${sy(6)} A6,6 0 0 0 ${sx(89)},${sy(-6)} Z`} fill={`${C.ice}26`} stroke={C.ice} strokeOpacity="0.6" strokeWidth="0.3" />
        <rect x={sx(89)} y={sy(3)} width="3.3" height="6" fill="none" stroke={C.text2} strokeWidth="0.4" />
        {view === 'dots' && drawn.map((shot, i) => {
          const [x, y, res] = shot
          const goal = res === 'goal'; const on = res === 'sog'; const sel = picked === shot
          return (
            <g key={i}>
              <circle cx={sx(x)} cy={sy(y)} r={sel ? 2 : goal ? 1.3 : 0.9}
                fill={goal ? C.lamp : on ? C.ice : 'none'} fillOpacity={goal ? 1 : 0.75}
                stroke={sel ? C.text : goal ? C.lamp : on ? 'none' : C.text3} strokeWidth={sel ? 0.5 : 0.3} />
              {onPick && <circle cx={sx(x)} cy={sy(y)} r="2.6" fill="transparent" style={{ cursor: 'pointer' }} onClick={() => onPick(shot)} />}
            </g>
          )
        })}
      </svg>
      {/* The key moved to the caller's ChartLegend (BATCH-2D-CORE flag 2). */}
    </div>
  )
}
