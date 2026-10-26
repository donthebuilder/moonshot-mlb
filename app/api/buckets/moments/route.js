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
import { momentRows, momentText, KIND, ddtdRows, ddtdText, DD_KIND, TD_KIND } from '../../../../lib/nba/moments'
import { easternToday, shiftDay, etHour } from '../../../../lib/data'
import { hasX, postToDiscord, postToX } from '../../../../lib/dash/xPost'
import { feedHooksFor } from '../../../../lib/dash/discordChannels'
import { kindOn } from '../../../../lib/dash/longshotsPost'
import { isMaintenanceMode } from '../../../../lib/edgeConfig'
import { pregameQuotes, quoteKinds, receiptLineOf } from '../../../../lib/dash/quoteFor'
import { momentCandidates, keyOf } from '../../../../lib/nba/momentsSweep'
import { settleAlert } from '../../../../lib/dash/xFail'

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
    db.from('buckets_feed').select('game_id, player_id, kind, x_post_id, seen_at, discord_sent').in('game_id', ids).in('kind', [KIND, DD_KIND, TD_KIND]),
    // the night's scored points rows: status for the tag, score for the night rank
    db.from('buckets_log').select('game_id, game_date, player_id, status, score').in('game_date', dates).eq('market', 'pts').eq('model_version', NBA_MARKETS.pts.version).not('score', 'is', null),
    db.from('buckets_games').select('game_id, graded_at').in('game_id', ids),
  ])
  // THE DOUBLE-DOUBLE / TRIPLE-DOUBLE CALLS (2026-10-20): only the CALLED rows of those two markets, for the CALLED-only moment below
  const ddtd = await db.from('buckets_log').select('game_id, player_id, market, status').in('game_date', dates).eq('status', 'called')
    .or(`and(market.eq.dd,model_version.eq.${NBA_MARKETS.dd.version}),and(market.eq.td,model_version.eq.${NBA_MARKETS.td.version})`)
  if (ddtd.error) console.error(`[buckets moments] dd/td calls: ${ddtd.error.message}`)   // a failed read costs the dd/td moments, never the 30 piece
  const ddtdLocks = new Map((ddtd.data || []).map((r) => [`${r.game_id}|${r.player_id}|${r.market}`, r.status]))
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
  // what is already stored (with its post state): a PENDING row (x_post_id null) is posted again, a stale one expires (lib/nba/momentsSweep.js, batch 3)
  const stored = new Map((seen.data || []).map((r) => [`${r.game_id}|${r.player_id}|${r.kind}`, r]))
  const derived = [...momentRows(read, boxes, lockMap, lockedGames), ...ddtdRows(read, boxes, ddtdLocks, lockedGames)]
  const fresh = derived.filter((r) => !stored.has(keyOf(r)))
  const out = { dates, live: on.filter((g) => g.state === 'live').length, read: read.length, new: [], posted: [] }
  const pendingHere = derived.some((r) => stored.get(keyOf(r))?.x_post_id == null && stored.has(keyOf(r)))
  if (fresh.length || pendingHere) {
    let written = new Set()
    if (fresh.length) {
      const ins = await db.from('buckets_feed').upsert(fresh.map(({ _rank, _line, ...r }) => r), { onConflict: 'game_id,player_id,kind', ignoreDuplicates: true }).select('game_id, player_id, kind')
      if (ins.error) return Response.json({ ...out, error: `buckets_feed: ${ins.error.message}` }, { status: 500 })
      written = new Set((ins.data || []).map((r) => `${r.game_id}|${r.player_id}|${r.kind}`))
    }
    const isNew = (x) => written.has(keyOf(x))
    const sweep = momentCandidates({ derived, stored, written, games: on })
    // an expired row is CLOSED, never posted late (and said so in the log)
    for (const { row: r, why } of sweep.expired) {
      console.error(`[buckets moments] ${r.name} ${r.kind} expired unposted: ${why}`)
      await db.from('buckets_feed').update({ x_post_id: 'skipped' }).match(KEY(r)).is('x_post_id', null)
    }
    out.new = fresh.filter(isNew).map((r) => `${r.name} ${r.kind === KIND ? r.points : r.kind} (${r.status || 'not locked'})`)
    // POST: regular season / playoffs only, the kind switched on, not in maintenance
    const canPost = kindOn('nba30') && !(await isMaintenanceMode())
    // THE RECEIPT (2026-10-20, lib/dash/quoteFor.js pregameQuotes): a CALLED 30-point night quotes the post that named him before tip
    // (his game's write-up, THE CARD, then THE SLATE). Read once, only when a CALLED one is about to post.
    const anyCalled = canPost && hasX() && sweep.post.some((x) => x.status === 'called' && x.season_type !== 1)
    const { data: quotePosts } = anyCalled ? await db.from('homer_feed_posts').select('day,kind,x_post_id,payload,seen_at').in('day', dates).or(`kind.like.writeup_nba_%,kind.in.(${quoteKinds('nba').join(',')})`) : { data: [] }
    const quoteOf = pregameQuotes('nba', quotePosts || [])
    let xStop = false   // X refused for an account-level reason / a rate limit this tick: the called rows stay pending (they expire by age), nothing is claimed for X
    const wantsX = (r) => r.status === 'called' && r.kind !== DD_KIND && hasX()
    for (const r of sweep.post) {
      if (!canPost || r.season_type === 1) continue
      if (xStop && wantsX(r)) continue
      const claim = await db.from('buckets_feed').update({ x_post_id: 'posting' }).match(KEY(r)).is('x_post_id', null).select('game_id')
      if (claim.error || !claim.data?.length) continue
      const text = r.kind === KIND ? momentText(r, { site: SITE }) : ddtdText(r)
      const hooks = feedHooksFor('nba', r.status)
      let discord = false
      // a card linked to him on BUCKETS, in BUCKETS' colour (2026-10-04)
      if (hooks) discord = await postToDiscord(text, { sport: 'nba', kind: 'nba30', link: r.player_id ? playerHref('nba', r.player_id) : null }, hooks).then((r) => Boolean(r?.ok)).catch((e) => { console.error(`[buckets moments] discord: ${e?.message || e}`); return false })
      let id = 'skipped'
      // X carries the 30 PIECE and the triple-double; a double-double stays in #buckets-nba (Donovan, 2026-10-23 volume review)
      if (wantsX(r)) {
        const q = quoteOf({ day: r.game_date || r.day, playerId: r.player_id, gameId: r.game_id })
        const x = await postToX(q ? `${text}\n\n${receiptLineOf(q, { sport: 'nba', key: `${r.game_id}:${r.player_id}:${r.kind}` })}` : text, { kind: 'nba30', ...(q ? { quoteId: q.id } : {}) }).catch((e) => ({ ok: false, error: e?.message }))
        // a refusal used to close the moment for good with nothing in the log (batch 3, 2026-10-26). Now it is logged and settled by the shared rule
        // (lib/dash/xFail.js settleAlert): a transient 429 / 5xx leaves the row PENDING (null: the next tick tries again until it expires), an account-level or
        // content refusal closes it 'skipped', and a moment whose Discord copy already went is closed rather than re-sent
        const posted = Boolean(x?.ok && x.id)
        const st = posted ? { value: String(x.id), stop: false } : settleAlert(x, { key: `bm|${r.game_id}|${r.player_id}|${r.kind}`, channelSent: discord })
        if (!posted) console.error(`[buckets moments] X did not post ${r.name} ${r.kind}: ${x?.status ?? 0} ${String(x?.error || '').slice(0, 120)} -> ${st.value === null ? 'retry next tick' : 'closed'}`)
        id = st.value
        if (st.stop) xStop = true
      }
      await db.from('buckets_feed').update({ x_post_id: id, discord_sent: discord || Boolean(r.discord_sent) }).match(KEY(r))
      out.posted.push(`${r.name} ${r.points} -> ${id === null ? 'retry' : id === 'skipped' ? 'discord' : 'x + discord'}`)
    }
  }
  out.ms = Date.now() - t0
  return Response.json(out, { headers: { 'Cache-Control': 'no-store' } })
}
