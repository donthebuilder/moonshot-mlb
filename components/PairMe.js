'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { n, clean, nameOf, teamOf, oppOf, hrScore, playerId } from '../lib/player'

// 🤝 PAIR ME — the answer to the question Donovan gets constantly:
// "can you help me pair?" (2026-08-08). Pick ONE hitter; the site hands
// back three partners, each with its reason written out. No new math —
// this is a guided read of things the site already knows:
//   history   they've co-homered before (pair_history_summary)
//   tonight   the partner's own board strength right now
//   stack     same-game pairs live or die together — flagged, not hidden
// The blend leans toward tonight over history on purpose: a handful of
// co-HR days across a season is a story, tonight's matchup is a bet.

const norm = (full) => String(full || '').toLowerCase().replace(/[^a-z]/g, '')

export default function PairMe({ players = [], pairHistorySummary, onPlayerClick }) {
  const [anchorId, setAnchorId] = useState(null)
  const [query, setQuery] = useState('')

  const anchor = players.find((p) => String(playerId(p)) === String(anchorId)) || null

  // co-HR history lookup: partner name → {count, lastDate, sameGame}
  const historyFor = useMemo(() => {
    if (!anchor) return new Map()
    const me = norm(nameOf(anchor))
    const m = new Map()
    ;(pairHistorySummary?.top_pairs || []).forEach((pr) => {
      const names = [pr?.player_1, pr?.player_2].map(norm)
      const idx = names.indexOf(me)
      if (idx === -1) return
      const other = idx === 0 ? pr?.player_2 : pr?.player_1
      m.set(norm(other), {
        count: n(pr?.repeat_count, 0),
        last: clean(pr?.last_hit_date, ''),
        sameGame: !!pr?.same_game_flag,
      })
    })
    return m
  }, [anchor, pairHistorySummary])

  const suggestions = useMemo(() => {
    if (!anchor) return []
    const aId = String(playerId(anchor))
    return players
      .filter((p) => String(playerId(p)) !== aId)
      .map((p) => {
        const h = historyFor.get(norm(nameOf(p)))
        const sameGame = p?.game_pk && anchor?.game_pk && Number(p.game_pk) === Number(anchor.game_pk)
        const score = hrScore(p)
        // tonight-first blend: board strength 60%, history 30%, small
        // same-game penalty (correlated risk is a choice, not a default)
        const blend = 0.6 * score
          + 0.3 * Math.min(30, (h?.count || 0) * 8)
          + (h?.sameGame ? 4 : 0)
          - (sameGame ? 6 : 0)
        const reasons = []
        if (h?.count >= 2) reasons.push(`co-homered ${h.count}× this season${h.last ? ` (last ${h.last.slice(5)})` : ''}`)
        else if (h?.count === 1) reasons.push('co-homered once this season')
        if (score >= 60) reasons.push(`strong board tonight (${score.toFixed(0)})`)
        else if (score >= 45) reasons.push(`live board tonight (${score.toFixed(0)})`)
        if (String(p?.game_pick_role || '').trim()) reasons.push(`bot's ${String(p.game_pick_role).split('/')[0]} pick`)
        if (sameGame) reasons.push('⚠ same game — you win big together or lose together')
        if (!reasons.length) reasons.push('pure tonight play — no history, board carries it')
        return { p, blend, score, h, sameGame, reasons }
      })
      .sort((a, b) => b.blend - a.blend)
      .slice(0, 3)
  }, [anchor, players, historyFor])

  const q = query.toLowerCase().trim()
  const matches = useMemo(() => (
    q ? players.filter((p) => `${nameOf(p)} ${teamOf(p)}`.toLowerCase().includes(q)).slice(0, 8) : []
  ), [players, q])

  return (
    <div style={{
      background: `linear-gradient(155deg, ${C.bg2}, rgba(34,211,238,.03))`,
      border: `1px solid ${C.border}`, borderRadius: 12, padding: '11px 14px', marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 900 }}>🤝 Pair me</span>
        <span style={{ fontSize: 9.5, color: C.text3 }}>
          pick one hitter — get three partners with the reasons written out
        </span>
      </div>

      {!anchor ? (
        <div style={{ marginTop: 8 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Who's your guy tonight?"
            style={{
              background: C.bg3, border: `1px solid ${C.border2}`, color: C.text, borderRadius: 999,
              padding: '7px 14px', fontSize: 12, outline: 'none', width: '100%', maxWidth: 300,
              boxSizing: 'border-box',
            }}
          />
          {matches.length > 0 && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 7 }}>
              {matches.map((p) => (
                <button key={playerId(p)} onClick={() => { setAnchorId(playerId(p)); setQuery('') }} style={{
                  display: 'flex', gap: 6, alignItems: 'baseline', cursor: 'pointer',
                  border: `1px solid ${C.border2}`, background: 'transparent', borderRadius: 8, padding: '4px 10px',
                }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: C.text }}>{nameOf(p)}</span>
                  <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>{teamOf(p)} · {hrScore(p).toFixed(0)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: C.orange }}>{nameOf(anchor)}</span>
            <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
              {teamOf(anchor)} vs {oppOf(anchor)} · board {hrScore(anchor).toFixed(0)}
            </span>
            <button onClick={() => setAnchorId(null)} style={{
              fontSize: 9.5, fontWeight: 700, cursor: 'pointer', color: C.text3,
              background: 'transparent', border: `1px dashed ${C.border2}`, borderRadius: 6, padding: '2px 8px',
            }}>× different guy</button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {suggestions.map(({ p, score, reasons }, i) => (
              <div key={playerId(p)} onClick={() => onPlayerClick?.(p)} style={{
                flex: '1 1 220px', minWidth: 0, cursor: 'pointer',
                background: C.bg2, border: `1px solid ${i === 0 ? 'rgba(34,211,238,.5)' : C.border}`,
                borderTop: `2px solid ${i === 0 ? '#22d3ee' : C.border2}`,
                borderRadius: 10, padding: '8px 12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  {i === 0 && <span style={{ fontSize: 10 }}>🥇</span>}
                  <span style={{ fontSize: 12, fontWeight: 800 }}>{nameOf(p)}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 900, fontFamily: NUM_FONT, color: '#22d3ee' }}>{score.toFixed(0)}</span>
                </div>
                <div style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT, marginTop: 1 }}>
                  {teamOf(p)} vs {oppOf(p)}
                </div>
                <div style={{ fontSize: 9.5, color: C.text2, lineHeight: 1.55, marginTop: 4 }}>
                  {reasons.map((r, ri) => <div key={ri}>· {r}</div>)}
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 9, color: C.text3, marginTop: 8, lineHeight: 1.5 }}>
            Blend leans tonight-over-history on purpose: a few co-HR days across a season is a story,
            tonight&apos;s matchup is the bet. Same-game partners are flagged, not hidden — correlated
            risk should be a choice you make, never a default you discover.
          </div>
        </div>
      )}
    </div>
  )
}
