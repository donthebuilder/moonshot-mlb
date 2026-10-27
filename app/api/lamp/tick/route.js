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
import { easternToday, dayBefore, shiftDay } from '../../../../lib/data'
import { scoreFor, nhlGet, validDate, TTL } from '../../../../lib/nhl/api'
import { reduceScoreDay } from '../../../../lib/nhl/reduce'
import { buildNight, toLogRow } from '../../../../lib/nhl/goalBoard'
import { gradeRows } from '../../../../lib/nhl/goalModel'
import { VERSIONS, versionsFor } from '../../../../lib/nhl/versions'
import { recheckReason, changedResults, resultPatch, RECHECK_MAX_MS } from '../../../../lib/nhl/regrade'
import { cronAuthorized, adminClient } from '../../../../lib/supabase/admin'
import { LOCK_WINDOW_MS, readBoard } from '../../../../lib/nhl/boardRead'
import { startersFromPlayByPlay, goaliesFromBoxscore } from '../../../../lib/nhl/goalies'
import { shotsFromPlayByPlay, writeShots } from '../../../../lib/nhl/shots'
import { boxRowsNhl, writeBox } from '../../../../lib/nhl/box'
import { writeOpeningNhl, openingRowNhl } from '../../../../lib/nhl/openings'
import { teamGameRows, writeTeamGames } from '../../../../lib/nhl/teamXg'
import { postLongshotsOnce } from '../../../../lib/dash/longshotsPost'
import { postMultiClubOnce } from '../../../../lib/dash/multiClubPost'
import { toPropRow, gradeSogRows, MARKET as SOG } from '../../../../lib/nhl/sogModel'
import { toGoal2Row, gradeGoal2Rows, MARKET as GOAL2 } from '../../../../lib/nhl/goal2Model'
import { toPtsRow, gradePtsRows, MARKET as PTS } from '../../../../lib/nhl/ptsModel'
import { toAstRow, gradeAstRows, MARKET as AST } from '../../../../lib/nhl/astModel'
import { MARKET as GOALPOS, toGoalPosRow, gradeGoalPosRows } from '../../../../lib/nhl/goalPosModel'
import { MARKET as GOALW, toGoalWeightedRow, gradeGoalWeightedRows } from '../../../../lib/nhl/goalWeightedModel'
import { toCompositeRow, gradeCompositeRows } from '../../../../lib/nhl/goalCompositeModel'
import { attachComposite } from '../../../../lib/nhl/goalCompositeBoard'
import { toComposite2Row, gradeComposite2Rows } from '../../../../lib/nhl/goalComposite2Model'
import { attachComposite2 } from '../../../../lib/nhl/goalComposite2Board'
import { MARKET as FIRSTM, toFirstRow, gradeFirstRows } from '../../../../lib/nhl/firstModel'
import { attachFirst } from '../../../../lib/nhl/firstBoard'
import { readNumerology } from '../../../../lib/nhl/numerology'
import { writeNight as writeNumerology, gradeNight as gradeNumerology, boxResults, refreshLaneNights, writeNumbersNight } from '../../../../lib/numerology/record'
import { fromNhl } from '../../../../lib/numerology/adapters'
import { storiesTick } from '../../../../lib/stories/record'
import { postNhlListOnce } from '../../../../lib/lists/post'
import { postHardestOnce } from '../../../../lib/nhl/hardestShot'
import { windowOpen } from '../../../../lib/dash/xSchedule'
import { runNhlWriteups } from '../../../../lib/writeups/post'
import { postLampSlateOnce } from '../../../../lib/posts/lampSlate'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const SHADOW_START_BY_MS = 22_000   // a shadow starts only if the tick is younger than this
const SHADOW_CAP_MS = 9_000         // ...and gets at most this long

// The net columns (starters, starters_source, starters_actual, goalies) were
// added to lamp_goal_games the same day as the tables, in the same migration
// file. If that file was run before the columns were appended, the write
// fails on the missing column: retry without the net rather than lose the
// lock or the grade, and say so in the log. Run the migration again — it is
// idempotent.
const NET_COLS = ['starters', 'starters_source', 'starters_actual', 'goalies']
const missingNetColumn = (error) => Boolean(error && /column|schema cache/i.test(error.message || '') && NET_COLS.some((c) => (error.message || '').includes(c)))
async function writeGame(db, game_id, row, op, version) {
  const run = (r) => (op === 'update'
    ? db.from('lamp_goal_games').update(r).eq('game_id', game_id).eq('model_version', version)
    : db.from('lamp_goal_games').upsert(r, { onConflict: 'game_id,model_version' }))
  let res = await run(row)
  if (res.error && missingNetColumn(res.error)) {
    console.error(`[lamp tick] games ${game_id}: net columns missing (${res.error.message}) — run the 2026-09-25 lamp_goal_log migration again; writing without the net`)
    res = await run(Object.fromEntries(Object.entries(row).filter(([k]) => !NET_COLS.includes(k))))
  }
  return res
}
// SHADOW MARKETS (2026-10-01): lamp-pts-v1 / lamp-ast-v1. Locked and graded
// exactly like LAMP SHOTS, read by nothing on the site. lamp_prop_log's
// market check already allows 'PTS' and 'AST' (202609280100_lamp_prop_log.sql).
const SHADOW = [
  { market: PTS, key: 'pts', byGame: 'ptsByGame', toRow: toPtsRow, grade: gradePtsRows },
  { market: AST, key: 'ast', byGame: 'astByGame', toRow: toAstRow, grade: gradeAstRows },
  // lamp-goalpos-v1 (2026-10-03): the goal board, ice time ranked within position.
  // Needs lamp_prop_log's market check to allow 'GOAL' (RUN-IN-SUPABASE-2026-10-03-lamp-goalpos.sql);
  // until then its upsert fails, is logged, and nothing else is touched.
  { market: GOALPOS, key: 'goalpos', byGame: 'goalPosByGame', toRow: toGoalPosRow, grade: gradeGoalPosRows },
  // lamp-goalw-v1 (2026-10-10, .claude-notes/LAMP-GOALW-DEFINITION.md): the goal board's legs, fitted weights + a defence flag.
  // Same market ('GOAL') and table as goalpos; the primary key carries model_version, so no SQL.
  { market: GOALW, key: 'goalw', byGame: 'goalWByGame', toRow: toGoalWeightedRow, grade: gradeGoalWeightedRows },
  // goal2_site_v1 (2026-10-11, lib/nhl/goal2Model.js): 2+ goals, a NEW model, tracked. Market 'GOAL', its own version in the key: no SQL.
  { market: GOAL2, key: 'goal2', byGame: 'goal2ByGame', toRow: toGoal2Row, grade: gradeGoal2Rows },
  // lamp-goal-comp-v1 (2026-10-18, lib/nhl/goalCompositeModel.js): HIDDEN composite, ONE score per scored skater per game. Market 'GOAL' under its own
  // version (the primary key carries the version): no SQL. Its own failure is caught below and never touches the goals tick.
  { market: 'GOAL', key: 'comp', byGame: 'compByGame', toRow: toCompositeRow, grade: gradeCompositeRows },
  // lamp-goal-comp-v2 (2026-10-18, lib/nhl/goalComposite2Model.js): v1 + xG shot quality, PP ice time / share, the opponent's rest. A NEW version beside v1; same market, no SQL.
  { market: 'GOAL', key: 'comp2', byGame: 'comp2ByGame', toRow: toComposite2Row, grade: gradeComposite2Rows },
  // lamp-first-v1 (2026-10-27, lib/nhl/firstModel.js): who scores the game's FIRST goal, ranked in the game. Market 'FIRST' (202610271700_first_scorer.sql, applied).
  // Graded off the play-by-play's first goal (the third argument); with no first goal to name, its rows stay ungraded.
  { market: FIRSTM, key: 'first', byGame: 'firstByGame', toRow: toFirstRow, grade: gradeFirstRows },
]

export async function GET(request) {
  if (!cronAuthorized(request)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const db = adminClient()
  if (!db) return Response.json({ error: 'no supabase env' }, { status: 500 })
  const t0 = Date.now()
  const { searchParams } = new URL(request.url)
  const date = validDate(searchParams.get('date')) ? searchParams.get('date') : easternToday()
  // the versions tonight's games lock under (lib/nhl/versions.js: v3 from 10-03)
  const V = versionsFor(date)
  const out = { date, modelVersion: V.goal, locked: [], graded: [], skipped: [] }

  // ── LOCK ──────────────────────────────────────────────────────────────
  let night = null
  try {
    night = await buildNight(date)
  } catch (e) {
    console.error(`[lamp tick] buildNight ${date}: ${e?.message}`)
    out.skipped.push({ why: `buildNight failed: ${e?.message}` })
  }
  // lamp-goal-comp-v1: scored only when a game is inside its lock window; its own failure, logged, never the lock's
  if (night && night.games.some((g) => g.state === 'pre' && Date.now() < Date.parse(g.startUtc) && Date.parse(g.startUtc) - Date.now() <= LOCK_WINDOW_MS)) {
    // TIME BUDGET (2026-10-18): the hidden shadows must never cost the real lock. They run only while the tick is young and each gets a hard cap;
    // past it the shadow is skipped for this run (its row is simply not written this tick) and the live lock goes ahead.
    const young = () => Date.now() - t0 < SHADOW_START_BY_MS
    const capped = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`shadow over its ${SHADOW_CAP_MS}ms budget`)), SHADOW_CAP_MS))])
    if (young()) try { out.composite = (await capped(attachComposite(night, date))).feeds } catch (e) { console.error(`[lamp tick] composite: ${e?.message}`); night.compByGame = null }
    // lamp-goal-comp-v2: its OWN try/catch (a v2 failure never touches v1, the lock or the goals tick); all its extra reads are cached or Supabase
    if (young()) try { out.composite2 = (await capped(attachComposite2(night, date))).feeds } catch (e) { console.error(`[lamp tick] composite2: ${e?.message}`); night.comp2ByGame = null }
    // lamp-first-v1: its OWN try/catch; one Supabase read of this season's finished games before the day
    if (young()) try { out.first = (await capped(attachFirst(night, db, date))).feeds } catch (e) { console.error(`[lamp tick] first: ${e?.message}`); night.firstByGame = null }
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
      const del = await db.from('lamp_goal_log').delete().eq('game_id', g.id).eq('model_version', V.goal).lt('locked_at', lockedAt)
      if (del.error) console.error(`[lamp tick] prune ${g.id}: ${del.error.message}`)
      // LAMP SHOTS (lamp-sog-v1): same game, same snapshot, same lockedAt, the
      // same "never at or after puck drop" (checked above). Its own failure,
      // logged; never the goal lock's.
      const sogRows = night.sogByGame?.get(g.id) || []
      if (sogRows.length) {
        const up = await db.from('lamp_prop_log').upsert(sogRows.map((r) => toPropRow(r, g, night.day, lockedAt)), { onConflict: 'game_id,player_id,market,model_version' })
        if (up.error) console.error(`[lamp tick] sog upsert ${g.id}: ${up.error.message}`)
        else {
          const sdel = await db.from('lamp_prop_log').delete().eq('game_id', g.id).eq('market', SOG).eq('model_version', V.sog).lt('locked_at', lockedAt)
          if (sdel.error) console.error(`[lamp tick] sog prune ${g.id}: ${sdel.error.message}`)
        }
      }
      // SHADOW points / assists: same snapshot, same lockedAt; the clock is
      // re-read before each write (never at or after puck drop). Own failures.
      const shadowLocked = {}
      for (const m of SHADOW) {
        const mRows = night[m.byGame]?.get(g.id) || []
        if (!mRows.length) continue
        if (Date.now() >= start) { out.skipped.push({ game: g.id, why: `${m.market}: puck dropped before its write` }); continue }
        const mu = await db.from('lamp_prop_log').upsert(mRows.map((r) => m.toRow(r, g, night.day, lockedAt)), { onConflict: 'game_id,player_id,market,model_version' })
        if (mu.error) { console.error(`[lamp tick] ${m.market} upsert ${g.id}: ${mu.error.message}`); continue }
        const md = await db.from('lamp_prop_log').delete().eq('game_id', g.id).eq('market', m.market).eq('model_version', V[m.key]).lt('locked_at', lockedAt)
        if (md.error) console.error(`[lamp tick] ${m.market} prune ${g.id}: ${md.error.message}`)
        shadowLocked[m.market] = mRows.length
      }
      const prevGame = await db.from('lamp_goal_games').select('snapshots').eq('game_id', g.id).eq('model_version', V.goal).maybeSingle()
      const gm = await writeGame(db, g.id, {
        game_id: g.id, model_version: V.goal, game_date: night.day.date, season: g.season, game_type: g.gameType, start_utc: g.startUtc,
        away: g.away.abbrev, home: g.home.abbrev, snapshots: (prevGame.data?.snapshots || 0) + 1,
        lineup_known: Boolean(night.lineups[g.id]), locked_at: lockedAt, state: g.rawState,
        // The net, pregame: null until a starter source exists (lib/nhl/goalies.js).
        starters: night.starters?.byGame?.[g.id] || null, starters_source: night.starters?.source || null,
      }, 'upsert', V.goal)
      if (gm.error) console.error(`[lamp tick] games ${g.id}: ${gm.error.message}`)
      out.locked.push({ game: g.id, matchup: `${g.away.abbrev}@${g.home.abbrev}`, rows: rows.length, called: rows.filter((r) => r.status === 'called').map((r) => r.name),
        sogCalled: sogRows.filter((r) => r.status === 'called').map((r) => r.name), shadow: shadowLocked, lineupKnown: Boolean(night.lineups[g.id]), minutesToDrop: Math.round((start - Date.now()) / 60000) })
    }
  }

  // ── NUMEROLOGY, RECORDED (BATCH-NUMEROLOGY step 6) ─────────────────────
  // Dressed skaters (the posted lineup) of games still before puck drop,
  // inside the lock window, written once (first write wins). Its own
  // failure, logged; never the lock's.
  if (night && night.games.some((g) => g.state === 'pre' && Date.now() < Date.parse(g.startUtc) && Date.parse(g.startUtc) - Date.now() <= LOCK_WINDOW_MS)) {
    try {
      const num = await readNumerology(night.day.date)
      const open = new Map(night.games.filter((g) => g.state === 'pre' && Date.now() < Date.parse(g.startUtc)).map((g) => [`${g.away.abbrev}@${g.home.abbrev}`, g]))
      const players = (num.all || []).filter((r) => open.has(r.game)).map((r) => {
        const [away, home] = r.game.split('@')
        return { player_id: r.id, ...fromNhl({ ...r, opp: r.team === away ? home : away }) }
      })
      out.numerology = players.length ? await writeNumerology(db, 'nhl', night.day.date, players) : { players: 0, rows: 0 }
    } catch (e) { console.error(`[lamp tick] numerology write: ${e?.message}`) }
  }

  // ── GRADE ─────────────────────────────────────────────────────────────
  const pending = await db.from('lamp_goal_games').select('game_id, game_date, model_version').in('model_version', VERSIONS.goal).is('graded_at', null).gte('game_date', shiftDay(date, -6)).lte('game_date', date) /* a week, not two days: a missed day stayed ungraded (2026-10-04) */
  if (pending.error) { console.error(`[lamp tick] pending: ${pending.error.message}`); out.skipped.push({ why: `pending: ${pending.error.message}` }) }
  const feedByDate = {}
  for (const p of pending.data || []) {
    const Vp = versionsFor(p.game_date)   // graded under the version it was locked under
    try {
      if (!feedByDate[p.game_date]) feedByDate[p.game_date] = (p.game_date === date && night) ? night.day : reduceScoreDay(await scoreFor(p.game_date))
      const g = feedByDate[p.game_date].games.find((x) => x.id === Number(p.game_id))
      if (!g) { out.skipped.push({ game: p.game_id, why: 'not on the feed for its date' }); continue }
      if (g.scheduleState !== 'OK') {
        await db.from('lamp_goal_games').update({ state: g.scheduleState, graded_at: new Date().toISOString() }).eq('game_id', p.game_id).eq('model_version', Vp.goal)
        out.graded.push({ game: p.game_id, closed: g.scheduleState }); continue
      }
      if (g.state !== 'final') { await db.from('lamp_goal_games').update({ state: g.rawState }).eq('game_id', p.game_id).eq('model_version', Vp.goal); continue }
      // FRESH, AND FINAL (2026-10-04 audit F1). These read through the Data
      // Cache (TTL.game), so BUF@CHI 2026020022 was graded off a mid-game
      // boxscore -- 3 of its 7 goals, a CALLED scorer logged a miss -- and a
      // graded game is never retried. Grading reads the league directly and
      // grades only a boxscore that is itself over and agrees with the final
      // score; otherwise it waits for the next tick.
      const box = await nhlGet(`/gamecenter/${p.game_id}/boxscore`, 0)
      if (!box?.playerByGameStats) { out.skipped.push({ game: p.game_id, why: 'final but no playerByGameStats yet' }); continue }
      const boxOver = ['OFF', 'FINAL'].includes(String(box.gameState || '').toUpperCase())
      const boxAgrees = Number(box.homeTeam?.score) === Number(g.home?.score) && Number(box.awayTeam?.score) === Number(g.away?.score)
      if (!boxOver || !boxAgrees) {
        console.warn(`[lamp tick] ${p.game_id}: boxscore not final yet (state ${box.gameState}, ${box.awayTeam?.score}-${box.homeTeam?.score} vs feed ${g.away?.score}-${g.home?.score}) -- grading waits`)
        out.skipped.push({ game: p.game_id, why: 'boxscore not final yet' }); continue
      }
      // The net, postgame — archived for the v2 goalie leg; a failed play-by-play read costs only the starters, never the grade.
      const pbp = await nhlGet(`/gamecenter/${p.game_id}/play-by-play`, 0).catch((e) => { console.error(`[lamp tick] pbp ${p.game_id}: ${e?.message}`); return null })
      const startersActual = pbp ? startersFromPlayByPlay(pbp) : null
      const firstCtx = pbp ? { firstScorer: openingRowNhl(pbp)?.first_score_player ?? null } : null   // lamp-first-v1's grade
      const goalies = goaliesFromBoxscore(box)
      const have = await db.from('lamp_goal_log').select('*').eq('game_id', p.game_id).eq('model_version', Vp.goal)
      if (have.error) throw new Error(have.error.message)
      const gradedAt = new Date().toISOString()
      const graded = gradeRows((have.data || []).map((r) => ({ ...r, playerId: r.player_id, status: r.status, rank: r.rank_in_game })), box.playerByGameStats)
      const up = await db.from('lamp_goal_log').upsert(graded.map(({ playerId, rank, ...r }) => ({ ...r, dressed: r.dressed, goals: r.goals, hit: r.hit, graded_at: gradedAt })), { onConflict: 'game_id,player_id,model_version' })
      if (up.error) throw new Error(up.error.message)
      const gu = await writeGame(db, p.game_id, { state: g.rawState, graded_at: gradedAt, starters_actual: startersActual, goalies }, 'update', Vp.goal)
      if (gu.error) throw new Error(gu.error.message)
      // THE SHOT ARCHIVE (lamp research step 3): the play-by-play already read
      // for the net, written to lamp_shots. Its own failure, logged; never the grade's.
      let shotRows = null
      if (pbp) {
        try {
          const shots = shotsFromPlayByPlay(pbp)
          shotRows = (await writeShots(db, shots)).rows
          // THE CLUB-GAME LINE (lamp-team-v1, 2026-10-08): what each club scored, shot and allowed in this game, from the
          // shots just written; the slate's projection reads it. Its own failure, logged; a table that is not there yet is skipped.
          const tg = await writeTeamGames(db, teamGameRows(shots))
          if (tg.missing) console.error('[lamp tick] team xg: lamp_team_game_xg is not there yet (run 202610081200_lamp_team_game_xg.sql)')
        } catch (e) { console.error(`[lamp tick] shots ${p.game_id}: ${e?.message}`) }
      }
      // THE OPENING (2026-10-26, lib/nhl/openings.js): opening faceoff, first shot, first goal, from the play-by-play already
      // read -- the first-goal face wall's rows (opening_games, sport 'nhl'). Its own failure, logged, never the grade.
      if (pbp) {
        try {
          const oe = await writeOpeningNhl(db, pbp)
          if (oe) console.error(`[lamp tick] opening ${p.game_id}: ${oe}`)
        } catch (e) { console.error(`[lamp tick] opening ${p.game_id}: ${e?.message}`) }
      }
      // THE BOX ARCHIVE (2026-10-25, lib/nhl/box.js): every dressed player's line from this same boxscore, for LAMP Trending and
      // WITHOUT. Its own failure, logged; a table that is not there yet (202610252200_lamp_box.sql not run) is skipped, never the grade.
      try {
        const bx = await writeBox(db, boxRowsNhl(box))
        if (bx.missing) console.error('[lamp tick] box: lamp_box is not there yet (run 202610252200_lamp_box.sql)')
      } catch (e) { console.error(`[lamp tick] box ${p.game_id}: ${e?.message}`) }
      // LAMP SHOTS grade, off the same boxscore: value = sog, hit = 3+, not
      // dressed = void. Scoring columns untouched; its own failure, logged.
      let sogGraded = null
      try {
        const sh = await db.from('lamp_prop_log').select('*').eq('game_id', p.game_id).eq('market', SOG).eq('model_version', Vp.sog).is('graded_at', null)
        if (sh.error) throw new Error(sh.error.message)
        if (sh.data?.length) {
          const gs = gradeSogRows(sh.data, box.playerByGameStats)
          const su = await db.from('lamp_prop_log').upsert(gs.map((r) => ({ ...r, graded_at: gradedAt })), { onConflict: 'game_id,player_id,market,model_version' })
          if (su.error) throw new Error(su.error.message)
          sogGraded = { rows: gs.length, hits: gs.filter((r) => r.hit).length, calledHits: gs.filter((r) => r.hit && r.status === 'called').length }
        }
      } catch (e) { console.error(`[lamp tick] sog grade ${p.game_id}: ${e?.message}`) }
      // SHADOW grade (points >= 1 / assists >= 1), off the same boxscore, the
      // same way as SOG: not dressed = void; scoring columns untouched.
      const shadowGraded = {}
      for (const m of SHADOW) {
        try {
          const sh = await db.from('lamp_prop_log').select('*').eq('game_id', p.game_id).eq('market', m.market).eq('model_version', Vp[m.key]).is('graded_at', null)
          if (sh.error) throw new Error(sh.error.message)
          if (!sh.data?.length) continue
          if (m.key === 'first' && !firstCtx?.firstScorer) continue   // no first goal named (a pbp that failed, a game with no goal): stays ungraded
          const gs = m.grade(sh.data, box.playerByGameStats, firstCtx)
          const su = await db.from('lamp_prop_log').upsert(gs.map((r) => ({ ...r, graded_at: gradedAt })), { onConflict: 'game_id,player_id,market,model_version' })
          if (su.error) throw new Error(su.error.message)
          shadowGraded[m.market] = { rows: gs.length, hits: gs.filter((r) => r.hit).length, calledHits: gs.filter((r) => r.hit && r.status === 'called').length }
        } catch (e) { console.error(`[lamp tick] ${m.market} grade ${p.game_id}: ${e?.message}`) }
      }
      // Numerology grade for this game's skaters: played = dressed, hit = scored.
      // EVERY logged skater, not only the board's rows (2026-10-06, ledger audit P0-3): numerology logs each
      // dressed skater of the game, and a night's lane summary completes only when all of them are graded.
      try {
        const logged = await db.from('numerology_log').select('player_id').eq('sport', 'nhl').eq('day', p.game_date).eq('lane', '_eligible').in('team', [g.away.abbrev, g.home.abbrev]).is('graded_at', null)
        if (logged.error) throw new Error(logged.error.message)
        const results = boxResults(box.playerByGameStats, (logged.data || []).map((r) => String(r.player_id)))
        for (const r of graded) results.set(String(r.playerId), { played: r.dressed, hit: Boolean(r.dressed && r.goals >= 1) })   // the board's rows keep their own grade
        if (await gradeNumerology(db, 'nhl', p.game_date, results)) await refreshLaneNights(db, 'nhl', p.game_date)
      } catch (e) { console.error(`[lamp tick] numerology grade ${p.game_id}: ${e?.message}`) }
      const scorers = graded.filter((r) => r.hit)
      out.graded.push({ game: p.game_id, matchup: `${g.away.abbrev}@${g.home.abbrev}`, rows: graded.length, dressed: graded.filter((r) => r.dressed).length, net: [startersActual?.away?.name, startersActual?.home?.name], shots: shotRows, scorers: scorers.map((r) => `${r.name} (${r.status}${r.rank ? ` #${r.rank}` : ''})`), sog: sogGraded, shadow: shadowGraded })
    } catch (e) {
      console.error(`[lamp tick] grade ${p.game_id}: ${e?.message}`); out.skipped.push({ game: p.game_id, why: `grade: ${e?.message}` })
    }
  }
  // ── RECHECK (2026-10-11, lib/nhl/regrade.js): the league keeps correcting a boxscore for hours after the horn (10-10 TBL@NYI: the
  // 11:39 goal moved from Schaefer to Pageau at 03:39Z, 90 minutes after we graded; Pageau stayed a 0, Schaefer a scorer). A game graded
  // in the last 12h is read again when its goal feed changed after the grade, and once at the settle window, and graded by the SAME
  // functions. Only the result columns (dressed / goals or value / hit) of a row whose result changed are written; the locked model
  // columns never are. Its own failure, logged; never the tick's.
  try {
    const nowMs = Date.now()
    const recent = await db.from('lamp_goal_games').select('game_id, game_date, graded_at').in('model_version', VERSIONS.goal).not('graded_at', 'is', null).gte('graded_at', new Date(nowMs - RECHECK_MAX_MS).toISOString())
    if (recent.error) throw new Error(recent.error.message)
    const rIds = (recent.data || []).map((x) => x.game_id)
    const fed = rIds.length ? await db.from('lamp_goal_feed').select('game_id, first_seen_at, confirmed_at, overturned_at').in('game_id', rIds) : { data: [] }
    if (fed.error) throw new Error(fed.error.message)
    const feedBy = new Map()
    for (const f of fed.data || []) { const k = String(f.game_id); if (!feedBy.has(k)) feedBy.set(k, []); feedBy.get(k).push(f) }
    out.regraded = []
    for (const p of recent.data || []) {
      const why = recheckReason({ gradedAt: p.graded_at, now: nowMs, feedRows: feedBy.get(String(p.game_id)) })
      if (!why) continue
      try {
        const box = await nhlGet(`/gamecenter/${p.game_id}/boxscore`, 0)
        if (!box?.playerByGameStats || !['OFF', 'FINAL'].includes(String(box.gameState || '').toUpperCase())) continue
        const Vp = versionsFor(p.game_date)
        const changes = []
        const goalLog = await db.from('lamp_goal_log').select('*').eq('game_id', p.game_id).eq('model_version', Vp.goal).not('graded_at', 'is', null)
        if (goalLog.error) throw new Error(goalLog.error.message)
        const goalAfter = gradeRows((goalLog.data || []).map((r) => ({ ...r, playerId: r.player_id })), box.playerByGameStats)
        for (const c of changedResults(goalLog.data, goalAfter, 'goals')) {
          const u = await db.from('lamp_goal_log').update(resultPatch('goals', c.to)).eq('game_id', p.game_id).eq('player_id', c.row.player_id).eq('model_version', Vp.goal)
          if (u.error) throw new Error(u.error.message)
          changes.push({ table: 'lamp_goal_log', who: c.row.name, status: c.row.status, from: c.from, to: c.to })
        }
        for (const m of [{ market: SOG, key: 'sog', grade: gradeSogRows }, ...SHADOW]) {
          const rows = await db.from('lamp_prop_log').select('*').eq('game_id', p.game_id).eq('market', m.market).eq('model_version', Vp[m.key]).not('graded_at', 'is', null)
          if (rows.error) throw new Error(rows.error.message)
          if (!rows.data?.length) continue
          for (const c of changedResults(rows.data, m.grade(rows.data, box.playerByGameStats), 'value')) {
            const u = await db.from('lamp_prop_log').update(resultPatch('value', c.to)).eq('game_id', p.game_id).eq('player_id', c.row.player_id).eq('market', m.market).eq('model_version', Vp[m.key])
            if (u.error) throw new Error(u.error.message)
            changes.push({ table: 'lamp_prop_log', market: `${m.market}/${Vp[m.key]}`, who: c.row.name, status: c.row.status, from: c.from, to: c.to })
          }
        }
        if (changes.length) {
          console.warn(`[lamp tick] REGRADED ${p.game_id} (${why}): ${changes.length} result(s) changed after the league corrected the box: ${JSON.stringify(changes)}`)
          out.regraded.push({ game: p.game_id, why, changes: changes.length })
        }
      } catch (e) { console.error(`[lamp tick] recheck ${p.game_id}: ${e?.message}`) }
    }
  } catch (e) { console.error(`[lamp tick] recheck: ${e?.message}`) }

  // 🔢 HOT NUMBERS (numerology step 6b): once a night's games are all graded,
  // the dressed skaters' numbers against who scored, written once.
  // Today and yesterday every tick (a failed write retries); two small counts
  // and nothing else unless the night has games, all graded, none written.
  for (const d of [date, dayBefore(date)]) {
    try {
      const [games, left, done] = await Promise.all([
        db.from('lamp_goal_games').select('game_id', { count: 'exact', head: true }).eq('model_version', versionsFor(d).goal).eq('game_date', d),
        db.from('lamp_goal_games').select('game_id', { count: 'exact', head: true }).eq('model_version', versionsFor(d).goal).eq('game_date', d).is('graded_at', null),
        db.from('numerology_numbers').select('value', { count: 'exact', head: true }).eq('sport', 'nhl').eq('day', d),
      ])
      if (games.error || left.error || !games.count || left.count || done.count) continue
      const num = await readNumerology(d)
      const logRows = await db.from('lamp_goal_log').select('player_id, dressed, hit').eq('game_date', d).eq('model_version', versionsFor(d).goal)
      if (logRows.error) throw new Error(logRows.error.message)
      const dressed = new Set((logRows.data || []).filter((r) => r.dressed).map((r) => String(r.player_id)))
      const hits = new Set((logRows.data || []).filter((r) => r.hit).map((r) => String(r.player_id)))
      const players = (num.all || []).filter((r) => dressed.has(String(r.id))).map((r) => ({ player_id: r.id, ...fromNhl(r) }))
      out.hotNumbers = { ...(out.hotNumbers || {}), [d]: players.length ? await writeNumbersNight(db, 'nhl', d, players, hits) : 'no players' }
    } catch (e) { console.error(`[lamp tick] hot numbers ${d}: ${e?.message}`) }
  }

  // ⚡ THE HARDEST SHOT OF THE NIGHT (BATCH-3D-V2 step 3): once a night's games
  // are all graded, its fastest MEASURED shot (NHL EDGE's ten-hardest lists),
  // once. lib/nhl/hardestShot.js; skips everything until its SQL has run.
  for (const d of [date, dayBefore(date)]) {
    try {
      const [games, left] = await Promise.all([
        db.from('lamp_goal_games').select('game_id', { count: 'exact', head: true }).eq('model_version', versionsFor(d).goal).eq('game_date', d),
        db.from('lamp_goal_games').select('game_id', { count: 'exact', head: true }).eq('model_version', versionsFor(d).goal).eq('game_date', d).is('graded_at', null),
      ])
      if (games.error || left.error || !games.count || left.count) continue
      out.hardest = { ...(out.hardest || {}), [d]: await postHardestOnce(db, d) }
    } catch (e) { console.error(`[lamp tick] hardest ${d}: ${e?.message}`) }
  }

  // 🎯 LONGSHOTS (2026-09-27): today only, from 5pm ET, once, when at least
  // three long-priced skaters are still to play (lib/dash/longshotsPost.js).
  // 🔁 THE 2+ CLUB, WEEKLY: Mondays from noon ET (waits for the new season).
  const etDay = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(new Date())
  if (date === easternToday() && etDay === 'Mon' && windowOpen({ kind: 'nhl_multi_club', legacyHour: 0 })) {   // xSchedule window (old: noon ET)
    out.multiClub = await postMultiClubOnce(db, { sport: 'nhl', day: date, kind: 'nhl_multi_club' }).catch((e) => `error: ${e?.message}`)
  }
  if (date === easternToday() && windowOpen({ kind: 'nhl_longshots', legacyHour: 5 })) {   // old: 5pm ET
    out.longshots = await postLongshotsOnce(db, { sport: 'nhl', day: date, kind: 'nhl_longshots' }).catch((e) => `error: ${e?.message}`)
  }
  // 🏒 THE LAMP SLATE (2026-10-10, lib/posts/lampSlate.js): the night's top CALLED skaters, once, after the first game's lock is written
  // and >= 20 min before the first puck it names. Asked only while a game is inside its lock window (the rows are written then); it
  // reads the board the site reads (cached per change) and does nothing when the slot is taken. NHL_SLATE_OFF=on stops it.
  if (date === easternToday() && night && night.games.some((g) => g.state === 'pre' && Date.now() < Date.parse(g.startUtc) && Date.parse(g.startUtc) - Date.now() <= LOCK_WINDOW_MS)) {
    out.lampSlate = await postLampSlateOnce(db, { day: date, load: async () => (await readBoard(date, { market: 'GOAL', net: true })).games }).catch((e) => `error: ${e?.message}`)
  }
  // 📰 STORYLINES (BATCH-STORYLINES-PAGE step 3): freeze each game's stories
  // in the 15 minutes before puck drop (this tick runs every 10), grade them
  // once final. lib/stories/record.js; never throws.
  out.stories = await storiesTick(db, 'nhl')
  // 📋 LIST POSTS (BATCH-LIST-POSTS step 3): one a day from noon ET once the
  // regular season has games -- Mondays IRON MAN, else goal streaks / a point
  // in every game (lib/lists/post.js). Today's date only.
  if (date === easternToday() && windowOpen({ kind: 'list_nhl', legacyHour: 0 })) {   // old: noon ET
    out.lists = await postNhlListOnce(db, date).catch((e) => `error: ${e?.message}`)
  }
  // THE WRITE-UPS (2026-10-05): each game 75-60 min before puck drop; dry while the switch is off
  // (lib/writeups/post.js runNhlWriteups). ?writeups=print prints and writes nothing.
  if (night) {
    const wq = searchParams.get('writeups')
    out.writeups = await runNhlWriteups(db, { date: night.day.date, games: night.games, dry: wq === 'print' ? 'print' : null, readBoard,
      now: wq === 'print' && Number(searchParams.get('at')) ? Number(searchParams.get('at')) : Date.now() }).catch((e) => `error: ${e?.message}`)
  }
  out.ms = Date.now() - t0
  console.log(`[lamp tick] ${date} locked ${out.locked.length} graded ${out.graded.length} skipped ${out.skipped.length} in ${out.ms}ms`)
  return Response.json(out, { headers: { 'Cache-Control': 'no-store' } })
}
