'use client'
import { useState, useEffect } from 'react'
import { C, NUM_FONT, TABS } from '../lib/theme'
import { logUrl } from '../lib/dataSource'
import SlateTiles from './SlateTiles'

// ── live capture ticker ───────────────────────────────────────────────────────

function CaptureStat({ results }) {
  if (!results?.hr_capture_report) return null
  const report = results.hr_capture_report
  const pct = Number(report.hr_capture_pct || 0)
  const caught = Number(report.caught_hrs_on_sheet || 0)
  const total = Number(report.total_hrs_on_slate || 0)
  const col = pct >= 70 ? '#4ade80' : pct >= 50 ? '#f59e0b' : '#f87171'
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:8,
      padding:'4px 12px', borderRadius:8,
      background:`${col}12`, border:`1px solid ${col}30`,
    }}>
      <div style={{ width:6, height:6, borderRadius:'50%', background:col, animation:'pulse 2s infinite' }} />
      <span style={{ fontFamily:NUM_FONT, fontSize:11, fontWeight:800, color:col }}>{pct.toFixed(1)}%</span>
      <span style={{ fontSize:10, color:C.text3, fontFamily:NUM_FONT }}>{caught}/{total} HR</span>
    </div>
  )
}

// ── projected HR total ────────────────────────────────────────────────────────

function ProjectedHRStat({ mode }) {
  const [projection, setProjection] = useState(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setProjection(null)
      try {
        const response = await fetch(`${logUrl(mode)}?ts=${Date.now()}`, { cache:'no-store' })
        if (!response.ok) return
        const text = await response.text()
        const range = text.match(/Model Projected HRs:\s*(\d+)\s*[–—-]\s*(\d+)/i)
        const grade = text.match(/Slate Power Grade:\s*([^|\n]+)/i)
        if (!cancelled && range) {
          setProjection({ low:Number(range[1]), high:Number(range[2]), grade:(grade?.[1] || '').trim() })
        }
      } catch {
        if (!cancelled) setProjection(null)
      }
    }
    load()
    return () => { cancelled = true }
  }, [mode])

  if (!projection) return null
  const col = projection.grade.toLowerCase().includes('strong') ? '#f97316'
    : projection.grade.toLowerCase().includes('medium') ? '#FCD34D'
    : '#a78bfa'

  return (
    <div style={{
      display:'flex', alignItems:'center', gap:7,
      padding:'4px 12px', borderRadius:8,
      background:`${col}10`, border:`1px solid ${col}30`,
    }} title={`${projection.grade || 'Model'} slate projection`}>
      <span style={{ fontSize:11 }}>💣</span>
      <span style={{ fontFamily:NUM_FONT, fontSize:11, fontWeight:800, color:col }}>{projection.low}–{projection.high}</span>
      <span style={{ fontSize:10, color:C.text3, fontFamily:NUM_FONT }}>projected HR</span>
    </div>
  )
}

// ── date display ──────────────────────────────────────────────────────────────

function DateBadge({ label }) {
  const [time, setTime] = useState('')
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }))
    tick()
    const id = setInterval(tick, 30000)
    return () => clearInterval(id)
  }, [])
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-start' }}>
      <span style={{ fontSize:11, color:C.text3, fontFamily:NUM_FONT, lineHeight:1 }}>{time}</span>
      <span style={{ fontSize:12, color:C.text2, fontFamily:NUM_FONT, fontWeight:700, lineHeight:1.3 }}>{label}</span>
    </div>
  )
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function Header({ tab, setTab, mode, setMode, dateLabel, results, players = [], games = [] }) {
  return (
    <header style={{
      position:'sticky', top:0, zIndex:50,
      background:'rgba(9,9,11,0.92)',
      backdropFilter:'blur(14px)',
      borderBottom:'1px solid rgba(255,255,255,0.07)',
    }}>
      <div style={{
        maxWidth:1300, margin:'0 auto',
        padding:'10px 16px 8px',
        display:'flex', alignItems:'center', justifyContent:'space-between', gap:12,
        flexWrap:'wrap',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{
            position:'relative', width:38, height:38, borderRadius:10, flexShrink:0,
            background:'linear-gradient(135deg, #f97316 0%, #ef4444 100%)',
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 0 18px rgba(249,115,22,0.35)',
          }}>
            <span style={{ fontSize:14, fontWeight:900, color:'#fff', letterSpacing:'-0.05em', fontFamily:NUM_FONT }}>HR</span>
            <div style={{
              position:'absolute', top:-2, right:-2,
              width:8, height:8, borderRadius:'50%',
              background:'#4ade80', border:'2px solid #09090b',
              animation:'pulse 2s infinite',
            }} />
          </div>

          <div>
            <div style={{ display:'flex', alignItems:'baseline', gap:4 }}>
              <span style={{ fontSize:18, fontWeight:900, letterSpacing:'-0.04em', color:C.text }}>MLB</span>
              <span style={{ fontSize:18, fontWeight:900, letterSpacing:'-0.04em', background:'linear-gradient(90deg, #f97316, #ef4444)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>HR</span>
              <span style={{ fontSize:11, fontWeight:700, color:C.text3, marginLeft:2, letterSpacing:'0.06em', textTransform:'uppercase', alignSelf:'center' }}>Dashboard</span>
            </div>
            <div style={{ height:2, background:'linear-gradient(90deg, #f97316, transparent)', borderRadius:1, marginTop:1, width:80 }} />
          </div>
        </div>

        {/* The HR tracker plus the merged slate strip. Streamlit carried these
            tiles twice -- once at the top, once on Games -- overlapping on
            three of them. One row in the header, visible from every tab. */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'center',
          gap:6, flexWrap:'wrap', flex:'1 1 480px', minWidth:0,
        }}>
          <ProjectedHRStat mode={mode} />
          <CaptureStat results={results} />
          <SlateTiles players={players} results={results} games={games} />
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <DateBadge label={dateLabel || 'Loading…'} />
          <div style={{ display:'flex', borderRadius:8, overflow:'hidden', border:`1px solid ${C.border}` }}>
            <button
              onClick={() => setMode('today')}
              style={{
                padding:'5px 12px', fontSize:11, fontWeight:700, cursor:'pointer', border:'none',
                background:mode === 'today' ? '#f97316' : 'transparent',
                color:mode === 'today' ? '#fff' : C.text3,
                transition:'all .12s',
              }}
            >Today</button>
            <button
              onClick={() => setMode('tomorrow')}
              style={{
                padding:'5px 12px', fontSize:11, fontWeight:700, cursor:'pointer', border:'none',
                borderLeft:`1px solid ${C.border}`,
                background:mode === 'tomorrow' ? '#22d3ee' : 'transparent',
                color:mode === 'tomorrow' ? '#09090b' : C.text3,
                transition:'all .12s',
              }}
            >Tmrw</button>
          </div>
        </div>
      </div>

      <div style={{
        maxWidth:1300, margin:'0 auto', padding:'0 16px',
        overflowX:'auto', scrollbarWidth:'none', WebkitOverflowScrolling:'touch',
      }}>
        <div style={{ display:'flex', gap:2, paddingBottom:0, minWidth:'max-content' }}>
          {TABS.map(([key,label]) => {
            const active = tab === key
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                style={{
                  padding:'8px 13px', fontSize:11, fontWeight:active ? 800 : 500,
                  cursor:'pointer', border:'none', borderRadius:0,
                  background:'transparent', color:active ? '#f97316' : C.text3,
                  position:'relative', transition:'color .12s', whiteSpace:'nowrap',
                }}
              >
                {label}
                {active && <div style={{
                  position:'absolute', bottom:0, left:0, right:0, height:2,
                  background:'linear-gradient(90deg, #f97316, #ef4444)',
                  borderRadius:'2px 2px 0 0',
                }} />}
              </button>
            )
          })}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        header div::-webkit-scrollbar { display: none; }
      `}</style>
    </header>
  )
}
