// 🏅 LAMP'S AWARD RACES, LIVE (2026-10-20). Server only. BUCKETS' builder (lib/nba/awards.js) for hockey. The model is
// lib/nhl/awardModel.js (fitted on 2012-2026 voting); this file feeds it tonight's numbers and writes the shared award-race
// file (lib/awards.js) the Home panel draws.
//   players  the league's season reports (api.nhle.com/stats skater + goalie summary, the reports Leaders reads), this season
//            shrunk toward last season's (blendLine): early season = mostly last season. Rookies: the same report, isRookie.
//   clubs    every club's roster today (who is on which club; a player on no roster is in no race) and its projected points
//            share from the Cup odds sim (lib/nhl/titleSim.js, the same 10,000 seasons as Stanley Cup odds)
// Each race lists its top 10 with THIS season's line (not the blended one) and shares, plus the rest of the pool as one line,
// so the shares sum to 1. A race with nothing honest to show yet says so (`waiting`), and lists nobody.
import { unstable_cache } from 'next/cache'
import { nhlStatsGet, rosterFor, TTL2 } from './api'
import { NHL_TEAMS } from './teams'
import { previousSeasonId } from './season'
import { seasonLabel } from './reduce'
import { readTitleOdds } from './titleSim'
import { pool } from '../titleSimCore'
import { AWARDS_MODEL_VERSION, AWARD_DEFS, AWARD_FITS, BLEND_GAMES, blendLine, goalieLine, leagueSv, rawFeatures, skaterLine, softmax, temperatureAt, zScore } from './awardModel'

const SEASON_GAMES = 82
// the Calder opens once the median club has played this many games: before that a rookie's line is a night or two (a rule of
// the page, not a fitted number; the race says so)
export const OPEN_AFTER_GAMES = 10
const SHOWN = 10

const q = (seasonId, rookie) => `isAggregate=false&isGame=false&start=0&limit=-1&cayenneExp=${encodeURIComponent(`seasonId=${seasonId} and gameTypeId=2${rookie ? " and isRookie='1'" : ''}`)}`
const report = (kind, seasonId, rookie = false) => nhlStatsGet(`/${kind}/summary?${q(seasonId, rookie)}`, TTL2.leaders).then((j) => j?.data || [])
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10)
const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000)
const r4 = (x) => Math.round(x * 10000) / 10000
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0 }

/** Today's rosters: { [playerId]: { team, pos, name } }. */
async function rosters() {
  const per = await pool(NHL_TEAMS, 6, async ([abbrev]) => [abbrev, await rosterFor(abbrev).catch(() => null)])
  if (per.filter(([, j]) => !j).length > 3) throw new Error('rosters: too many clubs unread')
  const out = {}
  for (const [abbrev, j] of per) for (const a of [...(j?.forwards || []), ...(j?.defensemen || []), ...(j?.goalies || [])]) {
    out[String(a.id)] = { team: abbrev, pos: a.positionCode, name: `${a.firstName?.default || ''} ${a.lastName?.default || ''}`.trim() }
  }
  return out
}

/** One finished race: shares over the pool, the top SHOWN with this season's line, the rest as one number. */
function race(key, scored, extra) {
  const order = scored.sort((a, b) => b.share - a.share)
  return {
    key, label: AWARD_DEFS[key].label, title: AWARD_DEFS[key].title, status: 'ok',
    pool: order.length,
    rows: order.slice(0, SHOWN).map((r) => {
      const c = r.cur || {}
      const line = r.pos === 'G'
        ? { gp: c.gp || 0, w: c.w ?? 0, svPct: r3(c.svPct), gaa: c.gaa != null ? Math.round(c.gaa * 100) / 100 : null, so: c.so ?? 0 }
        : { gp: c.gp || 0, g: c.g ?? 0, a: c.a ?? 0, pts: c.pts ?? 0, toi: c.toi != null ? r1(c.toi / 60) : null }
      return { id: r.id, name: r.name, team: r.team, pos: r.pos, rookie: r.rookie || undefined, ...line, share: r4(r.share) }
    }),
    rest: r4(order.slice(SHOWN).reduce((t, r) => t + r.share, 0)),
    ...extra,
  }
}

export async function buildAwardRaces(seasonId, day) {
  const prevId = previousSeasonId(seasonId)
  const [sk, gk, skR, gkR, skP, gkP, roster, title] = await Promise.all([
    report('skater', seasonId), report('goalie', seasonId), report('skater', seasonId, true), report('goalie', seasonId, true),
    report('skater', prevId), report('goalie', prevId), rosters(), readTitleOdds(seasonId, day),
  ])
  const rookies = new Set([...skR, ...gkR].map((r) => String(r.playerId)))
  const lines = (rows, fn) => new Map(rows.map(fn).filter(Boolean).map((l) => [l.id, l]))
  const cur = new Map([...lines(sk, skaterLine), ...lines(gk, goalieLine)])
  const prev = new Map([...lines(skP, skaterLine), ...lines(gkP, goalieLine)])

  const clubs = {}
  for (const t of title.teams || []) clubs[t.abbr] = { games: (t.wins || 0) + (t.losses || 0) + (t.otl || 0), pointPct: t.proj_points / (2 * SEASON_GAMES) }
  const medGames = median(Object.values(clubs).map((c) => c.games))
  const frac = medGames / SEASON_GAMES
  // the league's save percentage, this season's shrunk toward last season's as each goalie's is
  const aLg = medGames / (medGames + BLEND_GAMES)
  const svCur = leagueSv(gk), svPrev = leagueSv(gkP)
  const lgSv = svCur != null && svPrev != null ? aLg * svCur + (1 - aLg) * svPrev : (svCur ?? svPrev)

  // every rostered player with a line: blended, with his share of his club's games (last season's over 82)
  const people = []
  for (const [id, who] of Object.entries(roster)) {
    const club = clubs[who.team]
    let c = cur.get(id) || null, p = prev.get(id) || null
    if (!club || (!c && !p)) continue
    const rookie = rookies.has(id)
    if (c) c = { ...c, gpFrac: club.games ? Math.min(1, c.gp / club.games) : 0, gsFrac: c.pos === 'G' && club.games ? Math.min(1, c.gs / club.games) : null }
    if (p) p = { ...p, gpFrac: Math.min(1, p.gp / SEASON_GAMES), gsFrac: p.pos === 'G' ? Math.min(1, p.gs / SEASON_GAMES) : null }
    const line = rookie ? c : blendLine(c, p)
    if (!line) continue
    line.pos = c?.pos || p?.pos || who.pos
    people.push({ id, name: c?.name || p?.name || who.name, team: who.team, pos: line.pos, rookie, cur: c, line, club })
  }

  const races = []
  for (const key of ['hart', 'vezina', 'norris', 'calder']) {
    const def = AWARD_DEFS[key], fit = AWARD_FITS[key]
    const waiting = (why) => races.push({ key, label: def.label, title: def.title, status: 'waiting', why, rows: [], measured: fit.measured })
    // no regular-season games left (the Cup sim's file is empty): the regular season is what voters judge, and it is done
    if (!title.teams?.length) { waiting('The regular season is over. The race opens again with the next one.'); continue }
    if (def.rookies && medGames < OPEN_AFTER_GAMES) {
      waiting(`${medGames === 0 ? 'Rookies have no NHL games yet.' : 'Rookies have a few games each.'} This race opens after ${OPEN_AFTER_GAMES} games a club.`)
      continue
    }
    const candidates = people.map((x) => ({ x, f: rawFeatures(x.line, x.club, lgSv) }))
      .filter(({ x, f }) => (!def.rookies || x.rookie) && def.pool(x.line, f))
    if (candidates.length < 10) { waiting('Too few players qualify yet.'); continue }
    const rows = zScore(candidates, def.feats)
    const T = fit.T0 ? temperatureAt(frac, fit.T0) : 1
    const sh = softmax(rows, fit.w, T)
    races.push(race(key, rows.map((r, i) => ({ ...r.x, share: sh[i] })), { T: Math.round(T * 100) / 100, measured: fit.measured }))
  }

  const played = Object.values(clubs).reduce((t, c) => t + c.games, 0) / 2
  return {
    schema: 1, sport: 'nhl', season: seasonId % 10000, seasonLabel: seasonLabel(seasonId), as_of: new Date().toISOString(), model_version: AWARDS_MODEL_VERSION,
    games_played: Math.round(played), median_club_games: medGames,
    method: `Fitted on how voters split each award, 2012-26 (Hockey-Reference): his numbers against that season's league, goalies on saves above the league's rate, and his club's projected points (Stanley Cup odds). Lines lean on last season's for his first ~${BLEND_GAMES} games.`,
    note: played < 200
      ? `${Math.round(played)} games played: mostly last season's lines, spread wider for it. Trades and injuries count once his games do.`
      : 'Trades and injuries count once his games do.',
    races,
  }
}

/** Cached six hours per season and day, as Stanley Cup odds is (the inputs move a few times a day at most). */
export function readAwardRaces(seasonId, day) {
  return unstable_cache(() => buildAwardRaces(seasonId, day), ['nhl-award-races-v1', String(seasonId), String(day)], { revalidate: 21600 })()
}
