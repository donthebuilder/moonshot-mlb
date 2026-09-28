// THE LOOK-OUT'S "defenses leaking touchdowns" -- one copy (2026-09-27), used
// by TUDDY Home and the Ledger tab. Moved verbatim from components/nfl/tabs/
// Home.js: for each defense on this week's slate, its softest role by TD rank
// (top 8, with at least one TD allowed), the five softest overall.
const number = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback)

export function defenseLeaks(matchup, games) {
  const slateTeams = new Set((games || []).flatMap((game) => [game.away, game.home]))
  const season = matchup?.dvp?.season || {}
  return Object.entries(season).filter(([team]) => slateTeams.has(team)).map(([team, roles]) => {
    const vulnerable = Object.entries(roles || {})
      .filter(([, row]) => number(row?.td_rank, 99) <= 8 && number(row?.td) > 0)
      .sort((a, b) => number(a[1].td_rank, 99) - number(b[1].td_rank, 99))[0]
    return vulnerable ? { team, role: vulnerable[0], ...vulnerable[1] } : null
  }).filter(Boolean).sort((a, b) => a.td_rank - b.td_rank).slice(0, 5)
}
