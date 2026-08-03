'use client'
import { useState, useMemo } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { Empty } from '../ui'
import { ORANGE_RAMP, rampColor, inkFor } from '../Heatmap'
import DenseTable from '../DenseTable'

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
          <DenseTable
            rows={allPitches.map(pt => {
              const d = byPitch[pt] || {}
              const pRow = pitcherMap[pt]
              return {
                _key: pt,
                pitch: PITCH_NAMES[pt] || pt,
                today: todayPitches.includes(pt) ? 1 : 0,
                use: pRow?.usage_pct ?? (player?.pitcher_arsenal || {})[pt] ?? null,
                seen: d.seen ?? null,
                bbe: d.bbe ?? null,
                ba: d.ba ?? null,
                xwoba: d.xwoba ?? null,
                hr: d.hr ?? null,
                ev: d.avg_ev ?? null,
                la: d.avg_la ?? null,
                gb: d.gb_rate != null ? d.gb_rate * 100 : null,
                fb: d.fb_rate != null ? d.fb_rate * 100 : null,
                hh: d.hard_hit_rate != null ? d.hard_hit_rate * 100 : null,
                brl: d.barrel_like_rate != null ? d.barrel_like_rate * 100 : null,
                pull: d.air_pull_rate != null ? d.air_pull_rate * 100 : null,
                whiff: d.whiff_rate != null ? d.whiff_rate * 100 : null,
                k: d.k_rate != null ? d.k_rate * 100 : null,
                bb: d.bb_rate != null ? d.bb_rate * 100 : null,
              }
            })}
            columns={[
              { key:'pitch', label:'Pitch', heat:false, w:92, bold:true, sticky:true },
              { key:'today', label:'★', flag:true, mark:'★', w:30,
                title:"Today's starter throws this pitch" },
              { key:'use',   label:'Use%', w:48, dp:0,
                title:"Share of tonight's mix. No judgement in this column — just how often he throws it." },
              { key:'seen',  label:'Seen', w:46 },
              { key:'bbe',   label:'BBE',  w:42, title:'Balls in play — the denominator for every rate on this row' },
              { key:'ba',    label:'BA',   w:48, dp:3 },
              { key:'xwoba', label:'xwOBA', w:54, dp:3 },
              { key:'hr',    label:'HR',   w:38 },
              { key:'ev',    label:'EV',   w:46, dp:1 },
              { key:'la',    label:'LA',   w:44, dp:1,
                title:'Launch angle. Shaded like the rest, but read it carefully — high is a popup, not a good outcome.' },
              { key:'gb',    label:'GB%',  w:46, dp:0, invert:true,
                title:'Inverted — ground balls are the outcome the hitter wants least' },
              { key:'fb',    label:'FB%',  w:46, dp:0 },
              { key:'hh',    label:'HH%',  w:46, dp:0 },
              { key:'brl',   label:'Brl%', w:46, dp:1 },
              { key:'pull',  label:'Pull%', w:50, dp:0 },
              { key:'whiff', label:'Whiff%', w:54, dp:0, invert:true },
              { key:'k',     label:'K%',   w:44, dp:0, invert:true },
              { key:'bb',    label:'BB%',  w:44, dp:0 },
            ]}
            initialSort="use"
            maxHeight={320}
            caption="Click any header to sort. GB%, Whiff% and K% are inverted so bright still means good for the hitter. Use% carries no judgement — it's how often tonight's arm throws the pitch, not whether the pitch is good. Watch BBE: several rows here rest on single-digit balls in play."
          />
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
          <DenseTable
            rows={pitcherSummary.map((r,i) => {
              const pt = r.pitch_type||r.pitch_code||''
              const hrPBBE = r.hr_per_bbe||(r.hr_allowed&&r.bbe_allowed?r.hr_allowed/r.bbe_allowed:null)
              return {
                _key: pt || String(i),
                pitch: PITCH_NAMES[pt] || pt || '—',
                use: r.usage_pct ?? null,
                bbe: r.bbe_allowed ?? null,
                hr: r.hr_allowed ?? null,
                hrBbe: hrPBBE != null ? hrPBBE * 100 : null,
                ev: r.avg_ev_allowed || null,
                hh: r.hard_hit_rate_allowed != null ? r.hard_hit_rate_allowed * 100 : null,
                brl: r.barrel_rate_allowed != null ? r.barrel_rate_allowed * 100 : null,
              }
            })}
            columns={[
              { key:'pitch', label:'Pitch',   heat:false, w:96, bold:true, sticky:true },
              { key:'use',   label:'Use%',    w:50, dp:0 },
              { key:'bbe',   label:'BBE',     w:44, title:'Balls in play allowed against this pitch' },
              { key:'hr',    label:'HR',      w:40 },
              { key:'hrBbe', label:'HR/BBE%', w:58, dp:1 },
              { key:'ev',    label:'EV',      w:46, dp:1 },
              { key:'hh',    label:'HH%',     w:46, dp:0 },
              { key:'brl',   label:'Brl%',    w:48, dp:1 },
            ]}
            initialSort="use"
            maxHeight={280}
            caption="Sortable. Bright is good for the hitter — these are the pitches that get hurt. A high HR/BBE on four balls in play is one swing, so sort by BBE before you trust the rate columns."
          />
        </div>
      )}

      <div style={{fontSize:9,color:'#52525b',marginTop:8,fontFamily:NUM_FONT}}>
        Brightness is magnitude and bright is always good for the hitter — same ramp as every other board, so a dark cell is a low number, not a warning. ★ = today's pitcher throws this · Toggle LHB/RHB to see pitcher splits vs hand
      </div>
    </div>
  )
}
