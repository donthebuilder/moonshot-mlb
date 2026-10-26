// 🏀 THE CLUB PAGE'S SERVER READS (2026-10-10). GET /api/buckets/teamdeep?team=BOS calls this. Server only, gated like every
// BUCKETS route (lib/nba/respond.js bucketsRoute: a 404 to everyone but an admin until BUCKETS_PUBLIC=on).
//
//   standing   ESPN standings (seed, streak, home / road / last ten records, points for and against)
//   lines      the club's team stats with the rank of 30: ESPN's season team statistics for every club (one call each, held six hours)
//   schedule   the current season's schedule (incl. preseason) for the next game and the page's schedule
//   results    the READ season's final regular-season games, each with the opponent's conference and division: the splits' source
//   next       the next game: the team model's expected points (lib/nba/teamModelRead.js), the stored Top Totals row, both clubs' ranks
//   calls      OUR graded calls on this club's players (buckets_log, status 'called', by market and model version)
// SEASON RULE (lib/nba/season.js): the regular season and playoffs read this season; the preseason and the offseason read the
// last completed one and SAY so (`stale`). A part that fails is null: the page names the data it needs. Nothing is guessed.
import { adminClient } from '../supabase/admin'
import { readPaged } from '../record/paged'
import { nbaTeam, NBA_TEAMS } from './teams'
import { nbaSeason, seasonLabel } from './season'
import { standingsFor, reduceStandings, teamScheduleFor, reduceTeamSchedule } from './api'
import { teamModelRows } from './teamModelRead'
import { LIVE_VERSIONS } from './model'
import { easternDate } from '../data'
import { clubLines } from '../team/statLines'

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba'
const UA = { 'User-Agent': 'DASHNetwork/1.0', Accept: 'application/json' }
const num = (v) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(String(v).replace(/^\+/, ''))) ? Number(String(v).replace(/^\+/, '')) : null)

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]) } }))
  return out
}

const firstOf = (cat, abbr) => num(cat?.stats?.find((s) => s.abbreviation === abbr)?.value)
/** ESPN team statistics JSON -> the per-game line (the first of each abbreviation is the per-game one; later ones are season totals). */
export function teamLine(j) {
  const cats = Object.fromEntries((j?.results?.stats?.categories || []).map((c) => [c.name, c]))
  const g = cats.general; const o = cats.offensive; const d = cats.defensive
  if (!o) return null
  return {
    gp: firstOf(g, 'GP'), reb: firstOf(g, 'REB'), pf: firstOf(g, 'PF'), pts: firstOf(o, 'PTS'), fgPct: firstOf(o, 'FG%'), tpPct: firstOf(o, '3P%'), ftPct: firstOf(o, 'FT%'),
    tpm: firstOf(o, '3PM'), tpa: firstOf(o, '3PA'), fta: firstOf(o, 'FTA'), or: firstOf(o, 'OR'), ast: firstOf(o, 'AST'), to: firstOf(o, 'TO'), dr: firstOf(d, 'DR'), stl: firstOf(d, 'STL'), blk: firstOf(d, 'BLK'),
  }
}

async function readTeamStats(season) {
  const per = await pool(NBA_TEAMS, 6, async ([abbrev, id]) => {
    try {
      const r = await fetch(`${SITE}/teams/${id}/statistics?season=${season}&seasontype=2`, { headers: UA, next: { revalidate: 6 * 3600 } })
      return [abbrev, r.ok ? teamLine(await r.json()) : null]
    } catch { return [abbrev, null] }
  })
  const out = Object.fromEntries(per.filter(([, l]) => l && l.gp > 0))
  return Object.keys(out).length >= 20 ? out : null   // a handful of clubs is not a league: no ranks rather than ranks among a few
}

/** Pure: stat rows for clubLines (every club's value), from ESPN team lines + the standings rows. */
export function statRowsNba(stats, standings) {
  const by = (fn) => Object.fromEntries(NBA_TEAMS.map(([a]) => [a, fn(a)]))
  const S = (a) => stats?.[a] || null
  const T = (a) => standings?.[a] || null
  const rows = [
    { key: 'pts', group: 'Offense', label: 'Points / game', dp: 1, higherBetter: true, byClub: by((a) => S(a)?.pts ?? null) },
    { key: 'fg', group: 'Offense', label: 'FG %', dp: 1, higherBetter: true, byClub: by((a) => S(a)?.fgPct ?? null) },
    { key: 'tp', group: 'Offense', label: '3P %', dp: 1, higherBetter: true, byClub: by((a) => S(a)?.tpPct ?? null) },
    { key: 'ft', group: 'Offense', label: 'FT %', dp: 1, higherBetter: true, byClub: by((a) => S(a)?.ftPct ?? null) },
    { key: 'tpm', group: 'Offense', label: '3-pointers made / game', dp: 1, higherBetter: true, byClub: by((a) => S(a)?.tpm ?? null) },
    { key: 'ast', group: 'Offense', label: 'Assists / game', dp: 1, higherBetter: true, byClub: by((a) => S(a)?.ast ?? null) },
    { key: 'or', group: 'Offense', label: 'Offensive rebounds / game', dp: 1, higherBetter: true, byClub: by((a) => S(a)?.or ?? null) },
    { key: 'to', group: 'Offense', label: 'Turnovers / game', dp: 1, higherBetter: false, byClub: by((a) => S(a)?.to ?? null) },
    { key: 'opp', group: 'Defense', label: 'Points allowed / game', dp: 1, higherBetter: false, byClub: by((a) => T(a)?.oppg ?? null) },
    { key: 'dr', group: 'Defense', label: 'Defensive rebounds / game', dp: 1, higherBetter: true, byClub: by((a) => S(a)?.dr ?? null) },
    { key: 'stl', group: 'Defense', label: 'Steals / game', dp: 1, higherBetter: true, byClub: by((a) => S(a)?.stl ?? null) },
    { key: 'blk', group: 'Defense', label: 'Blocks / game', dp: 1, higherBetter: true, byClub: by((a) => S(a)?.blk ?? null) },
    { key: 'pf', group: 'Defense', label: 'Fouls / game', dp: 1, higherBetter: false, byClub: by((a) => S(a)?.pf ?? null) },
    { key: 'diff', group: 'Overall', label: 'Point difference / game', dp: 1, higherBetter: true, signed: true, byClub: by((a) => num(T(a)?.diff)) },
    { key: 'win', group: 'Overall', label: 'Win %', dp: 1, pct: true, higherBetter: true, byClub: by((a) => T(a)?.pct ?? null) },
  ]
  return rows.filter((r) => Object.values(r.byClub).some((v) => v != null))
}

/** A season's final regular-season games with the opponent's conference and division. Pure. */
export function resultsOf(sched, abbrev) {
  const me = nbaTeam(abbrev)
  return (sched || []).filter((g) => g.state === 'final' && g.seasonType === 2 && g.us != null && g.them != null).map((g) => {
    const o = nbaTeam(g.opp)
    return { id: g.id, date: easternDate(Date.parse(g.start)), home: g.home, opp: g.opp, us: g.us, them: g.them, result: g.us > g.them ? 'W' : 'L', sameConf: Boolean(o && me && o.conf === me.conf), sameDiv: Boolean(o && me && o.div === me.div), oppConf: o?.conf || null }
  }).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

async function readCalls(db, abbrev, read) {
  if (!db) return null
  try {
    const since = `${read - 1}-08-01`; const until = `${read}-09-01`
    // PAGED + TOTAL ORDER (2026-10-26, known-issues #116): a club's called rows over a season run to ~1,000 (8 markets a game) and the API stops a request at
    // 1,000 without a word; buckets_log is keyed (game_id, player_id, market, model_version).
    const { data, error } = await readPaged(() => db.from('buckets_log').select('game_id, game_date, season_type, player_id, name, opp, market, model_version, status, played, actual, hit, void_reason, graded_at, rank_in_game')
      .in('model_version', LIVE_VERSIONS).eq('team', abbrev).eq('status', 'called').neq('season_type', 1).gte('game_date', since).lte('game_date', until)
      .order('game_date', { ascending: false }).order('game_id', { ascending: true }).order('player_id', { ascending: true }).order('market', { ascending: true }).order('model_version', { ascending: true }))
    if (error) return null
    return data.map((r) => ({ gameId: r.game_id, date: r.game_date, playerId: r.player_id, name: r.name, opp: r.opp, market: r.market, version: r.model_version, rank: r.rank_in_game, actual: r.actual == null ? null : Number(r.actual),
      result: !r.graded_at ? null : (r.played === false || r.void_reason || r.hit == null) ? 'void' : r.hit ? 'hit' : 'miss' }))
  } catch { return null }
}

async function readTotals(db, id) {
  if (!db || !id) return null
  try {
    const { data, error } = await db.from('top_totals_calls').select('model_version,line,line_source,projected_total,called,rank,field_size').eq('sport', 'nba').eq('game_id', String(id)).order('locked_at', { ascending: false }).limit(1)
    if (error || !data?.length) return null
    const r = data[0]
    return { line: r.line, source: r.line_source, projected: r.projected_total, called: r.called, rank: r.rank, of: r.field_size }
  } catch { return null }
}

export async function readNbaTeam(abbrev) {
  const t = nbaTeam(abbrev)
  if (!t) throw Object.assign(new Error('no such club'), { status: 400 })
  const sn = await nbaSeason()
  const db = adminClient()
  const [stRaw, stats, curSched, readSched] = await Promise.all([
    standingsFor(sn.read).then(reduceStandings).catch(() => null),
    readTeamStats(sn.read),
    teamScheduleFor(t.id, sn.cur).then((j) => reduceTeamSchedule(j, t.abbrev)).catch(() => null),
    sn.read === sn.cur ? null : teamScheduleFor(t.id, sn.read).then((j) => reduceTeamSchedule(j, t.abbrev)).catch(() => null),
  ])
  const standings = Object.fromEntries((stRaw || []).flatMap((c) => c.rows).filter((r) => r.abbrev).map((r) => [r.abbrev, r]))
  const standing = standings[t.abbrev] || null
  const rows = stats ? statRowsNba(stats, standings) : []
  const schedule = curSched || null
  const results = resultsOf(sn.read === sn.cur ? curSched : readSched, t.abbrev)
  const next = (schedule || []).filter((g) => g.state === 'live' || g.state === 'pre').sort((a, b) => String(a.start).localeCompare(String(b.start)))[0] || null
  let model = null
  if (next) { try { const m = await teamModelRows(easternDate(Date.parse(next.start))); model = (m.games || []).find((g) => String(g.id) === String(next.id)) || null } catch (e) { console.error(`[buckets team] model: ${e?.message}`) } }
  const [totals, calls] = await Promise.all([next ? readTotals(db, next.id) : null, readCalls(db, t.abbrev, sn.read)])
  return {
    team: t, season: { cur: sn.cur, read: sn.read, label: seasonLabel(sn.read), stale: sn.stale, phase: sn.phase },
    standing, standingsN: Object.keys(standings).length, lines: rows.length ? clubLines(rows, t.abbrev) : [], oppLines: rows.length && next?.opp ? clubLines(rows, next.opp) : [],
    schedule, results, next: next ? { game: next, model, totals } : null, calls, fetchedAt: new Date().toISOString(),
  }
}
