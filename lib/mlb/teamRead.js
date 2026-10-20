// ⚾ THE CLUB PAGE'S SERVER READS (2026-10-10). GET /api/mlb/team?team=NYY calls this. Server only.
//
//   standing  MLB standings (division rank, streak, runs for / against, the record splits)
//   schedule  the club's whole season, played and to come (MLB schedule, probable pitchers)
//   lines     the club's batting and pitching with the rank of 30 (MLB team stats, every club, one call each)
//   splits    ESPN's team splits (regular season, batting + pitching) and MLB's situational splits for what ESPN lacks
//   venues    roof and surface of each ballpark on the schedule (MLB venues, fieldInfo)
//   starters  the next game's two starting pitchers: hand and the season line
//   calls     OUR locked home-run calls on this club's hitters, graded (lib/record/mlbCalls.js, the one locked record)
//   totals    the stored Top Totals row for the next game
// Upstream calls ride Next's data cache (splits six hours, the rest ten minutes); no cron. A part that fails is null and
// the page says which data is missing: nothing is guessed. SEASON RULE: this season's regular season; last season's,
// labelled (`stale`), only while this season has no game played.
import { adminClient } from '../supabase/admin'
import { teamKey, teamFullName } from '../mlbTeams'
import { easternToday } from '../data'
import { lockedHrCalls } from '../record/mlbCalls'
import { espnRows, mlbRows, sumBat, sumPit, recordSplits } from './teamSplitsCore'
import { clubLines } from '../team/statLines'

const API = 'https://statsapi.mlb.com/api/v1'
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb'
const UA = { 'User-Agent': 'DASHNetwork/1.0', Accept: 'application/json' }
const HOUR = 3600
const num = (v) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null)

async function getJSON(url, revalidate) {
  try {
    const r = await fetch(url, { headers: UA, next: { revalidate } })
    return r.ok ? await r.json() : null
  } catch (e) { console.error(`[mlb team] ${url.slice(0, 90)}: ${e?.message}`); return null }
}

/** { [teamKey code]: { id (MLB), espn, name, division, league } } */
async function clubIndex(year) {
  const [mlb, espn] = await Promise.all([getJSON(`${API}/teams?sportId=1&season=${year}`, 24 * HOUR), getJSON(`${ESPN}/teams`, 24 * HOUR)])
  const out = {}
  for (const t of mlb?.teams || []) { const k = teamKey(t.abbreviation); if (k) out[k] = { code: k, id: t.id, name: teamFullName(k) || t.name, division: t.division?.name || null, league: t.league?.name || null } }
  for (const e of espn?.sports?.[0]?.leagues?.[0]?.teams || []) { const k = teamKey(e.team?.abbreviation); if (k && out[k]) out[k].espn = e.team.id }
  return out
}

const SIT = ['h', 'a', 'd', 'n', 'g', 't', '3', '4', '5', '6', '7', '8', '9', '10', 'vl', 'vr', 'val', 'vnl', 'sah', 'sbh', 'sti', 'ix', 'i01', 'i02', 'i03', 'i04', 'i05', 'i06', 'i07', 'i08', 'i09', 'r0', 'r123', 'ron', 'risp', 'risp2', 'o0', 'o1', 'o2', 'sp', 'rp'].join(',')

async function readSplits(club, year) {
  const [espn, hit, pit] = await Promise.all([
    club.espn ? getJSON(`${ESPN}/teams/${club.espn}/statistics?season=${year}&seasontype=2`, 6 * HOUR) : null,
    getJSON(`${API}/teams/${club.id}/stats?stats=statSplits&group=hitting&season=${year}&gameType=R&sitCodes=${SIT}`, 6 * HOUR),
    getJSON(`${API}/teams/${club.id}/stats?stats=statSplits&group=pitching&season=${year}&gameType=R&sitCodes=${SIT}`, 6 * HOUR),
  ])
  const e = espn ? espnRows(espn) : null
  const bat = hit ? mlbRows(hit, 'hitting') : null; const pt = pit ? mlbRows(pit, 'pitching') : null
  const mlb = bat || pt ? { bat: bat || {}, pit: pt || {} } : null
  if (mlb) {   // innings 1-3 / 4-6 / 7-9: summed counts, rates recomputed
    const grp = (key, codes) => { mlb.bat[key] = sumBat(codes.map((c) => mlb.bat[c])); mlb.pit[key] = sumPit(codes.map((c) => mlb.pit[c])) }
    grp('i1-3', ['i01', 'i02', 'i03']); grp('i4-6', ['i04', 'i05', 'i06']); grp('i7-9', ['i07', 'i08', 'i09'])
  }
  return { espn: e, mlb, year }
}

async function readLeague(year) {
  const [h, p] = await Promise.all([
    getJSON(`${API}/teams/stats?season=${year}&group=hitting&stats=season&sportIds=1&gameType=R`, HOUR),
    getJSON(`${API}/teams/stats?season=${year}&group=pitching&stats=season&sportIds=1&gameType=R`, HOUR),
  ])
  return { h: h?.stats?.[0]?.splits || [], p: p?.stats?.[0]?.splits || [] }
}

/** Pure: league team stats -> the stat rows with every club's value (for lib/team/statLines clubLines). */
export function statRowsMlb(league, idToCode, standings = {}) {
  const by = (list, fn) => { const o = {}; for (const s of list) { const c = idToCode[s.team?.id]; if (c) o[c] = fn(s.stat, c) } return o }
  const gp = (s) => num(s.gamesPlayed)
  const per = (s, k) => (num(s[k]) != null && gp(s) > 0 ? s[k] / gp(s) : null)
  const rate = (s, k) => num(s[k])
  const rows = [
    { key: 'rg', group: 'Offense', label: 'Runs / game', dp: 2, higherBetter: true, byClub: by(league.h, (s) => per(s, 'runs')) },
    { key: 'hrg', group: 'Offense', label: 'Home runs / game', dp: 2, higherBetter: true, byClub: by(league.h, (s) => per(s, 'homeRuns')) },
    { key: 'avg', group: 'Offense', label: 'AVG', dp: 3, higherBetter: true, byClub: by(league.h, (s) => rate(s, 'avg')) },
    { key: 'obp', group: 'Offense', label: 'OBP', dp: 3, higherBetter: true, byClub: by(league.h, (s) => rate(s, 'obp')) },
    { key: 'slg', group: 'Offense', label: 'SLG', dp: 3, higherBetter: true, byClub: by(league.h, (s) => rate(s, 'slg')) },
    { key: 'ops', group: 'Offense', label: 'OPS', dp: 3, higherBetter: true, byClub: by(league.h, (s) => rate(s, 'ops')) },
    { key: 'bbg', group: 'Offense', label: 'Walks / game', dp: 2, higherBetter: true, byClub: by(league.h, (s) => per(s, 'baseOnBalls')) },
    { key: 'sog', group: 'Offense', label: 'Strikeouts / game', dp: 2, higherBetter: false, byClub: by(league.h, (s) => per(s, 'strikeOuts')) },
    { key: 'sbg', group: 'Offense', label: 'Stolen bases / game', dp: 2, higherBetter: true, byClub: by(league.h, (s) => per(s, 'stolenBases')) },
    { key: 'ra', group: 'Pitching', label: 'Runs allowed / game', dp: 2, higherBetter: false, byClub: by(league.p, (s) => per(s, 'runs')) },
    { key: 'era', group: 'Pitching', label: 'ERA', dp: 2, higherBetter: false, byClub: by(league.p, (s) => rate(s, 'era')) },
    { key: 'whip', group: 'Pitching', label: 'WHIP', dp: 2, higherBetter: false, byClub: by(league.p, (s) => rate(s, 'whip')) },
    { key: 'k9', group: 'Pitching', label: 'Strikeouts / 9', dp: 2, higherBetter: true, byClub: by(league.p, (s) => rate(s, 'strikeoutsPer9Inn')) },
    { key: 'bb9', group: 'Pitching', label: 'Walks / 9', dp: 2, higherBetter: false, byClub: by(league.p, (s) => rate(s, 'walksPer9Inn')) },
    { key: 'hr9', group: 'Pitching', label: 'Home runs allowed / 9', dp: 2, higherBetter: false, byClub: by(league.p, (s) => rate(s, 'homeRunsPer9')) },
    { key: 'oavg', group: 'Pitching', label: 'Opponent AVG', dp: 3, higherBetter: false, byClub: by(league.p, (s) => rate(s, 'avg')) },
    { key: 'sv', group: 'Pitching', label: 'Saves', dp: 0, higherBetter: true, byClub: by(league.p, (s) => num(s.saves)) },
    { key: 'diff', group: 'Overall', label: 'Run difference / game', dp: 2, higherBetter: true, signed: true, byClub: standings.diffPg || {} },
    { key: 'win', group: 'Overall', label: 'Win %', dp: 1, pct: true, higherBetter: true, byClub: standings.win || {} },
  ]
  return rows.filter((r) => Object.values(r.byClub).some((v) => v != null))
}

async function readStandings(year, idToCode) {
  const j = await getJSON(`${API}/standings?leagueId=103,104&season=${year}&standingsTypes=regularSeason&hydrate=team(division)`, 600)
  const out = {}
  const diffPg = {}; const win = {}
  for (const rec of j?.records || []) for (const t of rec.teamRecords || []) {
    const c = idToCode[t.team?.id]; if (!c) continue
    const g = num(t.gamesPlayed)
    out[c] = { w: t.wins, l: t.losses, pct: t.winningPercentage, gp: g, divName: t.team?.division?.name || null, divRank: num(t.divisionRank), leagueRank: num(t.leagueRank), gb: t.divisionGamesBack, streak: t.streak?.streakCode || null, rs: num(t.runsScored), ra: num(t.runsAllowed), diff: num(t.runDifferential), records: recordSplits(t.records) }
    if (g > 0) { diffPg[c] = t.runDifferential / g; win[c] = t.wins / g }
  }
  return { by: out, diffPg, win }
}

function reduceGame(g, id) {
  const home = g.teams?.home; const away = g.teams?.away
  const mine = home?.team?.id === id
  const us = mine ? home : away; const them = mine ? away : home
  const state = g.status?.abstractGameState
  const sc = (x) => (state === 'Final' || state === 'Live' ? num(x?.score) : null)
  return {
    pk: String(g.gamePk), date: g.officialDate || String(g.gameDate || '').slice(0, 10), startUtc: g.gameDate, type: g.gameType, state, detail: g.status?.detailedState, dayNight: g.dayNight || null,
    home: mine, opp: teamKey(them?.team?.abbreviation) || them?.team?.abbreviation, oppId: them?.team?.id, venue: g.venue?.name || null, venueId: g.venue?.id || null,
    us: sc(us), them: sc(them), result: state === 'Final' && num(us?.score) != null && num(them?.score) != null ? (us.score > them.score ? 'W' : us.score < them.score ? 'L' : 'T') : null,
    usPitcher: us?.probablePitcher ? { id: us.probablePitcher.id, name: us.probablePitcher.fullName } : null, themPitcher: them?.probablePitcher ? { id: them.probablePitcher.id, name: them.probablePitcher.fullName } : null,
    doubleHeader: g.doubleHeader !== 'N' ? g.gameNumber : null,
  }
}

async function readSchedule(club, year) {
  const j = await getJSON(`${API}/schedule?sportId=1&teamId=${club.id}&season=${year}&gameType=R,F,D,L,W&hydrate=team,probablePitcher,venue`, 600)
  const games = (j?.dates || []).flatMap((d) => (d.games || []).map((g) => reduceGame(g, club.id)))
  return games.length ? games : null
}

async function readVenues(ids) {
  const list = [...new Set(ids.filter(Boolean))]
  if (!list.length) return {}
  const j = await getJSON(`${API}/venues?venueIds=${list.join(',')}&hydrate=fieldInfo`, 24 * HOUR)
  return Object.fromEntries((j?.venues || []).map((v) => [v.id, { name: v.name, roof: v.fieldInfo?.roofType || null, turf: v.fieldInfo?.turfType || null }]))
}

async function readPitchers(list, year) {
  const ids = list.filter(Boolean)
  if (!ids.length) return {}
  const j = await getJSON(`${API}/people?personIds=${ids.join(',')}&hydrate=stats(group=[pitching],type=[season],season=${year})`, HOUR)
  return Object.fromEntries((j?.people || []).map((p) => { const s = p.stats?.[0]?.splits?.[0]?.stat || null; return [p.id, { id: p.id, name: p.fullName, hand: p.pitchHand?.code || null, gs: num(s?.gamesStarted), ip: s?.inningsPitched ?? null, era: num(s?.era), whip: num(s?.whip), k: num(s?.strikeOuts), bb: num(s?.baseOnBalls), hr: num(s?.homeRuns) }] }))
}

async function readTotals(db, pk) {
  if (!db || !pk) return null
  try {
    const { data, error } = await db.from('top_totals_calls').select('model_version,line,line_source,projected_total,called,rank,field_size,actual_total,result,hit').eq('sport', 'mlb').eq('game_id', String(pk)).limit(1)
    if (error || !data?.length) return null
    const r = data[0]
    return { line: r.line, source: r.line_source, projected: r.projected_total, called: r.called, rank: r.rank, of: r.field_size, actual: r.actual_total, result: r.result, version: r.model_version }
  } catch { return null }
}

export async function readMlbTeam(code) {
  const today = easternToday()
  let year = Number(today.slice(0, 4))
  let idx = await clubIndex(year)
  let club = idx[code]
  if (!club) throw Object.assign(new Error('no such club'), { status: 400 })
  let idToCode = Object.fromEntries(Object.values(idx).map((c) => [c.id, c.code]))
  let standings = await readStandings(year, idToCode)
  let stale = false
  if (!(standings.by[code]?.gp > 0)) { year -= 1; stale = true; idx = await clubIndex(year); club = idx[code] || club; idToCode = Object.fromEntries(Object.values(idx).map((c) => [c.id, c.code])); standings = await readStandings(year, idToCode) }
  const db = adminClient()
  const [schedule, league, splits] = await Promise.all([readSchedule(club, year), readLeague(year), readSplits(club, year)])
  const rows = statRowsMlb(league, idToCode, standings)
  const next = (schedule || []).find((g) => g.state === 'Live') || (schedule || []).find((g) => g.state === 'Preview' || g.state === 'Scheduled') || (schedule || []).find((g) => g.state !== 'Final') || null
  const [venues, pitchers, totals, calls] = await Promise.all([
    readVenues((schedule || []).map((g) => g.venueId)),
    readPitchers([next?.usPitcher?.id, next?.themPitcher?.id], year),
    next ? readTotals(db, next.pk) : null,
    db ? lockedHrCalls(db, today).catch(() => null) : null,
  ])
  return {
    team: { code, id: club.id, name: club.name, division: club.division, league: club.league }, season: year, stale,
    standing: standings.by[code] || null,
    schedule, venues, splits,
    lines: league.h.length ? clubLines(rows, code) : [], oppLines: next && league.h.length ? clubLines(rows, next.opp) : [],
    starters: next ? { us: next.usPitcher ? pitchers[next.usPitcher.id] || { ...next.usPitcher } : null, them: next.themPitcher ? pitchers[next.themPitcher.id] || { ...next.themPitcher } : null } : null,
    totals,
    calls: calls?.error ? null : calls ? { picks: calls.picks.filter((p) => teamKey(p.team) === code), today } : null,
    fetchedAt: new Date().toISOString(),
  }
}
