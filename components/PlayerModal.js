'use client'
import { useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import {
  nameOf, teamOf, oppOf, n, clean, pct, sc,
  hrScore, hitScore, prodScore, tbScore, pitchMixScore,
  recent375, recent400, recent350, ihrVal,
  avgEV, maxEV, hardHitRate, barrelRate, launchAngle,
  babipVal, pitcherBabipVal, avgVsRHP, avgVsLHP,
} from '../lib/player'
import { compactRole, roleColor, gradeFor, signalPills, bestBet } from '../lib/scoring'
import { Chip } from './ui'
import EVLog from './tabs/EVLog'
import PitchBreakdown from './tabs/PitchBreakdown'
import SprayChart from './SprayChart'
import HotZoneMap from './HotZoneMap'

function Row({ label, value, mono = true }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 11, color: C.text3 }}>{label}</span>
      <span style={{ fontSize: 12, color: C.text, fontFamily: mono ? NUM_FONT : 'inherit', fontWeight: 600 }}>{value}</span>
    </div>
  )
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 13px', fontSize: 11, fontWeight: 700, cursor: 'pointer', borderRadius: 999,
      border: `1px solid ${active ? C.orange : C.border}`,
      background: active ? `${C.orange}22` : 'transparent',
      color: active ? C.orange : C.text3,
      whiteSpace: 'nowrap',
    }}>{children}</button>
  )
}

const BBE_RANGES = [10, 15, 25, 40, 50]

function RangeToggle({ value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, whiteSpace: 'nowrap' }}>Last</span>
      <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: `1px solid ${C.border}` }}>
        {BBE_RANGES.map(n => (
          <button key={n} onClick={() => onChange(n)} style={{
            padding: '3px 7px', fontSize: 10, fontWeight: 600, cursor: 'pointer', border: 'none',
            background: value === n ? C.orange : 'transparent',
            color: value === n ? '#fff' : C.text3,
          }}>{n}BBE</button>
        ))}
      </div>
    </div>
  )
}

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'ev',       label: '⚡ EV Log' },
  { key: 'pitch',    label: '🎯 Pitch + 🗺 Spray' },
  { key: 'zones',    label: '🔥 Hot Zones' },
]

export default function PlayerModal({ player, onClose }) {
  const [tab, setTab]             = useState('overview')
  const [bbeRange, setBbeRange] = useState(25)

  if (!player) return null
  const p = player

  const role = compactRole(p)
  const rc = roleColor(role, C)
  const pills = signalPills(p, C, 'hr')
  const b = babipVal(p), pb = pitcherBabipVal(p)
  const weakSide = clean(p?.pitcher_weak_side || p?.weak_side, '')
  const batsHand = clean(p?.bats || p?.handedness, '')
  const matchesWeak = weakSide && batsHand && (
    (weakSide === 'LHB' && batsHand === 'L') ||
    (weakSide === 'RHB' && batsHand === 'R')
  )
  const weakLabel = weakSide
    ? `Weak vs ${weakSide}`
    : p?.pitcher_throws ? (p.pitcher_throws === 'R' ? 'RHP' : 'LHP') : '—'

  // Documented batter-vs-pitch exploit found by the model (pitch_type_match_score > 0).
  // Backtested separator: HR_PICKS with this flag hit 23.9% vs 9.5% without it
  // across 22 days / 241 picks -- the single largest gap found in that analysis.
  const hasMatchupEdge = n(p?.pitch_type_match_score, 0) > 0

  const wideTab = tab !== 'overview'
  const modalWidth = tab === 'pitch' ? 1180 : wideTab ? 900 : 480

  return (
    <div
      onClick={onClose}
      className="modal-backdrop"
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="modal-box"
        style={{
          background: C.bg2, border: `1px solid ${C.border2}`, borderRadius: 18,
          width: modalWidth, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto',
          transition: 'width .15s',
        }}
      >
        <div className="modal-content" style={{ padding: '18px 20px 22px' }}>

          {/* header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 19, fontWeight: 900 }}>{nameOf(p)}</div>
              <div style={{ fontSize: 11, color: C.text3, fontFamily: NUM_FONT, marginTop: 3 }}>
                {teamOf(p)} vs {oppOf(p)} · Lineup #{clean(p?.lineup_spot, '?')} · {clean(p?.handedness || p?.bats, '?')}HB
                {p?.pitcher_name && <span> · vs {p.pitcher_name} ({p.pitcher_throws}HP)</span>}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.text3, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>✕</button>
          </div>

          {/* chips */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            <Chip color={rc}>{role}</Chip>
            <Chip color={C.text2}>{bestBet(p, 'hr')}</Chip>
            <Chip color={C.text2}>Grade {gradeFor(p, 'hr')}</Chip>
            {hasMatchupEdge && <Chip color={C.orange}>🎯 Matchup Edge</Chip>}
            {pills.map((x, i) => <Chip key={i} color={x.color}>{x.label}</Chip>)}
          </div>

          {/* tab bar + range toggle */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            gap: 8, marginBottom: 16, borderBottom: `1px solid ${C.border}`, paddingBottom: 10,
            flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {TABS.map(t => (
                <TabBtn key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>{t.label}</TabBtn>
              ))}
            </div>
            {tab !== 'overview' && (
              <RangeToggle value={bbeRange} onChange={setBbeRange} />
            )}
          </div>

          {/* overview */}
          {tab === 'overview' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 10, color: C.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .5, padding: '8px 0 4px' }}>Model Scores</div>
                  <Row label="HR Score"  value={hrScore(p).toFixed(1)} />
                  <Row label="HRR Score" value={prodScore(p).toFixed(1)} />
                  <Row label="Hit Score" value={hitScore(p).toFixed(1)} />
                  <Row label="TB Score"  value={tbScore(p).toFixed(1)} />
                  <Row label="Pitch Mix" value={pitchMixScore(p).toFixed(1)} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .5, padding: '8px 0 4px' }}>Batted Ball</div>
                  <Row label="Avg EV"       value={avgEV(p) ? avgEV(p).toFixed(1) + ' mph' : '—'} />
                  <Row label="Max EV"       value={maxEV(p) ? maxEV(p).toFixed(1) + ' mph' : '—'} />
                  <Row label="Barrel %"     value={pct(barrelRate(p))} />
                  <Row label="Hard Hit %"   value={pct(hardHitRate(p))} />
                  <Row label="Launch Angle" value={launchAngle(p) ? launchAngle(p).toFixed(1) + '°' : '—'} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .5, padding: '14px 0 4px' }}>Recent Distance</div>
                  <Row label="350+ count" value={recent350(p)} />
                  <Row label="375+ count" value={recent375(p)} />
                  <Row label="400+ count" value={recent400(p)} />
                  <Row label="Ideal HR %" value={ihrVal(p) ? (ihrVal(p) * 100).toFixed(1) + '%' : '—'} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .5, padding: '14px 0 4px' }}>Season</div>
                  <Row label="AVG"    value={clean(p?.season_avg, '—')} />
                  <Row label="HR"     value={clean(p?.season_hr, '—')} />
                  <Row label="PA"     value={clean(p?.season_pa || p?.pa, '—')} />
                  <Row label="K Rate" value={pct(p?.season_k_rate)} />
                  {b > 0 && <Row label="BABIP" value={b.toFixed(3)} />}
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .5, padding: '14px 0 4px' }}>Splits</div>
                  {avgVsRHP(p) > 0 && <Row label="vs RHP" value={avgVsRHP(p).toFixed(3)} />}
                  {avgVsLHP(p) > 0 && <Row label="vs LHP" value={avgVsLHP(p).toFixed(3)} />}
                  <Row label="L5 Hits" value={n(p?.last5_hits, 0)} />
                  <Row label="L5 HR"   value={n(p?.last5_hr, 0)} />
                  <Row label="L5 XBH"  value={n(p?.last5_xbh, 0)} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .5, padding: '14px 0 4px' }}>Opposing Pitcher</div>
                  <Row label="Name"   value={clean(p?.pitcher_name, '—')} mono={false} />
                  <Row label="Throws" value={clean(p?.pitcher_throws, '—')} />
                  <Row label="HR/9"   value={sc(p?.pitcher_hr9)} />
                  <Row label="WHIP"   value={sc(p?.pitcher_whip)} />
                  {weakSide && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: 11, color: C.text3 }}>Weak Side</span>
                      <span style={{ fontSize: 12, fontWeight: 700, fontFamily: NUM_FONT, color: matchesWeak ? C.orange : C.text }}>
                        {weakLabel}{matchesWeak ? ' ✓' : ''}
                      </span>
                    </div>
                  )}
                  {pb > 0 && <Row label="P-BABIP" value={pb.toFixed(3)} />}
                </div>
              </div>
              {clean(p?.note || p?.summary, '') !== '—' && clean(p?.note || p?.summary, '') !== '' && (
                <div style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, fontSize: 12, color: C.text2, lineHeight: 1.5 }}>
                  {clean(p?.note || p?.summary)}
                </div>
              )}
            </>
          )}

          {/* ev log */}
          {tab === 'ev' && <EVLog player={p} bbeRange={bbeRange} />}

          {/* pitch breakdown + spray chart, side by side */}
          {tab === 'pitch' && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 20,
              alignItems: 'start',
            }}
              className="pitch-spray-grid"
            >
              <div style={{ minWidth: 0 }}>
                <PitchBreakdown player={p} />
              </div>
              <div style={{ minWidth: 0 }}>
                <SprayChart players={[p]} embedded={true} bbeRange={bbeRange} />
              </div>
            </div>
          )}

          {/* hot zone map */}
          {tab === 'zones' && (
            <HotZoneMap
              player={p}
              onClose={null}
            />
          )}

        </div>
      </div>
    </div>
  )
}
