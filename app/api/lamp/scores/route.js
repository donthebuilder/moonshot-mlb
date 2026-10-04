// LAMP · SCORES — GET /api/lamp/scores?date=YYYY-MM-DD
//
// One NHL game day (Eastern calendar day, the league's own unit, the same
// rule MOONSHOT's easternToday lives by), reduced to the site's shape by
// lib/nhl/reduce.js. No date = today in ET. Why this is a server route and
// not a browser fetch like TUDDY's ESPN read: lib/nhl/api.js, first note.
import { easternToday } from '../../../../lib/data'
import { slateNight } from '../../../../lib/slateNight'
import { scoreFor, validDate, TTL } from '../../../../lib/nhl/api'
import { reduceScoreDay } from '../../../../lib/nhl/reduce'
import { ok, bad, delayed } from '../../../../lib/nhl/respond'
import { adminClient } from '../../../../lib/supabase/admin'
import { goalLabels, labelGoals, FEED_START } from '../../../../lib/nhl/goalFeed'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') || await slateNight('nhl')
  if (!validDate(date)) return bad('date must be a real YYYY-MM-DD day')
  try {
    const raw = await scoreFor(date)
    const day = reduceScoreDay(raw)
    // CALLED / ON THE BOARD on each goal, from lamp_goal_feed (the lock's
    // label, frozen when the goal was first seen). Only asked for a day the
    // feed can have rows for, and only when a goal is on the board.
    const scored = day.games.filter((g) => g.goals?.length).map((g) => g.id)
    if (date >= FEED_START && scored.length) day.games = labelGoals(day.games, await goalLabels(adminClient(), scored))
    return ok({ ...day, fetchedAt: new Date().toISOString() }, TTL.score)
  } catch (e) {
    return delayed(`scores ${date}`, e)
  }
}
