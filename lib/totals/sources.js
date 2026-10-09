// TOP TOTALS: THE READS (server only). One loader per sport that answers the two questions the market asks:
//
//   loadSlate(sport, now)  -> { ok, slate_key, day, games: [{ game_id, game_date, start_ms, away, home, projected, line? }], why? }
//   loadFinals(sport, rows) -> Map(game_id -> number (the counted total) | 'void' (never played)); a game not final is absent
//
// Every `projected` is the number the sport's EXISTING team model already gives the Slate dial -- this file
// calls those models, it does not make a second one:
//   MLB  lib/teamHr.js gameExpHr over the day's board rows (the bot's file) + the league table (StatsAPI)
//   NFL  lib/nfl/teamTdModel.js slateTotals over the week file + the game logs
//   NHL  lib/nhl/teamProjRead.js readTeamProj (lamp-team-v1)
//   NBA  lib/nba/teamModelRead.js teamModelRows
// A source that cannot be read, or a game the model has no number for, is simply absent: never a guess.
// The counted result is read from the league's own feed (MLB boxscore HR, NHL/NBA final score, NFL the
// game logs' touchdowns -- the model's own unit, see lib/nfl/gameSnapshot.js compareSnapshots).
import { easternDate } from '../data'
import { slateNight } from '../slateNight'
import { clubTable, gameExpHr, byGame } from '../teamHr'
import { teamAbbrs, seasonYear } from '../gamelogs'
import { fetchBoardFull, fetchRunMeta } from '../dash/board'
import { fetchNfl, nflSlatePaths, nflSlateLooksReal, nflLogPaths } from '../nfl/dataSource'
import { slateTotals, teamGames, PARAMS as NFL_PARAMS } from '../nfl/teamTdModel'
import { scoreFor } from '../nhl/api'
import { reduceScoreDay } from '../nhl/reduce'
import { readTeamProj } from '../nhl/teamProjRead'
import { scoreboardFor, reduceScoreboard } from '../nba/api'
import { teamModelRows } from '../nba/teamModelRead'

const MLB_API = 'https://statsapi.mlb.com/api/v1'
const jget = (url) => fetch(url, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
const bad = (why) => ({ ok: false, why, games: [] })

// ── MLB ──────────────────────────────────────────────────────────────────────
const MLB_TYPES = 'R,F,D,L,W'   // regular season + postseason
async function mlbSchedule(day) {
  const j = await jget(`${MLB_API}/schedule?sportId=1&date=${day}&gameType=${MLB_TYPES}&fields=dates,games,gamePk,gameDate,officialDate,status,abstractGameState,detailedState,teams,away,home,team,id`)
  return (j?.dates || []).flatMap((d) => d.games || [])
}

async function mlbClubTable() {
  const [j, abbrs] = await Promise.all([
    jget(`${MLB_API}/teams/stats?season=${seasonYear()}&group=hitting&stats=season&sportIds=1&fields=stats,splits,team,id,stat,homeRuns,plateAppearances,gamesPlayed`),
    teamAbbrs().catch(() => null),
  ])
  return { table: clubTable(j?.stats?.[0]?.splits || [], abbrs || {}), abbrs: abbrs || {} }
}

async function loadMlb(now) {
  const day = await slateNight('mlb', now)
  const [meta, rows, sched, club] = await Promise.all([fetchRunMeta('today'), fetchBoardFull('today'), mlbSchedule(day), mlbClubTable()])
  // the board must be THIS day's (the homers tick's own pregame guard): a stale board projects the wrong games
  if (!meta || meta.slate_date !== day) return bad(`the board file is for ${meta?.slate_date || 'no day'}, not ${day}`)
  if (!Array.isArray(rows) || !rows.length) return bad('no board rows')
  if (!club.table) return bad('the league table is not whole yet')
  const groups = byGame(rows)
  const games = []
  for (const g of sched) {
    if (/postponed|cancel|suspend/i.test(String(g.status?.detailedState || ''))) continue
    const pk = g.gamePk
    const a = club.abbrs[g.teams?.away?.team?.id]; const h = club.abbrs[g.teams?.home?.team?.id]
    const start = Date.parse(g.gameDate)
    const mine = groups.get(pk) || groups.get(String(pk))
    if (!pk || !a || !h || !Number.isFinite(start) || !mine?.length) continue
    const p = gameExpHr(mine, club.table)
    if (!p || !Number.isFinite(p.total)) continue
    games.push({ game_id: String(pk), game_date: g.officialDate || day, start_ms: start, away: a, home: h, projected: p.total })
  }
  return { ok: true, slate_key: day, day, games }
}

async function finalsMlb(rows) {
  const out = new Map()
  for (const r of rows) {
    const j = await jget(`${MLB_API}/game/${r.game_id}/boxscore?fields=teams,away,home,teamStats,batting,homeRuns`)
    const st = await jget(`${MLB_API}/schedule?sportId=1&gamePk=${r.game_id}&fields=dates,games,status,abstractGameState,detailedState`)
    const s = st?.dates?.[0]?.games?.[0]?.status
    if (/postponed|cancel/i.test(String(s?.detailedState || ''))) { out.set(r.game_id, 'void'); continue }
    if (s?.abstractGameState !== 'Final') continue
    const a = Number(j?.teams?.away?.teamStats?.batting?.homeRuns); const h = Number(j?.teams?.home?.teamStats?.batting?.homeRuns)
    if (Number.isFinite(a) && Number.isFinite(h)) out.set(r.game_id, a + h)
  }
  return out
}

// ── NFL ──────────────────────────────────────────────────────────────────────
const nflSlateKey = (season, week) => `${season}-w${String(week).padStart(2, '0')}`
async function loadNfl() {
  const [week, logs] = await Promise.all([fetchNfl(nflSlatePaths(), nflSlateLooksReal).catch(() => null), fetchNfl(nflLogPaths()).catch(() => null)])
  if (!week || !Array.isArray(week.games) || !week.games.length) return bad('no TUDDY week file')
  if (week.mode === 'preseason') return bad('preseason (the model has no club rates for it)')
  if (!logs) return bad('no game logs')
  const season = Number(week.season); const wk = Number(week.week)
  if (!season || !wk) return bad('the week file names no season/week')
  const totals = slateTotals(week, logs)
  const games = []
  for (const g of week.games) {
    const m = totals[g.game_id]
    const start = Date.parse(String(g?.kickoff || ''))
    if (!g?.game_id || !m || !Number.isFinite(start)) continue
    // the result is counted in tracked skill-player touchdowns (nfl_logs), so the LINE is the projection in that unit
    games.push({ game_id: String(g.game_id), game_date: easternDate(start), start_ms: start, away: g.away, home: g.home, projected: m.total, line: m.total / (NFL_PARAMS.cover || 1) })
  }
  return { ok: true, slate_key: nflSlateKey(season, wk), day: easternDate(Math.min(...games.map((g) => g.start_ms))), games }
}

const NFL_FINAL_AFTER_MS = 4 * 3600e3   // a game is not graded off the logs until it has been over for certain
async function finalsNfl(rows, now) {
  const out = new Map()
  const logs = await fetchNfl(nflLogPaths()).catch(() => null)
  if (!logs) return out
  const byClub = new Map()
  for (const r of teamGames(logs)) byClub.set(`${r.s}|${r.w}|${r.tm}`, r.td)
  for (const r of rows) {
    const m = /^(\d{4})-w(\d{2})$/.exec(r.slate_key || '')
    if (!m || now < Date.parse(r.start_at) + NFL_FINAL_AFTER_MS) continue
    const a = byClub.get(`${Number(m[1])}|${Number(m[2])}|${r.away}`); const h = byClub.get(`${Number(m[1])}|${Number(m[2])}|${r.home}`)
    if (a != null && h != null) out.set(r.game_id, a + h)
  }
  return out
}

// ── NHL ──────────────────────────────────────────────────────────────────────
const nhlGoals = (g) => {
  const a = g.away?.score; const h = g.home?.score
  if (!Number.isFinite(a) || !Number.isFinite(h)) return null
  return a + h - (g.outcome === 'SO' ? 1 : 0)   // the feed's final score gives the shootout winner a goal; the model counts real goals
}
async function loadNhl(now) {
  const day = await slateNight('nhl', now)
  const sd = reduceScoreDay(await scoreFor(day).catch(() => null))
  const list = sd.games.filter((g) => (g.gameType === 2 || g.gameType === 3) && g.scheduleState === 'OK')
  if (!list.length) return { ok: true, slate_key: day, day, games: [] }
  const proj = await readTeamProj(list.map((g) => ({ id: g.id, date: g.date || day, state: g.state, home: g.home.abbrev, away: g.away.abbrev })))
  const games = []
  for (const g of list) {
    const p = proj.get(g.id); const start = Date.parse(g.startUtc)
    if (!p || !Number.isFinite(p.total) || !Number.isFinite(start)) continue
    games.push({ game_id: String(g.id), game_date: g.date || day, start_ms: start, away: g.away.abbrev, home: g.home.abbrev, projected: p.total })
  }
  return { ok: true, slate_key: day, day, games }
}
async function finalsNhl(rows) {
  const out = new Map()
  for (const date of [...new Set(rows.map((r) => r.game_date))]) {
    const sd = reduceScoreDay(await scoreFor(date).catch(() => null))
    for (const r of rows.filter((x) => x.game_date === date)) {
      const g = sd.games.find((x) => String(x.id) === r.game_id)
      if (!g) continue
      if (g.scheduleState && g.scheduleState !== 'OK' && g.state !== 'final') { out.set(r.game_id, 'void'); continue }
      if (g.state === 'final') { const t = nhlGoals(g); if (t != null) out.set(r.game_id, t) }
    }
  }
  return out
}

// ── NBA ──────────────────────────────────────────────────────────────────────
async function loadNba(now) {
  const day = await slateNight('nba', now)
  const sb = reduceScoreboard(await scoreboardFor(day).catch(() => null)).filter((g) => (g.seasonType === 2 || g.seasonType === 3) && g.state !== 'postponed' && g.state !== 'canceled')
  if (!sb.length) return { ok: true, slate_key: day, day, games: [] }
  const model = await teamModelRows(day)
  const by = new Map((model.games || []).map((g) => [g.id, g]))
  const games = []
  for (const g of sb) {
    const m = by.get(g.id); const start = Date.parse(g.start)
    if (!m || !Number.isFinite(m.total) || !Number.isFinite(start)) continue
    games.push({ game_id: String(g.id), game_date: day, start_ms: start, away: g.away.abbrev, home: g.home.abbrev, projected: m.total })
  }
  return { ok: true, slate_key: day, day, games }
}
async function finalsNba(rows) {
  const out = new Map()
  for (const date of [...new Set(rows.map((r) => r.game_date))]) {
    const sb = reduceScoreboard(await scoreboardFor(date).catch(() => null))
    for (const r of rows.filter((x) => x.game_date === date)) {
      const g = sb.find((x) => x.id === r.game_id)
      if (!g) continue
      if (g.state === 'postponed' || g.state === 'canceled') { out.set(r.game_id, 'void'); continue }
      if (g.state === 'final' && Number.isFinite(g.away.score) && Number.isFinite(g.home.score)) out.set(r.game_id, g.away.score + g.home.score)
    }
  }
  return out
}

// ── THE TABLE: one loader pair per sport, keyed by the registry's sport key ──
const LOADERS = {
  mlb: { slate: loadMlb, finals: finalsMlb },
  nfl: { slate: loadNfl, finals: finalsNfl },
  nhl: { slate: loadNhl, finals: finalsNhl },
  nba: { slate: loadNba, finals: finalsNba },
}

/** The sport's slate and its games' projections, or { ok:false, why }. Never throws. */
export async function loadSlate(sport, now = Date.now()) {
  try { return await (LOADERS[sport]?.slate(now) || bad(`no loader for ${sport}`)) } catch (e) { return bad(String(e?.message || e)) }
}
/** Map(game_id -> counted total | 'void') for the rows that have a result in the league's feed. Never throws. */
export async function loadFinals(sport, rows, now = Date.now()) {
  try { return rows.length ? await LOADERS[sport].finals(rows, now) : new Map() } catch (e) { console.error(`[totals] finals ${sport}: ${e?.message || e}`); return new Map() }
}
