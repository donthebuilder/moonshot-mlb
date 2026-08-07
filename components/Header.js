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

  // PREGAME: before the first homer lands anywhere, this pill used to read
  // "0.0%" in red with "0/0 HR" beside it — a failing grade for a test that
  // hasn't started. 0-for-0 is not a rate. Until there's a homer to capture,
  // show a calm neutral "tracking" state instead of a score, and style it to
  // match the tile family (gradient + border) rather than the old flat chip.
  if (total === 0) {
    const col = '#38bdf8'
    return (
      <div
        title="Live HR capture — how many of tonight's home runs were on the sheet. Starts scoring when the first homer lands."
        style={{
          display:'flex', alignItems:'center', gap:8,
          padding:'5px 13px', borderRadius:9,
          background:`linear-gradient(135deg, ${col}18, ${col}06)`,
          border:`1px solid ${col}40`,
        }}
      >
        <div style={{ width:6, height:6, borderRadius:'50%', background:col, animation:'pulse 2s infinite' }} />
        <div style={{ display:'flex', flexDirection:'column', lineHeight:1.15 }}>
          <span style={{ fontSize:8.5, color:C.text3, textTransform:'uppercase', letterSpacing:'.09em', fontWeight:800 }}>HR capture</span>
          <span style={{ fontFamily:NUM_FONT, fontSize:11, fontWeight:800, color:col }}>tracking…</span>
        </div>
      </div>
    )
  }

  // The PILL is blue — its slot in the strip's fixed colour order — while the
  // percentage inside keeps its performance colour, so "how are we doing" is
  // still answered by the number without the whole strip changing shape by
  // score.
  const col = '#38bdf8'
  const scoreCol = pct >= 70 ? '#4ade80' : pct >= 50 ? '#f59e0b' : '#f87171'
  return (
    <div
      title={`${caught} of the slate's ${total} home runs were on the sheet tonight.`}
      style={{
        display:'flex', alignItems:'center', gap:8,
        padding:'5px 13px', borderRadius:9,
        background:`linear-gradient(135deg, ${col}1e, ${col}08)`,
        border:`1px solid ${col}4d`,
        boxShadow:`0 0 16px ${col}14`,
      }}
    >
      <div style={{ width:6, height:6, borderRadius:'50%', background:col, animation:'pulse 2s infinite' }} />
      <div style={{ display:'flex', flexDirection:'column', lineHeight:1.15 }}>
        <span style={{ fontSize:8.5, color:C.text3, textTransform:'uppercase', letterSpacing:'.09em', fontWeight:800 }}>HR capture</span>
        <span style={{ display:'flex', alignItems:'baseline', gap:5 }}>
          <span style={{ fontFamily:NUM_FONT, fontSize:14, fontWeight:900, color:scoreCol }}>{pct.toFixed(0)}%</span>
          <span style={{ fontSize:9, color:C.text3, fontFamily:NUM_FONT }}>{caught}/{total}</span>
        </span>
      </div>
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
        // THE OLD PATTERNS NEVER MATCHED, so this pill has never once rendered.
        // They looked for "Model Projected HRs: 36-45" and "Slate Power Grade:
        // Strong" — colons, capitals, the word "Model". What the bot actually
        // writes in today.txt is:
        //
        //     projected HRs 36–45 · power grade Strong
        //     top HR profiles 117 · weak pitcher spots 14
        //
        // No colons, lower case, en-dash. Matched loosely now, with the old
        // wording kept as an alternative in case the bot's format moves back.
        const range = text.match(/projected\s+HRs?\s*[:\s]\s*(\d+)\s*[–—-]\s*(\d+)/i)
        const grade = text.match(/power\s+grade\s*[:\s]\s*([A-Za-z ]+)/i)
        const profiles = text.match(/top\s+HR\s+profiles\s*[:\s]\s*(\d+)/i)
        const weakSpots = text.match(/weak\s+pitcher\s+spots\s*[:\s]\s*(\d+)/i)
        if (!cancelled && range) {
          setProjection({
            low: Number(range[1]),
            high: Number(range[2]),
            grade: (grade?.[1] || '').trim(),
            profiles: profiles ? Number(profiles[1]) : null,
            weakSpots: weakSpots ? Number(weakSpots[1]) : null,
          })
        }
      } catch {
        if (!cancelled) setProjection(null)
      }
    }
    load()
    return () => { cancelled = true }
  }, [mode])

  if (!projection) return null
  // ORANGE, always. The pill used to shift hue with the power grade, but the
  // strip now has a fixed colour order (blue-orange-blue-orange-gold-green)
  // and a grade-coloured pill broke it on medium/weak slates. The grade is
  // still in the tooltip.
  const col = '#f97316'

  return (
    <div
      title={`Bot's projection for this slate: ${projection.low}–${projection.high} home runs, power grade ${projection.grade || 'n/a'}${projection.profiles != null ? `. ${projection.profiles} hitters clear its top-HR profile` : ''}${projection.weakSpots != null ? `, ${projection.weakSpots} weak pitcher spots` : ''}.`}
      style={{
        display:'flex', alignItems:'center', gap:8,
        padding:'5px 13px', borderRadius:9,
        background:`linear-gradient(135deg, ${col}22, ${col}0a)`,
        border:`1px solid ${col}55`,
        boxShadow:`0 0 18px ${col}14`,
      }}
    >
      <span style={{ fontSize:12 }}>💣</span>
      <div style={{ display:'flex', flexDirection:'column', lineHeight:1.15 }}>
        <span style={{
          fontSize:8.5, color:C.text3, textTransform:'uppercase',
          letterSpacing:'.09em', fontWeight:800,
        }}>Projected</span>
        {/* One figure, the midpoint to a decimal. The bot publishes a range and
            that range is still in the tooltip — it's off the face because a
            strip this dense reads better with one number per pill, and the
            interval is a detail you want on demand rather than always. */}
        <span style={{ display:'flex', alignItems:'baseline', gap:5 }}>
          <span style={{ fontFamily:NUM_FONT, fontSize:14, fontWeight:900, color:col }}>
            {((projection.low + projection.high) / 2).toFixed(1)}
          </span>
          <span style={{ fontSize:9, color:C.text3, fontFamily:NUM_FONT }}>HR</span>
        </span>
      </div>
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
              {/* MOONSHOT · MLB (2026-08-07): the receipts card, the Discord
                  posts, and the URL all said MOONSHOT while the header still
                  wore the pre-migration Streamlit name. The sport tag stays
                  so an NFL sibling can slot in later as MOONSHOT · NFL. */}
              <span style={{ fontSize:18, fontWeight:900, letterSpacing:'-0.02em', background:'linear-gradient(90deg, #f97316, #ef4444)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>MOONSHOT</span>
              <span style={{ fontSize:11, fontWeight:700, color:C.text3, marginLeft:2, letterSpacing:'0.06em', textTransform:'uppercase', alignSelf:'center' }}>· MLB</span>
            </div>
            <div style={{ height:2, background:'linear-gradient(90deg, #f97316, transparent)', borderRadius:1, marginTop:1, width:80 }} />
          </div>
        </div>

        {/* The HR tracker plus the merged slate strip. Streamlit carried these
            tiles twice -- once at the top, once on Games -- overlapping on
            three of them. One row in the header, visible from every tab.
            ORDER AND HUES ARE FIXED, left to right:
              Games blue · Projected orange · HR tracking blue ·
              Best game orange · Weak gold · Lineups green
            The two pills that live in this file are threaded into SlateTiles
            as elements so the whole strip renders as one ordered row instead
            of two groups that wrap independently on narrow screens. */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'center',
          gap:6, flexWrap:'wrap', flex:'1 1 480px', minWidth:0,
        }}>
          <SlateTiles
            players={players}
            results={results}
            games={games}
            projected={<ProjectedHRStat mode={mode} />}
            capture={<CaptureStat results={results} />}
          />
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
