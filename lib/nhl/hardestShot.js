// ⚡ THE HARDEST SHOT OF THE NIGHT (BATCH-3D-V2 step 3). Server only.
// Once a night's games are all graded (app/api/lamp/tick, the existing cron),
// its shooters' NHL EDGE speed files are read (lib/nhl/shotSpeed.js: fresh from
// the league, 4 at a time), each player's ten hardest of the season are matched to
// that night's exact shots in lamp_shots (date + period + clock + shooter),
// the matches are kept in lamp_shot_speed, and the fastest is posted once.
//
// WHAT IT CAN CLAIM: EDGE publishes a measured speed only for each player's ten
// hardest shots of the season. So the post is "the hardest MEASURED shot of the
// night" and says why; a night where none of the shots made anyone's ten has no
// post. Nothing is estimated.
//
// HIDDEN UNTIL ITS SQL RUNS (supabase/migrations/202610020300_*): no table, no
// EDGE reads, no post.
//
// A NIGHT WITH NO MATCH IS NOT CLAIMED UNTIL IT IS OVER (2026-10-26). The first version wrote { none: true } on the first empty scan, and
// the post logged "none" for every night from Oct 12 to Oct 25 while the league's feed held ~470 measured shots for Oct 24 alone (59 of 60
// sampled matched a stored shot to the second). Two causes, both fixed: (1) the scan read each shooter's list through a 24-hour Data
// Cache, so the list it saw was the one written before the games; (2) the league fills the list in after the final horn, and one empty
// look at the final horn closed the night for good. Now the scan reads the league fresh, an empty look is asked again about once an hour
// (per server instance), and 'none' is claimed only once the night is over: the next Eastern day, from 11:00 ET (where the lamp tick's
// morning run opens, vercel.json). A night with a match posts the moment it is found, exactly as before.
import { readShotSpeed } from './shotSpeed'
import { readPaged } from '../record/paged'
import { easternDate, etHour } from '../data'
import { postOnce } from '../dash/longshotsPost'
import { knownTaken, markTaken } from '../dash/postClaim'

export const HARDEST_KIND = 'nhlhardest'
const RESULT_WORD = { goal: 'that scored', sog: 'on goal, saved', miss: 'that missed the net', block: 'that was blocked' }
const perWord = (p, t) => (t && t !== 'REG' ? (t === 'OT' ? 'OT' : t) : p === 1 ? '1st' : p === 2 ? '2nd' : p === 3 ? '3rd' : `P${p}`)

// a table that answered once stays answered for this instance (egress round 6); a missing one is asked again
let _ready = false
export const tableReady = async (db) => _ready || (_ready = !(await db.from('lamp_shot_speed').select('game_id').limit(1)).error)

async function pool(items, n, fn) {
  const out = []; let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]).catch(() => null) } }))
  return out
}

/** The night's measured shots, matched and stored; the fastest first. */
export async function scanNight(db, date) {
  // paged: a busy night is 1,300-1,800 shots and the API stops a request at 1,000 without saying so (the old .limit(5000) saw a third of them at most)
  const { data: rows, error } = await readPaged(() => db.from('lamp_shots')
    .select('game_id, event_id, player_id, team, period, period_type, time_s, shot_type, result, season, game_type')
    .eq('game_date', date).not('player_id', 'is', null).order('game_id', { ascending: true }).order('event_id', { ascending: true }))
  if (error) throw new Error(error.message)
  if (!rows?.length) return { matched: [], listed: 0 }
  const teamsIn = new Map()
  for (const r of rows) { const s = teamsIn.get(r.game_id) || new Set(); s.add(r.team); teamsIn.set(r.game_id, s) }
  const shooters = [...new Map(rows.map((r) => [r.player_id, r])).values()]
  const speeds = await pool(shooters, 4, (r) => readShotSpeed({ player: r.player_id, season: r.season, gameType: r.game_type || 2, fresh: true }))
  const listed = speeds.filter(Boolean).length   // lists the league actually answered with (none = the feed is down, not "no hard shots")
  const matched = []
  shooters.forEach((r0, k) => {
    const sp = speeds[k]
    for (const h of sp?.hardest || []) {
      if (h.date !== date) continue
      const row = rows.find((r) => r.player_id === r0.player_id && r.game_id === h.gameId && r.period === h.period && r.time_s === h.timeS)
      if (!row) continue
      const opp = [...(teamsIn.get(row.game_id) || [])].find((t) => t !== row.team) || null
      matched.push({ row, mph: h.mph, name: sp.name, avg: sp.avg, leagueAvg: sp.leagueAvg, opp })
    }
  })
  matched.sort((a, b) => b.mph - a.mph)
  if (matched.length) {
    await db.from('lamp_shot_speed').upsert(matched.map((m) => ({
      game_id: m.row.game_id, event_id: m.row.event_id, player_id: m.row.player_id, game_date: date, season: m.row.season, mph: m.mph,
    })), { onConflict: 'game_id,event_id' })
  }
  return { matched, listed }
}

// NO LINKS ON X (2026-10-09): the shot-map URL line that closed this post is gone.
export function hardestText(m, { limit = 280 } = {}) {
  const r = m.row
  const lines = (withAvg) => [
    '⚡ HARDEST SHOT OF THE NIGHT',
    '',
    `${m.mph} MPH · ${m.name || 'Unknown'} (${r.team}), a ${r.shot_type || ''} shot ${RESULT_WORD[r.result] || ''}, ${perWord(r.period, r.period_type)} period${m.opp ? ` vs ${m.opp}` : ''}.`.replace(/\s+/g, ' '),
    m.avg ? `His average shot: ${m.avg} mph (league ${m.leagueAvg}).` : null,
    '',
    'Measured by NHL EDGE (each player’s 10 hardest are published).',
  ].filter((l) => l != null && (withAvg || !/^His average/.test(l))).join('\n')
  // under X's limit: the average line goes first if a long name needs the room
  const full = lines(true)
  return full.length <= limit ? full : lines(false)
}

const RESCAN_MS = 60 * 60 * 1000
const FINAL_FROM_ET_HOUR = 11
const _emptyLook = new Map()   // night -> when THIS instance last looked and found nothing

/** Is this night over for good: an earlier Eastern day, from 11:00 ET (the league has had the whole morning to fill in its lists). */
export const nightIsFinal = (date, now = Date.now()) => date < easternDate(now) && etHour(now) >= FINAL_FROM_ET_HOUR

/** Once per game day, after every game is graded. */
export async function postHardestOnce(db, date, { now = Date.now() } = {}) {
  // a night already seen taken costs no request (lib/dash/postClaim.js; the tick asks for today and yesterday every 10 min)
  if (knownTaken(date, HARDEST_KIND)) return 'already-posted'
  if (!(await tableReady(db))) return 'no-table (sql not run)'
  const { data: done } = await db.from('homer_feed_posts').select('day').match({ day: date, kind: HARDEST_KIND }).maybeSingle()
  if (done) { markTaken(date, HARDEST_KIND); return 'already-posted' }
  const final = nightIsFinal(date, now)
  const looked = _emptyLook.get(date)
  if (looked && now - looked < RESCAN_MS) return 'none-yet (the league was asked less than an hour ago)'   // ~400 league reads a look: not every tick
  const { matched, listed } = await scanNight(db, date)
  if (!matched.length) {
    if (!final || !listed) {   // not over yet, or the league answered nothing at all (down): never close a night on a feed we could not read
      if (_emptyLook.size > 20) _emptyLook.clear()
      _emptyLook.set(date, now)
      return listed ? 'none-yet (the league has not listed the night)' : 'none-yet (the league answered no lists)'
    }
    await db.from('homer_feed_posts').upsert([{ day: date, kind: HARDEST_KIND, payload: { none: true } }], { onConflict: 'day,kind', ignoreDuplicates: true })
    _emptyLook.delete(date)
    return 'none-measured'
  }
  _emptyLook.delete(date)
  const best = matched[0]
  return postOnce(db, { day: date, kind: HARDEST_KIND, sport: 'nhl', build: async () => ({ text: hardestText(best), payload: { game_id: best.row.game_id, event_id: best.row.event_id, player_id: best.row.player_id, mph: best.mph, matched: matched.length } }) })
}
