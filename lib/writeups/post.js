// POSTING THE WRITE-UPS (BATCH-GAME-WRITEUP, 2026-10-04). Called every minute
// from app/api/dash/nfl/tick. For each game 75 to 60 minutes before kickoff --
// after the pregame bot run that knows the inactives -- it builds the write-up
// (build.js), renders + checks it (text.js), and then:
//
//   switch OFF (default; WRITEUPS_AUTOPOST=off or dash_flags writeups_autopost)
//     DRY: the post is written to homer_feed_posts (kind writeup_nfl_<game>,
//     x_post_id 'dry') for /admin, and goes nowhere.
//   switch ON
//     claimSlot (never twice) -> Discord for every game -> X for the featured
//     games only (featured.js), at P1 under the daily cap, with both players'
//     cards from the screenshot job (data branch writeup_shots/). A missing
//     card posts text-only and says so on /admin (no_shot).
//
// CHECK BEFORE IT POSTS (plan rule 27): game not started; both called players
// not out / inactive; the calls file rebuilt within 100 minutes of kickoff (the
// inactives run); a body that fails the fact checker is never posted.
import { buildNflWriteup } from './build'
import { renderWriteup } from './text'
import { nflFeatured } from './featured'
import { claimSlot } from '../dash/postClaim'
import { hasX, postToDiscord, postToX, uploadImageToX } from '../dash/xPost'
import { xDailyAllows } from '../dash/xBudget'
import { sportHooks } from '../dash/discordChannels'
import { postLimit } from '../dash/postLimit'
import { flagState } from '../facts/engine'
import { easternDate } from '../data'
import {
  fetchNfl, NFL_DATA_BASE, nflGameCallsPaths, nflGameCallsTotalsPaths, nflLogPaths, nflMatchupLooksReal, nflMatchupPaths, nflOddsPaths,
} from '../nfl/dataSource'

export const WINDOW = { from: 75 * 60e3, to: 60 * 60e3 }   // minutes before kickoff
const FRESH_MS = 100 * 60e3                                  // calls rebuilt within this of kickoff
const OUT = /\b(out|inactive|injured reserve|ir|suspended|pup)\b/i
// our own prices first (as the site reads them); on the server a relative path needs the origin
const siteBase = () => String(process.env.NEXT_PUBLIC_SITE_URL || 'https://dashnetwork.vercel.app').replace(/\/+$/, '')
const absolute = (paths) => paths.map((p) => (p.startsWith('/') ? `${siteBase()}${p}` : p))

export const writeupsAutopost = (db) => flagState(db, 'writeups_autopost', 'WRITEUPS_AUTOPOST')
export const writeupKind = (sport, gameId) => `writeup_${sport}_${gameId}`
export const shotUrl = (gameId, pid) => `${NFL_DATA_BASE}/writeup_shots/${gameId}_${pid}.png`

/** Games inside the posting window at `now`. */
export function dueGames(games = [], now) {
  return games.filter((g) => {
    const k = new Date(g.kickoff).getTime()
    return Number.isFinite(k) && g.state !== 'in' && g.state !== 'post' && now >= k - WINDOW.from && now < k - WINDOW.to
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
export async function runNflWriteups(db, { now = Date.now(), getWeek = null, dry = null, freshMs = FRESH_MS } = {}) {
  const calls = await fetchNfl(nflGameCallsPaths()).catch(() => null)
  const due = dueGames(calls?.games || [], now)
  if (!due.length) return 'not-now'
  const featured = nflFeatured(calls.games)
  const out = {}

  // already written (dry or live) -> skip without fetching anything else
  const kinds = due.map((g) => writeupKind('nfl', g.game_id))
  const days = [...new Set(due.map((g) => easternDate(new Date(g.kickoff).getTime())))]
  const seen = dry === 'print' ? { data: [] } : await db.from('homer_feed_posts').select('kind').in('day', days).in('kind', kinds)
  const done = new Set((seen.data || []).map((r) => r.kind))
  const todo = due.filter((g) => !done.has(writeupKind('nfl', g.game_id)))
  if (!todo.length) return Object.fromEntries(due.map((g) => [g.game_id, 'already written']))

  const sw = dry ? { on: false, why: `dry=${dry}` } : await writeupsAutopost(db)
  const [totals, matchup, logs, odds] = await Promise.all([
    fetchNfl(nflGameCallsTotalsPaths(calls.season)).catch(() => null),
    fetchNfl(nflMatchupPaths(), nflMatchupLooksReal).catch(() => null),
    fetchNfl(nflLogPaths()).catch(() => null),
    fetchNfl(absolute(nflOddsPaths())).catch(() => null),
  ])
  const week = getWeek ? await getWeek() : null
  const byId = new Map((week?.players || []).map((p) => [String(p.player_id), p]))
  const xLimit = postLimit()

  for (const g of todo) {
    const kick = new Date(g.kickoff).getTime()
    const day = easternDate(kick)
    const kind = writeupKind('nfl', g.game_id)
    const lastMinute = now >= kick - WINDOW.to - 60e3
    // rule 27: the calls file has to be the pregame (inactives) build
    const built = new Date(calls.built_at).getTime()
    if (!(built >= kick - freshMs)) { out[g.game_id] = lastMinute ? await skip(db, day, kind, 'calls file not rebuilt before kickoff (stale board)', dry) : 'waiting for the pregame build'; continue }
    const outP = (g.calls || []).find((c) => OUT.test(String(byId.get(String(c.player_id))?.injury_status || '')))
    if (outP) { out[g.game_id] = await skip(db, day, kind, `${outP.name} is listed ${byId.get(String(outP.player_id)).injury_status}`, dry); continue }
    if (!(g.calls || []).length) { out[g.game_id] = await skip(db, day, kind, 'no call in this game', dry); continue }

    const w = buildNflWriteup(g, { week, totals, matchup, logs, odds })
    const r = renderWriteup(w, { xLimit })
    if (!r.ok) { out[g.game_id] = await skip(db, day, kind, `checker: ${r.why.join('; ')}`, dry); continue }
    const slot = featured.get(String(g.game_id)) || null
    const payload = { sport: 'nfl', game_id: String(g.game_id), kickoff: g.kickoff, featured: slot, text_full: r.full, text_x: r.x, x_is_long: r.xIsLong,
      called: w.players.map((p) => p.player_id), writeup: w, written_at: new Date(now).toISOString() }

    if (dry === 'print') { out[g.game_id] = { featured: slot, full: r.full, x: r.x }; continue }
    if (!sw.on) {
      const ins = await db.from('homer_feed_posts').upsert([{ day, kind, x_post_id: 'dry', payload: { ...payload, mode: 'dry', why: sw.why } }], { onConflict: 'day,kind', ignoreDuplicates: true })
      out[g.game_id] = ins.error ? `dry write failed: ${ins.error.message}` : `dry (${slot || 'site + Discord only'})`
      continue
    }
    if (!(await claimSlot(db, day, kind, { tag: 'writeup' }))) { out[g.game_id] = 'claimed elsewhere'; continue }
    const d = await postToDiscord(r.full, { sport: 'nfl' }, sportHooks('nfl').join(','))   // the NFL channel(s), MLB's as fallback
    let xId = null, noShot = [], xWhy = null
    if (slot && hasX() && await xDailyAllows(db, day, 1)) {
      const mediaIds = []
      for (const p of w.players) {
        const bytes = await cardBytes(shotUrl(g.game_id, p.player_id))
        const id = bytes ? await uploadImageToX(bytes) : null
        if (id) mediaIds.push(id); else noShot.push(p.player_id)
      }
      const x = await postToX(r.x, { mediaIds, kind: 'writeup' })
      xId = x.ok ? x.id : null
      if (!x.ok) xWhy = x.error || `status ${x.status}`
    } else if (slot) xWhy = !hasX() ? 'X not configured' : 'daily X cap reached'
    await db.from('homer_feed_posts').update({ x_post_id: xId, discord_sent: !!d?.ok, payload: { ...payload, mode: 'live', no_shot: noShot, x_why: xWhy, posted_at: new Date().toISOString() } })
      .match({ day, kind })
    out[g.game_id] = `live: discord ${d?.ok ? 'ok' : 'failed'}${slot ? `, X ${xId || xWhy}` : ''}`
  }
  return out
}

// a game that can't get a write-up says why, once, on /admin ('skipped' is never counted as an X post)
async function skip(db, day, kind, reason, dry) {
  if (dry === 'print') return `skip: ${reason}`
  await db.from('homer_feed_posts').upsert([{ day, kind, x_post_id: 'skipped', payload: { mode: 'skipped', reason } }], { onConflict: 'day,kind', ignoreDuplicates: true })
  return `skipped: ${reason}`
}
