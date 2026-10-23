// A PLAYER'S FACE BY SPORT AND ID (2026-10-20, Film Room and The Five). The same picture hosts the cards already use: NHL's mug
// (assets.nhle.com, the id alone: lib/nhl/format.js), ESPN's NBA headshot (lib/nba/teams.js nbaHeadshot), the NFL headshot by the
// source id (lib/nfl/headshotIds.js + lib/nfl/nflAssets.js), MLB's (lib/mlbTeams.js mlbHeadshot). Inlined as a data URI by cardKit's
// inline() (a miss is '' and the card draws its monogram). Never throws.
import { inline } from './cardKit'
import { nbaHeadshot } from '../nba/teams'
import { nflHeadshot } from '../nfl/nflAssets'
import { headshotIdFor } from '../nfl/headshotIds'
import { mlbHeadshot } from '../mlbTeams'
import { nhlMugLatest } from '../nhl/format'

// one picture host per sport (a lookup, not a sport ternary); a sport not listed has no face
const FACE = {
  nhl: (pid) => nhlMugLatest(pid),
  nba: (pid) => nbaHeadshot(pid),
  nfl: (pid) => { const h = headshotIdFor(pid); return h ? nflHeadshot(h, 200, 146) : null },
  mlb: (pid) => mlbHeadshot(pid),
}

export function faceUrl(sport, id) {
  const pid = String(id ?? '').trim()
  if (!pid) return null
  return Object.hasOwn(FACE, sport) ? FACE[sport](pid) : null
}
export async function faceOf(sport, id) {
  try { const u = faceUrl(sport, id); return u ? await inline(u) : '' } catch { return '' }
}
