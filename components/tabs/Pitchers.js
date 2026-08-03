'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { groupPitchers } from '../../lib/data'
import { PanelTitle, Empty, Chip, btnStyle } from '../ui'
import PitcherHeat from '../PitcherHeat'

const SORTS = [
  ['weak', 'Most Weak Spots'],
  ['hr9', 'Highest HR/9'],
  ['whip', 'Highest WHIP'],
  ['time', 'Game Time'],
]

function sortPitchers(pitchers, sortKey) {
  const list = [...pitchers]
  if (sortKey === 'weak') return list.sort((a, b) => b.weak_spot_count - a.weak_spot_count)
  if (sortKey === 'hr9') return list.sort((a, b) => (b.pitcher_hr9 ?? -1) - (a.pitcher_hr9 ?? -1))
  if (sortKey === 'whip') return list.sort((a, b) => (b.pitcher_whip ?? -1) - (a.pitcher_whip ?? -1))
  return list.sort((a, b) => new Date(a.game_time || 0) - new Date(b.game_time || 0))
}

function localTime(gameTime) {
  if (!gameTime) return '—'
  const d = new Date(gameTime)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}

// Same plain-stat-bar look used by Games.js's bot-view player rows, scaled
// down for HR/9 and WHIP since those don't run 0-100 like the hr/hrr scores.
function StatBar({ label, value, max, color }) {
  const pct = value == null ? 0 : Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
      <span style={{ width: 34, fontSize: 9, color: C.text3, fontFamily: NUM_FONT, textTransform: 'uppercase' }}>{label}</span>
      <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <span style={{ width: 32, fontSize: 10, color: 'rgba(255,255,255,0.7)', fontFamily: NUM_FONT, textAlign: 'right' }}>
        {value == null ? '—' : value.toFixed(2)}
      </span>
    </div>
  )
}

function LineupRow({ b, onPlayerClick }) {
  return (
    <div
      onClick={() => onPlayerClick?.(b.raw)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px',
        cursor: onPlayerClick ? 'pointer' : 'default',
        borderRadius: 6,
      }}
    >
      <span style={{ width: 18, fontSize: 10, color: C.text3, fontFamily: NUM_FONT, textAlign: 'center', flexShrink: 0 }}>
        {b.lineup_spot ?? '?'}
      </span>
      <span style={{ fontSize: 12, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {b.name}
      </span>
      <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, flexShrink: 0 }}>{b.bats}HB</span>
      {!b.lineup_confirmed && (
        <span style={{ fontSize: 9, color: C.text3, flexShrink: 0 }}>(proj.)</span>
      )}
      {b.weak_spot_flag && (
        <span title="Weak pitcher spot" style={{ fontSize: 11, flexShrink: 0 }}>⭐</span>
      )}
      {b.pitch_type_match_score > 0 && (
        <span title="Matchup edge" style={{ fontSize: 11, flexShrink: 0 }}>🎯</span>
      )}
      <span style={{ fontSize: 11, fontWeight: 800, color: C.orange, fontFamily: NUM_FONT, width: 28, textAlign: 'right', flexShrink: 0 }}>
        {Math.round(b.hr_score)}
      </span>
    </div>
  )
}

function PitcherCard({ pitcher, isOpen, onToggle, onPlayerClick }) {
  const hasWeak = pitcher.weak_spot_count > 0
  return (
    <div style={{ background: C.bg2, border: `1px solid ${hasWeak ? '#f59e0b44' : C.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 8 }}>
      <div
        onClick={() => onToggle(pitcher.pitcher_id)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 14px', cursor: 'pointer', gap: 10, flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 10, color: C.text3, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s', display: 'inline-block', width: 10 }}>▸</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 800 }}>{pitcher.pitcher_name}</span>
              <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{pitcher.pitcher_throws}HP</span>
              {hasWeak && <Chip color="#f59e0b">⭐ {pitcher.weak_spot_count} weak spot{pitcher.weak_spot_count > 1 ? 's' : ''}</Chip>}
            </div>
            <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, marginTop: 2 }}>
              {pitcher.team} vs {pitcher.opponent_team} · {localTime(pitcher.game_time)}
              {pitcher.venue_name ? ` · ${pitcher.venue_name}` : ''}
              {' · '}{pitcher.lineup_confirmed ? 'Lineup confirmed' : 'Projected lineup'}
            </div>
          </div>
        </div>
        <div style={{ minWidth: 130, flexShrink: 0 }}>
          <StatBar label="ERA" value={pitcher.pitcher_era} max={6} color={C.cyan} />
          <StatBar label="HR/9" value={pitcher.pitcher_hr9} max={3} color={C.orange} />
          <StatBar label="WHIP" value={pitcher.pitcher_whip} max={2} color={C.purple} />
        </div>
      </div>

      {isOpen && (
        <div style={{ padding: '0 14px 12px', borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 9, color: C.text3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '10px 0 4px' }}>
            Opposing Lineup ({pitcher.lineup.length})
          </div>
          {pitcher.lineup.map((b) => (
            <LineupRow key={b.player_id ?? b.name} b={b} onPlayerClick={onPlayerClick} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function Pitchers({ players, onPlayerClick }) {
  const [sortKey, setSortKey] = useState('weak')
  const [openId, setOpenId] = useState(null)

  const pitchers = useMemo(() => groupPitchers(players), [players])
  const sorted = useMemo(() => sortPitchers(pitchers, sortKey), [pitchers, sortKey])

  if (!pitchers.length) return <Empty text="No pitcher data found yet." />

  return (
    <div>
      <PanelTitle
        title="Pitchers"
        sub={`${pitchers.length} starters today · click to see opposing lineup`}
        right={
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {SORTS.map(([key, label]) => (
              <button key={key} onClick={() => setSortKey(key)} style={btnStyle(C.orange, sortKey === key)}>
                {label}
              </button>
            ))}
          </div>
        }
      />
      {/* The card list below is one starter at a time. This is the slate:
          which arms are actually attackable, and on which axis. */}
      <PitcherHeat pitchers={sorted} onSelect={(e) => setOpenId(e?.pitcher_id ?? null)} />

      {sorted.map((pitcher) => (
        <PitcherCard
          key={pitcher.pitcher_id ?? pitcher.pitcher_name}
          pitcher={pitcher}
          isOpen={openId === pitcher.pitcher_id}
          onToggle={(id) => setOpenId((prev) => (prev === id ? null : id))}
          onPlayerClick={onPlayerClick}
        />
      ))}
    </div>
  )
}
