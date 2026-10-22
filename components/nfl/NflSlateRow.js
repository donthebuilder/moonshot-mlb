'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../../lib/nfl/theme'
import { slateTotals } from '../../lib/nfl/teamTdModel'
import { useGameNav } from '../../lib/teamNav'
import TeamMark from '../TeamMark'

// THE SLATE ROW (2026-10-22, Donovan on TUDDY's Home: "we got New England and first Chicago at the top of the page ... that could have
// all of whatever these are up there ... the slate total for each game"). Every game this week as one small tile -- both clubs'
// logos, the team model's expected touchdowns for the game (lib/nfl/teamTdModel slateTotals, the same number GAME TO CIRCLE uses),
// and the kickoff, or the score once it is on. The week's top total is lit. Sorted by kickoff; scrolls sideways in its own box;
// a tile opens its game. Small on purpose ("too large and square"): ~96 x 58.
export default function NflSlateRow({ week, logs = null }) {
  const openGame = useGameNav()
  const totals = useMemo(() => slateTotals(week, logs), [week, logs])
  const games = useMemo(() => [...(week?.games || [])].sort((a, b) => Date.parse(a.kickoff || '') - Date.parse(b.kickoff || '')), [week])
  const top = Math.max(0, ...games.map((g) => totals[g.game_id]?.total || 0))
  if (!games.length) return null
  const when = (g) => {
    if (g.state === 'in') return `${g.away_score}–${g.home_score} · live`
    if (g.completed || g.state === 'post') return `${g.away_score}–${g.home_score} · final`
    const t = Date.parse(g.kickoff || '')
    return Number.isFinite(t) ? new Date(t).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : ''
  }
  return (
    <section aria-label="This week's games, expected touchdowns">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '0 0 6px' }}>
        <span style={{ font: `900 10px/1 ${NUM_FONT}`, letterSpacing: '.12em', color: C.green }}>THE SLATE · EXPECTED TDS</span>
      </div>
      <div className="nfl-slate-row" style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 }}>
        {games.map((g) => {
          const tot = totals[g.game_id]?.total
          const lit = tot != null && tot === top && top > 0
          return (
            <button key={g.game_id} type="button" data-tile="game" onClick={() => openGame?.(g.game_id)} aria-label={`${g.away} at ${g.home}${tot != null ? `, ${tot.toFixed(1)} expected touchdowns` : ''}`}
              style={{ flex: '0 0 auto', minWidth: 92, padding: '7px 9px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', color: C.text,
                border: `1px solid ${lit ? C.green : C.border}`, background: lit ? `color-mix(in srgb, ${C.green} 8%, ${C.bg2})` : C.bg2, display: 'grid', gap: 3 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, font: `800 10px/1 ${NUM_FONT}`, color: C.text2 }}>
                <TeamMark sport="nfl" abbr={g.away} variant="logo" px={14} />@<TeamMark sport="nfl" abbr={g.home} variant="logo" px={14} />
                <b style={{ marginLeft: 'auto', font: `900 13px/1 ${NUM_FONT}`, color: lit ? C.green : C.text }}>{tot != null ? tot.toFixed(1) : '—'}</b>
              </span>
              <span style={{ font: `600 10px/1 ${NUM_FONT}`, color: C.text3, whiteSpace: 'nowrap' }}>{when(g)}</span>
            </button>
          )
        })}
      </div>
      <style>{'.nfl-slate-row::-webkit-scrollbar{display:none}'}</style>
    </section>
  )
}
