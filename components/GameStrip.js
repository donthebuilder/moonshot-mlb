'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { nn, hrScore, prodScore } from '../lib/player'
import { med } from './SlateGlance'

// Game selector strip — the PropFinder pattern.
//
// The pill bar this replaces told you a matchup existed and nothing else, so
// picking a game meant opening several to find the live one. A card carries
// the numbers that decide it: first pitch, Game Score against the slate
// median, how much of the lineup is in a hot window, weak spots, park.
//
// First-pitch order, always. You read a slate chronologically -- re-ranking by
// strength makes you hunt for the 7:05 game you're about to bet.

const playerScore = (p) => med([
  hrScore(p), prodScore(p), nn(p?.hrw_score), nn(p?.damage_conversion_score),
])

function timeText(t) {
  if (!t) return 'TBD'
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return 'TBD'
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

const isPast = (t) => !!t && new Date(t) < new Date(Date.now() - 3 * 60 * 60 * 1000)

export default function GameStrip({ games, activeGame, onSelect }) {
  const cards = useMemo(() => {
    const built = games.map((g) => {
      const gp = g.players || []
      const head = gp.reduce((a, b) => (hrScore(b) > hrScore(a) ? b : a), gp[0] || {})
      return {
        pk: g.game_pk,
        matchup: `${g.away || '—'} @ ${g.home || '—'}`,
        time: timeText(g.game_time),
        past: isPast(g.game_time),
        confirmed: !!g.lineup_confirmed,
        gs: med(gp.map(playerScore)),
        hrw: med(gp.map((x) => nn(x?.hrw_score))),
        weak: gp.filter((x) => x?.weak_spot_flag).length,
        venue: head?.venue_name || '',
        batters: gp.length,
      }
    })
    const slateMed = med(built.map((c) => c.gs))
    return built.map((c) => ({ ...c, edge: c.gs >= slateMed ? '▲' : '▽' }))
  }, [games])

  if (!cards.length) return null

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        display: 'grid', gap: 8,
        gridTemplateColumns: 'repeat(auto-fill, minmax(158px, 1fr))',
      }}>
        {cards.map((c) => {
          const on = activeGame === c.pk
          return (
            <button
              key={c.pk}
              onClick={() => onSelect(c.pk)}
              style={{
                textAlign: 'left', cursor: 'pointer', padding: '8px 10px 7px',
                borderRadius: 12, minWidth: 0,
                border: `1px solid ${on ? C.orange : C.border}`,
                background: on ? 'rgba(249,115,22,0.09)' : C.bg2,
                boxShadow: on ? `0 0 22px -9px ${C.orange}` : 'none',
                opacity: c.past && !on ? 0.45 : 1,
                transition: 'border-color .12s, background .12s',
              }}
            >
              <div style={{
                fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em',
                color: on ? C.orange : C.text3, fontWeight: 700,
                display: 'flex', gap: 5, alignItems: 'center',
              }}>
                <span>{c.confirmed ? '✓' : '◻'}</span>
                <span style={{ fontFamily: NUM_FONT }}>{c.time}</span>
                {c.weak > 0 && <span style={{ marginLeft: 'auto', color: C.yellow }}>★{c.weak}</span>}
              </div>

              <div style={{
                fontFamily: NUM_FONT, fontSize: 14, fontWeight: 800, marginTop: 3,
                letterSpacing: '-.02em', color: on ? C.text : C.text2,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                textDecoration: c.past ? 'line-through' : 'none',
              }}>{c.matchup}</div>

              <div style={{
                fontFamily: NUM_FONT, fontSize: 10, color: C.text2, marginTop: 3,
              }}>
                GS {c.gs.toFixed(1)}{' '}
                <span style={{ color: c.edge === '▲' ? C.orange : C.text3 }}>{c.edge}</span>
                {'  ·  '}HRW {c.hrw.toFixed(0)}
              </div>

              <div style={{
                fontSize: 9, color: C.text3, marginTop: 2,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{c.venue || `${c.batters} hitters`}</div>
            </button>
          )
        })}
      </div>

      <div style={{ fontSize: 9.5, color: C.text3, marginTop: 7 }}>
        First-pitch order. <strong style={{ color: C.text2 }}>GS</strong> is the median of every
        hitter&apos;s four board scores, then the median of those across the lineup — so it answers
        &ldquo;is this whole lineup dangerous&rdquo;, not &ldquo;is there one guy here&rdquo;.
        ▲/▽ is against the slate&apos;s own median. ★ counts weak lineup spots.
      </div>
    </div>
  )
}
