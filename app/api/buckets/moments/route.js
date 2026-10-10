// 🏀 BUCKETS MOMENTS -- THE 30 PIECE (B5). Vercel cron, every minute through
// NBA windows (parked in scripts/cron-restore-buckets.json while BUCKETS is hidden), LAMP's goal-feed shape (app/api/lamp/goals/tick):
//   · CLOSED UNTIL BUCKETS OPENS: with BUCKETS_PUBLIC off this returns at once,
//     no league call and no database read (posting would make BUCKETS public);
//   · one scoreboard read per date (cached 30 s); a box read only for a game
//     that is live or final; a game that is neither costs nothing;
//   · each 30-point game is written ONCE to buckets_feed with the status his
//     points row locked with (lib/nba/moments.js), preseason included -- the
//     record keeps it -- but preseason never posts;
//   · the post: X only when CALLED (counted against the X budget), Discord
//     otherwise (#bucket channel, else the sport fallback). A claim sentinel
//     on x_post_id ('posting') stops two racing ticks double-posting;
//   · the push sweep is app/api/dash/push/tick (lib/dash/pushRules nbaEventsFrom).
import { playerHref } from '../../../../lib/routes'
import { cronAuthorized, adminClient } from '../../../../lib/supabase/admin'
import { bucketsPublic } from '../../../../lib/nba/gate'
import { scoreboardFor, reduceScoreboard, summaryFor, reduceBox } from '../../../../lib/nba/api'
import { NBA_MARKETS } from '../../../../lib/nba/model'
import { momentRows, momentText, KIND } from '../../../../lib/nba/moments'
import { easternToday, shiftDay, etHour } from '../../../../lib/data'
import { hasX, postToDiscord, postToX } from '../../../../lib/dash/xPost'
import { feedHooksFor } from '../../../../lib/dash/discordChannels'
import { kindOn } from '../../../../lib/dash/longshotsPost'
import { isMaintenanceMode } from '../../../../lib/edgeConfig'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'dashnetwork.vercel.app').replace(/^https?:\/\//, '').replace(/\/$/, '')
const KEY = (r) => ({ game_id: r.game_id, player_id: r.player_id, kind: r.kind })

export async function GET(request) {
  if (!cronAuthorized(request)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  if (!bucketsPublic()) return Response.json({ skipped: 'BUCKETS is not open (BUCKETS_PUBLIC)' }, { headers: { 'Cache-Control': 'no-store' } })
  const t0 = Date.now()
  const today = easternToday()
  const dates = etHour() < 8 ? [today, shiftDay(today, -1)] : [today]
  const games = (await Promise.all(dates.map((d) => scoreboardFor(d).then(reduceScoreboard).then((gs) => gs.map((g) => ({ ...g, date: d }))).catch(() => [])))).flat()
  const on = games.filter((g) => g.state === 'live' || g.state === 'final')
  if (!on.some((g) => g.state === 'live') && !on.length) return Response.json({ dates, quiet: true, games: games.length, ms: Date.now() - t0 }, { headers: { 'Cache-Control': 'no-store' } })
  const db = adminClient()
  if (!db) return Response.json({ error: 'no supabase env' }, { status: 500 })
  const ids = on.map((g) => String(g.id))
  // a final game is read only until its moments are on file (then it is done)
  const [seen, locks, lockedRows] = await Promise.all([
    db.from('buckets_feed').select('game_id, player_id').in('game_id', ids).eq('kind', KIND),
    // the night's scored points rows: status for the tag, score for the night rank
    db.from('buckets_log').select('game_id, game_date, player_id, status, score').in('game_date', dates).eq('market', 'pts').eq('model_version', NBA_MARKETS.pts.version).not('score', 'is', null),
    db.from('buckets_games').select('game_id, graded_at').in('game_id', ids),
  ])
  const graded = new Set((lockedRows.data || []).filter((r) => r.graded_at).map((r) => String(r.game_id)))
  const read = on.filter((g) => g.state === 'live' || !graded.has(String(g.id)))
  const boxes = await Promise.all(read.map((g) => summaryFor(g.id, g.state === 'final').then(reduceBox).catch(() => [])))
  // the night rank: his place among that date's scored points rows, by score (the board's own order)
  const lockMap = new Map()
  for (const d of dates) {
    const night = (locks.data || []).filter((r) => r.game_date === d).sort((a, b) => b.score - a.score)
    night.forEach((r, i) => lockMap.set(`${r.game_id}|${r.player_id}`, { status: r.status, nightRank: i + 1 }))
  }
  const lockedGames = new Set((lockedRows.data || []).map((r) => String(r.game_id)))
  const have = new Set((seen.data || []).map((r) => `${r.game_id}|${r.player_id}`))
  const fresh = momentRows(read, boxes, lockMap, lockedGames).filter((r) => !have.has(`${r.game_id}|${r.player_id}`))
  const out = { dates, live: on.filter((g) => g.state === 'live').length, read: read.length, new: [], posted: [] }
  if (fresh.length) {
    const ins = await db.from('buckets_feed').upsert(fresh.map(({ _rank, ...r }) => r), { onConflict: 'game_id,player_id,kind', ignoreDuplicates: true }).select('game_id, player_id, kind')
    if (ins.error) return Response.json({ ...out, error: `buckets_feed: ${ins.error.message}` }, { status: 500 })
    const written = new Set((ins.data || []).map((r) => `${r.game_id}|${r.player_id}`))
    out.new = fresh.filter((r) => written.has(`${r.game_id}|${r.player_id}`)).map((r) => `${r.name} ${r.points} (${r.status || 'not locked'})`)
    // POST: regular season / playoffs only, the kind switched on, not in maintenance
    const canPost = kindOn('nba30') && !(await isMaintenanceMode())
    for (const r of fresh.filter((x) => written.has(`${x.game_id}|${x.player_id}`))) {
      if (!canPost || r.season_type === 1) continue
      const claim = await db.from('buckets_feed').update({ x_post_id: 'posting' }).match(KEY(r)).is('x_post_id', null).select('game_id')
      if (claim.error || !claim.data?.length) continue
      const text = momentText(r, { site: SITE })
      const hooks = feedHooksFor('nba', r.status)
      let discord = false
      // a card linked to him on BUCKETS, in BUCKETS' colour (2026-10-04)
      if (hooks) discord = await postToDiscord(text, { sport: 'nba', link: r.player_id ? playerHref('nba', r.player_id) : null }, hooks).then(() => true).catch((e) => { console.error(`[buckets moments] discord: ${e?.message || e}`); return false })
      let id = 'skipped'
      if (r.status === 'called' && hasX()) {
        const x = await postToX(text, { kind: 'nba30' }).catch((e) => ({ ok: false, error: e?.message }))
        id = x?.ok && x.id ? String(x.id) : 'skipped'
      }
      await db.from('buckets_feed').update({ x_post_id: id, discord_sent: discord }).match(KEY(r))
      out.posted.push(`${r.name} ${r.points} -> ${id === 'skipped' ? 'discord' : 'x + discord'}`)
    }
  }
  out.ms = Date.now() - t0
  return Response.json(out, { headers: { 'Cache-Control': 'no-store' } })
}
