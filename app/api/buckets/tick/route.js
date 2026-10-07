// BUCKETS' TICK (BATCH-BUCKETS B3, 2026-10-02). Cron, every 10 min on NBA
// nights. LOCK: from 100 minutes before a game's tip, a snapshot each run of
// every market's rows (buckets_log), the last write before tip wins; nothing is
// written at or after the scheduled tip (re-checked at the write). GRADE: after
// the final, each row against the box score (lib/nba/model.js gradeNba) -- once.
// Preseason games lock and grade too (they stay out of the record). Does
// nothing until its SQL has run (no buckets_log table = an early exit).
import { adminClient, cronAuthorized } from '../../../../lib/supabase/admin'
import { buildNbaNight } from '../../../../lib/nba/board'
import { NBA_MARKETS, NBA_SHADOWS, gradeNba } from '../../../../lib/nba/model'
import { scoreboardFor, reduceScoreboard, nbaGet, reduceBox, reduceShots, firstBaskets } from '../../../../lib/nba/api'
import { easternToday, shiftDay } from '../../../../lib/data'
import { storiesTick } from '../../../../lib/stories/record'
import { writeFirstFeed, FIRST_KIND } from '../../../../lib/nba/firstFeed'


export const dynamic = 'force-dynamic'
export const maxDuration = 60
const LOCK_MS = 100 * 60 * 1000
// the FIRST BASKET model is scored once and written as its two graded answers
const WRITE_AS = { first: ['first_fg', 'first_pts'] }

function logRow(market, r, g, night, lockedAt, version) {
  return {
    game_id: g.id, player_id: r.playerId, market, model_version: version, game_date: night.date, season: night.season,
    season_type: g.seasonType, start_utc: g.start, team: r.team, opp: r.opp, home: r.home, name: r.name, pos: r.pos, starter: r.starter,
    legs: r.legs?.ok ? r.legs : null, pct: r.pct, score: r.score, rank_in_game: r.rank, status: r.status, role: r.role, reason: r.reason || null,
    context: { nightRank: r.nightRank, nightOf: r.nightOf, injury: r.injury, tpPctSource: r.legs?.tpPctSource || null }, locked_at: lockedAt,
  }
}

export async function GET(request) {
  if (!cronAuthorized(request)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const db = adminClient()
  if (!db) return Response.json({ error: 'no supabase env' }, { status: 500 })
  const q = new URL(request.url).searchParams
  const date = /^\d{4}-\d{2}-\d{2}$/.test(q.get('date') || '') ? q.get('date') : easternToday()
  const out = { date, locked: [], graded: [], skipped: [] }
  // no NBA game today or yesterday: nothing to lock or grade -- leave before the database
  const sb = reduceScoreboard(await scoreboardFor(date).catch(() => null))
  const yday = reduceScoreboard(await scoreboardFor(shiftDay(date, -1)).catch(() => null))
  if (!sb.length && !yday.length) return Response.json({ ...out, skipped: 'no NBA games today or yesterday' })
  // a REAL read: a head-only count on a missing table answers 204 with no error (probed 10-02)
  const ready = await db.from('buckets_log').select('game_id').limit(1)
  if (ready.error) return Response.json({ skipped: 'buckets tables not created yet (RUN-IN-SUPABASE-2026-10-03-QUEUE.sql part 3)' })

  // ── LOCK ──
  const now = Date.now()
  const due = sb.filter((g) => g.state === 'pre' && Date.parse(g.start) > now && Date.parse(g.start) - now <= LOCK_MS)
  if (due.length) {
    const night = await buildNbaNight(date).catch((e) => { out.skipped.push({ why: `build: ${e?.message}` }); return null })
    for (const g of night ? due : []) {
      // an unread injury report or an empty roster is a hole in the snapshot, not a snapshot: wait for the next tick
      const gap = night.injuriesOk === false ? 'injury report unread' : night.gaps?.find((x) => x.gameId === g.id)?.why
      if (gap) { out.skipped.push({ game: g.id, why: `not locked: ${gap}` }); continue }
      const lockedAt = new Date().toISOString()
      if (Date.parse(lockedAt) >= Date.parse(g.start)) { out.skipped.push({ game: g.id, why: 'tip during build' }); continue }
      const rows = []
      for (const [m, M] of Object.entries(NBA_MARKETS)) for (const name of WRITE_AS[m] || [m]) {
        for (const r of night.markets[m].filter((x) => x.gameId === g.id)) rows.push(logRow(name, r, g, night, lockedAt, M.version))
      }
      // shadows (lib/nba/model.js NBA_SHADOWS): same lock, same instant, their own version
      for (const [k, S] of Object.entries(NBA_SHADOWS)) {
        for (const r of (night.shadows?.[k] || []).filter((x) => x.gameId === g.id)) rows.push(logRow(S.market, r, g, night, lockedAt, S.version))
      }
      const up = await db.from('buckets_log').upsert(rows, { onConflict: 'game_id,player_id,market,model_version' })
      if (up.error) { out.skipped.push({ game: g.id, why: `upsert: ${up.error.message}` }); continue }
      // PRUNE (LAMP's rule, lamp tick): this run's snapshot replaces the earlier pre-tip ones, so a player
      // who dropped off the candidates (a late OUT) does not stay behind as a stale call. Only this game's,
      // only older than this write, never a graded row.
      for (const key of new Set(rows.map((x) => `${x.market}|${x.model_version}`))) {
        const [mk, ver] = key.split('|')
        const del = await db.from('buckets_log').delete().eq('game_id', g.id).eq('market', mk).eq('model_version', ver).lt('locked_at', lockedAt).is('graded_at', null)
        if (del.error) console.error(`[buckets tick] prune ${g.id} ${mk}: ${del.error.message}`)
      }
      const gm = await db.from('buckets_games').select('snapshots').eq('game_id', g.id).eq('model_version', NBA_MARKETS.pts.version).maybeSingle()
      await db.from('buckets_games').upsert([{ game_id: g.id, model_version: NBA_MARKETS.pts.version, game_date: date, season: night.season, season_type: g.seasonType,
        start_utc: g.start, away: g.away.abbrev, home: g.home.abbrev, snapshots: (gm.data?.snapshots || 0) + 1, lineup_known: night.lineupsKnown.includes(g.id), locked_at: lockedAt, state: g.state }], { onConflict: 'game_id,model_version' })
      out.locked.push({ game: g.id, matchup: `${g.away.abbrev}@${g.home.abbrev}`, rows: rows.length, lineupKnown: night.lineupsKnown.includes(g.id) })
    }
  }

  // ── GRADE (today and yesterday: a late final grades the next morning) ──
  // The last WEEK, not two days (2026-10-04 ops audit): a tick that missed two
  // days left those games ungraded for good.
  const pending = await db.from('buckets_games').select('game_id, game_date, season_type').is('graded_at', null).gte('game_date', shiftDay(date, -6)).lte('game_date', date)
  for (const p of pending.data || []) {
    // Straight from the source: a cached summary could predate the final stats (LAMP's BUF@CHI, audit F1).
    const s = await nbaGet(`/summary?event=${p.game_id}`, 0).catch(() => null)
    const stType = s?.header?.competitions?.[0]?.status?.type || {}
    // A postponed / canceled game is closed, not left pending forever (its rows
    // keep hit null: no game, no grade) -- LAMP's tick does the same.
    if (/POSTPONED|CANCELED|CANCELLED/.test(String(stType.name || ''))) {
      await db.from('buckets_games').update({ state: String(stType.name).toLowerCase(), graded_at: new Date().toISOString() }).eq('game_id', p.game_id)
      out.skipped.push({ game: p.game_id, why: `closed: ${stType.name}` })
      continue
    }
    const final = stType.completed === true
    if (!final) continue
    const box = new Map(reduceBox(s).map((b) => [b.id, b]))
    const firsts = firstBaskets(s)
    const rows = await db.from('buckets_log').select('*').eq('game_id', p.game_id).is('graded_at', null)
    // A FAILED READ OR A BOX THAT HASN'T ARRIVED IS NOT A GRADE (2026-10-05 scan).
    // rows.error was never looked at: a failed buckets_log read gave ups = [] and
    // the game was stamped graded with nothing in it. And ESPN marks a game
    // completed before boxscore.players is filled in -- reduceBox returned [] and
    // every row graded "did not play", then graded_at made it permanent. Wait for
    // the next tick instead; a graded game is never retried.
    if (rows.error) { out.skipped.push({ game: p.game_id, why: `rows: ${rows.error.message}` }); continue }
    if ((rows.data || []).length && box.size === 0) { out.skipped.push({ game: p.game_id, why: 'final but no box score players yet' }); continue }
    const gradedAt = new Date().toISOString()
    const ups = (rows.data || []).map((r) => {
      const base = r.market === 'first_fg' || r.market === 'first_pts' ? 'first' : r.market
      // first_fg / first_pts grade by who scored (lib/nba/model.js), whatever his minutes
      const gr = gradeNba(base, { playerId: r.player_id, firstKey: r.market === 'first_pts' ? 'firstPoints' : 'firstFieldGoal' }, box.get(r.player_id), firsts)
      return { ...r, played: gr.played, minutes: gr.minutes ?? null, actual: gr.actual, hit: gr.hit, void_reason: gr.void_reason, graded_at: gradedAt }
    })
    if (ups.length) {
      const w = await db.from('buckets_log').upsert(ups, { onConflict: 'game_id,player_id,market,model_version' })
      if (w.error) { out.skipped.push({ game: p.game_id, why: `grade: ${w.error.message}` }); continue }
    }
    // the shots, written once at grade time (BUCKETS-PLAN-v2 B3)
    const shots = reduceShots(s, p.game_id).map((x) => ({ ...x, game_date: p.game_date, team_id: x.team_id || null }))
    if (shots.length) {
      const sw = await db.from('buckets_shots').upsert(shots.map(({ game_id, event_id, game_date, player_id, team_id, x, y, shot_type, made, points, three, distance, period, clock }) => ({ game_id, event_id, game_date, player_id, team_id, x, y, shot_type, made, points, three, distance, period, clock })), { onConflict: 'game_id,event_id' })
      // a failed shots write must not close the game: buckets_shots is written once, at grade time
      if (sw.error) { out.skipped.push({ game: p.game_id, why: `shots: ${sw.error.message}` }); continue }
    }
    // the first basket, on file for the Ledger's First scorers (lib/nba/firstFeed; never posts)
    const ff = await writeFirstFeed(db, { gameId: p.game_id, gameDate: p.game_date, seasonType: p.season_type, summary: s })
    if (ff) out.skipped.push({ game: p.game_id, why: `first basket: ${ff}` })
    const closed = await db.from('buckets_games').update({ graded_at: gradedAt, state: 'final' }).eq('game_id', p.game_id)
    if (closed.error) { out.skipped.push({ game: p.game_id, why: `close: ${closed.error.message}` }); continue }
    out.graded.push({ game: p.game_id, rows: ups.length, shots: shots.length })
  }
  // FIRST BASKETS, CATCH-UP (2026-10-05): a game graded before the first basket was kept
  // (or whose write failed) gets it here -- the last two weeks, a few games a tick.
  const done = await db.from('buckets_games').select('game_id, game_date, season_type').not('graded_at', 'is', null).eq('state', 'final').gte('game_date', shiftDay(date, -14)).lte('game_date', date)
  const ids = (done.data || []).map((g) => g.game_id)
  if (ids.length) {
    const have = await db.from('buckets_feed').select('game_id').eq('kind', FIRST_KIND).in('game_id', ids)
    const got = new Set((have.data || []).map((r) => String(r.game_id)))
    out.firstCatchUp = []
    for (const g of [...new Map((done.data || []).filter((x) => !got.has(String(x.game_id))).map((x) => [x.game_id, x])).values()].slice(0, 4)) {
      const s = await nbaGet(`/summary?event=${g.game_id}`, 3600).catch(() => null)
      const ff = s ? await writeFirstFeed(db, { gameId: g.game_id, gameDate: g.game_date, seasonType: g.season_type, summary: s }) : 'summary unread'
      out.firstCatchUp.push({ game: g.game_id, ...(ff ? { why: ff } : {}) })
    }
  }
  // STORYLINES (2026-10-03, LAMP's pattern): freeze at tip, grade after the
  // final, the night's base rate -- lib/stories/record.js. Never throws.
  out.stories = await storiesTick(db, 'nba')
  return Response.json(out, { headers: { 'Cache-Control': 'no-store' } })
}
