'use client'
import { useId, useState } from 'react'
import { C, NUM_FONT, RINK, rampAt } from '../../lib/nhl/theme'
import { shotPath, shotOutcome, paceMs, measuredMph } from '../../lib/nhl/shotPath'
import { GOALIE_ZONES, ZONE_SHAPES, ZONE_LABEL_AT, tintAlpha } from '../../lib/nhl/zones'

// 🏒 THE RINK (lamp research step 3, 2026-09-26). One attacking half seen
// from above, net on the right, drawn in the league's own feet: blue line
// at x=25, faceoff dots at x=69 / y=±22, goal line at x=89, boards rounded
// at 28 ft. The slot (lib/nhl/shotMap.js SLOT) is shaded so the slot share
// beside the map is visibly the shaded box. Two views of the same shots:
//   DOTS  every recent attempt
//   HEAT  the zone grid, each cell shaded on LAMP's ramp by its attempts
// Every shot is already normalised to attack this net (the route does it).
//
// BATCH-3D-V2 (2026-10-02), the same rules as the 3D arena so the two match:
//   THE SHEET IS ICE (RINK.ice), real line colours, so the marks can be what
//   real pucks are -- black. On net: a charcoal disc with a thin light rim.
//   Goal: lamp red, 1.5x, glowing. Miss: a small dark x. Blocked: a short dark
//   stub toward the net. Nothing on the ice is red except a goal: the faceoff
//   dots are thin red rings (they read as goals before, 1b).
//   HEAT: tiles floor at 35% (a cold zone still reads), each with its count;
//   the slot prints its own share.
//   HOVER / TAP plays the shot along its line (lib/nhl/shotPath.js), at the
//   pace his EDGE average gives (or a measured hardest-ten speed), 0.8 s with
//   neither. The line is to the net along the ice -- not a tracked puck path.
const X0 = 25; const W = 75; const H = 85
const sx = (x) => x - X0
const sy = (y) => 42.5 - y

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
/** The heat tile's opacity: never under 35%, so a cold zone still reads (1d). */
export const heatAlpha = (t) => 0.35 + 0.5 * t

/** One mark, by result, in rink feet at (cx, cy). Shared rule with the 3D arena. */
function Mark({ shot, cx, cy, sel, hard }) {
  const out = shotOutcome(shot)
  if (shot[2] === 'goal') {
    return (
      <g>
        <circle cx={cx} cy={cy} r={2.4} fill={C.lamp} opacity={0.28} />
        <circle cx={cx} cy={cy} r={sel ? 1.8 : 1.35} fill={C.lamp} stroke={sel ? C.text : C.lamp} strokeWidth={sel ? 0.45 : 0.2} />
        {hard && <circle cx={cx} cy={cy} r={2.2} fill="none" stroke={RINK.puckRim} strokeWidth={0.25} />}
      </g>
    )
  }
  if (shot[2] === 'sog') {
    return (
      <g>
        <circle cx={cx} cy={cy} r={sel ? 1.3 : 0.95} fill={RINK.puck} stroke={sel ? C.lamp : RINK.puckRim} strokeWidth={sel ? 0.4 : 0.22} />
        {hard && <circle cx={cx} cy={cy} r={1.7} fill="none" stroke={C.ice} strokeWidth={0.3} />}
      </g>
    )
  }
  if (out === 'block') {
    // a short stub toward the net
    const d = Math.hypot(89 - (cx + X0), 42.5 - cy) || 1
    const ux = (89 - (cx + X0)) / d, uy = (42.5 - cy) / d
    return <line x1={cx} y1={cy} x2={cx + ux * 1.8} y2={cy + uy * 1.8} stroke={sel ? C.lamp : RINK.missInk} strokeWidth={sel ? 0.55 : 0.4} strokeLinecap="round" />
  }
  const k = sel ? 0.95 : 0.7
  return (
    <g stroke={sel ? C.lamp : RINK.missInk} strokeWidth={sel ? 0.4 : 0.3} strokeLinecap="round">
      <line x1={cx - k} y1={cy - k} x2={cx + k} y2={cy + k} />
      <line x1={cx - k} y1={cy + k} x2={cx + k} y2={cy - k} />
      {hard && <circle cx={cx} cy={cy} r={1.5} fill="none" stroke={C.ice} strokeWidth={0.3} />}
    </g>
  )
}

// a zone ring -> an SVG path in rink space (holes cut with evenodd)
const ringPath = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${sx(x).toFixed(2)},${sy(y).toFixed(2)}`).join(' ') + ' Z'

export default function Rink({ map, slot, gridSpec, height = 300, shots = null, onPick = null, onPickCell = null, picked = null, view: viewProp = null, onView = null, extraView = null, league = null, vsMin = VS_MIN, speed = null, hardest = null, slotPct = null,
  goalieRead = null, onPickZone = null, pickedZone = null }) {
  const clipId = `rink-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const [viewOwn, setViewOwn] = useState('dots')
  const [play, setPlay] = useState(null)        // { shot, n } -- n restarts the animation
  const view = viewProp || viewOwn
  const setView = onView || setViewOwn
  const drawn = shots || map?.recent || []
  if (!map) return null
  const max = Math.max(1, ...map.grid.flat().map((c) => c.att))
  const cw = (gridSpec.x1 - gridSpec.x0) / gridSpec.cols; const ch = (gridSpec.y1 - gridSpec.y0) / gridSpec.rows
  const vs = view === 'vs' ? vsCells(map.grid, league) : null
  const start = (shot) => setPlay((p) => (p?.shot === shot ? p : { shot, n: (p?.n || 0) + 1 }))
  // the playing shot: its path as an SVG polyline, timed by its pace
  const playing = play && (view === 'dots' || view === 'goalie') ? (() => {
    const pts = shotPath(play.shot)
    const mph = measuredMph(hardest, play.shot)
    const ms = paceMs(pts, { avg: speed?.avg, leagueAvg: speed?.leagueAvg, mph })
    const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${sx(x).toFixed(2)},${sy(y).toFixed(2)}`).join(' ')
    return { d, ms, goal: play.shot[2] === 'goal' }
  })() : null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
      <div role="group" aria-label="Map view" style={{ display: 'inline-flex', gap: 4 }}>
        {[...(league ? ['dots', 'heat', 'vs'] : ['dots', 'heat']), ...(goalieRead ? ['goalie'] : [])].map((v) => (
          <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v}
            style={{ padding: '4px 10px', borderRadius: 7, cursor: 'pointer', font: `800 9px/1 ${NUM_FONT}`, letterSpacing: '.08em', border: `1px solid ${view === v ? C.ice : C.border2}`, background: view === v ? `${C.ice}1f` : 'transparent', color: view === v ? C.ice : C.text3 }}>
            {v === 'vs' ? 'VS LEAGUE' : v === 'goalie' ? 'VS GOALIE' : v.toUpperCase()}
          </button>
        ))}
        {/* the caller's extra view (ShotPanel's 🏟 ARENA, BATCH-NHL-3D) */}
        {extraView}
      </div>
      <svg viewBox={`-1 -1 ${W + 2} ${H + 2}`} role="img" aria-label={`Shot map: ${map.attempts} attempts, ${map.goals} goals`}
        style={{ height, width: 'auto', maxWidth: '100%', display: 'block' }} onMouseLeave={() => setPlay(null)}>
        {/* the sheet: ice, inside the boards */}
        <path d={`M0,0 H${W - 28} A28,28 0 0 1 ${W},28 V${H - 28} A28,28 0 0 1 ${W - 28},${H} H0 Z`} fill={RINK.ice} stroke={RINK.cap} strokeWidth="0.8" />
        {view !== 'goalie' && <rect x={sx(slot.x0)} y={sy(slot.y)} width={slot.x1 - slot.x0} height={slot.y * 2} fill={RINK.crease} opacity={0.22} />}
        {/* DISTANCE ARCS (2026-09-30, "like the spray chart"): fixed-feet arcs
            from the net, 20 / 40 / 60 ft, clipped to the rink. */}
        <clipPath id={clipId}><path d={`M0,0 H${W - 28} A28,28 0 0 1 ${W},28 V${H - 28} A28,28 0 0 1 ${W - 28},${H} H0 Z`} /></clipPath>
        <g clipPath={`url(#${clipId})`}>
          {[20, 40, 60].map((r) => (
            <circle key={r} cx={sx(89)} cy={sy(0)} r={r} fill="none" stroke={RINK.iceLine} strokeWidth="0.3" strokeDasharray="1.2 1.4" />
          ))}
          {view === 'heat' && map.grid.map((row, r) => row.map((cell, c) => cell.att ? (
            <g key={`${r}-${c}`}>
              <rect x={sx(gridSpec.x0 + c * cw)} y={r * ch} width={cw} height={ch} fill={rampAt(cell.att / max)} opacity={heatAlpha(cell.att / max)}>
                <title>{`${cell.att} attempts · ${cell.sog} on net · ${cell.g} goals`}</title>
              </rect>
              <text x={sx(gridSpec.x0 + c * cw + cw / 2)} y={r * ch + ch / 2 + 1.6} fill={RINK.puck} fontSize="4.4" fontWeight="900" fontFamily={NUM_FONT} textAnchor="middle" pointerEvents="none">{cell.att}</text>
            </g>
          ) : null))}
        </g>
        {/* VS GOALIE (BATCH-3D-V2 1h): HIS map under the shooter's pucks --
            each named zone by goals against per shot on goal there vs the
            league's. Lamp red = he lets in more than the league, blue = better,
            no tint = league average, hatched = thin (too few shots). */}
        {view === 'goalie' && goalieRead && (
          <g clipPath={`url(#${clipId})`}>
            <defs><pattern id={`${clipId}-thin`} width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="2" stroke={RINK.iceLine} strokeWidth="0.4" /></pattern></defs>
            {GOALIE_ZONES.map((z) => {
              const r = goalieRead[z.key]; const sh = ZONE_SHAPES[z.key]
              const d = [ringPath(sh.outer), ...sh.holes.map(ringPath)].join(' ')
              const fill = r.thin ? `url(#${clipId}-thin)` : r.tint === 'worse' ? C.lamp : r.tint === 'better' ? RINK.blue : 'none'
              return (
                <path key={z.key} d={d} fillRule="evenodd" fill={fill} fillOpacity={r.thin ? 1 : r.tint ? tintAlpha(r.d) : 0}
                  stroke={pickedZone === z.key ? RINK.puck : RINK.iceLine} strokeWidth={pickedZone === z.key ? 0.6 : 0.25}
                  style={{ cursor: onPickZone ? 'pointer' : 'default' }} onClick={onPickZone ? () => onPickZone(z.key) : undefined}>
                  <title>{`${z.label}: ${r.thin ? 'thin' : `${r.ga} goals on ${r.sa} shots`}`}</title>
                </path>
              )
            })}
            {GOALIE_ZONES.map((z) => {
              const r = goalieRead[z.key]; const [lx, ly] = ZONE_LABEL_AT[z.key]
              return (
                <text key={`l${z.key}`} x={sx(lx)} y={sy(ly)} fill={RINK.puck} fontSize="3" fontWeight="800" fontFamily={NUM_FONT} textAnchor="middle" pointerEvents="none">
                  {r.thin ? 'thin' : `${Math.round(r.rate * 1000) / 10}%`}
                </text>
              )
            })}
          </g>
        )}
        {[20, 40, 60].map((r) => (
          <text key={`t${r}`} x={sx(89 - r)} y={sy(0) - 1} fill={RINK.missInk} fontSize="3" fontFamily={NUM_FONT} textAnchor="middle">{r} ft</text>
        ))}
        {vs && vs.map((row, r) => row.map((v, c) => v.att >= vsMin ? (
          <g key={`vs${r}-${c}`}>
            <rect x={sx(gridSpec.x0 + c * cw)} y={r * ch} width={cw} height={ch} fill={v.d >= 0 ? C.lamp : RINK.blue} opacity={vsAlpha(v.d)}>
              <title>{`${Math.round(v.mine * 100)}% of the attempts here · the league ${Math.round(v.lg * 100)}%`}</title>
            </rect>
            <text x={sx(gridSpec.x0 + c * cw + cw / 2)} y={r * ch + ch / 2 + 1.4} fill={RINK.puck} fontSize="4" fontWeight="800" fontFamily={NUM_FONT} textAnchor="middle" pointerEvents="none">
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
        {/* the slot prints its own share, inside its box (1d) */}
        {slotPct != null && view !== 'goalie' && (
          <text x={sx(slot.x0) + 1.2} y={sy(slot.y) + 4.2} fill={RINK.blue} fontSize="3.6" fontWeight="900" fontFamily={NUM_FONT} pointerEvents="none">SLOT {slotPct}%</text>
        )}
        {/* the lines: blue line, goal line, the circles; faceoff dots as thin rings */}
        <line x1="0.4" y1="0" x2="0.4" y2={H} stroke={RINK.blue} strokeWidth="1" />
        <line x1={sx(89)} y1="3" x2={sx(89)} y2={H - 3} stroke={RINK.red} strokeWidth="0.35" />
        {[22, -22].map((y) => (
          <g key={y}>
            <circle cx={sx(69)} cy={sy(y)} r="15" fill="none" stroke={RINK.red} strokeOpacity="0.55" strokeWidth="0.35" />
            <circle cx={sx(69)} cy={sy(y)} r="1" fill="none" stroke={RINK.red} strokeOpacity="0.55" strokeWidth="0.25" />
          </g>
        ))}
        <path d={`M${sx(89)},${sy(6)} A6,6 0 0 0 ${sx(89)},${sy(-6)} Z`} fill={RINK.crease} fillOpacity="0.55" stroke={RINK.red} strokeOpacity="0.6" strokeWidth="0.3" />
        <rect x={sx(89)} y={sy(3)} width="3.3" height="6" fill="none" stroke={RINK.red} strokeWidth="0.45" />
        {(view === 'dots' || view === 'goalie') && drawn.map((shot, i) => {
          const sel = picked === shot
          const hard = measuredMph(hardest, shot) != null
          return (
            <g key={i}>
              <Mark shot={shot} cx={sx(shot[0])} cy={sy(shot[1])} sel={sel} hard={hard} />
              {onPick && <circle cx={sx(shot[0])} cy={sy(shot[1])} r="2.6" fill="transparent" style={{ cursor: 'pointer' }}
                onMouseEnter={() => start(shot)} onClick={() => { start(shot); onPick(shot) }} />}
            </g>
          )
        })}
        {/* THE PLAY: the shot's line, and the puck sliding along it */}
        {playing && (
          <g key={play.n} pointerEvents="none">
            <path d={playing.d} fill="none" stroke={playing.goal ? C.lamp : RINK.missInk} strokeWidth="0.35" strokeDasharray={playing.goal ? '0' : '1 0.8'} opacity="0.85" />
            <circle r={playing.goal ? 1.2 : 0.9} fill={playing.goal ? C.lamp : RINK.puck} stroke={RINK.puckRim} strokeWidth="0.2">
              <animateMotion dur={`${playing.ms}ms`} fill="freeze" path={playing.d} />
            </circle>
          </g>
        )}
      </svg>
      {/* The key moved to the caller's ChartLegend (BATCH-2D-CORE flag 2). */}
    </div>
  )
}
