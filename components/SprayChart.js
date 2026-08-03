'use client'
import { useState, useCallback, useEffect, useMemo } from 'react'
import { NUM_FONT } from '../lib/theme'
import { detailUrl } from '../lib/dataSource'
import { rampColor, inkFor } from './Heatmap'

// ── colors ────────────────────────────────────────────────────────────────────

const PITCH_COLORS = {
  FF:'#f97316',SI:'#fb923c',FC:'#f59e0b',SL:'#4ade80',CU:'#22d3ee',
  KC:'#06b6d4',CH:'#60a5fa',FS:'#818cf8',KN:'#a78bfa',ST:'#34d399',
  SV:'#f87171',OTHER:'#71717a',
}
const PITCH_NAMES = {
  FF:'4-Seam',SI:'Sinker',FC:'Cutter',SL:'Slider',CU:'Curveball',
  KC:'K-Curve',CH:'Changeup',FS:'Splitter',KN:'Knuckleball',ST:'Sweeper',
  SV:'Slurve',OTHER:'Other',
}

// Result config — color, short label, dot radius
const RES_CONFIG = {
  home_run:                  { color:'#f87171', label:'HR',   r:5.5 },
  triple:                    { color:'#fb923c', label:'3B',   r:3.6 },
  double:                    { color:'#f59e0b', label:'2B',   r:3.2 },
  single:                    { color:'#4ade80', label:'1B',   r:2.6 },
  sac_fly:                   { color:'#22d3ee', label:'SF',   r:2.6 },
  field_error:               { color:'#a78bfa', label:'Err',  r:2.6 },
  field_out:                 { color:'#52525b', label:'Out',  r:2.0 },
  force_out:                 { color:'#52525b', label:'Out',  r:2.0 },
  grounded_into_double_play: { color:'#52525b', label:'GIDP', r:2.0 },
  double_play:               { color:'#52525b', label:'DP',   r:2.0 },
  strikeout:                 { color:'#52525b', label:'K',    r:2.0 },
  fielders_choice:           { color:'#52525b', label:'FC',   r:2.0 },
  fielders_choice_out:       { color:'#52525b', label:'FC',   r:2.0 },
  sac_bunt:                  { color:'#3f3f46', label:'SB',   r:2.0 },
  catcher_interf:            { color:'#a78bfa', label:'CI',   r:2.0 },
}

const BB_COLORS = {
  fly_ball:'#f97316', line_drive:'#4ade80', ground_ball:'#60a5fa', popup:'#71717a',
}

const OUT_ALIASES = new Set([
  'field_out','force_out','grounded_into_double_play','double_play',
  'strikeout','fielders_choice','fielders_choice_out','sac_bunt',
])

const RES_GROUPS = [
  { key:'home_run',   label:'HR',  color:'#f87171' },
  { key:'triple',     label:'3B',  color:'#fb923c' },
  { key:'double',     label:'2B',  color:'#f59e0b' },
  { key:'single',     label:'1B',  color:'#4ade80' },
  { key:'field_out',  label:'Out', color:'#52525b' },
  { key:'sac_fly',    label:'SF',  color:'#22d3ee' },
  { key:'field_error',label:'Err', color:'#a78bfa' },
]

const BB_GROUPS = [
  { key:'fly_ball',   label:'FB', color:'#f97316' },
  { key:'line_drive', label:'LD', color:'#4ade80' },
  { key:'ground_ball',label:'GB', color:'#60a5fa' },
  { key:'popup',      label:'PU', color:'#71717a' },
]

// ── park walls — more control points for smooth curve ─────────────────────────
// Format: [angle_deg, distance_ft] — angle 0=CF, neg=LF, pos=RF

const PARK_WALLS = {
  'Coors Field':              [[-45,347],[-38,360],[-30,375],[-15,390],[0,415],[15,415],[30,375],[38,362],[45,350]],
  'Fenway Park':              [[-45,310],[-38,340],[-30,379],[-15,420],[0,420],[15,380],[30,302],[38,302],[45,302]],
  'Yankee Stadium':           [[-45,318],[-38,318],[-30,318],[-15,399],[0,408],[15,385],[30,314],[38,314],[45,314]],
  'Dodger Stadium':           [[-45,330],[-38,345],[-30,360],[-15,395],[0,395],[15,375],[30,360],[38,345],[45,330]],
  'Oracle Park':              [[-45,339],[-38,368],[-30,399],[-15,421],[0,399],[15,399],[30,309],[38,309],[45,309]],
  'PNC Park':                 [[-45,325],[-38,354],[-30,383],[-15,399],[0,399],[15,375],[30,365],[38,342],[45,320]],
  'Petco Park':               [[-45,336],[-38,353],[-30,370],[-15,396],[0,396],[15,390],[30,369],[38,345],[45,322]],
  'Oriole Park at Camden Yards':[[-45,333],[-38,348],[-30,364],[-15,400],[0,400],[15,373],[30,350],[38,336],[45,320]],
  'T-Mobile Park':            [[-45,331],[-38,354],[-30,378],[-15,405],[0,401],[15,387],[30,381],[38,353],[45,326]],
  'Minute Maid Park':         [[-45,315],[-38,338],[-30,362],[-15,435],[0,435],[15,409],[30,326],[38,326],[45,326]],
  'Wrigley Field':            [[-45,355],[-38,361],[-30,368],[-15,400],[0,400],[15,368],[30,368],[38,361],[45,353]],
  'Progressive Field':        [[-45,325],[-38,347],[-30,370],[-15,410],[0,410],[15,405],[30,370],[38,347],[45,325]],
  'Comerica Park':            [[-45,345],[-38,357],[-30,370],[-15,420],[0,420],[15,379],[30,370],[38,357],[45,330]],
  'Globe Life Field':         [[-45,329],[-38,350],[-30,372],[-15,407],[0,407],[15,374],[30,372],[38,350],[45,326]],
  'Rogers Centre':            [[-45,328],[-38,351],[-30,375],[-15,400],[0,400],[15,375],[30,375],[38,351],[45,328]],
  'Kauffman Stadium':         [[-45,330],[-38,352],[-30,375],[-15,410],[0,410],[15,375],[30,375],[38,352],[45,330]],
  'Tropicana Field':          [[-45,315],[-38,342],[-30,370],[-15,404],[0,404],[15,375],[30,375],[38,348],[45,322]],
  'loanDepot park':           [[-45,344],[-38,365],[-30,386],[-15,422],[0,422],[15,416],[30,386],[38,360],[45,335]],
  'Angel Stadium':            [[-45,330],[-38,350],[-30,370],[-15,396],[0,396],[15,375],[30,370],[38,350],[45,330]],
  'Citi Field':               [[-45,335],[-38,346],[-30,358],[-15,408],[0,408],[15,390],[30,375],[38,352],[45,330]],
  'Rate Field':               [[-45,330],[-38,352],[-30,375],[-15,400],[0,400],[15,375],[30,375],[38,352],[45,335]],
  'Las Vegas Ballpark':       [[-45,325],[-38,345],[-30,365],[-15,400],[0,400],[15,365],[30,365],[38,345],[45,325]],
  'Truist Park':              [[-45,335],[-38,355],[-30,375],[-15,400],[0,400],[15,390],[30,375],[38,355],[45,325]],
  'American Family Field':    [[-45,344],[-38,357],[-30,371],[-15,400],[0,400],[15,392],[30,374],[38,359],[45,345]],
  'Chase Field':              [[-45,330],[-38,352],[-30,374],[-15,407],[0,407],[15,374],[30,374],[38,352],[45,334]],
  'Nationals Park':           [[-45,336],[-38,356],[-30,377],[-15,402],[0,402],[15,370],[30,370],[38,352],[45,335]],
  'Citizens Bank Park':       [[-45,330],[-38,349],[-30,369],[-15,401],[0,401],[15,369],[30,369],[38,349],[45,330]],
  'Target Field':             [[-45,339],[-38,358],[-30,377],[-15,404],[0,404],[15,367],[30,367],[38,347],[45,328]],
  'Busch Stadium':            [[-45,336],[-38,355],[-30,375],[-15,400],[0,400],[15,375],[30,375],[38,355],[45,335]],
  'Great American Ball Park': [[-45,328],[-38,349],[-30,370],[-15,404],[0,404],[15,375],[30,375],[38,350],[45,325]],
}
const DEFAULT_WALL = [[-45,330],[-38,350],[-30,370],[-15,400],[0,400],[15,370],[30,370],[38,350],[45,330]]

function getWall(venue) {
  if (!venue) return DEFAULT_WALL
  if (PARK_WALLS[venue]) return PARK_WALLS[venue]
  const key = Object.keys(PARK_WALLS).find(k =>
    (venue||'').toLowerCase().includes(k.toLowerCase().split(' ')[0])
  )
  return PARK_WALLS[key] || DEFAULT_WALL
}

// ── geometry ──────────────────────────────────────────────────────────────────
// Canvas: 320×260. Home plate at bottom-center. SCALE maps feet → px.

const W = 320, H = 260, SCALE = 0.40
const HPx = W / 2
const HPy = H - 18

function fp(deg, ft) {
  const r = deg * Math.PI / 180
  return { x: HPx + Math.sin(r) * ft * SCALE, y: HPy - Math.cos(r) * ft * SCALE }
}

// Statcast hc_x/hc_y → SVG px. Plate ≈ (125, 205) in Statcast coords.
function sp(hc_x, hc_y) {
  return {
    x: HPx + (hc_x - 125) * 2.08 * SCALE,
    y: HPy - (205 - hc_y) * 2.08 * SCALE,
  }
}

const B1 = fp(45, 90), B2 = fp(0, 127), B3 = fp(-45, 90)

// Build a smooth cubic-bezier path through wall points
function smoothWallPath(wall, close) {
  const pts = (wall || DEFAULT_WALL).map(([a, d]) => fp(a, d))
  if (pts.length < 2) return ''
  // Catmull-Rom → cubic bezier conversion
  const n = pts.length
  let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(n - 1, i + 2)]
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`
  }
  if (close) d += ` L${HPx},${HPy} Z`
  return d
}

function starPoints(cx, cy, r = 5) {
  const pts = []
  for (let i = 0; i < 10; i++) {
    const ang = (i * Math.PI) / 5 - Math.PI / 2
    const rad = i % 2 === 0 ? r : r * 0.40
    pts.push(`${(cx + Math.cos(ang) * rad).toFixed(2)},${(cy + Math.sin(ang) * rad).toFixed(2)}`)
  }
  return pts.join(' ')
}

// ── Field SVG ─────────────────────────────────────────────────────────────────

function Field({ venue, windDeg, windMph, hits, colorBy, tooltip, onDotClick }) {
  const wall = getWall(venue)

  const distLabels = useMemo(() => {
    return [-30, 0, 30].map(ang => {
      const entry = wall.find(([a]) => a === ang) || wall[Math.floor(wall.length / 2)]
      const dist = entry ? entry[1] : 400
      const pt = fp(ang, dist - 14)
      return { x: pt.x, y: pt.y, label: `${dist}'` }
    })
  }, [wall])

  // sorted: outs first, then hits, HRs on top
  const sorted = useMemo(() =>
    (hits || []).slice().sort((a, b) => {
      const order = { home_run:4, triple:3, double:2, single:1, sac_fly:1, field_error:1 }
      return (order[a._r] || 0) - (order[b._r] || 0)
    })
  , [hits])

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ display:'block', width:'100%', height:'auto' }}>
      <defs>
        <clipPath id="fieldClip">
          <path d={smoothWallPath(wall, true)} />
        </clipPath>
      </defs>

      {/* background */}
      <rect width={W} height={H} fill="#0a0a0f" />

      {/* outfield grass */}
      <path d={smoothWallPath(wall, true)} fill="#0f2409" />

      {/* subtle grass stripes */}
      {Array.from({length:8}, (_,i) => {
        const y = 10 + i * 28
        return <rect key={i} x={0} y={y} width={W} height={14} fill="rgba(255,255,255,0.012)" clipPath="url(#fieldClip)" />
      })}

      {/* infield dirt circle */}
      <ellipse cx={HPx} cy={HPy - Math.round(60*SCALE)} rx={Math.round(96*SCALE)} ry={Math.round(93*SCALE)} fill="#221208" />

      {/* infield grass diamond */}
      <path d={`M${HPx},${HPy} L${B1.x.toFixed(2)},${B1.y.toFixed(2)} L${B2.x.toFixed(2)},${B2.y.toFixed(2)} L${B3.x.toFixed(2)},${B3.y.toFixed(2)} Z`} fill="#122008" />

      {/* base paths */}
      {[[{x:HPx,y:HPy},B1],[B1,B2],[B2,B3],[B3,{x:HPx,y:HPy}]].map(([a,b],i) => {
        const dx=b.x-a.x, dy=b.y-a.y, l=Math.sqrt(dx*dx+dy*dy)||1
        const nx=(-dy/l)*4.5, ny=(dx/l)*4.5
        return <path key={i} d={`M${(a.x-nx).toFixed(2)},${(a.y-ny).toFixed(2)} L${(b.x-nx).toFixed(2)},${(b.y-ny).toFixed(2)} L${(b.x+nx).toFixed(2)},${(b.y+ny).toFixed(2)} L${(a.x+nx).toFixed(2)},${(a.y+ny).toFixed(2)} Z`} fill="#221208" />
      })}

      {/* mound */}
      <ellipse cx={HPx} cy={HPy - Math.round(60.5*SCALE)} rx={Math.round(8*SCALE)} ry={Math.round(7*SCALE)} fill="#221208" />

      {/* foul lines */}
      {[fp(-45,320), fp(45,320)].map((pt,i) => (
        <line key={i} x1={HPx} y1={HPy} x2={pt.x.toFixed(2)} y2={pt.y.toFixed(2)}
          stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
      ))}

      {/* base lines */}
      {[[{x:HPx,y:HPy},B1],[B1,B2],[B2,B3],[B3,{x:HPx,y:HPy}]].map(([a,b],i) => (
        <line key={i} x1={a.x.toFixed(2)} y1={a.y.toFixed(2)} x2={b.x.toFixed(2)} y2={b.y.toFixed(2)}
          stroke="rgba(255,255,255,0.18)" strokeWidth={0.9} />
      ))}

      {/* smooth wall line */}
      <path d={smoothWallPath(wall, false)} fill="none"
        stroke="rgba(255,255,255,0.50)" strokeWidth={1.8}
        strokeLinecap="round" strokeLinejoin="round" />

      {/* bases */}
      {[B1, B2, B3].map((b,i) => (
        <rect key={i} x={b.x-4} y={b.y-4} width={8} height={8} rx={0.5}
          fill="#e8e8e8" transform={`rotate(45,${b.x},${b.y})`} />
      ))}
      {/* home plate */}
      <polygon points={`${HPx},${HPy-6} ${HPx+4},${HPy-2} ${HPx+4},${HPy+3} ${HPx-4},${HPy+3} ${HPx-4},${HPy-2}`} fill="#e8e8e8" />

      {/* distance labels */}
      {distLabels.map((dl,i) => (
        <text key={i} x={dl.x.toFixed(2)} y={dl.y.toFixed(2)}
          fontSize={7} fontFamily="monospace" textAnchor="middle"
          fill="rgba(255,255,255,0.20)">{dl.label}</text>
      ))}

      {/* wind arrow — subtle, bottom-right */}
      {windMph > 2 && windDeg != null && (() => {
        const r = (windDeg - 180) * Math.PI / 180
        const len = 14 + windMph * 0.9
        const ax = W - 24, ay = H - 10
        const ex = ax + Math.sin(r)*len, ey = ay - Math.cos(r)*len
        const ha = Math.atan2(ey - ay, ex - ax)
        return (
          <g opacity={0.4}>
            <line x1={ax} y1={ay} x2={ex.toFixed(2)} y2={ey.toFixed(2)}
              stroke="#60a5fa" strokeWidth={1} strokeLinecap="round" />
            <polyline
              points={`${(ex-Math.cos(ha-0.4)*4).toFixed(2)},${(ey-Math.sin(ha-0.4)*4).toFixed(2)} ${ex.toFixed(2)},${ey.toFixed(2)} ${(ex-Math.cos(ha+0.4)*4).toFixed(2)},${(ey-Math.sin(ha+0.4)*4).toFixed(2)}`}
              fill="none" stroke="#60a5fa" strokeWidth={1} />
            <text x={ax} y={ay+8} fontSize={6} fontFamily="monospace"
              textAnchor="middle" fill="#60a5fa">{Math.round(windMph)}mph</text>
          </g>
        )
      })()}

      {/* dots */}
      {sorted.map((hit, i) => {
        if (hit.hc_x == null || hit.hc_y == null) return null
        const { x, y } = sp(hit.hc_x, hit.hc_y)
        const isHR  = hit._r === 'home_run'
        const isOut = OUT_ALIASES.has(hit._r)
        const cfg   = RES_CONFIG[hit._r] || { color:'#27272a', r:2.0 }

        const color = colorBy === 'pitch'
          ? (PITCH_COLORS[hit.pitch_type] || PITCH_COLORS.OTHER)
          : colorBy === 'bb'
          ? (BB_COLORS[hit._bb] || '#3f3f46')
          : cfg.color

        const r    = cfg.r
        const active = tooltip?.idx === i
        const isHH = !isHR && !isOut && (hit.ev || 0) >= 95

        if (isHR) return (
          <polygon key={i} points={starPoints(x, y, active ? r+2 : r)}
            fill={color}
            stroke={active ? '#fff' : 'rgba(0,0,0,0.7)'}
            strokeWidth={active ? 1.5 : 0.7}
            style={{ cursor:'pointer' }}
            onClick={() => onDotClick(hit, i)} />
        )

        return (
          <g key={i} style={{ cursor:'pointer' }} onClick={() => onDotClick(hit, i)}>
            <circle cx={x} cy={y} r={active ? r+1.2 : r}
              fill={isOut && colorBy==='result' ? '#71717a' : color}
              opacity={active ? 1 : isOut ? 0.7 : 0.88}
              stroke={active ? '#fff' : isOut ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)'}
              strokeWidth={active ? 1.2 : 0.6} />
            {isHH && !active && (
              <circle cx={x} cy={y} r={r+2.5}
                fill="none" stroke={color} strokeWidth={0.7} opacity={0.35} />
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ── Radar ─────────────────────────────────────────────────────────────────────

function Radar({ byPitch, activePitches }) {
  const relevant = useMemo(() => {
    if (!byPitch) return {}
    const ap = activePitches instanceof Set && activePitches.size > 0 ? activePitches : null
    return ap ? Object.fromEntries(Object.entries(byPitch).filter(([pt]) => ap.has(pt))) : byPitch
  }, [byPitch, activePitches])

  if (!Object.keys(relevant).length) return (
    <div style={{ width:110, height:110, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <span style={{ fontSize:9, color:'#52525b', fontFamily:NUM_FONT, textAlign:'center' }}>No pitch<br/>profile</span>
    </div>
  )

  const mn = (v, lo, hi) => Math.max(0, Math.min(1, ((v||0)-lo)/(hi-lo)))
  let tot=0, sEV=0, sLA=0, sFB=0, sPull=0, sHH=0, sBrl=0
  Object.values(relevant).forEach(d => {
    const s = d.seen||0; tot+=s
    sEV+=(d.avg_ev||0)*s; sLA+=(d.avg_la||0)*s
    sFB+=((d.fb_rate||0)+(d.ld_rate||0))*s
    sPull+=(d.air_pull_rate||0)*s
    sHH+=(d.hard_hit_rate||0)*s; sBrl+=(d.barrel_like_rate||0)*s
  })
  const n = tot||1
  const axes = [
    mn(sEV/n,82,100), Math.max(0,1-Math.abs((sLA/n)-22)/22),
    mn(sFB/n,.20,.55), mn(sPull/n,.10,.50),
    mn(sHH/n,.20,.60), mn(sBrl/n,0,.18),
  ]
  const labels = ['EV','LA','Air%','Pull','HH%','Brl%']
  const cx=60,cy=62,R=46
  const ptStr = axes.map((v,i) => {
    const ang=(i*Math.PI*2)/6-Math.PI/2
    return `${(cx+Math.cos(ang)*v*R).toFixed(2)},${(cy+Math.sin(ang)*v*R).toFixed(2)}`
  })
  const hex = s => Array.from({length:6},(_,i)=>{
    const ang=(i*Math.PI*2)/6-Math.PI/2
    return `${(cx+Math.cos(ang)*R*s).toFixed(2)},${(cy+Math.sin(ang)*R*s).toFixed(2)}`
  }).join(' ')

  return (
    <svg viewBox="0 0 120 128" style={{ width:110, flexShrink:0 }}>
      {[.33,.66,1].map(s=>(
        <polygon key={s} points={hex(s)} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={0.6}/>
      ))}
      {axes.map((_,i)=>{
        const ang=(i*Math.PI*2)/6-Math.PI/2
        return <line key={i} x1={cx} y1={cy} x2={(cx+Math.cos(ang)*R).toFixed(2)} y2={(cy+Math.sin(ang)*R).toFixed(2)} stroke="rgba(255,255,255,0.05)" strokeWidth={0.6}/>
      })}
      <polygon points={ptStr.join(' ')} fill="rgba(249,115,22,0.16)" stroke="#f97316" strokeWidth={1.2} strokeLinejoin="round"/>
      {ptStr.map((pt,i)=>{
        const [x,y]=pt.split(',').map(Number)
        return <circle key={i} cx={x} cy={y} r={1.8} fill="#f97316"/>
      })}
      {labels.map((l,i)=>{
        const ang=(i*Math.PI*2)/6-Math.PI/2
        const x=cx+Math.cos(ang)*(R+10), y=cy+Math.sin(ang)*(R+10)
        return <text key={i} x={x.toFixed(2)} y={y.toFixed(2)} fontSize={6.5} fontFamily="monospace" fill="#52525b" textAnchor="middle" dominantBaseline="central">{l}</text>
      })}
    </svg>
  )
}

// ── Pitch profile table ───────────────────────────────────────────────────────

function PitchProfile({ player, activePitches, onToggle }) {
  const [pitcherHand, setPitcherHand] = useState('ALL')
  if (!player) return null

  const byPitch    = player.batter_pitch_type_profile?.by_pitch || {}
  const arsenal    = player.pitcher_arsenal || player.pitcher_pitch_usage || {}
  // BUGFIX: previously always read pitcher_pitch_mix.pitch_type_summary
  // (the all-batters blend) regardless of the ALL/RHB/LHB toggle, then tried
  // to pull a per-row r.vs_lhb/r.vs_rhb sub-object that never existed in the
  // real data shape -- the bot stores LHB/RHB splits as separate top-level
  // arrays (pitcher_pitch_type_summary_vs_lhb / _vs_rhb), not nested on each
  // row. That made split always null and the toggle a no-op. Now selects
  // the correct array up front, matching the same fields PitchBreakdown.js
  // already reads correctly.
  const pitcherPts = pitcherHand==='L'
    ? (player.pitcher_pitch_type_summary_vs_lhb || player.pitcher_pitch_mix_vs_lhb?.pitch_type_summary || [])
    : pitcherHand==='R'
    ? (player.pitcher_pitch_type_summary_vs_rhb || player.pitcher_pitch_mix_vs_rhb?.pitch_type_summary || [])
    : (player.pitcher_pitch_mix?.pitch_type_summary || [])
  const todayPts   = Object.keys(arsenal).sort((a,b)=>(arsenal[b]||0)-(arsenal[a]||0))
  const allPitches = [...todayPts, ...Object.keys(byPitch).filter(p=>!todayPts.includes(p))].filter(p=>byPitch[p]||todayPts.includes(p))

  const dec = (v,n=1) => v!=null?Number(v).toFixed(n):'—'
  const pct = v => v!=null?`${(v*100).toFixed(0)}%`:'—'
  const bd  = '1px solid rgba(255,255,255,0.05)'
  const cG  = (v,lo,hi) => !v?{}:v>=hi?{color:'#4ade80',fontWeight:700}:v<=lo?{color:'#f87171',fontWeight:700}:{}
  const cR  = (v,lo,hi) => !v?{}:v>=hi?{color:'#f87171',fontWeight:700}:v<=lo?{color:'#4ade80',fontWeight:700}:{}

  const TH = ({children,style={}}) => (
    <th style={{padding:'3px 4px',fontSize:8,fontWeight:700,color:'#52525b',fontFamily:NUM_FONT,textAlign:'right',borderBottom:bd,whiteSpace:'nowrap',...style}}>{children}</th>
  )
  const TD = ({children,style={}}) => (
    <td style={{padding:'3px 4px',fontSize:9,fontFamily:NUM_FONT,textAlign:'right',borderBottom:bd,color:'#a1a1aa',...style}}>{children}</td>
  )

  return (
    <div style={{flex:1,minWidth:0,overflowX:'auto'}}>
      <div style={{fontSize:9,fontWeight:800,color:'#f4f4f5',marginBottom:4}}>
        {player.name} <span style={{fontSize:8,color:'#52525b',fontWeight:400}}>vs pitch · ★ today · tap to filter</span>
      </div>
      {allPitches.length===0
        ? <div style={{fontSize:9,color:'#52525b',fontFamily:NUM_FONT,padding:'5px 0'}}>Run bot to populate.</div>
        : (
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr>
                <TH style={{textAlign:'left',minWidth:72}}>Pitch</TH>
                <TH>N</TH><TH>BA</TH><TH>EV</TH><TH>LA</TH>
                <TH style={{color:'#60a5fa'}}>GB%</TH>
                <TH style={{color:'#f97316'}}>FB%</TH>
                <TH>HH%</TH><TH>Brl%</TH><TH>Pull%</TH><TH>Whf</TH><TH>K%</TH><TH>BB%</TH><TH>HR</TH><TH>HR/BBE</TH><TH>xwOBA</TH>
              </tr>
            </thead>
            <tbody>
              {allPitches.map(pt=>{
                const d=byPitch[pt]||{}
                const isToday=todayPts.includes(pt)
                const usage=arsenal[pt]
                const dot=PITCH_COLORS[pt]||PITCH_COLORS.OTHER
                const active=activePitches instanceof Set?activePitches.has(pt):true
                return (
                  <tr key={pt} onClick={()=>onToggle(pt)} style={{
                    cursor:'pointer',opacity:active?1:0.22,
                    background:isToday?`${dot}0c`:'transparent',
                    borderLeft:isToday?`2.5px solid ${dot}`:'2.5px solid transparent',
                    transition:'opacity .1s',
                  }}>
                    <td style={{padding:'3px 4px',borderBottom:bd,whiteSpace:'nowrap'}}>
                      <span style={{width:5,height:5,borderRadius:'50%',background:dot,display:'inline-block',marginRight:4,verticalAlign:'middle'}}/>
                      <span style={{fontSize:9,fontWeight:700,color:active?'#f4f4f5':'#52525b'}}>{PITCH_NAMES[pt]||pt}</span>
                      {isToday&&<span style={{fontSize:8,color:dot,marginLeft:3}}>★{usage?` ${Math.round(usage)}%`:''}</span>}
                    </td>
                    <TD>{d.seen||'—'}</TD>
                    <TD style={cG(d.ba,.18,.28)}>{d.ba!=null?dec(d.ba,3).replace('0.','.'):'—'}</TD>
                    <TD style={cG(d.avg_ev,84,91)}>{dec(d.avg_ev)}</TD>
                    <TD style={cG(d.avg_la,8,18)}>{d.avg_la!=null?`${dec(d.avg_la)}°`:'—'}</TD>
                    <TD style={cR(d.gb_rate,.28,.50)}>{pct(d.gb_rate)}</TD>
                    <TD style={cG(d.fb_rate,.20,.38)}>{pct(d.fb_rate)}</TD>
                    <TD style={cG(d.hard_hit_rate,.30,.42)}>{pct(d.hard_hit_rate)}</TD>
                    <TD style={cG(d.barrel_like_rate,.05,.14)}>{pct(d.barrel_like_rate)}</TD>
                    <TD style={cG(d.air_pull_rate,.30,.55)}>{pct(d.air_pull_rate)}</TD>
                    <TD style={cR(d.whiff_rate,.12,.32)}>{pct(d.whiff_rate)}</TD>
                    <TD style={cR(d.k_rate,.15,.28)}>{d.k_rate!=null?pct(d.k_rate):'—'}</TD>
                    <TD style={cG(d.bb_rate,.05,.12)}>{d.bb_rate!=null?pct(d.bb_rate):'—'}</TD>
                    <TD style={{color:(d.hr||0)>0?'#f87171':'#52525b',fontWeight:(d.hr||0)>0?800:400}}>{d.hr??'—'}</TD>
                    <TD style={cR(d.hr_per_bbe,.02,.08)}>{d.hr_per_bbe!=null?dec(d.hr_per_bbe,3):'—'}</TD>
                    <TD style={cG(d.xwoba,.270,.380)}>{d.xwoba!=null?dec(d.xwoba,3).replace('0.','.'):'—'}</TD>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )
      }

      {pitcherPts.length>0&&(
        <div style={{marginTop:10}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
            <span style={{fontSize:9,fontWeight:800,color:'#f4f4f5'}}>
              {player.pitcher_name} <span style={{fontSize:8,color:'#52525b',fontWeight:400}}>allowed</span>
            </span>
            <div style={{display:'flex',borderRadius:4,overflow:'hidden',border:'1px solid rgba(255,255,255,0.10)'}}>
              {[['ALL','All'],['R','vs RHB'],['L','vs LHB']].map(([v,l])=>(
                <button key={v} onClick={()=>setPitcherHand(v)} style={{
                  padding:'1px 5px',fontSize:8,fontWeight:600,cursor:'pointer',border:'none',
                  background:pitcherHand===v?'#f97316':'transparent',
                  color:pitcherHand===v?'#fff':'#71717a',
                }}>{l}</button>
              ))}
            </div>
          </div>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr>
                <TH style={{textAlign:'left',minWidth:65}}>Pitch</TH>
                <TH>Use%</TH><TH>BBE</TH><TH>HR</TH><TH>HR/BBE</TH><TH>EV</TH><TH>HH%</TH><TH>Brl%</TH><TH>xwOBA</TH>
              </tr>
            </thead>
            <tbody>
              {pitcherPts.map((r,i)=>{
                const pt=r.pitch_type||r.pitch_code||''
                const dot=PITCH_COLORS[pt]||PITCH_COLORS.OTHER
                // pitcherPts already points at the correct ALL/vs_lhb/vs_rhb
                // array (see fix above), so each row's own fields are used
                // directly -- no more nested r.vs_lhb/r.vs_rhb lookup, which
                // never matched the real data shape and always fell through
                // to null, silently ignoring the toggle.
                const bbe=r.bbe_allowed
                const hr=r.hr_allowed
                const ev=r.avg_ev_allowed
                const hh=r.hard_hit_rate_allowed
                const brl=r.barrel_rate_allowed
                const xwoba=r.xwoba_allowed
                const hrBBE=r.hr_per_bbe!=null?r.hr_per_bbe:(hr!=null&&bbe?hr/bbe:null)
                return (
                  <tr key={i}>
                    <td style={{padding:'3px 4px',borderBottom:bd,whiteSpace:'nowrap'}}>
                      <span style={{width:5,height:5,borderRadius:'50%',background:dot,display:'inline-block',marginRight:4,verticalAlign:'middle'}}/>
                      <span style={{fontSize:9,color:'#a1a1aa'}}>{PITCH_NAMES[pt]||pt}</span>
                    </td>
                    <TD style={{color:'#71717a'}}>{r.usage_pct!=null?`${Math.round(r.usage_pct)}%`:'—'}</TD>
                    <TD>{bbe??'—'}</TD>
                    <TD style={{color:(hr||0)>0?'#f87171':'#52525b',fontWeight:(hr||0)>0?700:400}}>{hr??'—'}</TD>
                    <TD style={hrBBE>=.05?{color:'#f87171',fontWeight:700}:hrBBE<=.02?{color:'#4ade80',fontWeight:700}:{}}>{hrBBE!=null?hrBBE.toFixed(3):'—'}</TD>
                    <TD style={ev>=88?{color:'#f87171'}:ev<=80?{color:'#4ade80'}:{}}>{ev?dec(ev):'—'}</TD>
                    <TD style={hh>=.35?{color:'#f87171'}:hh<=.20?{color:'#4ade80'}:{}}>{hh!=null?pct(hh):'—'}</TD>
                    <TD style={brl>=.09?{color:'#f87171'}:brl<=.04?{color:'#4ade80'}:{}}>{brl!=null?pct(brl):'—'}</TD>
                    <TD style={xwoba>=.380?{color:'#f87171'}:xwoba<=.270?{color:'#4ade80'}:{}}>{xwoba!=null?dec(xwoba,3).replace('0.','.'):'—'}</TD>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function SegGroup({ children }) {
  return (
    <div style={{display:'flex',borderRadius:5,overflow:'hidden',border:'1px solid rgba(255,255,255,0.11)',flexShrink:0}}>
      {children}
    </div>
  )
}
function Seg({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding:'3px 7px',fontSize:10,fontWeight:600,cursor:'pointer',border:'none',
      background:active?'#f97316':'transparent',color:active?'#fff':'#a1a1aa',
    }}>{children}</button>
  )
}
function TogBtn({ active, color, label, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding:'2px 6px',fontSize:9,fontWeight:700,cursor:'pointer',borderRadius:4,
      border:`1px solid ${active?color:'rgba(255,255,255,0.07)'}`,
      background:active?`${color}20`:'transparent',
      color:active?color:'#3f3f46',
    }}>{label}</button>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

const BBE_RANGES = [10,15,25,40,50]

export default function SprayChart({ players, embedded=false, bbeRange:bbeRangeProp }) {
  const safePlayers = Array.isArray(players)?players:[]
  const [search,   setSearch]     = useState('')
  const [selected, setSelected]   = useState(null)
  const [hits,     setHits]       = useState([])
  const [loading,  setLoading]    = useState(false)
  const [noData,   setNoData]     = useState(false)
  const [colorBy,  setColorBy]    = useState('result')
  const [bbeRange, setBbeRange]   = useState(25)
  const [handFilter,  setHand]    = useState('ALL')
  const [batterHand,  setBatterHand] = useState('ALL')
  const [activePitches, setPitches]  = useState(()=>new Set())
  const [activeRes,     setActiveRes]= useState(()=>new Set(Object.keys(RES_CONFIG)))
  const [activeBB,      setActiveBB] = useState(()=>new Set(['fly_ball','line_drive','ground_ball','popup']))
  const [tooltip,    setTooltip]  = useState(null)
  const [profileOpen,setProfileOpen] = useState(false)

  const sorted = useMemo(()=>
    [...safePlayers].sort((a,b)=>{
      const at=['TOP','HR'].includes(a?.game_pick_role||'')?1:0
      const bt=['TOP','HR'].includes(b?.game_pick_role||'')?1:0
      return bt-at||(b?.hr_score||0)-(a?.hr_score||0)
    })
  ,[safePlayers])

  const searchFiltered = useMemo(()=>{
    const q=search.trim().toLowerCase()
    return q?sorted.filter(p=>(p?.name||'').toLowerCase().includes(q)||(p?.team||'').toLowerCase().includes(q)):sorted
  },[sorted,search])

  useEffect(()=>{ if(sorted.length&&!selected) setSelected(sorted[0]) },[sorted])

  useEffect(()=>{
    if(!selected) return
    const arsenal=selected.pitcher_arsenal||selected.pitcher_pitch_usage||{}
    const pitches=Object.keys(arsenal)
    setPitches(pitches.length?new Set(pitches):new Set())
    setTooltip(null)
  },[selected?.player_id])

  const fetchHits = useCallback(async(player)=>{
    if(!player?.player_id) return
    setLoading(true); setHits([]); setNoData(false); setTooltip(null)
    try {
      const res=await fetch(detailUrl(player.player_id))
      if(res.ok){
        const data=await res.json()
        const raw=data.spray_chart||data.batted_ball_log||[]
        const valid=raw.filter(h=>h?.hc_x!=null&&h?.hc_y!=null&&h.hc_x>=10&&h.hc_x<=240)
        if(valid.length){ setHits(valid); setLoading(false); return }
      }
    } catch{}
    const emb=player.batted_ball_log||player.spray_chart||[]
    const valid=emb.filter(h=>h?.hc_x!=null&&h?.hc_y!=null&&h.hc_x>=10&&h.hc_x<=240)
    if(valid.length){ setHits(valid); setLoading(false); return }
    setNoData(true); setLoading(false)
  },[])

  useEffect(()=>{ if(selected) fetchHits(selected) },[selected,fetchHits])

  const norm = useMemo(()=>hits.map(h=>({
    ...h, _r:h.result||h.event||'', _bb:h.bb_type||h.trajectory||'',
  })),[hits])

  // Most-recent-N-BBE window, sorted by date descending then sliced.
  // BUGFIX: this previously bucketed by N most recent unique DATES (labeled
  // "PA" even though it was really a game count) -- see EVLog.js for the
  // same fix and full rationale. True PA (with walks/Ks) isn't available in
  // this data source, only BBE rows, so this now slices actual batted-ball
  // events directly instead of approximating via distinct game-dates.
  const bbeFiltered = useMemo(()=>{
    const range=bbeRangeProp??bbeRange
    if(range>=999) return norm
    return [...norm].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,range)
  },[norm,bbeRange,bbeRangeProp])

  const display = useMemo(()=>{
    const ap=activePitches instanceof Set?activePitches:new Set()
    const ab=activeBB instanceof Set?activeBB:new Set(['fly_ball','line_drive','ground_ball','popup'])
    const ar=activeRes instanceof Set?activeRes:new Set(Object.keys(RES_CONFIG))
    return bbeFiltered.filter(h=>{
      if(handFilter!=='ALL'&&h.arm!==handFilter&&h.pitcher_throws!==handFilter) return false
      if(batterHand!=='ALL'&&h.stand!==batterHand) return false
      if(ap.size>0&&!ap.has(h.pitch_type)) return false
      if(!ab.has(h._bb||'ground_ball')) return false
      const rKey=OUT_ALIASES.has(h._r)?'field_out':h._r
      if(!ar.has(rKey)) return false
      return true
    })
  },[bbeFiltered,handFilter,batterHand,activePitches,activeBB,activeRes])

  // Live stat bar — updates as filters change
  const statBar = useMemo(()=>{
    const total=display.length||1
    const count=(key)=>display.filter(h=>{
      if(key==='field_out') return OUT_ALIASES.has(h._r)
      return h._r===key
    }).length
    const gb=display.filter(h=>h._bb==='ground_ball').length
    const fb=display.filter(h=>h._bb==='fly_ball').length
    const ld=display.filter(h=>h._bb==='line_drive').length
    const pu=display.filter(h=>h._bb==='popup').length
    const evArr=display.filter(h=>h.ev)
    const avgEV=evArr.length?Math.round(evArr.reduce((s,h)=>s+h.ev,0)/evArr.length):null
    // pitch usage in current view
    const pitchCounts={}
    display.forEach(h=>{ if(h.pitch_type){ pitchCounts[h.pitch_type]=(pitchCounts[h.pitch_type]||0)+1 } })
    const topPitches=Object.entries(pitchCounts).sort((a,b)=>b[1]-a[1]).slice(0,5)
    return {
      results: RES_GROUPS.map(g=>({ ...g, n:count(g.key), pct:Math.round(count(g.key)/total*100) })),
      bb: [
        {label:'GB',n:gb,pct:Math.round(gb/total*100),color:'#60a5fa'},
        {label:'FB',n:fb,pct:Math.round(fb/total*100),color:'#f97316'},
        {label:'P',n:pu,pct:Math.round(pu/total*100),color:'#71717a'},
        {label:'LD',n:ld,pct:Math.round(ld/total*100),color:'#4ade80'},
      ],
      pitches: topPitches.map(([pt,n])=>({ pt,n,pct:Math.round(n/total*100),color:PITCH_COLORS[pt]||PITCH_COLORS.OTHER,name:PITCH_NAMES[pt]||pt })),
      avgEV,
      total: display.length,
    }
  },[display])

  const togglePitch = pt=>setPitches(prev=>{ const n=new Set(prev); n.has(pt)?n.delete(pt):n.add(pt); return n })
  const toggleRes   = k =>setActiveRes(prev=>{ const n=new Set(prev); n.has(k)?n.delete(k):n.add(k); return n })
  const toggleBB    = bb=>setActiveBB(prev=>{ const n=new Set(prev); n.has(bb)?n.delete(bb):n.add(bb); return n })

  const byPitch = selected?.batter_pitch_type_profile?.by_pitch||{}

  return (
    <div style={{color:'#f4f4f5',fontFamily:'inherit'}}>

      {/* Player picker */}
      {!embedded&&(
        <div style={{marginBottom:8}}>
          <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
            <div style={{position:'relative',flex:'1 1 130px',minWidth:0}}>
              <input type="search" placeholder="Search player…" value={search} onChange={e=>setSearch(e.target.value)}
                style={{width:'100%',boxSizing:'border-box',background:'#18181b',border:'1px solid rgba(255,255,255,0.11)',borderRadius:6,padding:'5px 9px',fontSize:11,color:'#f4f4f5',outline:'none',fontFamily:NUM_FONT}}/>
              {search.trim()&&(
                <div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:50,background:'#18181b',border:'1px solid rgba(255,255,255,0.11)',borderRadius:6,marginTop:2,maxHeight:170,overflowY:'auto'}}>
                  {searchFiltered.slice(0,12).map((p,i)=>(
                    <div key={p?.player_id||i} onClick={()=>{ setSelected(p); setSearch('') }}
                      style={{padding:'6px 10px',cursor:'pointer',borderBottom:'1px solid rgba(255,255,255,0.04)',display:'flex',justifyContent:'space-between',background:selected?.player_id===p?.player_id?'rgba(249,115,22,0.09)':'transparent'}}>
                      <span style={{fontSize:11,fontWeight:700}}>{p?.name}</span>
                      <span style={{fontSize:10,color:'#f97316',fontFamily:NUM_FONT}}>{p?.team} {Math.round(p?.hr_score||0)}</span>
                    </div>
                  ))}
                  {searchFiltered.length===0&&<div style={{padding:'6px 10px',color:'#52525b',fontSize:10}}>No players found.</div>}
                </div>
              )}
            </div>
            {selected&&!search&&(
              <div style={{fontSize:11,fontWeight:700}}>
                {selected.name}
                <span style={{fontSize:10,color:'#71717a',marginLeft:5}}>vs {selected.pitcher_name} ({selected.pitcher_throws})</span>
                {noData&&<span style={{fontSize:10,marginLeft:6,color:'#f97316'}}>No spray data</span>}
              </div>
            )}
          </div>
          {!search.trim()&&(
            <div style={{display:'flex',gap:3,flexWrap:'wrap',marginTop:5}}>
              {(()=>{
                const top=sorted.slice(0,10)
                const vals=top.map(x=>Number(x?.hr_score)||0)
                const lo=Math.min(...vals,0), hi=Math.max(...vals,1)
                return top.map((p,i)=>{
                  const on=selected?.player_id===p?.player_id
                  const bg=rampColor(Number(p?.hr_score)||0,lo,hi)
                  return (
                    <button key={p?.player_id||i} onClick={()=>setSelected(p)}
                      title={`HR score ${(Number(p?.hr_score)||0).toFixed(1)}`}
                      style={{
                        padding:'2px 7px',borderRadius:5,cursor:'pointer',fontSize:10,fontWeight:700,
                        color:bg?inkFor(bg):'#f4f4f5',
                        border:`1px solid ${on?'#f97316':'rgba(255,255,255,0.07)'}`,
                        background:bg||'#18181b',
                        boxShadow:on?'0 0 0 1px #f97316':'none',
                      }}>{(p?.name||'').split(' ').pop()}</button>
                  )
                })
              })()}
            </div>
          )}
        </div>
      )}

      {/* Matchup bar */}
      {selected&&(
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,padding:'4px 9px',background:'#18181b',borderRadius:6,border:'1px solid rgba(255,255,255,0.07)',flexWrap:'wrap'}}>
          <span style={{fontSize:11,fontWeight:700}}>{selected.name}</span>
          <span style={{fontSize:10,color:'#71717a'}}>vs {selected.pitcher_name} ({selected.pitcher_throws}) · ERA {selected.pitcher_era}</span>
          {(selected.wind_mph||0)>1&&<span style={{fontSize:10,color:'#60a5fa'}}>💨 {selected.wind_mph}mph {selected.wind_direction_label||''}</span>}
          <span style={{fontSize:10,color:'#52525b',marginLeft:'auto'}}>{selected.venue_name||''}</span>
        </div>
      )}

      {/* Controls */}
      <div style={{display:'flex',gap:4,alignItems:'center',flexWrap:'wrap',marginBottom:5,rowGap:4}}>
        <SegGroup>
          {[['result','Res'],['pitch','Pitch'],['bb','BB']].map(([v,l])=>(
            <Seg key={v} active={colorBy===v} onClick={()=>setColorBy(v)}>{l}</Seg>
          ))}
        </SegGroup>
        {!bbeRangeProp&&(
          <SegGroup>
            {BBE_RANGES.map(n=><Seg key={n} active={bbeRange===n} onClick={()=>setBbeRange(n)}>{n}BBE</Seg>)}
          </SegGroup>
        )}
        <SegGroup>
          {[['ALL','All'],['R','vs RHP'],['L','vs LHP']].map(([v,l])=>(
            <Seg key={v} active={handFilter===v} onClick={()=>setHand(v)}>{l}</Seg>
          ))}
        </SegGroup>
        <SegGroup>
          {[['ALL','All'],['R','RHB'],['L','LHB']].map(([v,l])=>(
            <Seg key={v} active={batterHand===v} onClick={()=>setBatterHand(v)}>{l}</Seg>
          ))}
        </SegGroup>
        <span style={{fontSize:10,color:'#52525b',marginLeft:'auto',fontFamily:NUM_FONT}}>{display.length} BBE</span>
      </div>

      {/* Filter toggles — result + BB type side by side */}
      <div style={{display:'flex',gap:10,marginBottom:7,flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:3,flexWrap:'wrap',alignItems:'center'}}>
          <span style={{fontSize:8,color:'#3f3f46',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',marginRight:2}}>Result</span>
          {RES_GROUPS.map(({key,label,color})=>(
            <TogBtn key={key} active={activeRes instanceof Set?activeRes.has(key):true} color={color} label={label} onClick={()=>toggleRes(key)}/>
          ))}
        </div>
        <div style={{display:'flex',gap:3,flexWrap:'wrap',alignItems:'center'}}>
          <span style={{fontSize:8,color:'#3f3f46',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',marginRight:2}}>Type</span>
          {BB_GROUPS.map(({key,label,color})=>(
            <TogBtn key={key} active={activeBB instanceof Set?activeBB.has(key):true} color={color} label={label} onClick={()=>toggleBB(key)}/>
          ))}
        </div>
      </div>

      {/* Field */}
      <div style={{position:'relative',borderRadius:8,overflow:'hidden',border:'1px solid rgba(255,255,255,0.06)',marginBottom:0}}>
        {loading&&(
          <div style={{position:'absolute',inset:0,display:'flex',gap:5,alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.7)',zIndex:10,color:'#f4f4f5',fontSize:11}}>
            <div style={{width:14,height:14,border:'2px solid rgba(255,255,255,0.2)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin .7s linear infinite'}}/>
            Loading…
          </div>
        )}
        <Field
          venue={selected?.venue_name||''}
          windDeg={selected?.wind_deg??selected?.weather_wind_deg??null}
          windMph={selected?.wind_mph??selected?.weather_wind_mph??0}
          hits={display}
          colorBy={colorBy}
          tooltip={tooltip}
          onDotClick={(hit,idx)=>setTooltip(tooltip?.idx===idx?null:{hit,idx})}
        />
        {tooltip&&(
          <div style={{position:'absolute',top:5,right:5,background:'rgba(10,10,15,0.95)',color:'#f4f4f5',borderRadius:7,padding:'6px 10px',minWidth:130,fontSize:10,border:'1px solid rgba(255,255,255,0.12)',zIndex:100}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
              <span style={{fontSize:11,fontWeight:700,color:RES_CONFIG[tooltip.hit._r]?.color||'#f4f4f5'}}>
                {RES_CONFIG[tooltip.hit._r]?.label||tooltip.hit._r}
              </span>
              <button onClick={()=>setTooltip(null)} style={{background:'none',border:'none',color:'#52525b',cursor:'pointer',fontSize:11,padding:0}}>✕</button>
            </div>
            {[
              ['Pitch',[PITCH_NAMES[tooltip.hit.pitch_type]||tooltip.hit.pitch_type,tooltip.hit.pitch_velocity?`${tooltip.hit.pitch_velocity}mph`:null].filter(Boolean).join(' ')],
              ['EV',tooltip.hit.ev?`${tooltip.hit.ev}mph`:null],
              ['LA',tooltip.hit.launch_angle!=null?`${tooltip.hit.launch_angle}°`:null],
              ['Dist',tooltip.hit.distance?`${tooltip.hit.distance}ft`:null],
              ['Date',tooltip.hit.date],
            ].filter(([,v])=>v).map(([l,v])=>(
              <div key={l} style={{display:'flex',justifyContent:'space-between',gap:6,margin:'1px 0',color:'#a1a1aa',fontFamily:NUM_FONT,fontSize:9}}>
                <span>{l}</span><strong style={{color:'#f4f4f5'}}>{v}</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Live stat bar — below field, updates with filters */}
      <div style={{background:'#0f0f13',border:'1px solid rgba(255,255,255,0.06)',borderTop:'none',borderRadius:'0 0 8px 8px',padding:'5px 10px',marginBottom:8}}>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          {statBar.results.filter(g=>g.n>0).map(g=>(
            <div key={g.key} style={{display:'flex',alignItems:'center',gap:3}}>
              <span style={{width:6,height:6,borderRadius:'50%',background:g.color,display:'inline-block',flexShrink:0}}/>
              <span style={{fontSize:9,color:g.color,fontWeight:700,fontFamily:NUM_FONT}}>{g.label}</span>
              <span style={{fontSize:9,color:'#52525b',fontFamily:NUM_FONT}}>{g.pct}%</span>
            </div>
          ))}
          <span style={{fontSize:9,color:'#3f3f46',margin:'0 2px'}}>·</span>
          {statBar.bb.filter(g=>g.n>0).map(g=>(
            <div key={g.label} style={{display:'flex',alignItems:'center',gap:2}}>
              <span style={{fontSize:9,color:g.color,fontWeight:700,fontFamily:NUM_FONT}}>{g.label}</span>
              <span style={{fontSize:9,color:'#52525b',fontFamily:NUM_FONT}}>{g.pct}%</span>
            </div>
          ))}
          {statBar.avgEV&&<>
            <span style={{fontSize:9,color:'#3f3f46',margin:'0 2px'}}>·</span>
            <span style={{fontSize:9,color:'#60a5fa',fontFamily:NUM_FONT}}>EV {statBar.avgEV}</span>
          </>}
          {statBar.pitches.length>0&&<>
            <span style={{fontSize:9,color:'#3f3f46',margin:'0 2px'}}>·</span>
            {statBar.pitches.map(p=>(
              <div key={p.pt} style={{display:'flex',alignItems:'center',gap:2}}>
                <span style={{width:5,height:5,borderRadius:'50%',background:p.color,display:'inline-block'}}/>
                <span style={{fontSize:9,color:'#71717a',fontFamily:NUM_FONT}}>{p.name} {p.pct}%</span>
              </div>
            ))}
          </>}
        </div>
      </div>

      {/* Pitch profile — collapsed */}
      {selected&&(
        <div style={{background:'#18181b',borderRadius:8,border:'1px solid rgba(255,255,255,0.07)',overflow:'hidden'}}>
          <button onClick={()=>setProfileOpen(o=>!o)} style={{
            width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',
            padding:'6px 12px',background:'none',border:'none',cursor:'pointer',
          }}>
            <span style={{fontSize:9,fontWeight:700,color:'#52525b',textTransform:'uppercase',letterSpacing:'0.06em',fontFamily:NUM_FONT}}>
              Pitch Profile · vs {selected.pitcher_name}
            </span>
            <span style={{fontSize:10,color:'#52525b',transform:profileOpen?'rotate(180deg)':'none',transition:'transform .15s'}}>▾</span>
          </button>
          {profileOpen&&(
            <div style={{padding:'0 12px 10px',borderTop:'1px solid rgba(255,255,255,0.05)'}}>
              <div style={{display:'flex',gap:10,alignItems:'flex-start',marginTop:8}}>
                <Radar byPitch={byPitch} activePitches={activePitches}/>
                <PitchProfile player={selected} activePitches={activePitches} onToggle={togglePitch}/>
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
