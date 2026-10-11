// 🏈 THE CLUB PAGE'S SERVER READS (2026-10-10). GET /api/nfl/team?team=BUF calls this. Server only.
//
//   games   the club's full season, played and to come (ESPN's public team schedule: the same family of feed the
//           standings and the live scoreboard already read): week, kickoff, opponent, venue, score and state
//   totals  the stored Top Totals row for each of those games (top_totals_calls, sport 'nfl'): the number locked
//           before kickoff, its rank on the slate, whether it was CALLED, and the result once graded
//   tds     touchdowns this club's players scored this season, each with what the board said BEFORE it (nfl_td_feed
//           through lib/record/nfl.js toNflEvent -> lib/callStatus tdCallStatus; nothing re-derived here)
// A feed that fails leaves its part null ("not available"), never a guess.
import { adminClient } from '../supabase/admin'
import { toNflEvent } from '../record/nfl'
import { NFL_TEAMS } from './teams'

// ESPN's club codes differ from TUDDY's for Washington (WSH / WAS) and the Rams (LAR / LA)
const ESPN = { WAS: 'WSH', LA: 'LAR' }
const FROM_ESPN = { WSH: 'WAS', LAR: 'LA' }
const SCHEDULE = (code) => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${ESPN[code] || code}/schedule`
const TUDDY = (c) => FROM_ESPN[c] || c
const NAME = Object.fromEntries(NFL_TEAMS)
const n = (v) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null)

/** ESPN's schedule JSON -> [{ id, week, type, date, home, opp, oppName, venue, state, us, them, result }]. Pure. */
export function reduceSchedule(json, code) {
  const out = []
  for (const e of json?.events || []) {
    const c = e.competitions?.[0]
    const mine = (c?.competitors || []).find((x) => TUDDY(String(x.team?.abbreviation || '').toUpperCase()) === code)
    const them = (c?.competitors || []).find((x) => x !== mine)
    if (!c || !mine || !them) continue
    const score = (x) => n(x?.score?.value ?? x?.score)
    const state = c.status?.type?.state || e.status?.type?.state || 'pre'   // pre | in | post
    const us = state === 'pre' ? null : score(mine); const th = state === 'pre' ? null : score(them)
    out.push({
      id: String(e.id), week: n(e.week?.number), type: n(e.seasonType?.type) ?? n(e.seasonType?.id), date: String(e.date || c.date || '').slice(0, 10), startUtc: e.date || c.date || null,
      home: mine.homeAway === 'home', opp: TUDDY(String(them.team?.abbreviation || '').toUpperCase()), oppName: them.team?.displayName || null,
      venue: c.venue?.fullName || null, neutral: c.neutralSite === true, state,
      us, them: th, result: state === 'post' && us != null && th != null ? (us > th ? 'W' : us < th ? 'L' : 'T') : null,
    })
  }
  return out.sort((a, b) => String(a.startUtc).localeCompare(String(b.startUtc)))
}

async function readGames(code) {
  try {
    const r = await fetch(SCHEDULE(code), { next: { revalidate: 600 }, headers: { Accept: 'application/json' } })
    if (!r.ok) return null
    const j = await r.json()
    return { season: n(j?.season?.year), games: reduceSchedule(j, code), bye: n(j?.byeWeek) }
  } catch (e) { console.error(`[tuddy team] schedule ${code}: ${e?.message}`); return null }
}

async function readTotals(db, ids) {
  if (!db || !ids.length) return null
  try {
    const { data, error } = await db.from('top_totals_calls').select('game_id,model_version,line,line_source,projected_total,called,rank,field_size,actual_total,result,hit,locked_at').eq('sport', 'nfl').in('game_id', ids)
    if (error) return null
    return Object.fromEntries((data || []).map((r) => [r.game_id, { line: r.line, source: r.line_source, projected: r.projected_total, called: r.called, rank: r.rank, of: r.field_size, actual: r.actual_total, result: r.result, hit: r.hit, version: r.model_version }]))
  } catch { return null }
}

const TD_SELECT = 'day,game_id,td_n,team,opponent,quarter,clock,scorer_name,gsis_id,position,kind,yards,passer_name,on_bot,td_board,seen_at'
async function readTds(db, code, since) {
  if (!db) return null
  try {
    const { data, error } = await db.from('nfl_td_feed').select(TD_SELECT).eq('team', code).gte('day', since).order('day', { ascending: false }).order('td_n', { ascending: true }).limit(400)
    if (error) return null
    return data.map(toNflEvent).map((e) => ({ day: e.game_date, gameId: e.game_id, playerId: e.player_id, name: e.name, opp: e.opp, kind: e.payload.kind || null, position: e.payload.position || null, status: e.status }))
  } catch { return null }
}

export async function readNflTeam(code) {
  if (!NAME[code]) throw Object.assign(new Error('no such club'), { status: 400 })
  const sched = await readGames(code)
  const db = adminClient()
  const season = sched?.season || new Date().getUTCFullYear()
  const [totals, tds] = await Promise.all([readTotals(db, (sched?.games || []).map((g) => g.id)), readTds(db, code, `${season}-08-01`)])
  return { team: { abbr: code, name: NAME[code] }, season, schedule: sched, totals, tds, fetchedAt: new Date().toISOString() }
}
