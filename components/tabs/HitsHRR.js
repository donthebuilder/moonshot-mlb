'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import BoardFilters, { useBoardFilter } from '../BoardFilters'
import { btnStyle } from '../ui'
import RankedBoard from './RankedBoard'
import PlayerCard from '../PlayerCard'
import HitterHeat from '../HitterHeat'
import { playerId } from '../../lib/player'

function WeakSpotSection({ players, onAdd, onWatch, watchIds, onPlayerClick }) {
  const ws = players
    .filter(p => p?.weak_spot_flag === true)
    .sort((a, b) => (b?.hr_score || 0) - (a?.hr_score || 0))

  if (!ws.length) return null

  return (
    <div style={{ marginBottom: 18 }}>
      {/* The cards below say who qualified. This says whether they qualified
          for the same reason -- a category where every name is carried by one
          column is a category worth distrusting. */}
      <HitterHeat
        players={ws}
        type="hr"
        title="Weak spot matchups"
        onPlayerClick={onPlayerClick}
      />
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 10,
        paddingBottom: 8,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <span style={{ fontSize: 16 }}>⭐</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>Weak Spot Matchups</span>
        <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{ws.length} players</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
        {ws.map(p => (
          <PlayerCard
            key={playerId(p)}
            p={p}
            type="hr"
            onAdd={onAdd}
            onWatch={onWatch}
            watched={watchIds?.has(playerId(p))}
            onClick={() => onPlayerClick?.(p)}
          />
        ))}
      </div>
    </div>
  )
}

function AlignedSignalsSection({ players, onAdd, onWatch, watchIds, onPlayerClick }) {
  const aligned = players
    .filter(p => (p?.top_board_tags || []).some(t => String(t).includes('🧩')))
    .sort((a, b) => (b?.hr_score || 0) - (a?.hr_score || 0))

  if (!aligned.length) return null

  return (
    <div style={{ marginBottom: 18 }}>
      {/* The cards below say who qualified. This says whether they qualified
          for the same reason -- a category where every name is carried by one
          column is a category worth distrusting. */}
      <HitterHeat
        players={aligned}
        type="hr"
        title="Aligned signals"
        onPlayerClick={onPlayerClick}
      />
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 10,
        paddingBottom: 8,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <span style={{ fontSize: 16 }}>🧩</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>Aligned Signals</span>
        <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{aligned.length} players</span>
      </div>
      <div style={{ fontSize: 10.5, color: C.text3, marginBottom: 10, lineHeight: 1.5 }}>
        Weak-spot lineup matchup, pitch-type match, and real recent contact quality all line up —
        the strongest validated signal combo found in backtesting.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
        {aligned.map(p => (
          <PlayerCard
            key={playerId(p)}
            p={p}
            type="hr"
            onAdd={onAdd}
            onWatch={onWatch}
            watched={watchIds?.has(playerId(p))}
            onClick={() => onPlayerClick?.(p)}
          />
        ))}
      </div>
    </div>
  )
}

function MatchupEdgeSection({ players, onAdd, onWatch, watchIds, onPlayerClick }) {
  const edge = players
    .filter(p => Number(p?.pitch_type_match_score || 0) > 0)
    .sort((a, b) => (b?.hr_score || 0) - (a?.hr_score || 0))

  if (!edge.length) return null

  return (
    <div style={{ marginBottom: 18 }}>
      {/* The cards below say who qualified. This says whether they qualified
          for the same reason -- a category where every name is carried by one
          column is a category worth distrusting. */}
      <HitterHeat
        players={edge}
        type="hr"
        title="Matchup edge"
        onPlayerClick={onPlayerClick}
      />
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 10,
        paddingBottom: 8,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <span style={{ fontSize: 16 }}>🎯</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>Matchup Edge</span>
        <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{edge.length} players</span>
      </div>
      <div style={{ fontSize: 10.5, color: C.text3, marginBottom: 10, lineHeight: 1.5 }}>
        Documented batter-vs-pitch exploit — backtested separator: players with this flag hit
        23.9% vs 9.5% without it.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
        {edge.map(p => (
          <PlayerCard
            key={playerId(p)}
            p={p}
            type="hr"
            onAdd={onAdd}
            onWatch={onWatch}
            watched={watchIds?.has(playerId(p))}
            onClick={() => onPlayerClick?.(p)}
          />
        ))}
      </div>
    </div>
  )
}

export default function HitsHRR({ players, onAdd, onWatch, watchIds, onPlayerClick }) {
  const [view, setView] = useState('hrr')
  const { filtered, state } = useBoardFilter(players)

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        background: C.bg2,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: 10,
        marginBottom: 14,
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 900 }}>Hits / HRR / Contact</div>
          <div style={{ fontSize: 10, color: C.text3, marginTop: 2 }}>
            Toggle between production looks, base-hit floors, and contact anchors.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => setView('hrr')}     style={btnStyle(C.cyan,   view === 'hrr')}>🏁 HRR</button>
          <button onClick={() => setView('hit')}     style={btnStyle(C.purple, view === 'hit')}>💠 Hits</button>
          <button onClick={() => setView('contact')} style={btnStyle(C.blue,   view === 'contact')}>⚾ Contact</button>
          <button onClick={() => setView('weakspot')} style={btnStyle(C.yellow, view === 'weakspot')}>⭐ Weak Spot</button>
          <button onClick={() => setView('aligned')} style={btnStyle(C.purple, view === 'aligned')}>🧩 Aligned</button>
          <button onClick={() => setView('matchupedge')} style={btnStyle(C.orange, view === 'matchupedge')}>🎯 Matchup Edge</button>
        </div>
      </div>

      {/* The three signal sections get the filter bar here. The hrr/hit/contact
          views delegate to RankedBoard, which carries its own — showing two
          filter bars stacked would be worse than either. */}
      {['weakspot', 'aligned', 'matchupedge'].includes(view) && (
        <BoardFilters state={state} total={players.length} shown={filtered.length} />
      )}

      {view === 'weakspot'
        ? <WeakSpotSection players={filtered} onAdd={onAdd} onWatch={onWatch} watchIds={watchIds} onPlayerClick={onPlayerClick} />
        : view === 'aligned'
        ? <AlignedSignalsSection players={filtered} onAdd={onAdd} onWatch={onWatch} watchIds={watchIds} onPlayerClick={onPlayerClick} />
        : view === 'matchupedge'
        ? <MatchupEdgeSection players={filtered} onAdd={onAdd} onWatch={onWatch} watchIds={watchIds} onPlayerClick={onPlayerClick} />
        : <RankedBoard players={players} type={view} onAdd={onAdd} onWatch={onWatch} watchIds={watchIds} onPlayerClick={onPlayerClick} />
      }
    </div>
  )
}
