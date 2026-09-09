'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { n, clean, nameOf, teamOf, oppOf, hrScore, playerId } from '../lib/player'
import { tone, alpha } from '../lib/scales'

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
        // ── THE NUMBER THAT RANKS IS NOW THE NUMBER THAT PRINTS ────────
        //
        // This card RANKED by `blend` and PRINTED `score`, so the order and
        // the number on screen could disagree outright: a partner with two
        // co-HR days could sit above one with a higher board score, and the
        // card gave you no way to see why — it just looked out of order.
        // "Do not sort by a number you do not draw" is Donovan's rule and
        // this was the clearest breach of it on the site.
        //
        // The terms are kept rather than collapsed, so the card can show its
        // own arithmetic instead of asking you to trust it.
        const tBoard = 0.6 * score
        const tHist = 0.3 * Math.min(30, (h?.count || 0) * 8)
        const tPast = h?.sameGame ? 4 : 0
        const tStack = sameGame ? -6 : 0
        const blend = tBoard + tHist + tPast + tStack
        const terms = { board: tBoard, hist: tHist, past: tPast, stack: tStack }
        const reasons = []
        if (h?.count >= 2) reasons.push(`co-homered ${h.count}× this season${h.last ? ` (last ${h.last.slice(5)})` : ''}`)
        else if (h?.count === 1) reasons.push('co-homered once this season')
        if (score >= 60) reasons.push(`strong board tonight (${score.toFixed(0)})`)
        else if (score >= 45) reasons.push(`live board tonight (${score.toFixed(0)})`)
        if (String(p?.game_pick_role || '').trim()) reasons.push(`bot's ${String(p.game_pick_role).split('/')[0]} pick`)
        if (sameGame) reasons.push('⚠ same game — you win big together or lose together')
        if (!reasons.length) reasons.push('pure tonight play — no history, board carries it')
        return { p, blend, score, terms, h, sameGame, reasons }
      })
      .sort((a, b) => b.blend - a.blend)
      .slice(0, 3)
  }, [anchor, players, historyFor])

  // The bar under each card is drawn RELATIVE TO THE LEADER, not against an
  // implied 100. Fit tops out near 70, so a 100-wide bar would make every
  // partner look thin and would quietly assert a ceiling the number does not
  // have. The best fit fills the bar; the others are read against it.
  const topFit = suggestions.length ? Math.max(...suggestions.map((x) => x.blend), 1) : 1

  const q = query.toLowerCase().trim()
  const matches = useMemo(() => (
    q ? players.filter((p) => `${nameOf(p)} ${teamOf(p)}`.toLowerCase().includes(q)).slice(0, 8) : []
  ), [players, q])

  return (
    <div style={{
      background: `linear-gradient(155deg, ${C.bg2}, ${alpha(tone('cyan'), 0.03)})`,
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
            {suggestions.map(({ p, blend, score, terms, reasons }, i) => (
              <div key={playerId(p)} onClick={() => onPlayerClick?.(p)} style={{
                flex: '1 1 220px', minWidth: 0, cursor: 'pointer',
                background: C.bg2, border: `1px solid ${i === 0 ? alpha(tone('cyan'), 0.5) : C.border}`,
                borderTop: `2px solid ${i === 0 ? tone('cyan') : C.border2}`,
                borderRadius: 10, padding: '8px 12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  {i === 0 && <span style={{ fontSize: 10 }}>🥇</span>}
                  <span style={{ fontSize: 12, fontWeight: 800 }}>{nameOf(p)}</span>
                  {/* FIT is the ranking number, so FIT is the big one. The
                      board score stays on the line below — it is a term in
                      the fit, not a competitor to it. */}
                  <span
                    title={`Fit ${blend.toFixed(1)} = 60% of his board score (${terms.board.toFixed(1)}) + co-HR history (${terms.hist.toFixed(1)})${terms.past ? ` + past same-game pair (${terms.past.toFixed(1)})` : ''}${terms.stack ? ` − same game tonight (${Math.abs(terms.stack).toFixed(1)})` : ''}. Runs to about 70, not 100 — it orders partners, it is not a score out of anything.`}
                    style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 900, fontFamily: NUM_FONT, color: tone('cyan') }}
                  >{blend.toFixed(1)}</span>
                </div>
                <div style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT, marginTop: 1, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span>{teamOf(p)} vs {oppOf(p)}</span>
                  <span>· board {score.toFixed(0)}</span>
                </div>
                {/* The fit, drawn. Three bars in the order the formula adds
                    them, on the widest fit in this set — so you can see WHICH
                    term is carrying a partner without reading the tooltip. */}
                <div style={{ display: 'flex', height: 3, borderRadius: 2, overflow: 'hidden', marginTop: 5, background: C.bg3 }}>
                  <span style={{ width: `${(100 * Math.max(0, terms.board)) / topFit}%`, background: tone('cyan'), opacity: 0.85 }} />
                  <span style={{ width: `${(100 * Math.max(0, terms.hist + terms.past)) / topFit}%`, background: tone('purple'), opacity: 0.85 }} />
                  <span style={{ width: `${(100 * Math.abs(Math.min(0, terms.stack))) / topFit}%`, background: C.orange, opacity: 0.7 }} />
                </div>
                <div style={{ fontSize: 9.5, color: C.text2, lineHeight: 1.55, marginTop: 4 }}>
                  {reasons.map((r, ri) => <div key={ri}>· {r}</div>)}
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 9, color: C.text3, marginTop: 8, lineHeight: 1.5 }}>
            The number on each card is the <b style={{ color: C.text2 }}>fit</b> — the one that
            ordered them. The bar under it splits that fit into its terms:{' '}
            <span style={{ color: tone('cyan') }}>board</span>,{' '}
            <span style={{ color: tone('purple') }}>history</span>,{' '}
            <span style={{ color: C.orange }}>same-game penalty</span>. Fit runs to about 70, not
            100 — it orders partners, it is not a score out of anything.{' '}
            Blend leans tonight-over-history on purpose: a few co-HR days across a season is a story,
            tonight&apos;s matchup is the bet. Same-game partners are flagged, not hidden — correlated
            risk should be a choice you make, never a default you discover.
          </div>
        </div>
      )}
    </div>
  )
}
