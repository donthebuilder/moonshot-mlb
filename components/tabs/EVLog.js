'use client'
import { useState, useMemo } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { Empty } from '../ui'

const PITCH_COLORS = {
  FF:'#f97316',SI:'#fb923c',FC:'#f59e0b',SL:'#4ade80',CU:'#22d3ee',
  KC:'#06b6d4',CH:'#60a5fa',FS:'#818cf8',KN:'#a78bfa',ST:'#34d399',
  SV:'#f87171',
}
const PITCH_NAMES = {
  FF:'4-Seam',SI:'Sinker',FC:'Cutter',SL:'Slider',CU:'Curveball',
  KC:'K-Curve',CH:'Changeup',FS:'Splitter',KN:'Knuckleball',ST:'Sweeper',SV:'Slurve',
}

const RES_COLORS = {
  home_run:'#f87171',triple:'#fb923c',double:'#f59e0b',single:'#4ade80',
  field_out:'#3f3f46',grounded_into_double_play:'#71717a',force_out:'#3f3f46',
  sac_fly:'#22d3ee',field_error:'#a78bfa',strikeout:'#52525b',
}

function cell(val,low,high,goodDir='high') {
  if (val==null) return {}
  const isGood=goodDir==='high'?val>=high:val<=low
  const isBad=goodDir==='high'?val<=low:val>=high
  return {
    background:isGood?'rgba(74,222,128,0.18)':isBad?'rgba(248,113,113,0.18)':'transparent',
    color:isGood?'#4ade80':isBad?'#f87171':'#f4f4f5',
    fontWeight:(isGood||isBad)?700:400,
  }
}

const TD = ({children,style={}}) => (
  <td style={{padding:'5px 8px',fontSize:11,fontFamily:NUM_FONT,textAlign:'right',borderBottom:'1px solid rgba(255,255,255,0.06)',...style}}>{children}</td>
)

export default function EVLog({ player, bbeRange:bbeRangeProp }) {
  const [armFilter,   setArmFilter]   = useState('ALL')
  const [batterHand,  setBatterHand]  = useState('ALL')
  const [pitchFilter, setPitch]       = useState('ALL')
  const [resFilter,   setRes]         = useState('ALL')
  const [sortKey,     setSort]        = useState('date')
  const [sortDir,     setSortDir]     = useState(-1)
  const [bbeRange,    setBbeRange]    = useState(25)

  const log = player?.batted_ball_log || player?.spray_chart || []
  if (!log.length) return <Empty text="No batted ball data. Run spray_cache.py." />

  const pitchTypes  = useMemo(()=>['ALL',...new Set(log.map(h=>h.pitch_type).filter(Boolean))]   ,[log])
  const resultTypes = useMemo(()=>['ALL',...new Set(log.map(h=>h.result||h.event).filter(Boolean))],[log])

  // Debug: check what stand values actually exist
  const standVals = useMemo(()=>new Set(log.map(h=>h.stand||h.batter_stand||h.batter_hand).filter(Boolean)),[log])

  // Most-recent-N-BBE window, sorted by date descending then sliced.
  // BUGFIX: this previously bucketed by N most recent unique DATES (so a
  // 2-HR game and a 0-for-4 game both counted as "1 PA" toward the range),
  // labeled as "PA" even though it was really a game-count and didn't match
  // either true plate appearances OR a real batted-ball count. True PA
  // (with walks/Ks) isn't available in this data source at all -- only BBE
  // rows exist -- so this now does what the label says: take the most
  // recent N actual batted-ball events, full stop.
  const recentBBE = useMemo(() => {
    const range = bbeRangeProp ?? bbeRange
    return [...log]
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, range)
  }, [log, bbeRangeProp, bbeRange])

  const filtered = useMemo(()=>{
    let rows = recentBBE.filter(h=>{
      // pitcher arm — check multiple field names
      if (armFilter!=='ALL') {
        const arm = h.arm || h.pitcher_throws || h.p_throws || ''
        if (arm && arm !== armFilter) return false
      }
      // batter hand — check multiple field names
      if (batterHand!=='ALL') {
        const stand = h.stand || h.batter_stand || h.batter_hand || ''
        if (stand && stand !== batterHand) return false
      }
      if (pitchFilter!=='ALL' && h.pitch_type !== pitchFilter) return false
      if (resFilter!=='ALL' && (h.result||h.event) !== resFilter) return false
      return true
    })
    rows = [...rows].sort((a,b)=>{
      let av=a[sortKey], bv=b[sortKey]
      if (typeof av==='string') return sortDir*av.localeCompare(bv||'')
      return sortDir*((av||0)-(bv||0))
    })
    return rows
  },[recentBBE,armFilter,batterHand,pitchFilter,resFilter,sortKey,sortDir])

  const toggleSort = key => {
    if (sortKey===key) setSortDir(d=>-d)
    else { setSort(key); setSortDir(-1) }
  }

  const seg = active => ({
    padding:'3px 8px',fontSize:10,fontWeight:600,cursor:'pointer',border:'none',
    background:active?'#f97316':'transparent',color:active?'#fff':'#a1a1aa',
  })

  const SH = ({k,children}) => (
    <th onClick={()=>toggleSort(k)} style={{
      padding:'5px 8px',fontSize:10,fontWeight:700,
      color:sortKey===k?'#f97316':'#71717a',
      textAlign:'right',borderBottom:'1px solid rgba(255,255,255,0.09)',
      whiteSpace:'nowrap',cursor:'pointer',userSelect:'none',
    }}>
      {children}{sortKey===k?(sortDir===-1?' ▼':' ▲'):''}
    </th>
  )

  const batsLabel = player?.bats && player.bats !== '?' ? player.bats : null
  const hasStandData = standVals.size > 0

  return (
    <div>
      {/* Filters */}
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10,alignItems:'center'}}>
        {/* BBE range — only shown if not controlled by parent (PlayerModal) */}
        {bbeRangeProp==null && (
          <div style={{display:'flex',borderRadius:6,overflow:'hidden',border:'1px solid rgba(255,255,255,0.15)'}}>
            {[10,15,25,40,50].map(n=>(
              <button key={n} style={seg(bbeRange===n)} onClick={()=>setBbeRange(n)}>{n}BBE</button>
            ))}
          </div>
        )}
        {/* Pitcher arm */}
        <div style={{display:'flex',borderRadius:6,overflow:'hidden',border:'1px solid rgba(255,255,255,0.15)'}}>
          {['ALL','R','L'].map(v=>(
            <button key={v} style={seg(armFilter===v)} onClick={()=>setArmFilter(v)}>
              {v==='ALL'?'All Arm':v==='R'?'RHP':'LHP'}
            </button>
          ))}
        </div>
        {/* Batter hand */}
        <div style={{display:'flex',borderRadius:6,overflow:'hidden',border:'1px solid rgba(255,255,255,0.15)'}}>
          {['ALL','R','L'].map(v=>(
            <button key={v} style={{
              ...seg(batterHand===v),
              ...(batsLabel && v===batsLabel && batterHand!==v ? {borderBottom:'2px solid #f97316'} : {}),
            }} onClick={()=>setBatterHand(v)}>
              {v==='ALL'?'All Batter':v==='R'?'RHB':'LHB'}
              {batsLabel && v===batsLabel ? ' ★' : ''}
            </button>
          ))}
        </div>
        {/* Pitch type */}
        <select value={pitchFilter} onChange={e=>setPitch(e.target.value)} style={{fontSize:10,padding:'3px 7px',borderRadius:6,border:'1px solid rgba(255,255,255,0.15)',background:'#18181b',color:'#f4f4f5',cursor:'pointer'}}>
          {pitchTypes.map(p=><option key={p} value={p}>{p==='ALL'?'All Pitches':(PITCH_NAMES[p]||p)}</option>)}
        </select>
        {/* Result */}
        <select value={resFilter} onChange={e=>setRes(e.target.value)} style={{fontSize:10,padding:'3px 7px',borderRadius:6,border:'1px solid rgba(255,255,255,0.15)',background:'#18181b',color:'#f4f4f5',cursor:'pointer'}}>
          {resultTypes.map(r=><option key={r} value={r}>{r==='ALL'?'All Results':r.replace(/_/g,' ')}</option>)}
        </select>
        <span style={{fontSize:10,color:'#71717a',marginLeft:'auto'}}>{filtered.length} / {recentBBE.length} BBE</span>
      </div>
      <div style={{fontSize:9,color:'#52525b',marginTop:-4,marginBottom:6,fontFamily:NUM_FONT}}>
        Showing last {bbeRangeProp ?? bbeRange} batted-ball events ({log.length} total on file)
      </div>

      {/* Stand data warning */}
      {!hasStandData && batterHand !== 'ALL' && (
        <div style={{fontSize:10,color:'#f59e0b',marginBottom:6,fontFamily:NUM_FONT}}>
          ⚠ Batter hand (stand) field missing from BBE data — filter may not work until spray_cache.py re-runs.
        </div>
      )}

      {/* Table */}
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
          <thead>
            <tr>
              <th style={{padding:'5px 8px',fontSize:10,fontWeight:700,color:'#71717a',textAlign:'left',borderBottom:'1px solid rgba(255,255,255,0.09)',whiteSpace:'nowrap'}}>Date</th>
              <th style={{padding:'5px 8px',fontSize:10,fontWeight:700,color:'#71717a',textAlign:'left',borderBottom:'1px solid rgba(255,255,255,0.09)',whiteSpace:'nowrap'}}>Pitcher</th>
              <SH k="arm">ARM</SH>
              <SH k="pitch_type">Pitch</SH>
              <SH k="ev">EV</SH>
              <SH k="launch_angle">Angle</SH>
              <SH k="distance">Dist</SH>
              <SH k="pitch_velocity">Velo</SH>
              <th style={{padding:'5px 8px',fontSize:10,fontWeight:700,color:'#71717a',textAlign:'left',borderBottom:'1px solid rgba(255,255,255,0.09)',whiteSpace:'nowrap'}}>Result</th>
              <th style={{padding:'5px 8px',fontSize:10,fontWeight:700,color:'#71717a',textAlign:'left',borderBottom:'1px solid rgba(255,255,255,0.09)',whiteSpace:'nowrap'}}>Traj</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((h,i)=>{
              const res = h.result||h.event||''
              const resColor = RES_COLORS[res]||'#71717a'
              const isHR = res==='home_run'
              const ptColor = PITCH_COLORS[h.pitch_type]||'#71717a'
              const isBarrel = !!h.is_barrel
              const isHardHit = !!h.is_hard_hit
              // Left-edge stripe makes barrels/hard-hits scannable down the
              // whole row at a glance, not just a tiny dot buried in Result.
              const stripeColor = isBarrel ? '#f97316' : isHardHit ? '#FCD34D' : 'transparent'
              return (
                <tr key={i} style={{
                  background:isHR?'rgba(248,113,113,0.06)':i%2===0?'transparent':'rgba(255,255,255,0.015)',
                  borderLeft:`3px solid ${stripeColor}`,
                }}>
                  <td style={{padding:'5px 8px',fontSize:11,fontFamily:NUM_FONT,color:'#a1a1aa',borderBottom:'1px solid rgba(255,255,255,0.04)',whiteSpace:'nowrap'}}>{h.date||'—'}</td>
                  <td style={{padding:'5px 8px',fontSize:11,color:'#f4f4f5',borderBottom:'1px solid rgba(255,255,255,0.04)',whiteSpace:'nowrap',maxWidth:130,overflow:'hidden',textOverflow:'ellipsis'}}>{h.pitcher||'—'}</td>
                  <td style={{padding:'5px 8px',fontSize:10,fontFamily:NUM_FONT,color:'#a1a1aa',borderBottom:'1px solid rgba(255,255,255,0.04)',textAlign:'right'}}>{h.arm||h.pitcher_throws||'—'}</td>
                  <td style={{padding:'5px 8px',fontSize:10,fontFamily:NUM_FONT,borderBottom:'1px solid rgba(255,255,255,0.04)',textAlign:'right'}}>
                    <span style={{color:ptColor,fontWeight:700}}>{PITCH_NAMES[h.pitch_type]||h.pitch_type||'—'}</span>
                  </td>
                  <TD style={{
                    ...(isBarrel ? {background:'rgba(249,115,22,0.22)',color:'#fb923c',fontWeight:800} : isHardHit ? {background:'rgba(252,211,77,0.16)',color:'#FCD34D',fontWeight:700} : cell(h.ev,85,95)),
                    whiteSpace:'nowrap',
                  }}>{h.ev||'—'}</TD>
                  <TD style={{whiteSpace:'nowrap'}}>{h.launch_angle!=null?`${h.launch_angle}°`:'—'}</TD>
                  <TD style={{...cell(h.distance,300,375),whiteSpace:'nowrap'}}>{h.distance||'—'}</TD>
                  <TD style={{color:'#a1a1aa',whiteSpace:'nowrap'}}>{h.pitch_velocity||'—'}</TD>
                  <td style={{padding:'5px 8px',fontSize:11,borderBottom:'1px solid rgba(255,255,255,0.04)',whiteSpace:'nowrap'}}>
                    <span style={{color:resColor,fontWeight:isHR?800:400}}>{res.replace(/_/g,' ')}</span>
                    {isBarrel&&(
                      <span style={{fontSize:9,marginLeft:5,padding:'1px 6px',borderRadius:4,background:'rgba(249,115,22,0.2)',color:'#fb923c',fontWeight:800,letterSpacing:'.03em'}}>BARREL</span>
                    )}
                    {isHardHit&&!isBarrel&&(
                      <span style={{fontSize:9,marginLeft:5,padding:'1px 6px',borderRadius:4,background:'rgba(252,211,77,0.16)',color:'#FCD34D',fontWeight:800,letterSpacing:'.03em'}}>HARD HIT</span>
                    )}
                  </td>
                  <td style={{padding:'5px 8px',fontSize:10,color:'#71717a',borderBottom:'1px solid rgba(255,255,255,0.04)',whiteSpace:'nowrap'}}>{(h.bb_type||h.trajectory||'').replace(/_/g,' ')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{fontSize:9,color:'#52525b',marginTop:6,fontFamily:NUM_FONT}}>
        Left stripe + BARREL/HARD HIT badge mark elite contact &nbsp;· EV green ≥95, red ≤85 · Dist green ≥375, red ≤300 · ★ = batter's hand
      </div>
    </div>
  )
}
