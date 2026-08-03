/**
 * HotZoneMap.js — v3
 *
 * Reads scoring/pitcher fields from the `player` prop (already on the slate row).
 * Fetches batter_{pid}.json only for zone_profile, pitcher_zone_profile, and
 * batter_pitch_type_profile.by_pitch (which is stripped from bots/outputs but
 * still present in public/data spray cache).
 *
 * Props:
 *   player     {object}  full player row from slate JSON — required
 *   onClose    {fn|null}
 */

'use client'
import { useState, useEffect, useMemo } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { dataUrl } from '../lib/dataSource'

// ── Pitch colors + names ──────────────────────────────────────────────────────
const PITCH_COLORS = {
  FF:'#f97316', SI:'#fb923c', FC:'#f59e0b', SL:'#4ade80', CU:'#22d3ee',
  KC:'#06b6d4', CH:'#60a5fa', FS:'#818cf8', KN:'#a78bfa', ST:'#34d399',
  SV:'#f87171', OTHER:'#71717a',
}
const PITCH_NAMES = {
  FF:'4-Seam', SI:'Sinker', FC:'Cutter', SL:'Slider', CU:'Curveball',
  KC:'K-Curve', CH:'Changeup', FS:'Splitter', KN:'Knuckleball', ST:'Sweeper',
  SV:'Slurve', OTHER:'Other',
}

// ── Zone constants ────────────────────────────────────────────────────────────
const ZONE_LABELS = {
  1:'Up-in', 2:'Up', 3:'Up-away',
  4:'Mid-in', 5:'Heart', 6:'Mid-away',
  7:'Low-in', 8:'Low', 9:'Low-away',
  11:'Shadow in', 12:'Shadow out', 13:'Shadow low-in', 14:'Shadow low-out',
}
const ROWS_9 = [[1,2,3],[4,5,6],[7,8,9]]

// ── Small UI pieces ───────────────────────────────────────────────────────────
function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding:'5px 13px', fontSize:11, fontWeight:700, cursor:'pointer', borderRadius:999,
      border:`1px solid ${active ? C.orange : C.border}`,
      background: active ? `${C.orange}22` : 'transparent',
      color: active ? C.orange : C.text3,
      whiteSpace:'nowrap',
    }}>{children}</button>
  )
}

function TogBtn({ active, color, label, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding:'2px 7px', fontSize:9, fontWeight:700, cursor:'pointer', borderRadius:4,
      border:`1px solid ${active ? color : C.border}`,
      background: active ? `${color}22` : 'transparent',
      color: active ? color : C.text3,
    }}>{label}</button>
  )
}

function Seg({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding:'3px 8px', fontSize:10, fontWeight:600, cursor:'pointer', border:'none',
      background: active ? C.orange : 'transparent',
      color: active ? '#fff' : C.text3,
    }}>{children}</button>
  )
}
function SegGroup({ children }) {
  return (
    <div style={{display:'flex', borderRadius:5, overflow:'hidden', border:`1px solid ${C.border}`, flexShrink:0}}>
      {children}
    </div>
  )
}

// ── Heat color ────────────────────────────────────────────────────────────────
function heatColor(ratio, lowSample) {
  if (lowSample) return { bg:'rgba(255,255,255,0.04)', text:C.text3, border:C.border }
  if (ratio == null) return { bg:'transparent', text:C.text3, border:C.border }
  if (ratio >= 0.75) return { bg:'rgba(248,113,113,0.18)', text:'#f87171', border:'rgba(248,113,113,0.55)' }
  if (ratio >= 0.50) return { bg:'rgba(245,158,11,0.18)', text:'#f59e0b', border:'rgba(245,158,11,0.55)' }
  if (ratio >= 0.25) return { bg:'rgba(255,255,255,0.06)', text:C.text2,  border:C.border }
  return               { bg:'rgba(96,165,250,0.12)', text:'#60a5fa', border:'rgba(96,165,250,0.35)' }
}

function normRatios(zones, key) {
  const vals = zones.map(z => z[key]).filter(v => v != null && !isNaN(v))
  if (!vals.length) return {}
  const mx = Math.max(...vals), mn = Math.min(...vals), r = mx - mn || 1
  const out = {}
  zones.forEach(z => { out[z.zone] = z[key] != null ? (z[key] - mn) / r : null })
  return out
}

// ── Zone cell ─────────────────────────────────────────────────────────────────
function ZoneCell({ z, ratio, isKill, val, size=64 }) {
  const c = heatColor(ratio, !z || z.pa < 8)
  return (
    <div
      title={z ? `Zone ${z.zone} — ${ZONE_LABELS[z.zone]}` : ''}
      style={{
        width:size, height:size, background:c.bg,
        border: isKill ? `2px solid #f87171` : `1px solid ${c.border}`,
        borderRadius:4, display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center', cursor:'default',
        transition:'transform .1s',
      }}
      onMouseEnter={e=>e.currentTarget.style.transform='scale(1.06)'}
      onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}
    >
      <span style={{fontSize:size>56?13:11, fontWeight:800, color:C.heatLabel, lineHeight:1, textShadow:'0 1px 2px rgba(0,0,0,.75)'}}>{val}</span>
      {z?.ba != null && (
        <span style={{fontSize:9, color:C.heatLabel, marginTop:1, opacity:.85, textShadow:'0 1px 2px rgba(0,0,0,.75)'}}>
          .{String(Math.round(z.ba*1000)).padStart(3,'0')}
        </span>
      )}
      {isKill && <span style={{fontSize:8, color:'#f87171', fontWeight:800, marginTop:1}}>KILL</span>}
    </div>
  )
}

function Grid9({ zones, metricKey, metricFmt, killZones=[] }) {
  const byId = {}; zones.forEach(z=>{ byId[z.zone]=z })
  const ratios = normRatios(zones, metricKey)
  return (
    <div style={{display:'grid', gridTemplateColumns:'repeat(3,64px)', gap:3}}>
      {ROWS_9.flat().map(zid => {
        const z = byId[zid]
        const val = z?.[metricKey] != null ? metricFmt(z[metricKey]) : '—'
        return <ZoneCell key={zid} z={z||{zone:zid,pa:0}} ratio={ratios[zid]} isKill={killZones.includes(zid)} val={val} />
      })}
    </div>
  )
}

function Legend() {
  return (
    <div style={{display:'flex', gap:10, flexWrap:'wrap', marginTop:8}}>
      {[['#f87171','Hot'],['#f59e0b','Warm'],[C.text3,'Neutral'],['#60a5fa','Cold']].map(([c,l])=>(
        <span key={l} style={{display:'flex',alignItems:'center',gap:3,fontSize:10,color:C.text3}}>
          <span style={{width:8,height:8,borderRadius:2,background:c}}/>
          {l}
        </span>
      ))}
    </div>
  )
}

// ── Pitch toggles ─────────────────────────────────────────────────────────────
function PitchToggles({ pitches, active, onToggle, onClear }) {
  if (!pitches.length) return null
  return (
    <div style={{display:'flex', gap:4, flexWrap:'wrap', alignItems:'center', marginBottom:8}}>
      <span style={{fontSize:8,color:C.text3,fontWeight:800,textTransform:'uppercase',letterSpacing:'.05em',marginRight:2}}>Pitch</span>
      <TogBtn active={active.size===0} color={C.orange} label="All" onClick={onClear}/>
      {pitches.map(pt => (
        <TogBtn key={pt.code} active={active.has(pt.code)}
          color={PITCH_COLORS[pt.code]||PITCH_COLORS.OTHER}
          label={`${pt.code}${pt.usage>0?' '+pt.usage+'%':''}`}
          onClick={()=>onToggle(pt.code)}
        />
      ))}
    </div>
  )
}

// ── Metric selector ───────────────────────────────────────────────────────────
const BATTER_METRICS = [
  { key:'hr_rate', label:'HR%',   fmt: v => `${(v*100).toFixed(0)}%` },
  { key:'ba',      label:'BA',    fmt: v => `.${String(Math.round(v*1000)).padStart(3,'0')}` },
  { key:'xwoba',   label:'xwOBA', fmt: v => `.${String(Math.round(v*1000)).padStart(3,'0')}` },
  { key:'xslg',    label:'xSLG',  fmt: v => `.${String(Math.round(v*1000)).padStart(3,'0')}` },
  { key:'bbe',     label:'BBE',   fmt: v => String(v) },
]
const PITCHER_METRICS = [
  { key:'xwoba',   label:'xwOBA', fmt: v => `.${String(Math.round(v*1000)).padStart(3,'0')}` },
  { key:'hr_rate', label:'HR%',   fmt: v => `${(v*100).toFixed(0)}%` },
  { key:'ba',      label:'BA',    fmt: v => `.${String(Math.round(v*1000)).padStart(3,'0')}` },
  { key:'bbe',     label:'BBE',   fmt: v => String(v) },
]

function MetricBar({ options, active, onChange }) {
  return (
    <SegGroup>
      {options.map(o => <Seg key={o.key} active={active===o.key} onClick={()=>onChange(o.key)}>{o.label}</Seg>)}
    </SegGroup>
  )
}

// ── Pitch matchup matrix ──────────────────────────────────────────────────────
function PitchMatrix({ pitches, matchNote }) {
  if (!pitches.length) return <div style={{fontSize:12,color:C.text3,padding:'1rem 0'}}>No pitch matchup data available.</div>
  const bd=`1px solid ${C.border}`
  const TH=({children,style={}})=><th style={{padding:'3px 5px',textAlign:'right',fontSize:9,fontWeight:700,color:C.text3,borderBottom:bd,...style}}>{children}</th>
  const TD=({children,style={}})=><td style={{padding:'3px 5px',textAlign:'right',fontSize:10,fontFamily:NUM_FONT,borderBottom:bd,...style}}>{children}</td>
  const cG=(v,lo,hi)=>v>=hi?{color:'#f87171',fontWeight:800}:v>=lo?{color:'#f59e0b',fontWeight:700}:{}
  const cR=(v,lo,hi)=>v<=lo?{color:'#4ade80',fontWeight:700}:v>=hi?{color:'#f87171',fontWeight:800}:{}
  const pct=v=>v!=null?`${Math.round(v*100)}%`:'—'
  return (
    <div>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',minWidth:400}}>
          <thead>
            <tr>
              <TH style={{textAlign:'left',minWidth:75}}>Pitch</TH>
              <TH>Use%</TH><TH>PA</TH><TH>HR</TH><TH>HH%</TH><TH>Brl%</TH><TH>EV</TH><TH>Whiff%</TH><TH>xwOBA</TH>
            </tr>
          </thead>
          <tbody>
            {pitches.map((p,i)=>{
              const dot=PITCH_COLORS[p.code]||PITCH_COLORS.OTHER
              const b=p.batter
              return (
                <tr key={i} style={{background:b.hard_hit_rate>=0.50?'rgba(248,113,113,0.06)':'transparent'}}>
                  <td style={{padding:'4px 5px',borderBottom:bd,whiteSpace:'nowrap'}}>
                    <span style={{width:6,height:6,borderRadius:'50%',background:dot,display:'inline-block',marginRight:4,verticalAlign:'middle'}}/>
                    <span style={{fontSize:10,color:C.text2,fontWeight:700}}>{PITCH_NAMES[p.code]||p.code}</span>
                  </td>
                  <TD style={{color:C.text3}}>{p.usage>0?`${p.usage}%`:'—'}</TD>
                  <TD>{b.seen??'—'}</TD>
                  <TD style={(b.hr||0)>0?{color:'#f87171',fontWeight:800}:{color:C.text3}}>{b.hr??'—'}</TD>
                  <TD style={cG(b.hard_hit_rate,.30,.45)}>{pct(b.hard_hit_rate)}</TD>
                  <TD style={cG(b.barrel_like_rate,.05,.12)}>{pct(b.barrel_like_rate)}</TD>
                  <TD style={cG(b.avg_ev,86,92)}>{b.avg_ev?b.avg_ev.toFixed(1):'—'}</TD>
                  <TD style={cR(b.whiff_rate,.15,.32)}>{pct(b.whiff_rate)}</TD>
                  <TD style={cG(b.xwoba||0,.280,.380)}>{b.xwoba!=null?`.${String(Math.round(b.xwoba*1000)).padStart(3,'0')}`:'—'}</TD>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {matchNote&&(
        <div style={{marginTop:8,padding:'6px 10px',background:C.bg3,borderRadius:6,fontSize:11,color:C.text2,border:`1px solid ${C.border}`,lineHeight:1.5}}>
          🎯 {matchNote}
        </div>
      )}
    </div>
  )
}

// ── Pitcher zones (damage + tendency) ────────────────────────────────────────
function PitcherZones({ pitcherProfile, killZones }) {
  const [view, setView] = useState('damage')
  const [metric, setMetric] = useState('xwoba')

  if (!pitcherProfile) return (
    <div style={{fontSize:12,color:C.text3,padding:'1rem 0'}}>
      Pitcher zone profile not yet built. Re-run spray_cache.py to populate.
    </div>
  )

  const zones = view === 'damage' ? pitcherProfile.damage : pitcherProfile.tendency
  const metricKey = view === 'damage' ? metric : 'pct'
  const mFmt = view === 'damage'
    ? PITCHER_METRICS.find(m=>m.key===metric)?.fmt || (v=>String(v))
    : v => v!=null ? `${(v*100).toFixed(0)}%` : '—'

  const byId = {}; zones.forEach(z=>{ byId[z.zone]=z })
  const ratios = normRatios(zones, metricKey)

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,flexWrap:'wrap',gap:6}}>
        <SegGroup>
          <Seg active={view==='damage'} onClick={()=>setView('damage')}>Damage allowed</Seg>
          <Seg active={view==='tendency'} onClick={()=>setView('tendency')}>Location tendency</Seg>
        </SegGroup>
        {view==='damage'&&<MetricBar options={PITCHER_METRICS} active={metric} onChange={setMetric}/>}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:'1rem',alignItems:'start'}}>
        <div>
          <div style={{fontSize:10,color:C.text3,fontWeight:800,textTransform:'uppercase',letterSpacing:'.05em',textAlign:'center',marginBottom:6}}>
            {view==='damage'?'Damage by zone':'Pitch location %'}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,64px)',gap:3}}>
            {ROWS_9.flat().map(zid=>{
              const z=byId[zid]||{zone:zid,pa:0}
              const val=z[metricKey]!=null?mFmt(z[metricKey]):'—'
              return <ZoneCell key={zid} z={z} ratio={ratios[zid]} isKill={killZones.includes(zid)} val={val}/>
            })}
          </div>
          <Legend/>
          {killZones.length>0&&(
            <div style={{marginTop:8,fontSize:11,color:'#f87171',fontWeight:700}}>
              🔥 Kill zones: {killZones.map(z=>ZONE_LABELS[z]||'Z'+z).join(', ')}
            </div>
          )}
        </div>

        <div>
          <div style={{fontSize:10,color:C.text3,fontWeight:800,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:6}}>
            Top zones
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:5}}>
            {zones.filter(z=>z.pa>=5).sort((a,b)=>(b[metricKey]||0)-(a[metricKey]||0)).slice(0,5).map(z=>{
              const isKill=killZones.includes(z.zone)
              return (
                <div key={z.zone} style={{
                  display:'flex',alignItems:'center',gap:8,padding:'6px 9px',borderRadius:7,
                  background:isKill?'rgba(248,113,113,0.06)':C.bg2,
                  border:`1px solid ${isKill?'rgba(248,113,113,0.25)':C.border}`,
                }}>
                  <div style={{width:28,height:28,borderRadius:4,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:800,color:isKill?'#f87171':C.text3,background:isKill?'rgba(248,113,113,0.15)':C.bg3}}>Z{z.zone}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:11,fontWeight:700,color:C.text}}>{ZONE_LABELS[z.zone]}{isKill?' 🔥':''}</div>
                    <div style={{fontSize:10,color:C.text3,fontFamily:NUM_FONT,marginTop:1}}>
                      {view==='damage'
                        ? `${z.hr||0} HR · .${String(Math.round((z.ba||0)*1000)).padStart(3,'0')} BA · ${z.bbe||0} BBE`
                        : `${z.pitches||0} pitches`}
                    </div>
                  </div>
                  <div style={{fontSize:14,fontWeight:900,fontFamily:NUM_FONT,color:isKill?'#f87171':C.text}}>{mFmt(z[metricKey])}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Danger signals ────────────────────────────────────────────────────────────
function DangerSignals({ p }) {
  const bats = p.bats || p.handedness || ''
  const signals = [
    { label:'Meatball rate',      val:p.pitcher_meatball_pct,           good:v=>v>=0.20, fmt:v=>`${(v*100).toFixed(1)}%`, tip:'Pitches in hittable zones' },
    { label:'Putaway rate',       val:p.pitcher_putaway_pct,            good:v=>v<=0.20, fmt:v=>`${(v*100).toFixed(1)}%`, tip:'2-strike finishing rate — lower favors batter' },
    { label:'SwStr%',             val:p.pitcher_swstr_pct,              good:v=>v<=0.09, fmt:v=>`${(v*100).toFixed(1)}%`, tip:'Swinging strike rate' },
    { label:'1st pitch K%',       val:p.pitcher_first_pitch_strike_pct, good:v=>v<=0.52, fmt:v=>`${(v*100).toFixed(1)}%`, tip:'Gets ahead 0-1' },
    { label:'Whiff%',             val:p.pitcher_whiff_pct,              good:v=>v<=0.21, fmt:v=>`${(v*100).toFixed(1)}%`, tip:'Whiff per swing' },
    { label:'Hard hit allowed',   val:p.pitcher_hardhit_allowed,        good:v=>v>=0.38, fmt:v=>`${(v*100).toFixed(1)}%`, tip:'HH% allowed' },
  ].filter(s => s.val != null)

  const handLabel = bats==='L'?'LHB':bats==='R'?'RHB':null
  const vsHand = handLabel ? [
    { label:`HR/9 vs ${handLabel}`, val:bats==='L'?p.pitcher_hr9_vs_lhb:p.pitcher_hr9_vs_rhb,   good:v=>v>=0.75, fmt:v=>v.toFixed(2) },
    { label:`WHIP vs ${handLabel}`, val:bats==='L'?p.pitcher_whip_vs_lhb:p.pitcher_whip_vs_rhb, good:v=>v>=1.40, fmt:v=>v.toFixed(2) },
  ].filter(s => s.val != null) : []

  if (!signals.length && !vsHand.length) return (
    <div style={{fontSize:12,color:C.text3,padding:'1rem 0'}}>No pitcher signal data available.</div>
  )

  return (
    <div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:10}}>
        {signals.map(s=>{
          const ok=s.good(s.val)
          return (
            <div key={s.label} title={s.tip} style={{
              padding:'8px 10px',borderRadius:8,
              background:ok?'rgba(74,222,128,0.07)':C.bg2,
              border:`1px solid ${ok?'rgba(74,222,128,0.30)':C.border}`,
            }}>
              <div style={{fontSize:10,color:C.text3,marginBottom:3}}>{s.label}</div>
              <div style={{fontSize:18,fontWeight:800,fontFamily:NUM_FONT,color:ok?'#4ade80':C.text2}}>{s.fmt(s.val)}</div>
              <div style={{fontSize:9,color:ok?'#4ade80':C.text3,marginTop:2}}>{ok?'batter edge':'neutral'}</div>
            </div>
          )
        })}
      </div>
      {vsHand.length>0&&(
        <>
          <div style={{fontSize:10,color:C.text3,fontWeight:800,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:6}}>Hand splits (vs {handLabel})</div>
          <div style={{display:'flex',gap:6}}>
            {vsHand.map(s=>{
              const ok=s.good(s.val)
              return (
                <div key={s.label} style={{
                  flex:1,padding:'8px 10px',borderRadius:8,textAlign:'center',
                  background:ok?'rgba(248,113,113,0.07)':C.bg2,
                  border:`1px solid ${ok?'rgba(248,113,113,0.30)':C.border}`,
                }}>
                  <div style={{fontSize:10,color:C.text3,marginBottom:3}}>{s.label}</div>
                  <div style={{fontSize:20,fontWeight:800,fontFamily:NUM_FONT,color:ok?'#f87171':C.text2}}>{s.fmt(s.val)}</div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Extra pitcher stats row */}
      <div style={{marginTop:10,display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6}}>
        {[
          {label:'Pitcher HR/9',  val:p.pitcher_hr9,  fmt:v=>v.toFixed(2), hot:v=>v>=1.0},
          {label:'Pitcher WHIP',  val:p.pitcher_whip, fmt:v=>v.toFixed(2), hot:v=>v>=1.40},
          {label:'K rate',        val:p.pitcher_k_rate,fmt:v=>`${(v*100).toFixed(0)}%`, hot:v=>v<=0.18},
        ].filter(s=>s.val!=null).map(s=>(
          <div key={s.label} style={{padding:'7px 9px',borderRadius:7,background:C.bg2,border:`1px solid ${C.border}`,textAlign:'center'}}>
            <div style={{fontSize:10,color:C.text3,marginBottom:2}}>{s.label}</div>
            <div style={{fontSize:16,fontWeight:800,fontFamily:NUM_FONT,color:s.hot(s.val)?'#f87171':C.text2}}>{s.fmt(s.val)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Kill zone tab ─────────────────────────────────────────────────────────────
function KillZoneTab({ p, zoneProfile, pitcherProfile }) {
  const bats = p.bats || p.handedness || ''
  const killZones = pitcherProfile?.kill_zones || []
  const batterHot = zoneProfile
    ? [...(zoneProfile.zones_13||zoneProfile.zones_9||[])].filter(z=>!z.low_sample&&z.hr_rate!=null).sort((a,b)=>b.hr_rate-a.hr_rate).slice(0,4).map(z=>z.zone)
    : []
  const matchup = batterHot.filter(z=>killZones.includes(z))
  const hasKill  = matchup.length>0

  const edgeScore = Math.min(100, Math.round(
    (p.pitch_mix_score||0)*0.35 +
    (p.pitcher_meatball_pct||0)*200 +
    (hasKill?25:0) +
    (p.pitch_type_match_flag?15:0) +
    (p.pitcher_hardhit_allowed||0)*30
  ))
  const edgeCol = edgeScore>=70?'#f87171':edgeScore>=50?'#f59e0b':C.text2

  return (
    <div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:12}}>
        {[
          {label:'Edge score', val:edgeScore, sub:'/100', col:edgeCol},
          {label:'Kill zones', val:matchup.length, sub:'of 9', col:matchup.length>0?'#f87171':C.text3},
          {label:'Pitch match', val:p.pitch_type_match_flag?'YES':'NO', sub:p.pitch_type_match_code||'—', col:p.pitch_type_match_flag?'#f87171':C.text3},
        ].map(c=>(
          <div key={c.label} style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:10,padding:'10px 12px',textAlign:'center'}}>
            <div style={{fontSize:10,color:C.text3,marginBottom:4}}>{c.label}</div>
            <div style={{fontSize:24,fontWeight:900,fontFamily:NUM_FONT,color:c.col}}>{c.val}</div>
            <div style={{fontSize:10,color:C.text3}}>{c.sub}</div>
          </div>
        ))}
      </div>

      <div style={{marginBottom:10,padding:'10px 12px',borderRadius:8,border:`1px solid ${hasKill?'rgba(248,113,113,0.30)':C.border}`,background:hasKill?'rgba(248,113,113,0.05)':C.bg2}}>
        <div style={{fontSize:11,fontWeight:800,color:hasKill?'#f87171':C.text2,marginBottom:3}}>
          {hasKill?`${matchup.length} kill zone${matchup.length>1?'s':''} — ${matchup.map(z=>ZONE_LABELS[z]||'Z'+z).join(', ')}`:zoneProfile&&pitcherProfile?'No kill zone overlap found':'Zone data needed — run spray_cache.py'}
        </div>
        <div style={{fontSize:11,color:C.text3,lineHeight:1.5}}>
          {hasKill?'Pitcher locates and gets hurt in zones where this batter has elevated HR rate.':zoneProfile&&pitcherProfile?`Batter's hot zones don't overlap pitcher's vulnerable zones this matchup.`:'Zone profiles are built by spray_cache.py from Statcast data.'}
        </div>
      </div>

      <div style={{display:'flex',flexDirection:'column',gap:6}}>
        {[
          {label:'Pitch mix score',  val:p.pitch_mix_score!=null?`${Math.round(p.pitch_mix_score)}/100`:'—',    note:p.pitch_mix_note||'',           hot:(p.pitch_mix_score||0)>=75},
          {label:'Meatball rate',    val:p.pitcher_meatball_pct!=null?`${(p.pitcher_meatball_pct*100).toFixed(1)}%`:'—', note:'League avg ~18%', hot:(p.pitcher_meatball_pct||0)>=0.20},
          {label:'Pitch type match', val:p.pitch_type_match_flag?'Yes':'No',                                    note:p.pitch_type_match_note||'',    hot:!!p.pitch_type_match_flag},
          {label:'Attack tag',       val:p.pitcher_attack_tag||'—',                                             note:'',                             hot:false},
          {label:`HR/9 vs ${bats==='L'?'LHB':'RHB'}`, val:((bats==='L'?p.pitcher_hr9_vs_lhb:p.pitcher_hr9_vs_rhb)||0).toFixed(2), note:'Season hand splits', hot:(bats==='L'?p.pitcher_hr9_vs_lhb:p.pitcher_hr9_vs_rhb)>=0.75},
          {label:'Primary mix',      val:p.pitcher_primary_mix||p.pitcher_arsenal_summary||'—',                 note:`${p.pitch_mix_sample||0} pitches sampled`, hot:false},
        ].map(r=>(
          <div key={r.label} style={{
            display:'flex',alignItems:'center',justifyContent:'space-between',
            padding:'7px 10px',borderRadius:7,
            background:r.hot?'rgba(248,113,113,0.05)':C.bg2,
            border:`1px solid ${r.hot?'rgba(248,113,113,0.25)':C.border}`,
          }}>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:C.text2}}>{r.label}</div>
              {r.note&&<div style={{fontSize:10,color:C.text3,marginTop:1}}>{r.note}</div>}
            </div>
            <div style={{fontSize:12,fontWeight:800,fontFamily:NUM_FONT,color:r.hot?'#f87171':C.text,maxWidth:180,textAlign:'right'}}>{r.val}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
const TABS = [
  { key:'batter',  label:'Batter zones' },
  { key:'pitcher', label:'Pitcher zones' },
  { key:'pitch',   label:'🎯 Pitch' },
  { key:'signals', label:'📡 Signals' },
  { key:'kill',    label:'🔥 Kill zone' },
]

export default function HotZoneMap({ player, onClose }) {
  const [cacheData, setCacheData] = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [tab,       setTab]       = useState('batter')
  const [metric,    setMetric]    = useState('hr_rate')
  const [activePitches, setActivePitches] = useState(()=>new Set())

  const pid = player?.player_id || player?.id

  useEffect(()=>{
    if (!pid) return
    setLoading(true); setError(null); setCacheData(null)
    fetch(dataUrl(`pitch/batter_${pid}.json`))
      .then(r=>{ if(!r.ok) throw new Error(r.status===404?'__UNPUBLISHED__':`HTTP ${r.status}`); return r.json() })
      .then(d=>{ setCacheData(d); setLoading(false) })
      .catch(e=>{ setError(e.message); setLoading(false) })
  },[pid])

  const zoneProfile    = cacheData?.zone_profile
  const pitcherProfile = cacheData?.pitcher_zone_profile

  // Build pitch list: batter data from cache, usage from player row
  const pitches = useMemo(()=>{
    const byPitch = cacheData?.batter_pitch_type_profile?.by_pitch || {}

    // Batter per-pitch from player row pitch_type_summary
    const bpts = player?.pitch_type_summary || []
    const bMap = {}
    bpts.forEach(r=>{ bMap[r.pitch_code||r.pitch_type]={
      seen:r.seen||r.count||0, hr:r.hr||0,
      hard_hit_rate:(r.hard_hit_pct||0)/100,
      barrel_like_rate:(r.barrel_pct||0)/100,
      avg_ev:r.avg_ev||0, avg_la:r.avg_la||0,
      whiff_rate:(r.whiff_pct||0)/100,
      xwoba:r.xwoba||null,
    }})
    // Merge with by_pitch from cache (more complete)
    Object.keys(byPitch).forEach(code=>{
      const b=byPitch[code]
      bMap[code]={
        seen:b.seen||0, hr:b.hr||0,
        hard_hit_rate:b.hard_hit_rate||0,
        barrel_like_rate:b.barrel_like_rate||0,
        avg_ev:b.avg_ev||0, avg_la:b.avg_la||0,
        whiff_rate:b.whiff_rate||0,
        xwoba:b.xwoba||null,
      }
    })

    // Pitcher usage from player row
    const ppts = player?.pitcher_pitch_type_summary || []
    const usageMap = {}
    ppts.forEach(r=>{ usageMap[r.pitch_code||r.pitch_type]=Math.round(r.usage_pct||r.usage||0) })

    // Also parse primary mix string as fallback
    const mixStr = player?.pitcher_primary_mix || player?.pitcher_arsenal_summary || ''
    mixStr.split('|').forEach(seg=>{
      const m=seg.trim().match(/^(\w+)\s+([\d.]+)%/)
      if(m&&!usageMap[m[1]]) usageMap[m[1]]=Math.round(parseFloat(m[2]))
    })

    const codes=new Set([...Object.keys(usageMap).filter(k=>usageMap[k]>0),...Object.keys(bMap).filter(k=>(bMap[k]?.seen||0)>=20)])
    return [...codes].map(code=>({
      code,
      usage:usageMap[code]||0,
      batter:bMap[code]||{seen:0,hr:0,hard_hit_rate:0,barrel_like_rate:0,avg_ev:0,avg_la:0,whiff_rate:0,xwoba:null},
    })).filter(p=>p.usage>0||p.batter.seen>=20).sort((a,b)=>b.usage-a.usage)
  },[player, cacheData])

  const togglePitch = code=>setActivePitches(prev=>{ const n=new Set(prev); n.has(code)?n.delete(code):n.add(code); return n })

  const killZones   = pitcherProfile?.kill_zones||[]
  const batterHot   = zoneProfile
    ? [...(zoneProfile.zones_13||zoneProfile.zones_9||[])].filter(z=>!z.low_sample&&z.hr_rate!=null).sort((a,b)=>b.hr_rate-a.hr_rate).slice(0,4).map(z=>z.zone)
    : []
  const matchupKill = batterHot.filter(z=>killZones.includes(z))

  const metricObj = BATTER_METRICS.find(m=>m.key===metric)
  const metricFmt = metricObj?.fmt||(v=>String(v))

  const s = {
    noData:{fontSize:12,color:C.text3,padding:'1rem 0',textAlign:'center'},
    sLbl:{fontSize:10,color:C.text3,fontWeight:800,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:6},
  }

  if (!player) return null

  return (
    <div style={{fontFamily:'inherit',color:C.text}}>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
        <div>
          <div style={{fontSize:15,fontWeight:900}}>{player.name||'Hot zones'}</div>
          <div style={{fontSize:11,color:C.text3,fontFamily:NUM_FONT,marginTop:2}}>
            vs {player.pitcher_name||'—'} · {player.bats&&player.bats!=='?'?`${player.bats}HB · `:''}
            {zoneProfile?`${zoneProfile.lookback}d · ${zoneProfile.total_pa} PA`:loading?'Loading…':'Zone data not published'}
          </div>
        </div>
        {onClose&&<button onClick={onClose} style={{background:'transparent',border:'none',color:C.text3,fontSize:20,cursor:'pointer',lineHeight:1}}>✕</button>}
      </div>

      {/* Tab bar */}
      <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:12,borderBottom:`1px solid ${C.border}`,paddingBottom:8}}>
        {TABS.map(t=><TabBtn key={t.key} active={tab===t.key} onClick={()=>setTab(t.key)}>{t.label}</TabBtn>)}
      </div>

      {/* ── BATTER ZONES ── */}
      {tab==='batter'&&(
        <div>
          <PitchToggles pitches={pitches} active={activePitches} onToggle={togglePitch} onClear={()=>setActivePitches(new Set())}/>
          {/* Active pitch callout */}
          {activePitches.size>0&&(
            <div style={{marginBottom:8,padding:'5px 10px',borderRadius:6,border:`1px solid ${C.border}`,background:C.bg2,fontSize:11,color:C.text2}}>
              {[...activePitches].map(code=>{
                const p=pitches.find(x=>x.code===code); if(!p||!p.batter.seen) return null
                const b=p.batter; const col=PITCH_COLORS[code]||PITCH_COLORS.OTHER
                return (
                  <span key={code} style={{marginRight:12}}>
                    <span style={{width:6,height:6,borderRadius:'50%',background:col,display:'inline-block',marginRight:4,verticalAlign:'middle'}}/>
                    <span style={{fontWeight:800,color:col}}>{PITCH_NAMES[code]||code}</span>
                    {' · '}{b.seen} PA · {b.hr} HR · {Math.round((b.hard_hit_rate||0)*100)}% HH · EV {b.avg_ev?.toFixed(1)||'—'}
                  </span>
                )
              }).filter(Boolean)}
            </div>
          )}
          {loading&&<div style={s.noData}>Loading zone data…</div>}
          {error==='__UNPUBLISHED__'
            ? <div style={s.noData}>Zone data isn&apos;t published for this player yet.</div>
            : error&&<div style={{...s.noData,color:'#f87171'}}>Error: {error}</div>}
          {!loading&&!error&&(
            <div style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:'1rem',alignItems:'start'}}>
              <div>
                <div style={{...s.sLbl,textAlign:'center'}}>{metric==='hr_rate'?'9-zone HR':'9-zone'}</div>
                {zoneProfile?(
                  <Grid9
                    zones={zoneProfile.zones_9||[]}
                    metricKey={metric}
                    metricFmt={metricFmt}
                    killZones={matchupKill}
                  />
                ):(
                  <div style={{...s.noData,width:196}}>Zone profile not yet built.</div>
                )}
                <Legend/>
              </div>
              <div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,flexWrap:'wrap',gap:4}}>
                  <div style={s.sLbl}>Metric</div>
                  <MetricBar options={BATTER_METRICS} active={metric} onChange={setMetric}/>
                </div>
                {zoneProfile&&(
                  <div style={{display:'flex',flexDirection:'column',gap:5}}>
                    {[...(zoneProfile.zones_13||zoneProfile.zones_9||[])].sort((a,b)=>(b[metric]||0)-(a[metric]||0)).slice(0,5).map(z=>{
                      const isKill=matchupKill.includes(z.zone)
                      return (
                        <div key={z.zone} style={{
                          display:'flex',alignItems:'center',gap:8,padding:'6px 9px',borderRadius:7,
                          background:isKill?'rgba(248,113,113,0.06)':C.bg2,
                          border:`1px solid ${isKill?'rgba(248,113,113,0.25)':C.border}`,
                        }}>
                          <div style={{width:28,height:28,borderRadius:4,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:800,color:isKill?'#f87171':C.text3,background:isKill?'rgba(248,113,113,0.15)':C.bg3}}>Z{z.zone}</div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:11,fontWeight:700}}>{ZONE_LABELS[z.zone]}{isKill?' 🔥':''}</div>
                            <div style={{fontSize:10,color:C.text3,fontFamily:NUM_FONT,marginTop:1}}>
                              {(z.hr_rate!=null?(z.hr_rate*100).toFixed(0):0)}% HR · .{String(Math.round((z.ba||0)*1000)).padStart(3,'0')} BA · {z.xwoba?.toFixed(3)||'—'} xwOBA · {z.bbe||0} BBE
                            </div>
                          </div>
                          <div style={{fontSize:14,fontWeight:900,fontFamily:NUM_FONT,color:isKill?'#f87171':C.text}}>{metricFmt(z[metric])}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── PITCHER ZONES ── */}
      {tab==='pitcher'&&(
        <PitcherZones pitcherProfile={pitcherProfile} killZones={killZones}/>
      )}

      {/* ── PITCH MATRIX ── */}
      {tab==='pitch'&&(
        <div>
          <PitchToggles pitches={pitches} active={activePitches} onToggle={togglePitch} onClear={()=>setActivePitches(new Set())}/>
          <PitchMatrix
            pitches={activePitches.size>0?pitches.filter(p=>activePitches.has(p.code)):pitches}
            matchNote={player?.pitch_type_match_note}
          />
        </div>
      )}

      {/* ── SIGNALS ── */}
      {tab==='signals'&&<DangerSignals p={player}/>}

      {/* ── KILL ZONE ── */}
      {tab==='kill'&&<KillZoneTab p={player} zoneProfile={zoneProfile} pitcherProfile={pitcherProfile}/>}
    </div>
  )
}
