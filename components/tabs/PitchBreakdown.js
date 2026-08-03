'use client'
import { useState, useMemo } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { Empty } from '../ui'
import { ORANGE_RAMP, rampColor, inkFor } from '../Heatmap'

// COLOUR NOTE. This page ran a green/red good-bad scale and a per-pitch rainbow
// until now — its own footer read "Green = favorable for batter, Red =
// unfavorable". Every other board here is the orange ramp, where brightness is
// magnitude and bright always means good for the hitter. Two colour languages
// on one site means neither gets learned, and a green cell here meant the
// opposite of a green cell nowhere else, because nowhere else has one.
//
// So: one ramp, and direction is carried by `goodDir` flipping the value before
// it's shaded rather than by switching hue. Pitch identity is a dim text label
// now instead of a colour, since colour is spoken for by magnitude.

const PITCH_NAMES = {
  FF:'4-Seam',SI:'Sinker',FC:'Cutter',SL:'Slider',CU:'Curveball',
  KC:'K-Curve',CH:'Changeup',FS:'Splitter',KN:'Knuckleball',ST:'Sweeper',
  SV:'Slurve',FA:'Fastball',EP:'Eephus',FO:'Forkball',CS:'Slow curve',
}

const pct1 = v => v != null ? `${(v*100).toFixed(1)}%` : '—'
const dec3 = v => v != null ? Number(v).toFixed(3).replace('0.', '.') : '—'
const num1 = v => v != null ? Number(v).toFixed(1) : '—'

// Shade against the [low, high] band this column cares about, flipping when a
// low number is the good one. Values outside the band clamp to the ends.
function cell(val, low, high, goodDir='high') {
  if (val == null || !Number.isFinite(Number(val))) return {}
  const v = Number(val)
  const shaded = goodDir === 'high' ? v : (high - (v - low))
  const bg = rampColor(shaded, low, high) || ORANGE_RAMP[0]
  return { background: bg, color: inkFor(bg), fontWeight: 700 }
}

const TH = ({children,style={}}) => (
  <th style={{padding:'5px 8px',fontSize:10,fontWeight:700,color:'#71717a',textAlign:'right',borderBottom:'1px solid rgba(255,255,255,0.09)',whiteSpace:'nowrap',...style}}>{children}</th>
)
const TD = ({children,style={}}) => (
  <td style={{padding:'5px 8px',fontSize:11,fontFamily:NUM_FONT,textAlign:'right',borderBottom:'1px solid rgba(255,255,255,0.06)',...style}}>{children}</td>
)

function SegGroup({children}) {
  return <div style={{display:'flex',borderRadius:6,overflow:'hidden',border:'1px solid rgba(255,255,255,0.15)',flexShrink:0}}>{children}</div>
}
function Seg({active,onClick,children}) {
  return (
    <button onClick={onClick} style={{
      padding:'3px 8px',fontSize:10,fontWeight:600,cursor:'pointer',border:'none',
      background:active?'#f97316':'transparent',
      color:active?'#fff':'#a1a1aa',
    }}>{children}</button>
  )
}

export default function PitchBreakdown({ player }) {
  // Auto-default each toggle to what's actually relevant for this matchup,
  // instead of always landing on "All" and making the person click twice.
  // hand = which PITCHER-allowed-vs-hand table shows -> defaults to the
  // batter's own hand, since "how does today's pitcher do against batters
  // like this one" is the natural first question.
  // batterVs = which BATTER-vs-pitch-type table shows -> defaults to
  // today's actual pitcher's throwing hand, for the same reason in reverse.
  const initialHand = player?.bats === 'L' ? 'L' : player?.bats === 'R' ? 'R' : 'ALL'
  const initialBatterVs = player?.pitcher_throws === 'L' ? 'L' : player?.pitcher_throws === 'R' ? 'R' : 'ALL'
  const [hand, setHand] = useState(initialHand) // ALL | L | R — pitcher view vs this batter hand
  const [batterVs, setBatterVs] = useState(initialBatterVs) // ALL | L | R — batter view vs pitcher hand (LHP/RHP)

  // ── Batter vs pitch type, now splittable by the HAND OF PITCHER faced ──
  // batterVs='ALL' keeps the original all-time blend; 'L'/'R' use the new
  // vs_lhp/vs_rhp splits the bot now computes (mirrors the pitcher-side
  // vs_lhb/vs_rhb split below). Falls back to the all-time blend if a split
  // wasn't available for this player (e.g. older cached data).
  const byPitch = useMemo(() => {
    if (batterVs === 'L') return player?.batter_pitch_type_profile?.vs_lhp?.by_pitch || player?.batter_pitch_type_profile?.by_pitch || {}
    if (batterVs === 'R') return player?.batter_pitch_type_profile?.vs_rhp?.by_pitch || player?.batter_pitch_type_profile?.by_pitch || {}
    return player?.batter_pitch_type_profile?.by_pitch || {}
  }, [player, batterVs])

  // ── Pitcher arsenal — switch by batter hand toggle ──
  const pitcherSummary = useMemo(() => {
    if (hand === 'L') return player?.pitcher_pitch_type_summary_vs_lhb || player?.pitcher_pitch_mix_vs_lhb?.pitch_type_summary || []
    if (hand === 'R') return player?.pitcher_pitch_type_summary_vs_rhb || player?.pitcher_pitch_mix_vs_rhb?.pitch_type_summary || []
    return (
      player?.pitcher_pitch_mix?.pitch_type_summary ||
      player?.pitcher_pitch_arsenal_detail ||
      []
    )
  }, [player, hand])

  const primaryMix = useMemo(() => {
    if (hand === 'L') return player?.pitcher_primary_mix_vs_lhb || player?.pitcher_primary_mix || '—'
    if (hand === 'R') return player?.pitcher_primary_mix_vs_rhb || player?.pitcher_primary_mix || '—'
    return player?.pitcher_primary_mix || player?.pitcher_arsenal_summary || '—'
  }, [player, hand])

  // Pitcher usage codes from the active split
  const todayPitches = useMemo(() => {
    const summary = pitcherSummary
    if (summary?.length) return summary.map(r => r.pitch_code || r.pitch_type)
    const arsenal = player?.pitcher_arsenal || player?.pitcher_pitch_usage || {}
    return Object.keys(arsenal).sort((a,b)=>(arsenal[b]||0)-(arsenal[a]||0))
  }, [pitcherSummary, player])

  const allPitches = [...new Set([...todayPitches, ...Object.keys(byPitch)])].filter(pt => byPitch[pt] || todayPitches.includes(pt))

  const pitcherMap = {}
  pitcherSummary.forEach(r => { pitcherMap[r.pitch_type||r.pitch_code] = r })

  const batsLabel = player?.bats && player.bats !== '?' ? `${player.bats}HB` : null

  return (
    <div>
      {/* Pitcher context + hand toggle */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10,flexWrap:'wrap',gap:8}}>
        <div style={{fontSize:11,color:'#a1a1aa',fontFamily:NUM_FONT}}>
          <span style={{color:'#f4f4f5',fontWeight:700}}>{player.pitcher_name}</span>
          {' '}{player.pitcher_throws}HP · ERA {player.pitcher_era} · {primaryMix}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <span style={{fontSize:9,color:'#71717a',fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em'}}>vs</span>
          <SegGroup>
            <Seg active={hand==='ALL'} onClick={()=>setHand('ALL')}>All</Seg>
            <Seg active={hand==='L'}   onClick={()=>setHand('L')}>LHB</Seg>
            <Seg active={hand==='R'}   onClick={()=>setHand('R')}>RHB</Seg>
          </SegGroup>
          {batsLabel && (
            <span style={{fontSize:10,color:'#f97316',fontWeight:700}}>
              {player.bats==='L'&&hand==='L' ? '← batter' : player.bats==='R'&&hand==='R' ? '← batter' : ''}
            </span>
          )}
        </div>
      </div>

      {/* ── Section 1: Batter vs pitch type, now toggleable by pitcher hand ── */}
      {Object.keys(byPitch).length > 0 ? (
        <div style={{marginBottom:16}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6,paddingBottom:5,borderBottom:'1px solid rgba(255,255,255,0.09)',flexWrap:'wrap',gap:8}}>
            <div style={{fontSize:12,fontWeight:800}}>
              {player.name} <span style={{color:'#71717a',fontWeight:400}}>vs pitch type</span>
              <span style={{fontSize:10,color:'#52525b',fontFamily:NUM_FONT,marginLeft:6}}>★ = today's pitcher throws this</span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontSize:9,color:'#71717a',fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em'}}>vs</span>
              <SegGroup>
                <Seg active={batterVs==='ALL'} onClick={()=>setBatterVs('ALL')}>All</Seg>
                <Seg active={batterVs==='L'}   onClick={()=>setBatterVs('L')}>LHP</Seg>
                <Seg active={batterVs==='R'}   onClick={()=>setBatterVs('R')}>RHP</Seg>
              </SegGroup>
              {player?.pitcher_throws && (
                <span style={{fontSize:10,color:'#f97316',fontWeight:700}}>
                  {(player.pitcher_throws==='L'&&batterVs==='L')||(player.pitcher_throws==='R'&&batterVs==='R') ? '← today' : ''}
                </span>
              )}
            </div>
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr>
                  <TH style={{textAlign:'left'}}>Pitch</TH>
                  <TH>Seen</TH><TH>BBE</TH><TH>BA</TH><TH>xwOBA</TH><TH>HR</TH>
                  <TH>EV</TH><TH>LA</TH><TH>GB%</TH><TH>FB%</TH>
                  <TH>HH%</TH><TH>Brl%</TH><TH>Pull%</TH><TH>Whiff%</TH><TH>K%</TH><TH>BB%</TH>
                </tr>
              </thead>
              <tbody>
                {allPitches.map(pt => {
                  const d = byPitch[pt] || {}
                  const isToday = todayPitches.includes(pt)
                  const pRow = pitcherMap[pt]
                  const usage = pRow?.usage_pct ?? (player?.pitcher_arsenal||{})[pt]
                  const dotColor = C.text3
                  return (
                    <tr key={pt} style={{borderLeft:isToday?`3px solid ${dotColor}`:'3px solid transparent'}}>
                      <td style={{padding:'5px 8px',borderBottom:'1px solid rgba(255,255,255,0.06)',whiteSpace:'nowrap'}}>
                        <span style={{width:7,height:7,borderRadius:'50%',background:dotColor,display:'inline-block',marginRight:5,verticalAlign:'middle'}}/>
                        <span style={{fontSize:11,fontWeight:700,color:'#f4f4f5'}}>{PITCH_NAMES[pt]||pt}</span>
                        {isToday&&<span style={{fontSize:9,color:dotColor,marginLeft:4}}>★{usage?` ${Math.round(usage)}%`:''}</span>}
                      </td>
                      <TD>{d.seen||'—'}</TD>
                      <TD>{d.bbe||'—'}</TD>
                      <TD style={cell(d.ba,.18,.28)}>{dec3(d.ba)}</TD>
                      <TD style={cell(d.xwoba,.28,.38)}>{d.xwoba!=null?dec3(d.xwoba):'—'}</TD>
                      <TD style={(d.hr||0)>0?{color:'#f87171',fontWeight:700}:{color:'#52525b'}}>{d.hr??'—'}</TD>
                      <TD style={cell(d.avg_ev,85,95)}>{num1(d.avg_ev)}</TD>
                      <TD style={{color:'#a1a1aa'}}>{d.avg_la!=null?`${num1(d.avg_la)}°`:'—'}</TD>
                      <TD style={cell(d.gb_rate,.35,.55,'low')}>{pct1(d.gb_rate)}</TD>
                      <TD style={cell(d.fb_rate,.2,.4)}>{pct1(d.fb_rate)}</TD>
                      <TD style={cell(d.hard_hit_rate,.3,.5)}>{pct1(d.hard_hit_rate)}</TD>
                      <TD style={cell(d.barrel_like_rate,.05,.15)}>{pct1(d.barrel_like_rate)}</TD>
                      <TD style={cell(d.air_pull_rate,.3,.55)}>{pct1(d.air_pull_rate)}</TD>
                      <TD style={cell(d.whiff_rate,.15,.3,'low')}>{pct1(d.whiff_rate)}</TD>
                      <TD style={cell(d.k_rate,.15,.28,'low')}>{d.k_rate!=null?pct1(d.k_rate):'—'}</TD>
                      <TD style={cell(d.bb_rate,.05,.12)}>{d.bb_rate!=null?pct1(d.bb_rate):'—'}</TD>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={{padding:'10px 0',fontSize:11,color:'#71717a',fontFamily:NUM_FONT}}>
          Batter vs pitch data not available — run bot to populate.
        </div>
      )}

      {/* ── Section 2: Pitcher arsenal (hand-split) ── */}
      {pitcherSummary.length > 0 && (
        <div>
          <div style={{fontSize:12,fontWeight:800,marginBottom:6,paddingBottom:5,borderBottom:'1px solid rgba(255,255,255,0.09)'}}>
            {player.pitcher_name}{' '}
            <span style={{color:'#71717a',fontWeight:400}}>
              pitch performance allowed {hand!=='ALL'?`vs ${hand}HB`:'(all batters)'}
            </span>
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr>
                  <TH style={{textAlign:'left'}}>Pitch</TH>
                  <TH>Use%</TH><TH>BBE</TH><TH>HR</TH><TH>HR/BBE</TH>
                  <TH>EV</TH><TH>HH%</TH><TH>Brl%</TH>
                </tr>
              </thead>
              <tbody>
                {pitcherSummary.map((r,i) => {
                  const pt = r.pitch_type||r.pitch_code||''
                  const dotColor = C.text3
                  const hrPBBE = r.hr_per_bbe||(r.hr_allowed&&r.bbe_allowed?r.hr_allowed/r.bbe_allowed:null)
                  return (
                    <tr key={i}>
                      <td style={{padding:'5px 8px',borderBottom:'1px solid rgba(255,255,255,0.06)',whiteSpace:'nowrap'}}>
                        <span style={{width:7,height:7,borderRadius:'50%',background:dotColor,display:'inline-block',marginRight:5,verticalAlign:'middle'}}/>
                        <span style={{fontSize:11,fontWeight:700,color:'#f4f4f5'}}>{PITCH_NAMES[pt]||pt}</span>
                      </td>
                      <TD style={{color:'#a1a1aa'}}>{r.usage_pct!=null?`${Math.round(r.usage_pct)}%`:'—'}</TD>
                      <TD>{r.bbe_allowed??'—'}</TD>
                      <TD style={(r.hr_allowed||0)>0?{color:'#f87171',fontWeight:700}:{color:'#52525b'}}>{r.hr_allowed??'—'}</TD>
                      <TD style={cell(hrPBBE,.02,.08)}>{hrPBBE!=null?hrPBBE.toFixed(3):'—'}</TD>
                      <TD style={cell(r.avg_ev_allowed,85,92)}>{r.avg_ev_allowed?num1(r.avg_ev_allowed):'—'}</TD>
                      <TD style={cell(r.hard_hit_rate_allowed,.3,.45)}>{r.hard_hit_rate_allowed!=null?pct1(r.hard_hit_rate_allowed):'—'}</TD>
                      <TD style={cell(r.barrel_rate_allowed,.04,.1)}>{r.barrel_rate_allowed!=null?pct1(r.barrel_rate_allowed):'—'}</TD>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{fontSize:9,color:'#52525b',marginTop:8,fontFamily:NUM_FONT}}>
        Brightness is magnitude and bright is always good for the hitter — same ramp as every other board, so a dark cell is a low number, not a warning. ★ = today's pitcher throws this · Toggle LHB/RHB to see pitcher splits vs hand
      </div>
    </div>
  )
}
