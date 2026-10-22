'use client'
import FindBar from '../FindBar'
import { C as MLB_C, NUM_FONT as MLB_NUM } from '../../lib/theme'

// ══ FIND / FILTER ROW ON THE PROPS PAGE (2026-10-17; since 2026-10-21 a thin wrapper) ══════════════════════════
// The row itself is the site's one find / filter row, components/FindBar.js (MOONSHOT's Controls look). The Props
// page passes its three selects: team, game and market (the market filter is on when it is not Picks).
export default function PropFind({
  query, setQuery, team, setTeam, game, setGame, market, setMarket,
  teams = [], games = [], markets = [], placeholder = 'Search player or team…',
  C = MLB_C, NUM_FONT = MLB_NUM, accent = MLB_C.orange,
}) {
  return (
    <FindBar query={query} setQuery={setQuery} placeholder={placeholder} searchLabel="Search the cards by player or team"
      C={C} NUM_FONT={NUM_FONT} accent={accent}
      filters={[
        { key: 'team', label: 'Team', aria: "Show one team's players only", value: team, onChange: setTeam, all: 'All teams', options: teams.map((t) => ({ key: t, label: t })) },
        { key: 'game', label: 'Game', aria: 'Show one game only', value: game, onChange: setGame, all: 'All games', options: games },
        { key: 'market', label: 'Market', aria: 'Show one market only', value: market, onChange: setMarket, options: markets },
      ]} />
  )
}
