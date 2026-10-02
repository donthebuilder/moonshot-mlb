// WHERE A GAME IS (2026-10-02, Donovan: "just show whatever building they are
// at"). The slate's own venue string when it carries one (a neutral or
// overseas game is where it is played), else the home club's building
// (lib/nfl/stadiums.js). The pair is the two teams; their order doesn't matter.
import { stadiumOf, currentName } from './stadiums'

export function gameVenue(games = [], a, b) {
  const g = (games || []).find((x) => x && ((x.away === a && x.home === b) || (x.away === b && x.home === a)))
  if (!g) return null
  const named = (typeof g.venue === 'string' && g.venue.trim()) || g.venue?.name || null
  return named ? currentName(named) : stadiumOf(g.home)?.name || null
}
