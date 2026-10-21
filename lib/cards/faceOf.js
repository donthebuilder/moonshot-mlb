// A PLAYER'S FACE BY SPORT AND ID (2026-10-20, Film Room and The Five). The same picture hosts the cards already use: NHL's mug
// (assets.nhle.com, the id alone: lib/nhl/format.js), ESPN's NBA headshot (lib/nba/teams.js nbaHeadshot), the NFL headshot by the
// source id (lib/nfl/headshotIds.js + lib/nfl/nflAssets.js), MLB's (lib/mlbTeams.js mlbHeadshot). Inlined as a data URI by cardKit's
// inline() (a miss is '' and the card draws its monogram). Never throws.
import { inline } from './cardKit'
import { nbaHeadshot } from '../nba/teams'
import { nflHeadshot } from '../nfl/nflAssets'
import { headshotIdFor } from '../nfl/headshotIds'
import { mlbHeadshot } from '../mlbTeams'

export function faceUrl(sport, id) {
  const pid = String(id ?? '').trim()
  if (!pid) return null
  if (sport === 'nhl') return /^\d{7}$/.test(pid) ? `https://assets.nhle.com/mugs/nhl/latest/${pid}.png` : null
  if (sport === 'nba') return nbaHeadshot(pid)
  if (sport === 'nfl') { const h = headshotIdFor(pid); return h ? nflHeadshot(h, 200, 146) : null }
  if (sport === 'mlb') return mlbHeadshot(pid)
  return null
}
export async function faceOf(sport, id) {
  try { const u = faceUrl(sport, id); return u ? await inline(u) : '' } catch { return '' }
}
