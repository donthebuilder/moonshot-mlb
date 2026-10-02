// "TONIGHT" IS THE SLATE STILL BEING PLAYED (2026-10-02, 0g D5). /called keyed
// tonight on easternToday(): at 12:00 AM ET the hero flipped to "No home runs
// yet tonight" while West Coast / Monday-night / late hockey games were still
// on, and a 12:30 AM homer post linked to a page that denied it. Tonight is
// the game's own date: before 6 AM ET the league's own feed is asked whether
// yesterday's slate still has a game live; if it does, that is tonight. The
// clock only decides whether the question is worth one request (after 6 AM a
// slate from yesterday is over); the answer comes from the league. A feed
// that can't be reached leaves the wall-clock day, as before.
import { easternDate, shiftDay, etHour } from './data'
import { mlbSlateState } from './mlbSlateState'
import { scoreFor } from './nhl/api'
import { gameStateOf } from './nhl/reduce'

const LATE_UNTIL = 6 // ET hour
const ESPN_NFL = 'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'

// One "is a game of this day still live" per sport, each read from that
// league's feed. Registry keys match lib/routes.js sport keys.
const LIVE_ON = {
  mlb: async (day) => ((await mlbSlateState(day))?.live || 0) > 0,
  nhl: async (day) => ((await scoreFor(day))?.games || []).some((g) => gameStateOf(g.gameState) === 'live'),
  nfl: async (day) => {
    const r = await fetch(`${ESPN_NFL}?dates=${day.replace(/-/g, '')}`, { next: { revalidate: 60 } })
    if (!r.ok) return false
    return ((await r.json())?.events || []).some((e) => e?.status?.type?.state === 'in')
  },
}

/** The date "tonight" means for a sport right now (YYYY-MM-DD, the slate's own). */
export async function slateNight(sport, now = Date.now()) {
  const today = easternDate(now)
  if (etHour(now) >= LATE_UNTIL || !LIVE_ON[sport]) return today
  const yesterday = shiftDay(today, -1)
  try {
    return (await LIVE_ON[sport](yesterday)) ? yesterday : today
  } catch {
    return today // the league's feed didn't answer: the wall-clock day, as before
  }
}
