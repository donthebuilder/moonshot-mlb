// ⚡ THE HARDEST SHOT OF THE NIGHT (BATCH-3D-V2 step 3). Server only.
// Once a night's games are all graded (app/api/lamp/tick, the existing cron),
// its shooters' NHL EDGE speed files are read (lib/nhl/shotSpeed.js: a day's
// cache, 4 at a time), each player's ten hardest of the season are matched to
// that night's exact shots in lamp_shots (date + period + clock + shooter),
// the matches are kept in lamp_shot_speed, and the fastest is posted once.
//
// WHAT IT CAN CLAIM: EDGE publishes a measured speed only for each player's ten
// hardest shots of the season. So the post is "the hardest MEASURED shot of the
// night" and says why; a night where none of the shots made anyone's ten has no
// post. Nothing is estimated.
//
// HIDDEN UNTIL ITS SQL RUNS (supabase/migrations/202610020300_*): no table, no
// EDGE reads, no post. A night scanned with no match is claimed as done (payload
// { none: true }) so it is not rescanned every tick.
import { readShotSpeed } from './shotSpeed'
import { postOnce } from '../dash/longshotsPost'

export const HARDEST_KIND = 'nhlhardest'
const RESULT_WORD = { goal: 'that scored', sog: 'on goal, saved', miss: 'that missed the net', block: 'that was blocked' }
const perWord = (p, t) => (t && t !== 'REG' ? (t === 'OT' ? 'OT' : t) : p === 1 ? '1st' : p === 2 ? '2nd' : p === 3 ? '3rd' : `P${p}`)

export const tableReady = async (db) => !(await db.from('lamp_shot_speed').select('game_id').limit(1)).error

async function pool(items, n, fn) {
  const out = []; let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]).catch(() => null) } }))
  return out
}

/** The night's measured shots, matched and stored; the fastest first. */
export async function scanNight(db, date) {
  const { data: rows, error } = await db.from('lamp_shots')
    .select('game_id, event_id, player_id, team, period, period_type, time_s, shot_type, result, season, game_type')
    .eq('game_date', date).not('player_id', 'is', null).limit(5000)
  if (error) throw new Error(error.message)
  if (!rows?.length) return { matched: [] }
  const teamsIn = new Map()
  for (const r of rows) { const s = teamsIn.get(r.game_id) || new Set(); s.add(r.team); teamsIn.set(r.game_id, s) }
  const shooters = [...new Map(rows.map((r) => [r.player_id, r])).values()]
  const speeds = await pool(shooters, 4, (r) => readShotSpeed({ player: r.player_id, season: r.season, gameType: r.game_type || 2 }))
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
  return { matched }
}

export function hardestText(m, { site = 'dashnetwork.vercel.app', limit = 280 } = {}) {
  const r = m.row
  const lines = (withAvg) => [
    '⚡ HARDEST SHOT OF THE NIGHT',
    '',
    `${m.mph} MPH · ${m.name || 'Unknown'} (${r.team}), a ${r.shot_type || ''} shot ${RESULT_WORD[r.result] || ''}, ${perWord(r.period, r.period_type)} period${m.opp ? ` vs ${m.opp}` : ''}.`.replace(/\s+/g, ' '),
    m.avg ? `His average shot: ${m.avg} mph (league ${m.leagueAvg}).` : null,
    '',
    'Measured by NHL EDGE (each player’s 10 hardest are published).',
    `${site}/app#sport=nhl&tab=shotmap`,
  ].filter((l) => l != null && (withAvg || !/^His average/.test(l))).join('\n')
  // under X's limit: the average line goes first if a long name needs the room
  const full = lines(true)
  return full.length <= limit ? full : lines(false)
}

/** Once per game day, after every game is graded. */
export async function postHardestOnce(db, date) {
  if (!(await tableReady(db))) return 'no-table (sql not run)'
  const { data: done } = await db.from('homer_feed_posts').select('day').match({ day: date, kind: HARDEST_KIND }).maybeSingle()
  if (done) return 'already-posted'
  const { matched } = await scanNight(db, date)
  if (!matched.length) {
    await db.from('homer_feed_posts').upsert([{ day: date, kind: HARDEST_KIND, payload: { none: true } }], { onConflict: 'day,kind', ignoreDuplicates: true })
    return 'none-measured'
  }
  const best = matched[0]
  return postOnce(db, { day: date, kind: HARDEST_KIND, build: async () => ({ text: hardestText(best), payload: { game_id: best.row.game_id, event_id: best.row.event_id, player_id: best.row.player_id, mph: best.mph, matched: matched.length } }) })
}
