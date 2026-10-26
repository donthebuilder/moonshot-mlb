// 🥇 FIRST SCORERS, ALL THREE (2026-09-27, ledger plan step 2). Server only.
// Read from the event tables already written -- nothing new is stored, no
// prediction is made (a first-scorer pick needs its own model and a graded
// archive; this is the tracking that archive will be built from):
//   MLB  the first HOME RUN of each game: homer_feed by game_pk, earliest
//        half-inning ("top 1st" < "bot 1st" < "top 2nd"), then seen_at.
//        It is the first homer, not the first run -- said on the page.
//   NFL  the first TOUCHDOWN of each game: nfl_td_feed td_n = 1 (ESPN's own
//        order of scoring plays in the game)
//   NHL  the first GOAL of each game: lamp_goal_feed goal_n = 1, not
//        overturned
//   NBA  the first BASKET (made field goal) of each game: buckets_feed kind
//        first_fg (lib/nba/firstFeed, written at grade time), regular season
//        and playoffs, with the status his first_fg row locked with
// Status is the product's own three words (lib/callStatus.js for MLB/NFL;
// LAMP's row carries the goal model's status). The season line counts how
// many first scorers the board had.
import { callStatus, tdCallStatus } from '../callStatus'
import { periodWord } from '../nfl/period'
import { nhlMugLatest } from '../nhl/format'
import { headshotIdFor } from '../nfl/headshotIds'
import { nflHeadshot } from '../nfl/nflAssets'

const inningKey = (s) => {
  const m = /^(top|bot)\s+(\d+)/i.exec(String(s || '').trim())
  return m ? Number(m[2]) * 2 + (m[1].toLowerCase() === 'bot' ? 1 : 0) : 999
}

async function pageAll(q) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q().range(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

const READ = {
  async mlb(db, since, until) {
    const rows = await pageAll(() => db.from('homer_feed').select('day, game_pk, player_id, name, team, opponent, home, inning, role, on_board, seen_at')
      .gte('day', since).lte('day', until).order('day', { ascending: true }).order('seen_at', { ascending: true }))
    const byGame = new Map()
    for (const r of rows) {
      if (!r.game_pk) continue
      const k = `${r.day}|${r.game_pk}`
      const cur = byGame.get(k)
      if (!cur || inningKey(r.inning) < inningKey(cur.inning) || (inningKey(r.inning) === inningKey(cur.inning) && r.seen_at < cur.seen_at)) byGame.set(k, r)
    }
    return [...byGame.values()].map((r) => ({
      day: r.day, gameId: String(r.game_pk), game: r.home ? `${r.opponent} @ ${r.team}` : `${r.team} @ ${r.opponent}`,
      playerId: String(r.player_id), name: r.name, team: r.team, when: r.inning || '', status: callStatus(r),
    }))
  },
  async nfl(db, since, until) {
    const rows = await pageAll(() => db.from('nfl_td_feed').select('day, game_id, td_n, team, opponent, quarter, clock, scorer_name, gsis_id, text, on_bot, td_board')
      .gte('day', since).lte('day', until).eq('td_n', 1).order('day', { ascending: true }))
    return rows.map((r) => ({
      day: r.day, gameId: String(r.game_id), game: `${r.team} v ${r.opponent}`,
      playerId: r.gsis_id || null, name: r.scorer_name || '(scorer not parsed)', team: r.team, opp: r.opponent || null,
      when: [r.quarter ? periodWord(r.quarter) : null, r.clock].filter(Boolean).join(' '), status: tdCallStatus(r),
    }))
  },
  async nhl(db, since, until) {
    const rows = await pageAll(() => db.from('lamp_goal_feed').select('day, game_id, goal_n, player_id, name, team, opp, period, time_in_period, status, overturned_at')
      .gte('day', since).lte('day', until).eq('goal_n', 1).eq('game_type', 2).is('overturned_at', null).order('day', { ascending: true }))
    return rows.map((r) => ({
      day: r.day, gameId: String(r.game_id), game: `${r.team} v ${r.opp || '?'}`,
      playerId: String(r.player_id), name: r.name, team: r.team, opp: r.opp || null,
      when: [r.period ? `P${r.period}` : null, r.time_in_period].filter(Boolean).join(' '), status: r.status || 'off',
    }))
  },
  async nba(db, since, until) {
    const rows = await pageAll(() => db.from('buckets_feed').select('game_date, game_id, player_id, name, team, opp, points, status, season_type')
      .gte('game_date', since).lte('game_date', until).eq('kind', 'first_fg').in('season_type', [2, 3]).order('game_date', { ascending: true }))
    return rows.map((r) => ({
      day: r.game_date, gameId: String(r.game_id), game: `${r.team} v ${r.opp || '?'}`,
      playerId: String(r.player_id), name: r.name, team: r.team,
      when: r.points === 3 ? 'a three' : '', status: r.status || 'off',
    }))
  },
}

/** A game has ONE first scorer. A second row for the same day and game is a duplicate in the feed (a goal
 *  posted twice, a review replayed); the first one seen stays, so the list, the season counts and the React
 *  keys (`day|gameId`) each count a game once. (Bug found 2026-10-07: LAMP's console warned about two
 *  children with the key `2026-10-06|2026020051`.) */
export function onePerGame(rows) {
  const seen = new Set()
  const out = []
  for (const r of rows) {
    const k = `${r.day}|${r.gameId}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(r)
  }
  return out
}

// THE FACE WALL'S LOGS (2026-10-26, Donovan: BUCKETS' first-basket face wall for LAMP's first goal and TUDDY's first TD;
// components/openings/OpeningViz.js FaceWallByGame). From the season's first scorers: each club's games newest first,
// [scored first 1|0, no ring (null), the scorer when it was this club's], his name, and his photo (NHL's mug by id; the NFL
// headshot through the GSIS -> ESPN bridge, server-side only). A game the feed has no first scorer for (no goal, no TD) isn't
// in it. Only the sports whose ids faceUrl can't draw on the client.
const PHOTO_OF = {
  nhl: (id) => nhlMugLatest(id),
  nfl: (id) => { const h = headshotIdFor(id); return h ? nflHeadshot(h, 66, 48) : null },
}
export function firstWalls(sport, season) {
  const photo = PHOTO_OF[sport]
  if (!photo) return null
  const teams = {}, names = {}, faces = {}
  const add = (t, x) => { if (t) (teams[t] ||= []).push(x) }
  for (const r of [...season].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))) {
    if (!r.team || !r.opp) continue
    const id = r.playerId ? String(r.playerId) : null
    add(r.team, [1, null, id]); add(r.opp, [0, null, null])
    if (id && !names[id]) { names[id] = r.name; faces[id] = photo(id) }
  }
  return { teams, names, faces }
}

/** { games: tonight's/this window's first scorers, season: { games, called, board, off, top: [{ name, n }] }, walls? } */
export async function readFirstScorers(db, sport, { day, since, seasonSince, player = null, walls = false }) {
  const read = READ[sport]
  if (!read) throw new Error(`no first-scorer reader for ${sport}`)
  const season = onePerGame(await read(db, seasonSince, day))
  const recent = season.filter((r) => r.day >= since && r.day <= day).sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
  const count = (k) => season.filter((r) => r.status === k).length
  const byPlayer = new Map()
  for (const r of season) {
    const k = r.playerId || r.name
    const o = byPlayer.get(k) || { name: r.name, team: r.team, n: 0 }
    o.n += 1; byPlayer.set(k, o)
  }
  // ONE PLAYER (2026-10-20, the first-pitch split's twin on TUDDY / LAMP / BUCKETS player cards): the games he scored first this
  // season, newest first, each with the status it was stored with. Only his rows go back.
  if (player) {
    const mine = season.filter((r) => String(r.playerId) === String(player)).sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
    return { sport, day, seasonSince, player: String(player), games: mine }
  }
  return {
    sport, day, since, seasonSince,
    ...(walls ? { walls: firstWalls(sport, season) } : null),
    games: recent,
    season: { games: season.length, called: count('called'), board: count('board'), off: count('off'), top: [...byPlayer.values()].sort((a, b) => b.n - a.n).slice(0, 10) },
  }
}
