// ⚾ MOONSHOT LIST POSTS (BATCH-LIST-POSTS steps 1-2, 2026-09-27). Server
// safe; every number is MLB StatsAPI's, computed here, never typed.
//
// PLAYED EVERY GAME (the season wrap): a hitter whose regular-season games
// played equals every game his team(s) played while he was on them.
//   one team   season gamesPlayed = the team's gamesPlayed
//   traded     his game log checked stint by stint: every game each club
//              played from his first game with it to his last, and none it
//              played between the trade date and his first game for it (or
//              after his last game for the old club and before the trade) --
//              "(with CHC and NYM)" on his row (Donovan 09-27: count them)
//   footnote   a club whose season ended short on a CANCELED game (status
//              Cancelled, not made up): its players who played all of its
//              games get "played in all 161 games before Game 162 was canceled"
// CONSECUTIVE GAMES: for those players only, the game log walked back across
// seasons against his club's completed games until a game he missed; shown at
// 200+; 10 seasons at most; cached per player per day. Canceled / postponed
// games are not games and never break a streak.

import { isCalledRole } from '../callStatus'
import { verified } from './shape'

const API = 'https://statsapi.mlb.com/api/v1'
const api = (p) => fetch(`${API}${p}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
export const STREAK_MIN = 200
const CAP = 10
const DONE = new Set(['Final', 'Game Over', 'Completed Early'])

const _sched = new Map()   // `${season}:${teamId}` -> [{ gamePk, date }]
/** A club's completed regular-season games, in order. */
export async function teamGamesPlayed(season, teamId) {
  const k = `${season}:${teamId}`
  if (_sched.has(k)) return _sched.get(k)
  const j = await api(`/schedule?sportId=1&season=${season}&teamId=${teamId}&gameType=R&fields=dates,games,gamePk,status,detailedState,officialDate,gameNumber`)
  if (!j) return null
  const games = (j.dates || []).flatMap((d) => d.games || [])
    .filter((g) => DONE.has(g?.status?.detailedState))
    .map((g) => ({ gamePk: Number(g.gamePk), date: g.officialDate, n: Number(g.gameNumber) || 1 }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.n - b.n || a.gamePk - b.gamePk)
  // A resumed game can list twice; one game, once.
  const seen = new Set()
  const out = games.filter((g) => (seen.has(g.gamePk) ? false : (seen.add(g.gamePk), true)))
  _sched.set(k, out)
  return out
}

/** His regular-season game log: [{ gamePk, date, teamId }]. */
export async function gameLog(personId, season) {
  const j = await api(`/people/${personId}/stats?stats=gameLog&group=hitting&season=${season}&gameType=R`)
  if (!j) return null
  return (j.stats?.[0]?.splits || []).map((s) => ({ gamePk: Number(s.game?.gamePk), date: s.date, teamId: Number(s.team?.id) })).filter((g) => g.gamePk)
}

/**
 * Pure: walk a season backward. `expected` = the team games he should have
 * played, in order; `played` = Set(gamePk). Returns { run, whole } -- the
 * games from the end until the first miss, and whether that covered all of them.
 */
export function walkBack(expected, played) {
  let run = 0
  for (let i = expected.length - 1; i >= 0; i -= 1) {
    if (!played.has(expected[i].gamePk)) return { run, whole: false }
    run += 1
  }
  return { run, whole: true }
}

const _streak = new Map()
/**
 * Consecutive games played ending at `season`'s last game. One club per
 * season only: a season split across clubs ends the walk (the count so far is
 * returned with complete: false -- shown only if it already clears the bar).
 */
export async function consecutiveGames(personId, season, { cap = CAP } = {}) {
  const k = `${personId}:${season}`
  if (_streak.has(k)) return _streak.get(k)
  let total = 0
  const seasons = []
  let complete = true
  for (let s = season; s > season - cap; s -= 1) {
    const log = await gameLog(personId, s)
    if (!log?.length) break
    const clubs = [...new Set(log.map((g) => g.teamId))]
    if (clubs.length !== 1) { complete = false; break }
    const team = await teamGamesPlayed(s, clubs[0])
    if (!team?.length) { complete = false; break }
    const { run, whole } = walkBack(team, new Set(log.map((g) => g.gamePk)))
    total += run
    seasons.push({ season: s, run, of: team.length })
    if (!whole) break
    if (s === season - cap + 1) complete = false   // hit the cap still unbroken: "at least"
  }
  const out = { total, seasons, complete }
  _streak.set(k, out)
  return out
}

/** Pure: which rows make the list (one-club players; the traded check is async). */
export function everyGameCandidates(splits, teamGp, cancelled) {
  const full = []; const foot = []; const traded = []
  const max = Math.max(...[...teamGp.values()].map((t) => t.gp))
  for (const s of splits) {
    const gp = Number(s.stat?.gamesPlayed)
    const pid = Number(s.player?.id)
    if (!pid || !gp) continue
    if (Number(s.numTeams) > 1) { if (gp >= max - 12) traded.push(s); continue }
    const t = teamGp.get(Number(s.team?.id))
    if (!t || gp !== t.gp) continue
    const row = { id: String(pid), name: s.player.fullName, team: t.abbr, gp, teamGp: t.gp }
    if (t.gp === max) full.push(row)
    else if (cancelled.get(Number(s.team.id))?.length && t.gp + cancelled.get(Number(s.team.id)).length === max) foot.push(row)
  }
  return { full, foot, traded, max }
}

async function tradedPlayedAll(s, season) {
  const pid = Number(s.player.id)
  const log = await gameLog(pid, season)
  if (!log?.length) return null
  const person = await api(`/people/${pid}?hydrate=transactions`)
  const trades = (person?.people?.[0]?.transactions || []).filter((t) => /Trade/i.test(t.typeDesc || '') && String(t.date || '').startsWith(String(season)))
  // Stints in the order played.
  const stints = []
  for (const g of log.slice().sort((a, b) => a.date.localeCompare(b.date))) {
    const last = stints[stints.length - 1]
    if (last && last.teamId === g.teamId) { last.to = g.date; last.games.add(g.gamePk) } else stints.push({ teamId: g.teamId, from: g.date, to: g.date, games: new Set([g.gamePk]) })
  }
  if (stints.length < 2) return null
  const abbrs = []
  for (let i = 0; i < stints.length; i += 1) {
    const st = stints[i]
    const team = await teamGamesPlayed(season, st.teamId)
    if (!team) return null
    // From the opener (first stint) or the trade date (later stints) to his
    // last game with the club (or the season's end for the last stint).
    const trade = i > 0 ? trades.find((t) => t.toTeam?.id === st.teamId && t.date <= st.from) : null
    if (i > 0 && !trade) return null   // no transaction to anchor the stint: not verifiable, dropped
    const start = i === 0 ? team[0]?.date : trade.date
    const nextTrade = i < stints.length - 1 ? trades.find((t) => t.fromTeam?.id === st.teamId && t.date >= st.to) : null
    if (i < stints.length - 1 && !nextTrade) return null
    const end = i === stints.length - 1 ? team[team.length - 1]?.date : nextTrade.date
    const due = team.filter((g) => g.date >= start && (i === stints.length - 1 ? g.date <= end : g.date < end))
    if (!due.length || due.some((g) => !st.games.has(g.gamePk))) return null
    abbrs.push(st.teamId)
  }
  return { id: String(pid), name: s.player.fullName, gp: Number(s.stat.gamesPlayed), teamIds: abbrs }
}

/** The list: { sport, kind, title, rows, footnote, source, asOf, detail } or null. */
export async function playedEveryGameList(season) {
  const [st, teams, sch] = await Promise.all([
    api(`/stats?stats=season&group=hitting&season=${season}&sportId=1&gameType=R&playerPool=ALL&limit=3000`),
    api(`/teams?sportId=1&season=${season}`),
    api(`/schedule?sportId=1&season=${season}&gameType=R&fields=dates,games,gamePk,status,detailedState,teams,away,home,team,id,officialDate`),
  ])
  const tStats = await api(`/teams/stats?season=${season}&group=hitting&stats=season&sportId=1&gameType=R`)
  if (!st || !teams || !sch || !tStats) return null
  const abbr = new Map((teams.teams || []).map((t) => [t.id, t.abbreviation]))
  const teamGp = new Map((tStats.stats?.[0]?.splits || []).map((s) => [s.team.id, { gp: Number(s.stat.gamesPlayed), abbr: abbr.get(s.team.id) || s.team.name }]))
  const cancelled = new Map()
  for (const g of (sch.dates || []).flatMap((d) => d.games || [])) {
    if (!/Cancel/i.test(g.status?.detailedState || '')) continue
    for (const side of ['away', 'home']) { const id = g.teams?.[side]?.team?.id; cancelled.set(id, [...(cancelled.get(id) || []), { gamePk: g.gamePk, date: g.officialDate }]) }
  }
  const { full, foot, traded, max } = everyGameCandidates(st.stats?.[0]?.splits || [], teamGp, cancelled)
  for (const s of traded) {
    const t = await tradedPlayedAll(s, season).catch(() => null)
    if (t && t.gp === max) full.push({ id: t.id, name: t.name, team: t.teamIds.map((id) => abbr.get(id)).join('/'), gp: t.gp, teamGp: max, withClubs: t.teamIds.map((id) => abbr.get(id)) })
  }
  // The streaks, for the list's players only.
  const rows = []
  for (const r of [...full, ...foot]) {
    const c = await consecutiveGames(Number(r.id), season).catch(() => null)
    rows.push({ ...r, streak: c })
  }
  const factOf = (r) => {
    const bits = []
    if (r.streak?.total >= STREAK_MIN) bits.push(`${r.streak.complete ? '' : 'at least '}${r.streak.total.toLocaleString('en-US')} consecutive games`)
    if (r.withClubs?.length > 1) bits.push(`with ${r.withClubs.join(' and ')}`)
    return bits.join(', ') || null
  }
  const listed = rows.filter((r) => r.gp === max).sort((a, b) => (b.streak?.total || 0) - (a.streak?.total || 0))
  const footRows = rows.filter((r) => r.gp !== max)
  return {
    sport: 'mlb', kind: 'played_every_game', season, max,
    title: `Players to play in all ${max} games this season:`,
    rows: listed.map((r) => ({ id: r.id, name: r.name, team: r.team, fact: factOf(r) })),
    footnote: footRows.length ? footRows.map((r) => `${r.name} played in all ${r.gp} games before Game ${max} was canceled${r.streak?.total >= STREAK_MIN ? ` (${r.streak.total.toLocaleString('en-US')} straight)` : ''}.`).join(' ') : null,
    source: 'MLB StatsAPI: season hitting games played, team games played, schedule (Cancelled), game logs',
    asOf: new Date().toISOString(),
    detail: rows.map((r) => ({ id: r.id, name: r.name, team: r.team, gp: r.gp, teamGp: r.teamGp, streak: r.streak })),
  }
}

// ── THE REST OF THE SEASON WRAP (one list a day, BATCH-LIST-POSTS step 2) ──
// All from the same season hitting read (a traded player's row is his season
// total), except CALLED IT season, which is our own record (homer_feed).
async function seasonSplits(season) {
  const st = await api(`/stats?stats=season&group=hitting&season=${season}&sportId=1&gameType=R&playerPool=ALL&limit=3000`)
  return st?.stats?.[0]?.splits || null
}

/** The 40-homer club (the 35-homer club if fewer than two reached 40). */
export async function hrClubList(season) {
  const s = await seasonSplits(season)
  if (!s) return null
  const bar = s.filter((x) => x.stat.homeRuns >= 40).length >= 2 ? 40 : 35
  const rows = s.filter((x) => x.stat.homeRuns >= bar).sort((a, b) => b.stat.homeRuns - a.stat.homeRuns || a.player.fullName.localeCompare(b.player.fullName))
    .map((x) => ({ id: String(x.player.id), name: x.player.fullName, team: x.team?.name || null, fact: `${x.stat.homeRuns} HR`, check: { homeRuns: bar } }))
  return { sport: 'mlb', kind: 'hr_club', season, title: `The ${bar}-homer club this season:`, rows, footnote: null, source: 'MLB StatsAPI season hitting (regular season)', asOf: new Date().toISOString() }
}

/** 30-30 (HR + SB); the 20-20 club when fewer than two went 30-30. */
export async function powerSpeedList(season) {
  const s = await seasonSplits(season)
  if (!s) return null
  const bar = s.filter((x) => x.stat.homeRuns >= 30 && x.stat.stolenBases >= 30).length >= 2 ? 30 : 20
  const rows = s.filter((x) => x.stat.homeRuns >= bar && x.stat.stolenBases >= bar)
    .sort((a, b) => (b.stat.homeRuns + b.stat.stolenBases) - (a.stat.homeRuns + a.stat.stolenBases))
    .map((x) => ({ id: String(x.player.id), name: x.player.fullName, team: x.team?.name || null, fact: `${x.stat.homeRuns} HR, ${x.stat.stolenBases} SB`, check: { homeRuns: bar, stolenBases: bar } }))
  return { sport: 'mlb', kind: 'power_speed', season, title: `The ${bar}-${bar} club this season:`, rows, footnote: null, source: 'MLB StatsAPI season hitting (regular season)', asOf: new Date().toISOString() }
}

/** CALLED IT season: the most homers the bot CALLED before they happened (our own record). */
export async function calledSeasonList(db, season, lastRegularDay) {
  if (!db) return null
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('homer_feed').select('player_id,name,role,day').gte('day', `${season}-01-01`).lte('day', lastRegularDay)
      .order('day', { ascending: true }).order('player_id', { ascending: true }).order('hr_n', { ascending: true }).range(from, from + 999)
    if (error) return null
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  const by = new Map()
  for (const r of out) {
    if (!isCalledRole(r.role)) continue
    const o = by.get(r.player_id) || { id: String(r.player_id), name: r.name, n: 0 }
    o.n += 1; by.set(r.player_id, o)
  }
  const rows = [...by.values()].filter((o) => o.n >= 5).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).slice(0, 6)
    .map((o) => ({ id: o.id, name: o.name, team: null, fact: `${o.n} called homers`, check: { called: o.n } }))
  const since = out.find((r) => isCalledRole(r.role))?.day
  // The record starts when homer_feed did (08-22), not on Opening Day: the
  // title says so rather than calling it "this season".
  const md = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
  if (!since) return null
  return { sport: 'mlb', kind: 'called_season', season, ranked: true, title: `CALLED IT since ${md(since)} -- the most homers named before first pitch:`, rows, footnote: 'Every call is on the public record.', source: 'homer_feed (the CALLED IT record)', asOf: new Date().toISOString() }
}

/**
 * THE FACT CHECK, at post time: every row re-read from the source; a row that
 * cannot be verified is dropped (lib/lists/shape.js verified() then refuses a
 * list under two rows).
 */
export async function recheckMlbList(list, { db = null, lastRegularDay = null } = {}) {
  if (!list?.rows?.length) return null
  const ok = new Set()
  if (list.kind === 'called_season') {
    const again = await calledSeasonList(db, list.season, lastRegularDay)
    const n = new Map((again?.rows || []).map((r) => [r.id, r.check.called]))
    for (const r of list.rows) if (n.get(r.id) === r.check.called) ok.add(r.id)
    return verified(list, ok)
  }
  const ids = list.rows.map((r) => r.id)
  const j = await api(`/people?personIds=${ids.join(',')}&hydrate=stats(group=[hitting],type=[season],season=${list.season},gameType=[R])`)
  for (const p of j?.people || []) {
    const splits = (p.stats || []).flatMap((x) => x.splits || [])
    const whole = splits.find((x) => !x.team) || splits[0]
    const st = whole?.stat || {}
    const row = list.rows.find((r) => r.id === String(p.id))
    if (!row) continue
    if (list.kind === 'played_every_game') { if (Number(st.gamesPlayed) === Number(list.max)) ok.add(row.id); continue }
    if (Object.entries(row.check || {}).every(([k, v]) => Number(st[k]) >= v)) ok.add(row.id)
  }
  return verified(list, ok)
}

export const MLB_WRAP = ['played_every_game', 'hr_club', 'power_speed', 'called_season']

// ── THE POSTSEASON LISTS (BATCH-LIST-POSTS step 6) ─────────────────────────
export const ROUNDS = [['F', 'Wild Card Series'], ['D', 'Division Series'], ['L', 'League Championship Series'], ['W', 'World Series']]

/** Postseason home run leaders so far (StatsAPI season hitting, gameType P). Ranked. */
export async function postHrLeadersList(season, roundName) {
  const st = await api(`/stats?stats=season&group=hitting&season=${season}&sportId=1&gameType=P&playerPool=ALL&limit=1000`)
  const s = (st?.stats?.[0]?.splits || []).filter((x) => Number(x.stat?.homeRuns) > 0)
  if (!s.length) return null
  const bar = s.filter((x) => x.stat.homeRuns >= 2).length >= 3 ? 2 : 1
  const rows = s.filter((x) => x.stat.homeRuns >= bar).sort((a, b) => b.stat.homeRuns - a.stat.homeRuns || a.player.fullName.localeCompare(b.player.fullName))
    .map((x) => ({ id: String(x.player.id), name: x.player.fullName, team: x.team?.name || null, fact: `${x.stat.homeRuns} HR`, check: { homeRuns: x.stat.homeRuns } }))
  return { sport: 'mlb', kind: 'post_hr_leaders', season, ranked: true, title: `Postseason home run leaders, through the ${roundName}:`, rows, footnote: null, source: 'MLB StatsAPI season hitting (gameType P)', asOf: new Date().toISOString() }
}

/** Everyone whose first career postseason homer came in [from, to] (homer_feed rows the tick stamped post_first). */
export async function firstPostHomersList(db, season, roundName, from, to) {
  if (!db) return null
  const { data, error } = await db.from('homer_feed').select('player_id,name,team,day,stats').gte('day', from).lte('day', to)
  if (error) return null
  const seen = new Set()
  const rows = (data || []).filter((r) => r?.stats?.post_first === true && !seen.has(String(r.player_id)) && seen.add(String(r.player_id)))
    .sort((a, b) => a.day.localeCompare(b.day)).map((r) => ({ id: String(r.player_id), name: r.name, team: r.team, fact: null, check: { firstPost: true } }))
  return { sport: 'mlb', kind: 'first_post_hr', season, title: `First career postseason home runs, ${roundName}:`, rows, footnote: null, source: 'homer_feed + MLB StatsAPI yearByYear postseason (gameType P)', asOf: new Date().toISOString() }
}

/** Post-time re-check for the postseason lists. */
export async function recheckPostList(list) {
  if (!list?.rows?.length) return null
  const ok = new Set()
  if (list.kind === 'post_hr_leaders') {
    const again = await postHrLeadersList(list.season, '')
    const hr = new Map((again?.rows || []).map((r) => [r.id, r.check.homeRuns]))
    for (const r of list.rows) if ((hr.get(r.id) ?? -1) >= r.check.homeRuns) ok.add(r.id)
  } else if (list.kind === 'first_post_hr') {
    for (const r of list.rows) {
      const j = await api(`/people/${r.id}?hydrate=stats(group=[hitting],type=[yearByYear],gameType=[P])`)
      const prior = (j?.people?.[0]?.stats || []).flatMap((s) => s.splits || []).filter((x) => Number(x.season) < list.season).reduce((a, x) => a + (Number(x.stat?.homeRuns) || 0), 0)
      if (j && prior === 0) ok.add(r.id)
    }
  }
  return verified(list, ok)
}
