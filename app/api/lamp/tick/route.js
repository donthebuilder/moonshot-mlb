// LAMP GOAL BOARD — THE LOCK AND THE GRADE. Vercel cron, every ten minutes
// through the NHL's game windows (vercel.json), plus manual fire with any of
// the three cron secrets (?date=YYYY-MM-DD to run a past day's grading).
//
// LOCK: for every game on the ET day that is still pregame and inside the
// 100-minute window before puck drop, score the whole night (one code
// path, lib/nhl/goalBoard.js) and upsert that game's rows with locked_at =
// now. The clock is re-read right before the write and NOTHING is written
// once now >= start_utc, so the last write is the lock and it is always
// before puck drop. Rows not refreshed by the write (a man cut from the
// lineup between snapshots) are removed, so the lock is exactly the last
// population. Same rule MOONSHOT moved to on 09-14 after the leaky lock.
//
// GRADE: every game in lamp_goal_games for today or yesterday with no
// graded_at whose feed state is final gets its boxscore read once:
// dressed / goals / hit per row (lib/nhl/goalModel.js gradeRows), never
// touching the scoring columns. A postponed game is closed with state PPD
// and its rows stay void. Failures are logged loudly and skipped; the next
// tick tries again. Nothing here ever invents a row.
import { easternToday } from '../../../../lib/data'
import { scoreFor, nhlGet, validDate, TTL } from '../../../../lib/nhl/api'
import { reduceScoreDay } from '../../../../lib/nhl/reduce'
import { buildNight, toLogRow } from '../../../../lib/nhl/goalBoard'
import { gradeRows, MODEL_VERSION } from '../../../../lib/nhl/goalModel'
import { cronAuthorized, adminClient } from '../../../../lib/nhl/db'
import { LOCK_WINDOW_MS } from '../../../../lib/nhl/boardRead'
import { startersFromPlayByPlay, goaliesFromBoxscore } from '../../../../lib/nhl/goalies'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// The net columns (starters, starters_source, starters_actual, goalies) were
// added to lamp_goal_games the same day as the tables, in the same migration
// file. If that file was run before the columns were appended, the write
// fails on the missing column: retry without the net rather than lose the
// lock or the grade, and say so in the log. Run the migration again — it is
// idempotent.
const NET_COLS = ['starters', 'starters_source', 'starters_actual', 'goalies']
const missingNetColumn = (error) => Boolean(error && /column|schema cache/i.test(error.message || '') && NET_COLS.some((c) => (error.message || '').includes(c)))
async function writeGame(db, game_id, row, op) {
  const run = (r) => (op === 'update'
    ? db.from('lamp_goal_games').update(r).eq('game_id', game_id).eq('model_version', MODEL_VERSION)
    : db.from('lamp_goal_games').upsert(r, { onConflict: 'game_id,model_version' }))
  let res = await run(row)
  if (res.error && missingNetColumn(res.error)) {
    console.error(`[lamp tick] games ${game_id}: net columns missing (${res.error.message}) — run the 2026-09-25 lamp_goal_log migration again; writing without the net`)
    res = await run(Object.fromEntries(Object.entries(row).filter(([k]) => !NET_COLS.includes(k))))
  }
  return res
}
const dayBefore = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d - 1, 12)).toISOString().slice(0, 10) }

export async function GET(request) {
  if (!cronAuthorized(request)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const db = adminClient()
  if (!db) return Response.json({ error: 'no supabase env' }, { status: 500 })
  const t0 = Date.now()
  const { searchParams } = new URL(request.url)
  const date = validDate(searchParams.get('date')) ? searchParams.get('date') : easternToday()
  const out = { date, modelVersion: MODEL_VERSION, locked: [], graded: [], skipped: [] }

  // ── LOCK ──────────────────────────────────────────────────────────────
  let night = null
  try {
    night = await buildNight(date)
  } catch (e) {
    console.error(`[lamp tick] buildNight ${date}: ${e?.message}`)
    out.skipped.push({ why: `buildNight failed: ${e?.message}` })
  }
  if (night) {
    for (const g of night.games) {
      const start = Date.parse(g.startUtc)
      if (!(g.state === 'pre' && Date.now() < start && start - Date.now() <= LOCK_WINDOW_MS)) continue
      const rows = night.byGame.get(g.id) || []
      if (!rows.length) { out.skipped.push({ game: g.id, why: 'no candidates' }); continue }
      const lockedAt = new Date().toISOString()
      if (Date.parse(lockedAt) >= start) { out.skipped.push({ game: g.id, why: 'puck dropped during build' }); continue }
      const { error } = await db.from('lamp_goal_log').upsert(rows.map((r) => toLogRow(r, g, night.day, lockedAt)), { onConflict: 'game_id,player_id,model_version' })
      if (error) { console.error(`[lamp tick] upsert ${g.id}: ${error.message}`); out.skipped.push({ game: g.id, why: `upsert: ${error.message}` }); continue }
      const del = await db.from('lamp_goal_log').delete().eq('game_id', g.id).eq('model_version', MODEL_VERSION).lt('locked_at', lockedAt)
      if (del.error) console.error(`[lamp tick] prune ${g.id}: ${del.error.message}`)
      const prevGame = await db.from('lamp_goal_games').select('snapshots').eq('game_id', g.id).eq('model_version', MODEL_VERSION).maybeSingle()
      const gm = await writeGame(db, g.id, {
        game_id: g.id, model_version: MODEL_VERSION, game_date: night.day.date, season: g.season, game_type: g.gameType, start_utc: g.startUtc,
        away: g.away.abbrev, home: g.home.abbrev, snapshots: (prevGame.data?.snapshots || 0) + 1,
        lineup_known: Boolean(night.lineups[g.id]), locked_at: lockedAt, state: g.rawState,
        // The net, pregame: null until a starter source exists (lib/nhl/goalies.js).
        starters: night.starters?.byGame?.[g.id] || null, starters_source: night.starters?.source || null,
      }, 'upsert')
      if (gm.error) console.error(`[lamp tick] games ${g.id}: ${gm.error.message}`)
      out.locked.push({ game: g.id, matchup: `${g.away.abbrev}@${g.home.abbrev}`, rows: rows.length, called: rows.filter((r) => r.status === 'called').map((r) => r.name), lineupKnown: Boolean(night.lineups[g.id]), minutesToDrop: Math.round((start - Date.now()) / 60000) })
    }
  }

  // ── GRADE ─────────────────────────────────────────────────────────────
  const pending = await db.from('lamp_goal_games').select('game_id, game_date').eq('model_version', MODEL_VERSION).is('graded_at', null).in('game_date', [date, dayBefore(date)])
  if (pending.error) { console.error(`[lamp tick] pending: ${pending.error.message}`); out.skipped.push({ why: `pending: ${pending.error.message}` }) }
  const feedByDate = {}
  for (const p of pending.data || []) {
    try {
      if (!feedByDate[p.game_date]) feedByDate[p.game_date] = (p.game_date === date && night) ? night.day : reduceScoreDay(await scoreFor(p.game_date))
      const g = feedByDate[p.game_date].games.find((x) => x.id === Number(p.game_id))
      if (!g) { out.skipped.push({ game: p.game_id, why: 'not on the feed for its date' }); continue }
      if (g.scheduleState !== 'OK') {
        await db.from('lamp_goal_games').update({ state: g.scheduleState, graded_at: new Date().toISOString() }).eq('game_id', p.game_id).eq('model_version', MODEL_VERSION)
        out.graded.push({ game: p.game_id, closed: g.scheduleState }); continue
      }
      if (g.state !== 'final') { await db.from('lamp_goal_games').update({ state: g.rawState }).eq('game_id', p.game_id).eq('model_version', MODEL_VERSION); continue }
      const box = await nhlGet(`/gamecenter/${p.game_id}/boxscore`, TTL.game)
      if (!box?.playerByGameStats) { out.skipped.push({ game: p.game_id, why: 'final but no playerByGameStats yet' }); continue }
      // The net, postgame — archived for the v2 goalie leg; a failed play-by-play read costs only the starters, never the grade.
      const pbp = await nhlGet(`/gamecenter/${p.game_id}/play-by-play`, TTL.game).catch((e) => { console.error(`[lamp tick] pbp ${p.game_id}: ${e?.message}`); return null })
      const startersActual = pbp ? startersFromPlayByPlay(pbp) : null
      const goalies = goaliesFromBoxscore(box)
      const have = await db.from('lamp_goal_log').select('*').eq('game_id', p.game_id).eq('model_version', MODEL_VERSION)
      if (have.error) throw new Error(have.error.message)
      const gradedAt = new Date().toISOString()
      const graded = gradeRows((have.data || []).map((r) => ({ ...r, playerId: r.player_id, status: r.status, rank: r.rank_in_game })), box.playerByGameStats)
      const up = await db.from('lamp_goal_log').upsert(graded.map(({ playerId, rank, ...r }) => ({ ...r, dressed: r.dressed, goals: r.goals, hit: r.hit, graded_at: gradedAt })), { onConflict: 'game_id,player_id,model_version' })
      if (up.error) throw new Error(up.error.message)
      const gu = await writeGame(db, p.game_id, { state: g.rawState, graded_at: gradedAt, starters_actual: startersActual, goalies }, 'update')
      if (gu.error) throw new Error(gu.error.message)
      const scorers = graded.filter((r) => r.hit)
      out.graded.push({ game: p.game_id, matchup: `${g.away.abbrev}@${g.home.abbrev}`, rows: graded.length, dressed: graded.filter((r) => r.dressed).length, net: [startersActual?.away?.name, startersActual?.home?.name], scorers: scorers.map((r) => `${r.name} (${r.status}${r.rank ? ` #${r.rank}` : ''})`) })
    } catch (e) {
      console.error(`[lamp tick] grade ${p.game_id}: ${e?.message}`); out.skipped.push({ game: p.game_id, why: `grade: ${e?.message}` })
    }
  }
  out.ms = Date.now() - t0
  console.log(`[lamp tick] ${date} locked ${out.locked.length} graded ${out.graded.length} skipped ${out.skipped.length} in ${out.ms}ms`)
  return Response.json(out, { headers: { 'Cache-Control': 'no-store' } })
}
