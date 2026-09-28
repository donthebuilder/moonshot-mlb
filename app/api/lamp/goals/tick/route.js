// 🚨 LAMP GOALS — THE LIVE GOAL FEED. Vercel cron, every minute through the
// NHL's game windows (vercel.json: * 16-23 and * 0-6 UTC; the 2026-27
// schedule's starts run 16:30Z Saturday matinees to 03:00Z Pacific games).
// Manual fire with any of the three cron secrets; ?date=YYYY-MM-DD reads
// that day instead of today (and yesterday).
//
// One league call per date (/score/<date>, lib/nhl/api.js, 15 s Data Cache)
// covers every game. Nothing touches the database unless a game is LIVE, or
// FINAL inside lib/nhl/goalFeed.js's FINAL_WINDOW_MS: the offseason and the
// mornings cost one cached call a minute.
//
// What a pass does (the rules are in lib/nhl/goalFeed.js tickGoals):
//   · writes each goal once to lamp_goal_feed, label frozen from the lock
//     (lamp_goal_log, MODEL_VERSION; null when the game never locked)
//   · confirms a goal a later read still has 90 s on; marks one a consistent
//     read no longer has as overturned (loudly, if it was already out)
//   · the 2+ Club row for a second confirmed goal in a regular-season game
//   · the CALLED IT post (X, kind 'nhlgoal', POST_KINDS_ON) for a CALLED goal
//     still standing 3 min after confirmation; preseason never posts
// The push is not here: app/api/dash/push/tick reads the confirmed rows
// (lib/dash/pushRules.js nhlEventsFrom), same split as the homer feed.
import { easternToday } from '../../../../../lib/data'
import { scoreFor, validDate } from '../../../../../lib/nhl/api'
import { reduceScoreDay } from '../../../../../lib/nhl/reduce'
import { MODEL_VERSION } from '../../../../../lib/nhl/goalModel'
import { cronAuthorized, adminClient } from '../../../../../lib/nhl/db'
import { gameActive, tickGoals } from '../../../../../lib/nhl/goalFeed'
import { hasX, postToX, uploadImageToX, xProblem } from '../../../../../lib/dash/xPost'
import { goalCard } from '../../../../../lib/nhl/goalCard'

// The host printed in the card's footer.
const SITE_HOST = (process.env.NEXT_PUBLIC_SITE_URL || 'dashnetwork.vercel.app').replace(/^https?:\/\//, '').replace(/\/$/, '')
import { kindOn } from '../../../../../lib/dash/longshotsPost'
import { isMaintenanceMode } from '../../../../../lib/edgeConfig'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const dayBefore = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d - 1, 12)).toISOString().slice(0, 10) }
const etHour = () => Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
const KEY = (row) => ({ game_id: row.game_id, player_id: row.player_id, goal_n: row.goal_n })

/** lamp_goal_feed / lamp_goal_log / multi_games through the service role. */
function supabaseStore(db) {
  const must = (what, { data, error }) => { if (error) throw new Error(`${what}: ${error.message}`); return data || [] }
  return {
    existing: async (ids) => must('existing', await db.from('lamp_goal_feed').select('*').in('game_id', ids)),
    locks: async (ids) => must('locks', await db.from('lamp_goal_log').select('game_id, player_id, status, rank_in_game, score').in('game_id', ids).eq('model_version', MODEL_VERSION)),
    insert: async (rows) => must('insert', await db.from('lamp_goal_feed').upsert(rows, { onConflict: 'game_id,player_id,goal_n', ignoreDuplicates: true }).select('*')),
    confirm: async (row, at) => must('confirm', await db.from('lamp_goal_feed').update({ confirmed_at: at }).match(KEY(row)).is('confirmed_at', null).is('overturned_at', null)),
    overturn: async (row, at) => must('overturn', await db.from('lamp_goal_feed').update({ overturned_at: at }).match(KEY(row)).is('overturned_at', null)),
    // The 2+ Club's own failure, logged; never the feed's or the post's.
    upsertMulti: async (rows) => { const { error } = await db.from('multi_games').upsert(rows, { onConflict: 'sport,game_id,player_id,kind' }); if (error) console.error(`[lamp goals] multi_games: ${error.message}`) },
    deleteMulti: async ({ game_id, player_id }) => { const { error } = await db.from('multi_games').delete().match({ sport: 'nhl', game_id, player_id, kind: 'G' }); if (error) console.error(`[lamp goals] multi_games delete: ${error.message}`) },
    countMulti: async (season, playerId) => {
      const { count, error } = await db.from('multi_games').select('game_id', { count: 'exact', head: true }).match({ sport: 'nhl', season, kind: 'G', player_id: playerId })
      if (error) throw new Error(error.message)
      return count || 0
    },
    // The homer feed's claim: flip null to a sentinel before any network
    // call, so a tick racing this one for the same goal gets zero rows back.
    claimPost: async (row) => must('claim', await db.from('lamp_goal_feed').update({ x_post_id: 'posting' }).match(KEY(row)).is('x_post_id', null).is('overturned_at', null).select('goal_n')).length > 0,
    finishPost: async (row, id) => must('finish', await db.from('lamp_goal_feed').update({ x_post_id: id }).match(KEY(row))),
  }
}

export async function GET(request) {
  if (!cronAuthorized(request)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const t0 = Date.now()
  const { searchParams } = new URL(request.url)
  const asked = validDate(searchParams.get('date')) ? searchParams.get('date') : null
  const today = asked || easternToday()
  // A Pacific game is still on after ET midnight: yesterday's date stays on
  // the list until 8am ET.
  const dates = asked || etHour() < 8 ? [today, dayBefore(today)] : [today]
  const days = await Promise.all(dates.map((d) => scoreFor(d).then(reduceScoreDay).catch((e) => { console.error(`[lamp goals] score ${d}: ${e?.message}`); return null })))
  const games = days.flatMap((d) => d?.games || [])
  if (!games.some((g) => gameActive(g))) {
    return Response.json({ dates, quiet: true, games: games.length, ms: Date.now() - t0 }, { headers: { 'Cache-Control': 'no-store' } })
  }
  const db = adminClient()
  if (!db) return Response.json({ error: 'no supabase env' }, { status: 500 })

  // Posting: the kind has to be on (POST_KINDS_ON), X configured, and the
  // site not in maintenance. The feed itself runs regardless.
  let poster = null
  if (kindOn('nhlgoal') && !(await isMaintenanceMode())) {
    // The CALLED goal carries its card (MLB-PARITY plan C1), like a homer or a
    // touchdown. A card that fails to render or upload never costs the post.
    if (hasX()) poster = {
      post: async (text, row) => {
        let mediaId = null
        if (row) {
          try {
            const img = await goalCard(row, { site: SITE_HOST })
            const buf = Buffer.from(await img.arrayBuffer())
            if (buf.length) mediaId = await uploadImageToX(buf)
          } catch (e) { console.error(`[lamp goals] card failed for ${row.name}: ${e?.message || e}`) }
        }
        return postToX(text, { kind: 'nhlgoal', ...(mediaId ? { mediaId } : {}) })
      },
    }
    else console.error(`[lamp goals] nhlgoal is on but X is not configured: ${xProblem()}`)
  }
  try {
    const out = await tickGoals({ games, store: supabaseStore(db), poster, modelVersion: MODEL_VERSION })
    out.ms = Date.now() - t0
    console.log(`[lamp goals] ${dates.join(',')} active ${out.active} goals ${out.goals} new ${out.inserted} confirmed ${out.confirmed} overturned ${out.overturned} posted ${out.posted.length} in ${out.ms}ms`)
    return Response.json({ dates, ...out }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error(`[lamp goals] tick failed: ${e?.message}`)
    return Response.json({ dates, error: e?.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
