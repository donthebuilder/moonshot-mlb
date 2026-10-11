// POSTING THE WRITE-UPS (BATCH-GAME-WRITEUP, 2026-10-04). Called every minute
// from app/api/dash/nfl/tick. For each game 75 to 60 minutes before kickoff --
// after the pregame bot run that knows the inactives -- it builds the write-up
// (build.js), renders + checks it (text.js), and then:
//
//   switch OFF (ONLY when X_WRITEUPS_PAUSE=on, the emergency off-switch; 2026-10-09 the
//   write-ups are LIVE BY CODE DEFAULT -- the old dash_flags writeups_autopost row is no longer read)
//     DRY: the post is written to homer_feed_posts (kind writeup_nfl_<game>,
//     x_post_id 'dry') for /admin, and goes nowhere.
//   switch ON
//     claimSlot (never twice) -> Discord for every game -> X for the featured
//     games only (featured.js), at P1 under the daily cap, with both players'
//     cards from the screenshot job (bot repo branch writeup-shots). A missing
//     card posts text-only and says so on /admin (no_shot).
//
// CHECK BEFORE IT POSTS (plan rule 27): game not started; both called players
// not out / inactive; the calls file rebuilt within 100 minutes of kickoff (the
// inactives run); a body that fails the fact checker is never posted.
import { buildNflWriteup } from './build'
import { renderWriteupSafe } from './text'
import { nflFeatured, dailyFeatured } from './featured'
import { claimSlot } from '../dash/postClaim'
import { hasX, postToX, uploadImageToX } from '../dash/xPost'
import { admit, logPosted, scheduleGate } from '../dash/xGate'
import { recordPost } from '../dash/xPostLog'
import { guardOff, holdOrDrop } from '../dash/xPolicy'
import { oppGoalieOf, nhlGoalieProblem } from '../nhl/oppGoalie'
import { sportHooks, nbaOwnHooks } from '../dash/discordChannels'
import { sendFree, sendMembers, retryMembers } from './discordRoute'
import { nbaNamingProblem } from '../dash/namingChecks'
import { buildNbaWriteup, nbaGameInput } from './nba'
import { postLimit } from '../dash/postLimit'
import { easternDate, shiftDay } from '../data'
import {
  fetchNfl, nflGameCallsPaths, nflGameCallsTotalsPaths, nflLogPaths, nflMatchupLooksReal, nflMatchupPaths, nflOddsPaths,
} from '../nfl/dataSource'

export const WINDOW = { from: 75 * 60e3, to: 60 * 60e3 }   // the first look: 75 to 60 minutes before kickoff / puck drop
// A write-up that is not READY at 60 minutes (the calls file not rebuilt yet, the goalie not confirmed) keeps
// being retried every tick until this long before the start, and is then dropped (xPolicy holdUntilBeforeStartMin).
export const RETRY_TO = 30 * 60e3
const FRESH_MS = 100 * 60e3                                  // calls rebuilt within this of kickoff
const OUT = /\b(out|inactive|injured reserve|ir|suspended|pup)\b/i
// our own prices first (as the site reads them); on the server a relative path needs the origin
const siteBase = () => String(process.env.NEXT_PUBLIC_SITE_URL || 'https://dashnetwork.vercel.app').replace(/\/+$/, '')
const absolute = (paths) => paths.map((p) => (p.startsWith('/') ? `${siteBase()}${p}` : p))

// THE SWITCH (2026-10-09). Before: dash_flags writeups_autopost (migration 202610050000 seeded it 'off') or the env
// WRITEUPS_AUTOPOST=off -- off by default, so every NHL write-up was a dry row. Now: ON by code default; the only
// off-switch is the env X_WRITEUPS_PAUSE=on (every write-up then becomes a dry row for /admin, nothing posts).
export const writeupsPaused = () => /^(on|1|true)$/i.test(String(process.env.X_WRITEUPS_PAUSE || '').trim())
export const writeupsAutopost = async () => (writeupsPaused()
  ? { on: false, why: 'X_WRITEUPS_PAUSE=on (emergency off-switch, Vercel)' }
  : { on: true, why: 'live by code default (pause: X_WRITEUPS_PAUSE=on)' })
export const writeupKind = (sport, gameId) => `writeup_${sport}_${gameId}`

// DISCORD, THE FREE / MEMBERS SPLIT (2026-10-09, Donovan's locked table): #members gets EVERY game's write-up, the free
// sport channel only the FEATURED game (lib/writeups/discordRoute.js: sendMembers / sendFree / retryMembers). The members
// webhook is read only through lib/dash/membersPost.js membersWebhook(); unset = nothing sent. Every send is logged to
// discord_sends with its kind; payload.members_sent / free_sent / members_tries live on the write-up's own row.
// the screenshot job's own branch (bot repo .github/workflows/writeup-shots.yml), not the data branch
export const shotUrl = (gameId, pid) => `https://raw.githubusercontent.com/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT/writeup-shots/${gameId}_${pid}.png`

/** Games to look at now: from 75 minutes before kickoff until it (`to` = 0). Posting stops at RETRY_TO before; a game still unwritten then gets its 'dropped' row. */
export function dueGames(games = [], now, to = 0) {
  return games.filter((g) => {
    const k = new Date(g.kickoff).getTime()
    return Number.isFinite(k) && g.state !== 'in' && g.state !== 'post' && now >= k - WINDOW.from && now < k - to
  })
}

async function cardBytes(url) {
  try {
    const r = await fetch(url, { cache: 'no-store' })
    return r.ok ? Buffer.from(await r.arrayBuffer()) : null
  } catch { return null }
}

/**
 * @param db     service client
 * @param opts   { now, getWeek (the tick's cached week-file reader, called only when a game is due), dry: true | 'print' | null (null = follow the switch) }
 * @returns      a per-game summary for the tick's JSON
 */
export async function runNflWriteups(db, { now = Date.now(), getWeek = null, dry = null, freshMs = FRESH_MS, fetchCalls = null } = {}) {
  const read = fetchCalls || ((bust) => fetchNfl(nflGameCallsPaths(), null, 6000, { bust }).catch(() => null))
  let calls = await read(false)
  const first = dueGames(calls?.games || [], now)
  if (!first.length) return 'not-now'
  const builtOf = (c) => new Date(c?.built_at).getTime()
  const freshFor = (c, g) => builtOf(c) >= new Date(g.kickoff).getTime() - freshMs
  // THE STALE FILE (2026-10-09). The bot rebuilds the calls file on its own cadence (GitHub cron, gated, queued, then
  // published through a CDN that may hold the old copy for minutes), so one look at 75-60 minutes before kickoff
  // lost both games it tried (10-05, 10-08: "calls file not rebuilt before kickoff"). Now a stale file is re-read
  // past the CDN (bust) and WAITED FOR every tick until 30 minutes before kickoff; only then is the game dropped.
  if (first.some((g) => !freshFor(calls, g))) {
    const again = await read(true)
    if (again && builtOf(again) >= builtOf(calls)) calls = again
  }
  const due = dueGames(calls?.games || [], now)
  const out = {}
  const late = (g) => now >= new Date(g.kickoff).getTime() - RETRY_TO
  const waiting = (g) => !freshFor(calls, g) && !late(g)
  const ready = due.filter((g) => !waiting(g))
  for (const g of due) if (waiting(g)) out[g.game_id] = 'waiting for the pregame build'
  if (!ready.length) return Object.keys(out).length ? out : 'not-now'

  // already written (dry or live) -> skip without fetching anything else
  const kinds = ready.map((g) => writeupKind('nfl', g.game_id))
  const days = [...new Set(ready.map((g) => easternDate(new Date(g.kickoff).getTime())))]
  const seen = dry === 'print' ? { data: [] } : await db.from('homer_feed_posts').select('day,kind,payload').in('day', days).in('kind', kinds)
  const done = new Set((seen.data || []).map((r) => r.kind))
  await retryMembers(db, (seen.data || []).filter((r) => r.payload?.members_sent === false), { sport: 'nfl', now }).catch(() => 0)   // a failed #members copy, tried again before the start
  const todo = ready.filter((g) => !done.has(writeupKind('nfl', g.game_id)))
  for (const g of ready) if (done.has(writeupKind('nfl', g.game_id))) out[g.game_id] = 'already written'
  if (!todo.length) return out

  const sw = dry ? { on: false, why: `dry=${dry}` } : await writeupsAutopost(db)
  const [totals, matchup, logs, odds] = await Promise.all([
    fetchNfl(nflGameCallsTotalsPaths(calls.season)).catch(() => null),
    fetchNfl(nflMatchupPaths(), nflMatchupLooksReal).catch(() => null),
    fetchNfl(nflLogPaths()).catch(() => null),
    fetchNfl(absolute(nflOddsPaths())).catch(() => null),
  ])
  const week = getWeek ? await getWeek() : null
  // the Sunday-afternoon pick reads the team model's expected touchdowns (featured.js; week file + logs)
  const featured = nflFeatured(calls.games, week, logs)
  const byId = new Map((week?.players || []).map((p) => [String(p.player_id), p]))
  const xLimit = postLimit()

  for (const g of todo) {
    const kick = new Date(g.kickoff).getTime()
    const day = easternDate(kick)
    const kind = writeupKind('nfl', g.game_id)
    // rule 27: the calls file has to be the pregame (inactives) build. Reached only once the retries ran out (waiting() above)
    if (!freshFor(calls, g)) {
      const ageMin = Math.round((kick - builtOf(calls)) / 60e3)
      out[g.game_id] = await skip(db, day, kind, `calls file not rebuilt before kickoff (stale board; built ${Number.isFinite(ageMin) ? `${ageMin} min before kickoff` : 'at an unknown time'}, needed within ${Math.round(freshMs / 60e3)})`, dry)
      continue
    }
    if (late(g)) { out[g.game_id] = await skip(db, day, kind, `not written by ${RETRY_TO / 60e3} minutes before kickoff (window closed)`, dry); continue }
    const outP = (g.calls || []).find((c) => OUT.test(String(byId.get(String(c.player_id))?.injury_status || '')))
    if (outP) { out[g.game_id] = await skip(db, day, kind, `${outP.name} is listed ${byId.get(String(outP.player_id)).injury_status}`, dry); continue }
    if (!(g.calls || []).length) { out[g.game_id] = await skip(db, day, kind, 'no call in this game', dry); continue }

    const w = buildNflWriteup(g, { week, totals, matchup, logs, odds })
    const r = renderWriteupSafe(w, { xLimit })
    if (!r.ok) { out[g.game_id] = await skip(db, day, kind, `checker: ${r.why.join('; ')}`, dry); continue }
    const slot = featured.get(String(g.game_id)) || null
    const payload = { sport: 'nfl', game_id: String(g.game_id), kickoff: g.kickoff, featured: slot, text_full: r.full, text_x: r.x, x_is_long: r.xIsLong, fell_back: r.fellBack, long_why: r.longWhy || null,
      called: w.players.map((p) => p.player_id), writeup: w, written_at: new Date(now).toISOString() }

    if (dry === 'print') { out[g.game_id] = { featured: slot, full: r.full, x: r.x }; continue }
    if (!sw.on) {
      const ins = await db.from('homer_feed_posts').upsert([{ day, kind, x_post_id: 'dry', payload: { ...payload, mode: 'dry', why: sw.why } }], { onConflict: 'day,kind', ignoreDuplicates: true })
      out[g.game_id] = ins.error ? `dry write failed: ${ins.error.message}` : `dry (${slot || 'site + Discord only'})`
      continue
    }
    if (!(await claimSlot(db, day, kind, { tag: 'writeup' }))) { out[g.game_id] = 'claimed elsewhere'; continue }
    const d = await sendFree(r.full, { sport: 'nfl', kind, featured: Boolean(slot), hooks: sportHooks('nfl').join(',') })   // FREE: the featured game only (the NFL channel(s), MLB's as fallback)
    const members = await sendMembers(r.full, { sport: 'nfl', kind })   // MEMBERS: every game
    let xId = null, noShot = [], xWhy = null
    const ids = w.players.map((p) => String(p.player_id))
    const gate = slot && hasX() ? await xGateFor(db, { day, kind, sport: 'nfl', ids, startMs: kick, now }) : null
    if (slot && hasX() && gate.state === 'go') {
      const mediaIds = []
      for (const p of w.players) {
        const bytes = await cardBytes(shotUrl(g.game_id, p.player_id))
        const id = bytes ? await uploadImageToX(bytes) : null
        if (id) mediaIds.push(id); else noShot.push(p.player_id)
      }
      const x = await postToX(r.x, { mediaIds, kind: 'writeup' })
      xId = x.ok ? x.id : null
      if (x.ok) logPosted({ day, kind, ids, tweetId: x.id, text: r.x })
      if (!x.ok) xWhy = x.error || `status ${x.status}`
    } else if (slot) xWhy = !hasX() ? 'X not configured' : gate.reason || gate.state
    await db.from('homer_feed_posts').update({ x_post_id: xId, discord_sent: !!d?.ok, payload: { ...payload, named: ids, mode: 'live', free: Boolean(slot), free_sent: Boolean(d?.ok), members_sent: members, members_tries: 1, no_shot: noShot, x_why: xWhy, posted_at: new Date().toISOString() } })
      .match({ day, kind })
    out[g.game_id] = `live: discord ${!slot ? 'members only' : d?.ok ? 'ok' : 'failed'}${slot ? `, X ${xId || xWhy}` : ''}`
  }
  return out
}

/** The X gates a write-up goes through, in order: the scheduler (event-driven INFO, logged), then admit (pause, repeat, the 'writeup' tier's cap). */
async function xGateFor(db, { day, kind, sport, ids, startMs, now }) {
  const sg = await scheduleGate(db, { kind, day, sport, startMs, now })
  if (!sg.ok) return { state: sg.drop ? 'dropped' : 'held', reason: sg.reason }
  return admit(db, { day, kind, ids, now })
}

// a game that can't get a write-up says why, once, on /admin ('skipped' is never counted as an X post)
async function skip(db, day, kind, reason, dry) {
  if (dry === 'print') return `skip: ${reason}`
  await db.from('homer_feed_posts').upsert([{ day, kind, x_post_id: 'skipped', payload: { mode: 'skipped', reason } }], { onConflict: 'day,kind', ignoreDuplicates: true })
  return `skipped: ${reason}`
}

// ── LAMP (2026-10-05) ───────────────────────────────────────────────────────
// The same switch and the same dry rows as TUDDY's: every NHL game from 75 minutes before puck
// drop (retried until 30 minutes before while the opposing goalie is unconfirmed) gets its write-up (lib/writeups/nhl.js) built from the goal board, checked, and -- switch
// OFF -- written to homer_feed_posts as kind writeup_nhl_<game> (x_post_id 'dry') for /admin.
// ON: Discord for every game (the NHL channel), X for the night's FEATURED game only (featured.js
// rank 'xg' on the dial's projected goals (nhlPick.js), then most players in the night's top 20).
// `games`: the tick's night.games (startUtc, state), so nothing is read unless a game is due.
export async function runNhlWriteups(db, { date, games = [], now = Date.now(), dry = null, readBoard } = {}) {
  // 75 minutes before puck drop until puck drop: the first look at 75-60, then every tick while the goalie is
  // unconfirmed; posting stops RETRY_TO (30 minutes) before, and a game still unwritten then gets its 'dropped' row
  const due = games.filter((g) => { const k = Date.parse(g.startUtc); return Number.isFinite(k) && g.state === 'pre' && now >= k - WINDOW.from && now < k })
  if (!due.length) return 'not-now'
  const kinds = due.map((g) => writeupKind('nhl', g.id))
  const seen = dry === 'print' ? { data: [] } : await db.from('homer_feed_posts').select('day,kind,payload').eq('day', date).in('kind', kinds)
  const done = new Set((seen.data || []).map((r) => r.kind))
  await retryMembers(db, (seen.data || []).filter((r) => r.payload?.members_sent === false), { sport: 'nhl', now }).catch(() => 0)   // a failed #members copy, tried again before the start
  const todo = due.filter((g) => !done.has(writeupKind('nhl', g.id)))
  if (!todo.length) return Object.fromEntries(due.map((g) => [g.id, 'already written']))

  // proj: true -- each game's projected goals (the Slate dial's own number, game.proj.total) ranks the featured game
  const board = await readBoard(date, { market: 'GOAL', net: false, proj: true })
  const { buildNhlWriteup } = await import('./nhl')
  const { nhlFeaturedPicks } = await import('./nhlPick')
  // the night's featured game, over every game of the night (stable as games start)
  const recent = dry === 'print' ? { data: [] } : await db.from('homer_feed_posts').select('payload').in('day', [shiftDay(date, -1), shiftDay(date, -2)]).like('kind', 'writeup_nhl_%')
  const recentTeams = new Set((recent.data || []).filter((r) => r.payload?.featured).flatMap((r) => r.payload?.teams || []))
  const { pick, oldPick, basis, candidates } = nhlFeaturedPicks(board.games, { recentTeams })
  // both picks, logged on every dry row so the owner can compare the old rule (summed board goal chances) with the new (the dial's number)
  const pickLog = {
    rule: 'proj_total', basis,
    new: pick ? { game_id: pick.game_id, teams: pick.teams, proj_total: pick.proj_total, proj_source: pick.proj_source, ranked: pick.ranked } : null,
    old: oldPick ? { game_id: oldPick.game_id, teams: oldPick.teams, old_xg: Number(oldPick.old_xg.toFixed(2)), ranked: oldPick.ranked } : null,
    same: Boolean(pick && oldPick && pick.game_id === oldPick.game_id),
  }
  const sw = dry ? { on: false, why: `dry=${dry}` } : await writeupsAutopost(db)
  const xLimit = postLimit()
  const out = {}
  for (const g of todo) {
    const kind = writeupKind('nhl', g.id)
    const startMs = Date.parse(g.startUtc)
    const bg = board.games.find((x) => x.game.id === g.id)
    // WHERE EACH CONFIRMED STARTER IS WEAK (2026-10-10, lib/nhl/goalieWeak.js): read for the opposing goalie of each called skater, only when
    // the club has named him (context.oppGoalie), and used only if his sample clears the floor. A failed read costs the sentence, never the post.
    const goalieWeak = {}
    if (bg) {
      const ids = [...new Set((bg.rows || []).filter((r) => r.status === 'called' && r.context?.oppGoalie?.confirmed === true).map((r) => String(r.context.oppGoalie.playerId ?? r.context.oppGoalie.id)).filter((x) => /^\d{7}$/.test(x)))]
      if (ids.length && bg.game?.season) {
        const { readWeak } = await import('../nhl/goalieWeakRead')
        await Promise.all(ids.map(async (id) => { try { goalieWeak[id] = await readWeak(id, bg.game.season) } catch { /* no sentence */ } }))
      }
    }
    const w = bg ? buildNhlWriteup(bg, { goalieWeak }) : null
    if (!w || !w.players.length) { out[g.id] = await skip(db, date, kind, 'no call in this game', dry); continue }

    // BEFORE THE SKATERS ARE NAMED (naming rule, 2026-10-09): the opposing starting goalie confirmed for each of them.
    // Not yet = HELD (nothing claimed, retried next tick); still not 30 minutes before puck drop = DROPPED. A game with
    // no goalie source at all waits the same way (the source may arrive), it is never named on a guess.
    const pending = [], blocked = []
    if (!guardOff('naming')) {
      for (const p of w.players) {
        const id = String(p.player_id)
        const row = (bg.rows || []).find((r) => String(r.playerId) === id)
        const problem = nhlGoalieProblem(bg, row, id)
        if (!problem) continue
        if (problem.pending || oppGoalieOf(bg, row) === undefined) pending.push({ id, reason: problem.pending ? problem.reason : 'no starting-goalie source yet' })
        else blocked.push(problem)
      }
    }
    if (blocked.length) { recordPost({ day: date, kind, sport: 'nhl', state: 'DROPPED', reason: blocked[0].reason, ids: blocked.map((b) => b.id) }); out[g.id] = await skip(db, date, kind, blocked[0].reason, dry); continue }
    if (pending.length) {
      const h = holdOrDrop({ pending, startMs, now })
      if (h.state === 'held') { recordPost({ day: date, kind, sport: 'nhl', state: 'HELD', reason: h.reason, ids: pending.map((x) => x.id) }); out[g.id] = `held: ${h.reason}`; continue }
      recordPost({ day: date, kind, sport: 'nhl', state: 'DROPPED', reason: `${h.reason} (30 min to start)`, ids: pending.map((x) => x.id) })
      out[g.id] = await skip(db, date, kind, `${h.reason}; not confirmed 30 minutes before puck drop`, dry); continue
    }
    if (now >= startMs - RETRY_TO) { out[g.id] = await skip(db, date, kind, `not written by ${RETRY_TO / 60e3} minutes before puck drop (window closed)`, dry); continue }

    // the long text; if the checker rejects it, the short text (as the MLB path falls back to its CALL text)
    const r = renderWriteupSafe(w, { xLimit })
    if (!r.ok) { out[g.id] = await skip(db, date, kind, `checker: ${r.why.join('; ')}`, dry); continue }
    const featured = pick && pick.game_id === String(g.id) ? 'NIGHT' : null
    const cand = candidates.find((c) => c.game_id === String(g.id))
    const payload = { sport: 'nhl', game_id: String(g.id), kickoff: g.startUtc, featured, teams: [g.away.abbrev, g.home.abbrev], xg: cand?.proj_total ?? null, xg_source: cand?.proj_source ?? null, old_xg: cand ? Number(cand.old_xg.toFixed(2)) : null, ranked: cand?.ranked ?? null, pick_log: pickLog,
      text_full: r.full, text_x: r.x, x_is_long: r.xIsLong, fell_back: r.fellBack, long_why: r.longWhy || null, called: w.players.map((p) => p.player_id), writeup: w, written_at: new Date(now).toISOString() }
    if (dry === 'print') { out[g.id] = { featured, full: r.full, x: r.x, pick_log: pickLog }; continue }
    if (!sw.on) {
      const ins = await db.from('homer_feed_posts').upsert([{ day: date, kind, x_post_id: 'dry', payload: { ...payload, mode: 'dry', why: sw.why } }], { onConflict: 'day,kind', ignoreDuplicates: true })
      out[g.id] = ins.error ? `dry write failed: ${ins.error.message}` : `dry (${featured ? 'featured' : 'site + Discord only'})`
      continue
    }
    if (!(await claimSlot(db, date, kind, { tag: 'writeup' }))) { out[g.id] = 'claimed elsewhere'; continue }
    const d = await sendFree(r.full, { sport: 'nhl', kind, featured: Boolean(featured), hooks: sportHooks('nhl').join(',') })   // FREE: the night's featured game only
    const members = await sendMembers(r.full, { sport: 'nhl', kind })   // MEMBERS: every game
    let xId = null, xWhy = null
    const ids = w.players.map((p) => String(p.player_id))
    const gate = featured && hasX() ? await xGateFor(db, { day: date, kind, sport: 'nhl', ids, startMs, now }) : null
    if (featured && hasX() && gate.state === 'go') {
      const x = await postToX(r.x, { kind: 'writeup' })
      xId = x.ok ? x.id : null
      if (x.ok) logPosted({ day: date, kind, ids, tweetId: x.id, text: r.x })
      if (!x.ok) xWhy = x.error || `status ${x.status}`
    } else if (featured) xWhy = !hasX() ? 'X not configured' : gate.reason || gate.state
    await db.from('homer_feed_posts').update({ x_post_id: xId, discord_sent: !!d?.ok, payload: { ...payload, named: ids, mode: 'live', free: Boolean(featured), free_sent: Boolean(d?.ok), members_sent: members, members_tries: 1, x_why: xWhy, posted_at: new Date().toISOString() } }).match({ day: date, kind })
    out[g.id] = `live: discord ${!featured ? 'members only' : d?.ok ? 'ok' : 'failed'}${featured ? `, X ${xId || xWhy}` : ''}`
  }
  return out
}

// ── BUCKETS (2026-10-09) ────────────────────────────────────────────────────
// THE QUICK CALL, BASKETBALL: every NBA game from 75 minutes before tip gets its write-up
// (lib/writeups/nba.js) from the DOUBLE-DOUBLE and TRIPLE-DOUBLE boards -- the CALLED man for each club in each
// market -- through the same switch, dry rows, checker and gates as LAMP's and TUDDY's. Site (the game page reads the
// same builder) and #members get every game; BUCKETS' own public channel (DISCORD_NBA_WEBHOOKS, never the MLB
// fallback) too; X gets the night's ONE featured game (featured.js dailyFeatured, rank 'sum': the game whose calls
// carry the most score), through the schedule gate and admit (cap, repeat guard), at most one a day: an earlier
// featured post that day closes the door. No link anywhere (X posts carry none; the footer is words). Regular season
// and playoffs only: a preseason night writes nothing.
// `games`: the tick's scoreboard rows (id, start, state, seasonType); `readBoard(date, market)`: lib/nba/boardRead.js.
export async function runNbaWriteups(db, { date, games = [], now = Date.now(), dry = null, readBoard } = {}) {
  const due = games.filter((g) => { const k = Date.parse(g.start); return (g.seasonType === 2 || g.seasonType === 3) && Number.isFinite(k) && g.state === 'pre' && now >= k - WINDOW.from && now < k })
  if (!due.length) return 'not-now'
  const kinds = due.map((g) => writeupKind('nba', g.id))
  const seen = dry === 'print' ? { data: [] } : await db.from('homer_feed_posts').select('day,kind,payload').eq('day', date).in('kind', kinds)
  const done = new Set((seen.data || []).map((r) => r.kind))
  await retryMembers(db, (seen.data || []).filter((r) => r.payload?.members_sent === false), { sport: 'nba', now }).catch(() => 0)   // a failed #members copy, tried again before the start
  const todo = due.filter((g) => !done.has(writeupKind('nba', g.id)))
  if (!todo.length) return Object.fromEntries(due.map((g) => [g.id, 'already written']))

  const boards = { dd: await readBoard(date, 'dd').catch(() => null), td: await readBoard(date, 'td').catch(() => null) }
  if (!boards.dd && !boards.td) return Object.fromEntries(todo.map((g) => [g.id, 'the boards could not be read (retried next tick)']))
  // the featured game is picked over EVERY game of the night, so it stays put as games start (as LAMP's does)
  const recent = dry === 'print' ? { data: [] } : await db.from('homer_feed_posts').select('payload').in('day', [shiftDay(date, -1), shiftDay(date, -2)]).like('kind', 'writeup\\_nba\\_%')
  const recentTeams = new Set((recent.data || []).filter((r) => r.payload?.featured).flatMap((r) => r.payload?.teams || []))
  const night = (boards.dd || boards.td).games || []
  const candidates = night.filter((g) => g.seasonType === 2 || g.seasonType === 3).map((g) => {
    const input = nbaGameInput(boards, g.id)
    const calls = input ? ['dd', 'td'].flatMap((m) => input.rows[m].filter((r) => r.status === 'called').map((r) => ({ score: r.score, role: r.role }))) : []
    return { game_id: String(g.id), start: g.start, teams: [g.away?.abbrev, g.home?.abbrev], calls, lineups: true, started: false }
  })
  const pick = dailyFeatured(candidates, { rank: 'sum', recentTeams })
  const sw = dry ? { on: false, why: `dry=${dry}` } : await writeupsAutopost(db)
  const xLimit = postLimit()
  const out = {}
  for (const g of todo) {
    const kind = writeupKind('nba', g.id)
    const startMs = Date.parse(g.start)
    const input = nbaGameInput(boards, g.id)
    if (!input) { out[g.id] = await skip(db, date, kind, 'the game is not on the boards', dry); continue }
    // BEFORE A MAN IS NAMED (naming rule): a CALLED man listed OUT, or whose game has started, is left out; his club then has no call
    const gone = []
    for (const m of ['dd', 'td']) {
      input.rows[m] = input.rows[m].map((r) => {
        if (r.status !== 'called') return r
        const problem = guardOff('naming') ? null : nbaNamingProblem({ player_id: r.playerId, injury: r.injury, startsAt: g.start }, { now })
        if (!problem) return r
        gone.push({ id: String(r.playerId), reason: problem.reason })
        return { ...r, status: 'board' }
      })
    }
    const w = buildNbaWriteup(input)
    if (!w || !w.players.length) {
      if (gone.length) recordPost({ day: date, kind, sport: 'nba', state: 'DROPPED', reason: gone[0].reason, ids: gone.map((x) => x.id) })
      out[g.id] = await skip(db, date, kind, gone.length ? `${gone[0].reason}; no other call in this game` : 'no call in this game', dry); continue
    }
    if (now >= startMs - RETRY_TO) { out[g.id] = await skip(db, date, kind, `not written by ${RETRY_TO / 60e3} minutes before tip (window closed)`, dry); continue }
    const r = renderWriteupSafe(w, { xLimit })
    if (!r.ok) { out[g.id] = await skip(db, date, kind, `checker: ${r.why.join('; ')}`, dry); continue }
    const featured = pick && pick.game_id === String(g.id) ? 'NIGHT' : null
    const payload = { sport: 'nba', game_id: String(g.id), kickoff: g.start, featured, teams: [w.away, w.home], text_full: r.full, text_x: r.x, x_is_long: r.xIsLong, fell_back: r.fellBack, long_why: r.longWhy || null,
      called: w.players.map((p) => p.player_id), markets: w.markets, writeup: w, written_at: new Date(now).toISOString() }
    if (dry === 'print') { out[g.id] = { featured, full: r.full, x: r.x }; continue }
    if (!sw.on) {
      const ins = await db.from('homer_feed_posts').upsert([{ day: date, kind, x_post_id: 'dry', payload: { ...payload, mode: 'dry', why: sw.why } }], { onConflict: 'day,kind', ignoreDuplicates: true })
      out[g.id] = ins.error ? `dry write failed: ${ins.error.message}` : `dry (${featured ? 'featured' : 'site + Discord only'})`
      continue
    }
    if (!(await claimSlot(db, date, kind, { tag: 'writeup' }))) { out[g.id] = 'claimed elsewhere'; continue }
    const pubHooks = nbaOwnHooks().join(',')
    const d = await sendFree(r.full, { sport: 'nba', kind, featured: Boolean(featured), hooks: pubHooks })   // FREE: the night's featured game, BUCKETS' own channel (no MLB fallback)
    const members = await sendMembers(r.full, { sport: 'nba', kind })   // MEMBERS: every game
    let xId = null, xWhy = null
    const ids = w.players.map((p) => String(p.player_id))
    // AT MOST ONE FEATURED GAME A DAY ON X: an earlier featured NBA write-up that day, already on X, closes the door
    let oneADay = false
    if (featured && hasX()) {
      const earlier = await db.from('homer_feed_posts').select('kind, x_post_id').eq('day', date).like('kind', 'writeup\\_nba\\_%').neq('kind', kind)
      oneADay = (earlier.data || []).some((x) => x.x_post_id && !['dry', 'skipped'].includes(String(x.x_post_id)))
    }
    const gate = featured && hasX() && !oneADay ? await xGateFor(db, { day: date, kind, sport: 'nba', ids, startMs, now }) : null
    if (featured && hasX() && !oneADay && gate.state === 'go') {
      const x = await postToX(r.x, { kind: 'writeup' })
      xId = x.ok ? x.id : null
      if (x.ok) logPosted({ day: date, kind, ids, tweetId: x.id, text: r.x })
      if (!x.ok) xWhy = x.error || `status ${x.status}`
    } else if (featured) xWhy = !hasX() ? 'X not configured' : oneADay ? 'one featured NBA game a day: already posted' : gate.reason || gate.state
    await db.from('homer_feed_posts').update({ x_post_id: xId, discord_sent: !!d?.ok, payload: { ...payload, named: ids, mode: 'live', free: Boolean(featured), free_sent: Boolean(d?.ok), members_sent: members, members_tries: 1, x_why: xWhy, posted_at: new Date().toISOString() } }).match({ day: date, kind })
    out[g.id] = `live: discord ${!featured ? 'members only' : d?.ok ? 'ok' : pubHooks ? 'failed' : 'no channel'}, members ${members ? 'ok' : 'no'}${featured ? `, X ${xId || xWhy}` : ''}`
  }
  return out
}
