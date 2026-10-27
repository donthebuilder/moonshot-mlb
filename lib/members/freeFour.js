// THE FREE FOUR, ON THE SERVER (2026-10-17). The front page names the first FREE_CALLS_PER_SPORT of each sport's called list (components/home/QuickPicks.js
// previewOf over lib/phone/todayCalls.js). A card image or a lookup answer for one of THOSE men must read the same as the front page does, so this reads the same
// lists the same way and returns their ids. Null/empty on any failure (then nobody is free: the safe side).
import { FREE_CALLS_PER_SPORT } from './limits'
import { mlbTodayCalls, nflWeekBoard, nhlTonightCalls, nbaTodayCalls } from '../phone/todayCalls'
import { slateNight } from '../slateNight'

const ids = (items) => new Set((items || []).slice(0, FREE_CALLS_PER_SPORT).map((p) => String(p.id)))

const LOADERS = {
  mlb: async () => ids((await mlbTodayCalls())?.items),
  nfl: async () => ids((await nflWeekBoard())?.items),
  nhl: async () => ids((await nhlTonightCalls(await slateNight('nhl')))?.items),
  nba: async () => ids((await nbaTodayCalls(await slateNight('nba')))?.items),   // BUCKETS' board feed gate (lib/members/boardGate.js, 2026-10-26)
}

/** Set of player ids (strings) that are one of `sport`'s free four right now; empty for a sport with no list. */
export async function freeFourIds(sport) {
  try { return (await LOADERS[sport]?.()) || new Set() } catch { return new Set() }
}
