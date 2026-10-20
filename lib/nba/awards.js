// 🏅 BUCKETS' AWARD RACES, LIVE (2026-10-20). Server only. The model is lib/nba/awardModel.js (fitted on 2012-2026 voting);
// this file feeds it tonight's numbers and writes the shared award-race file (lib/awards.js) the Home panel draws.
//   players  ESPN's season lines (lib/nba/stats.js), this season shrunk toward last season's (blendLine): early season = mostly
//            last season. ESPN answers a season with no games with LAST season's table; that is caught (servedSeason) and
//            counted as no games, never as this season.
//   clubs    every club's roster today (who is on which club, who is a rookie: experience 0), its projected win share from the
//            title sim (lib/nba/titleSim.js, the same 10,000 seasons as Title odds) and its defence per possession (ESPN byteam)
//   Finals MVP  title sim's champion share x the share inside his club (his share of its points + rebounds + assists ^ a)
// Each race lists its top 10 with their lines and shares, plus the rest of the pool as one line, so the shares sum to 1.
// A race with nothing honest to show yet says so (`waiting`), and lists nobody.
import { unstable_cache } from 'next/cache'
import { rosterFor } from './api'
import { seasonStats } from './stats'
import { seasonLabel } from './season'
import { NBA_TEAMS } from './teams'
import { readTitleOdds } from './titleSim'
import { AWARDS_MODEL_VERSION, AWARD_DEFS, AWARD_FITS, BLEND_GAMES, blendLine, defPerPoss, rawFeatures, softmax, temperatureAt, zScore } from './awardModel'

const SEASON_GAMES = 82
const RULE_GAMES = 65
// ROY and MIP open once the median club has played this many games: before that a rookie's line, or a change from last
// season, is one or two nights (a rule of the page, not a fitted number; the method line says so)
export const OPEN_AFTER_GAMES = 10
const SHOWN = 10

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]) } }))
  return out
}
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10)
const r4 = (x) => Math.round(x * 10000) / 10000
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0 }

/** Today's rosters: { [playerId]: { team, rookie, name } } (a player on no roster -- unsigned, retired -- is in no race). */
async function rosters() {
  const per = await pool(NBA_TEAMS, 6, async ([abbrev, id]) => [abbrev, await rosterFor(id).catch(() => null)])
  if (per.filter(([, j]) => !j).length > 3) throw new Error('rosters: too many clubs unread')
  const out = {}
  for (const [abbrev, j] of per) for (const a of j?.athletes || []) out[String(a.id)] = { team: abbrev, rookie: Number(a.experience?.years) === 0, name: a.displayName }
  return out
}

/** One finished race: shares over the pool, the top SHOWN with their lines, the rest as one number. */
function race(key, scored, extra) {
  const order = scored.sort((a, b) => b.share - a.share)
  const top = order.slice(0, SHOWN)
  return {
    key, label: AWARD_DEFS[key]?.label || extra.label, title: AWARD_DEFS[key]?.title || extra.title, status: 'ok',
    pool: order.length,
    rows: top.map((r) => ({ id: r.id, name: r.name, team: r.team, rookie: r.rookie || undefined, gp: r.gp, pts: r1(r.pts), reb: r1(r.reb), ast: r1(r.ast), stl: r1(r.stl), blk: r1(r.blk), min: r1(r.min), dPts: r.dPts != null ? r1(r.dPts) : undefined, share: r4(r.share) })),
    rest: r4(order.slice(SHOWN).reduce((t, r) => t + r.share, 0)),
    ...extra,
  }
}

export async function buildAwardRaces(season, day, { titleOdds = null } = {}) {
  const [cur, prev, roster, title] = await Promise.all([seasonStats(season), seasonStats(season - 1), rosters(), titleOdds || readTitleOdds(season, day)])
  // ESPN served last season for this one: no games yet
  const curPlayers = cur.servedSeason === season ? cur.athletes : new Map()
  const curTeams = cur.servedSeason === season ? cur.teams : new Map()
  const clubGames = Object.fromEntries((title.teams || []).map((t) => [t.abbr, (t.wins || 0) + (t.losses || 0)]))
  const medGames = median(Object.values(clubGames))
  const frac = medGames / SEASON_GAMES

  // clubs: projected win share (title sim) and defence per possession (this season shrunk toward last by BLEND_GAMES)
  const perPoss = (t) => (t ? defPerPoss({ avgPoints: t.oppPts, avgFieldGoalsAttempted: t.oppFga, avgFreeThrowsAttempted: t.oppFta, avgTurnovers: t.oppTov, avgOffensiveRebounds: t.oppOreb }) : null)
  const clubs = {}
  for (const t of title.teams || []) {
    const g = clubGames[t.abbr] || 0, a = g / (g + BLEND_GAMES)
    const c = perPoss(curTeams.get(t.abbr)), p = perPoss(prev.teams.get(t.abbr))
    clubs[t.abbr] = { games: g, winPct: t.proj_wins / SEASON_GAMES, oppPerPoss: c != null && p != null ? a * c + (1 - a) * p : (c ?? p), champ: t.win_champion }
  }
  const rated = Object.values(clubs).filter((c) => c.oppPerPoss != null)
  const lgDef = rated.reduce((x, c) => x + c.oppPerPoss, 0) / (rated.length || 1)
  for (const c of Object.values(clubs)) c.defVsLeague = c.oppPerPoss == null ? null : (lgDef - c.oppPerPoss) * 100

  // every rostered player with a line: blended, with his projected share of his club's games
  const people = []
  for (const [id, who] of Object.entries(roster)) {
    const c = curPlayers.get(id) || null, p = prev.athletes.get(id) || null
    const club = clubs[who.team]
    if (!club || (!c && !p)) continue
    const line = who.rookie ? c : blendLine(c, p)
    if (!line) continue
    const g = Number(c?.gp) || 0, a = g / (g + BLEND_GAMES)
    const curFrac = club.games ? Math.min(1, g / club.games) : null
    const prevFrac = p ? Math.min(1, (Number(p.gp) || 0) / SEASON_GAMES) : null
    const gpFrac = who.rookie || prevFrac == null ? curFrac : curFrac == null ? prevFrac : a * curFrac + (1 - a) * prevFrac
    people.push({ id, name: c?.name || p?.name || who.name, team: who.team, rookie: who.rookie, gp: g, club, line: { ...line, gpFrac }, prev: p, canReach65: g + Math.max(0, SEASON_GAMES - club.games) >= RULE_GAMES })
  }

  const races = []
  for (const key of ['mvp', 'dpoy', 'roy', 'mip']) {
    const def = AWARD_DEFS[key], fit = AWARD_FITS[key]
    const waiting = (why) => races.push({ key, label: def.label, title: def.title, status: 'waiting', why, rows: [], measured: fit.measured })
    if ((key === 'roy' || key === 'mip') && medGames < OPEN_AFTER_GAMES) {
      waiting(key === 'roy'
        ? (medGames === 0 ? 'Rookies have no NBA games yet.' : `Rookies have ${medGames < 2 ? 'a game' : 'a few games'} each.`) + ` This race opens after ${OPEN_AFTER_GAMES} games a club.`
        : `Improvement needs this season's games. This race opens after ${OPEN_AFTER_GAMES} games a club.`)
      continue
    }
    const candidates = people.filter((x) => (def.rookies ? x.rookie : !(def.needsPrev && x.rookie))
      && (!def.rule65 || x.canReach65)
      && def.pool({ ...x.line, gp: (x.line.gpFrac ?? 0) * SEASON_GAMES }, def.needsPrev ? x.prev : null))
    if (candidates.length < 10) { waiting('Too few players qualify yet.'); continue }
    const rows = zScore(candidates.map((x) => ({ x, f: rawFeatures(x.line, x.club, def.needsPrev ? x.prev : null) })), def.feats)
    const T = fit.T0 ? temperatureAt(frac, fit.T0) : 1
    const sh = softmax(rows, fit.w, T)
    races.push(race(key, rows.map((r, i) => ({ ...r.x.line, id: r.x.id, name: r.x.name, team: r.x.team, rookie: r.x.rookie, gp: r.x.gp, dPts: r.f.dPts, share: sh[i] })), { T: Math.round(T * 100) / 100, measured: fit.measured }))
  }

  // FINALS MVP: P(club wins the title) x his share inside the club
  {
    const fit = AWARD_FITS.fmvp
    const byClub = {}
    for (const x of people) {
      const v = ((x.line.pts || 0) + (x.line.reb || 0) + (x.line.ast || 0)) * (x.line.gpFrac ?? 0)
      if (v > 0) (byClub[x.team] ||= []).push({ x, v })
    }
    const scored = []
    for (const [abbrev, list] of Object.entries(byClub)) {
      const tot = list.reduce((t, r) => t + r.v, 0)
      const e = list.map((r) => (r.v / tot) ** fit.a); const z = e.reduce((t, y) => t + y, 0)
      list.forEach((r, i) => scored.push({ ...r.x.line, id: r.x.id, name: r.x.name, team: abbrev, rookie: r.x.rookie, gp: r.x.gp, share: (clubs[abbrev]?.champ || 0) * (e[i] / z) }))
    }
    const tot = scored.reduce((t, r) => t + r.share, 0) || 1
    scored.forEach((r) => { r.share /= tot })
    races.push(race('fmvp', scored, { label: 'Finals MVP', title: 'Finals MVP', measured: fit.measured }))
  }

  const played = Object.values(clubGames).reduce((t, g) => t + g, 0) / 2
  return {
    schema: 1, sport: 'nba', season, seasonLabel: seasonLabel(season), as_of: new Date().toISOString(), model_version: AWARDS_MODEL_VERSION,
    games_played: Math.round(played), median_club_games: medGames,
    method: `Fitted on how voters split each award, 2012-26 (Basketball-Reference): his numbers against that season's league, and his club's projected wins (Title odds). Lines lean on last season's for his first ~${BLEND_GAMES} games. Finals MVP: title share × his share of his club's points, rebounds and assists.`,
    note: played < 100
      ? `${Math.round(played)} games played: mostly last season's lines, spread wider for it. Trades and injuries count once his games do.`
      : 'MVP, DPOY and MIP drop anyone who can no longer reach 65 games.',
    races,
  }
}

/** Cached six hours per season and day, as Title odds is (the inputs move a few times a day at most). */
export function readAwardRaces(season, day) {
  return unstable_cache(() => buildAwardRaces(season, day), ['nba-award-races-v2', String(season), String(day)], { revalidate: 21600 })()
}
