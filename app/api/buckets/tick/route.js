// BUCKETS' TICK (BATCH-BUCKETS B3, 2026-10-02). Cron, every 10 min on NBA
// nights. LOCK: from 100 minutes before a game's tip, a snapshot each run of
// every market's rows (buckets_log), the last write before tip wins; nothing is
// written at or after the scheduled tip (re-checked at the write). GRADE: after
// the final, each row against the box score (lib/nba/model.js gradeNba) -- once.
// Preseason games lock and grade too (they stay out of the record). Does
// nothing until its SQL has run (no buckets_log table = an early exit).
import { adminClient, cronAuthorized } from '../../../../lib/supabase/admin'
import { buildNbaNight } from '../../../../lib/nba/board'
import { NBA_MARKETS, gradeNba } from '../../../../lib/nba/model'
import { scoreboardFor, reduceScoreboard, summaryFor, reduceBox, reduceShots, firstBaskets } from '../../../../lib/nba/api'
import { easternToday, shiftDay } from '../../../../lib/data'
import { storiesTick } from '../../../../lib/stories/record'


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
      const lockedAt = new Date().toISOString()
      if (Date.parse(lockedAt) >= Date.parse(g.start)) { out.skipped.push({ game: g.id, why: 'tip during build' }); continue }
      const rows = []
      for (const [m, M] of Object.entries(NBA_MARKETS)) for (const name of WRITE_AS[m] || [m]) {
        for (const r of night.markets[m].filter((x) => x.gameId === g.id)) rows.push(logRow(name, r, g, night, lockedAt, M.version))
      }
      const up = await db.from('buckets_log').upsert(rows, { onConflict: 'game_id,player_id,market,model_version' })
      if (up.error) { out.skipped.push({ game: g.id, why: `upsert: ${up.error.message}` }); continue }
      const gm = await db.from('buckets_games').select('snapshots').eq('game_id', g.id).eq('model_version', NBA_MARKETS.pts.version).maybeSingle()
      await db.from('buckets_games').upsert([{ game_id: g.id, model_version: NBA_MARKETS.pts.version, game_date: date, season: night.season, season_type: g.seasonType,
        start_utc: g.start, away: g.away.abbrev, home: g.home.abbrev, snapshots: (gm.data?.snapshots || 0) + 1, lineup_known: night.lineupsKnown.includes(g.id), locked_at: lockedAt, state: g.state }], { onConflict: 'game_id,model_version' })
      out.locked.push({ game: g.id, matchup: `${g.away.abbrev}@${g.home.abbrev}`, rows: rows.length, lineupKnown: night.lineupsKnown.includes(g.id) })
    }
  }

  // ── GRADE (today and yesterday: a late final grades the next morning) ──
  const pending = await db.from('buckets_games').select('game_id, game_date').is('graded_at', null).in('game_date', [date, shiftDay(date, -1)])
  for (const p of pending.data || []) {
    const s = await summaryFor(p.game_id, true).catch(() => null)
    const final = s?.header?.competitions?.[0]?.status?.type?.completed === true
    if (!final) continue
    const box = new Map(reduceBox(s).map((b) => [b.id, b]))
    const firsts = firstBaskets(s)
    const rows = await db.from('buckets_log').select('*').eq('game_id', p.game_id).is('graded_at', null)
    const gradedAt = new Date().toISOString()
    const ups = (rows.data || []).map((r) => {
      const base = r.market === 'first_fg' || r.market === 'first_pts' ? 'first' : r.market
      const gr = r.market === 'first_pts'
        ? (() => { const g0 = gradeNba('first', { playerId: r.player_id }, box.get(r.player_id), firsts); const fp = firsts.firstPoints?.player_id; return g0.void_reason ? g0 : { ...g0, actual: fp === r.player_id ? 1 : 0, hit: fp === r.player_id } })()
        : gradeNba(base, { playerId: r.player_id }, box.get(r.player_id), firsts)
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
      if (sw.error) out.skipped.push({ game: p.game_id, why: `shots: ${sw.error.message}` })
    }
    await db.from('buckets_games').update({ graded_at: gradedAt, state: 'final' }).eq('game_id', p.game_id)
    out.graded.push({ game: p.game_id, rows: ups.length, shots: shots.length })
  }
  // STORYLINES (2026-10-03, LAMP's pattern): freeze at tip, grade after the
  // final, the night's base rate -- lib/stories/record.js. Never throws.
  out.stories = await storiesTick(db, 'nba')
  return Response.json(out, { headers: { 'Cache-Control': 'no-store' } })
}
