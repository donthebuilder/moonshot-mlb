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
  // 10-26 audit: homer_feed alone was the wrong first homer in 57 of 474 games and covered 474 of 2,431 (it starts 2026-08-22,
  // and it logged at least one 'homer' MLB's play-by-play doesn't have: LAD @ SF 9-27). A graded game now takes its first homer
  // from opening_games (lib/mlb/openings.js, MLB's own play-by-play, written at grade); the status is the board's, from that
  // man's homer_feed row in that game, and no row = no status (the board's word for him isn't on file). A game not graded yet
  // (tonight's) keeps the feed's earliest, as before.
  async mlb(db, since, until) {
    const rows = await pageAll(() => db.from('homer_feed').select('day, game_pk, player_id, name, team, opponent, home, inning, role, on_board, seen_at')
      .gte('day', since).lte('day', until).order('day', { ascending: true }).order('seen_at', { ascending: true }).order('player_id', { ascending: true }).order('hr_n', { ascending: true }))
    const byGame = new Map(), mine = new Map()
    for (const r of rows) {
      if (!r.game_pk) continue
      const k = `${r.day}|${r.game_pk}`
      mine.set(`${r.game_pk}|${r.player_id}`, r)
      const cur = byGame.get(k)
      if (!cur || inningKey(r.inning) < inningKey(cur.inning) || (inningKey(r.inning) === inningKey(cur.inning) && r.seen_at < cur.seen_at)) byGame.set(k, r)
    }
    const graded = await pageAll(() => db.from('opening_games').select('game_id, game_date, away, home, first_hr_player, first_hr_team')
      .eq('sport', 'mlb').in('season_type', [2, 3]).gte('game_date', since).lte('game_date', until).order('game_id'))   // no spring training
    const done = new Set(graded.map((g) => String(g.game_id)))
    // a name for a first homer with no feed row: his opening_players row in that game
    const need = graded.filter((g) => g.first_hr_player && !mine.has(`${g.game_id}|${g.first_hr_player}`))
    const names = new Map()
    for (let i = 0; i < need.length; i += 150) {
      const part = need.slice(i, i + 150)
      const { data, error } = await db.from('opening_players').select('game_id, player_id, name').eq('sport', 'mlb')
        .in('game_id', part.map((g) => String(g.game_id))).in('player_id', [...new Set(part.map((g) => String(g.first_hr_player)))]).limit(1000)
      if (error) throw new Error(error.message)
      for (const r of data || []) names.set(`${r.game_id}|${r.player_id}`, r.name)
    }
    const fromTruth = graded.filter((g) => g.first_hr_player).map((g) => {
      const r = mine.get(`${g.game_id}|${g.first_hr_player}`)
      return {
        day: String(g.game_date), gameId: String(g.game_id), game: `${g.away} @ ${g.home}`,
        playerId: String(g.first_hr_player), name: r?.name || names.get(`${g.game_id}|${g.first_hr_player}`) || '(name not on file)', team: g.first_hr_team,
        when: r?.inning || '', status: r ? callStatus(r) : null,
      }
    })
    const live = [...byGame.values()].filter((r) => !done.has(String(r.game_pk))).map((r) => ({
      day: r.day, gameId: String(r.game_pk), game: r.home ? `${r.opponent} @ ${r.team}` : `${r.team} @ ${r.opponent}`,
      playerId: String(r.player_id), name: r.name, team: r.team, when: r.inning || '', status: callStatus(r),
    }))
    return [...fromTruth, ...live].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
  },
  async nfl(db, since, until) {
    const rows = await pageAll(() => db.from('nfl_td_feed').select('day, game_id, td_n, team, opponent, quarter, clock, scorer_name, gsis_id, text, on_bot, td_board')
      .gte('day', since).lte('day', until).eq('td_n', 1).order('day', { ascending: true }).order('game_id', { ascending: true }))
    return rows.map((r) => ({
      day: r.day, gameId: String(r.game_id), game: `${r.team} v ${r.opponent}`,
      playerId: r.gsis_id || null, name: r.scorer_name || '(scorer not parsed)', team: r.team, opp: r.opponent || null,
      when: [r.quarter ? periodWord(r.quarter) : null, r.clock].filter(Boolean).join(' '), status: tdCallStatus(r),
    }))
  },
  // 10-26 audit (Donovan: "confirm these are the first of each game ... I feel like it's usually off"): goal_n is HIS goal count
  // in the game (lib/nhl/goalFeed.js), not the game's, so goal_n = 1 was every scorer's first goal and the list kept whichever
  // came back first -- 34 of 181 games named the wrong man. Now: a graded game from opening_games, a live one the earliest
// standing goal on the game clock.
  async nhl(db, since, until) {
    const rows = await pageAll(() => db.from('lamp_goal_feed').select('day, game_id, goal_n, player_id, name, team, opp, period, time_in_period, status, overturned_at')
      .gte('day', since).lte('day', until).eq('game_type', 2).is('overturned_at', null).order('day', { ascending: true }).order('game_id').order('player_id').order('goal_n'))
    const at = (r) => { const m = /^(\d+):(\d{2})$/.exec(String(r.time_in_period || '')); return (Number(r.period) || 99) * 10000 + (m ? Number(m[1]) * 60 + Number(m[2]) : 9999) }
    const first = new Map(), mine = new Map()
    for (const r of rows) {
      const k = `${r.day}|${r.game_id}`; const cur = first.get(k); if (!cur || at(r) < at(cur)) first.set(k, r)
      if (!mine.has(`${r.game_id}|${r.player_id}`)) mine.set(`${r.game_id}|${r.player_id}`, r)
    }
    // a graded game: its first goal from opening_games (lib/nhl/openings.js, the league's play-by-play, written at grade) --
    // the live feed can miss a game (2 of 183 this season); the status stays the feed's row for that man in that game
    const graded = await pageAll(() => db.from('opening_games').select('game_id, game_date, away, home, first_score_player, first_score_team, first_score_clock_s')
      .eq('sport', 'nhl').eq('season_type', 2).gte('game_date', since).lte('game_date', until).order('game_id'))
    const done = new Set(graded.map((g) => String(g.game_id)))
    const need = [...new Set(graded.filter((g) => g.first_score_player && !mine.has(`${g.game_id}|${g.first_score_player}`)).map((g) => Number(g.first_score_player)))]
    const names = new Map()
    for (let i = 0; i < need.length; i += 40) {
      const { data, error } = await db.from('lamp_box').select('player_id, name').in('player_id', need.slice(i, i + 40)).gt('goals', 0).limit(1000)
      if (error) throw new Error(error.message)
      for (const r of data || []) if (!names.has(String(r.player_id))) names.set(String(r.player_id), r.name)
    }
    const clock = (sec) => { const p = Math.floor(sec / 1200) + 1, t = sec % 1200; return `P${p} ${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` }
    const fromTruth = graded.filter((g) => g.first_score_player).map((g) => {
      const r = mine.get(`${g.game_id}|${g.first_score_player}`)
      const opp = g.first_score_team === g.home ? g.away : g.home
      return {
        day: String(g.game_date), gameId: String(g.game_id), game: `${g.first_score_team} v ${opp}`,
        playerId: String(g.first_score_player), name: r?.name || names.get(String(g.first_score_player)) || '(name not on file)', team: g.first_score_team, opp,
        when: g.first_score_clock_s != null ? clock(g.first_score_clock_s) : '', status: r ? (r.status || 'off') : null,
      }
    })
    const live = [...first.values()].filter((r) => !done.has(String(r.game_id))).map((r) => ({
      day: r.day, gameId: String(r.game_id), game: `${r.team} v ${r.opp || '?'}`,
      playerId: String(r.player_id), name: r.name, team: r.team, opp: r.opp || null,
      when: [r.period ? `P${r.period}` : null, r.time_in_period].filter(Boolean).join(' '), status: r.status || 'off',
    }))
    return [...fromTruth, ...live].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
  },
  async nba(db, since, until) {
    const rows = await pageAll(() => db.from('buckets_feed').select('game_date, game_id, player_id, name, team, opp, points, status, season_type')
      .gte('game_date', since).lte('game_date', until).eq('kind', 'first_fg').in('season_type', [2, 3]).order('game_date', { ascending: true }).order('game_id', { ascending: true }).order('player_id', { ascending: true }))
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

// LAMP'S WALLS FROM THE OPENINGS (2026-10-26, Donovan: "backfill 2025-26 NHL first goals so LAMP's walls have last season
// too"): opening_games, sport 'nhl' (lib/nhl/openings.js: the tick writes each game at grade, scripts/backfill-nhl-openings.mjs
// filled 2025-26), this season and last. Each club's games newest first, [scored first 1|0|null, won the opening faceoff
// 1|0|null, the scorer when it was this club's] -- the faceoff is LAMP's ring, as the tip is BUCKETS'. Names from lamp_box.
async function nhlOpeningWalls(db) {
  const top = await db.from('opening_games').select('season').eq('sport', 'nhl').order('season', { ascending: false }).limit(1)
  if (top.error) throw new Error(top.error.message)
  const cur = top.data?.[0]?.season
  if (!cur) return null
  const prev = Number(String(cur).slice(0, 4)) - 1
  const games = await pageAll(() => db.from('opening_games').select('game_id, game_date, home, away, jump_win_team, first_score_team, first_score_player')
    .eq('sport', 'nhl').in('season', [cur, Number(`${prev}${prev + 1}`)]).in('season_type', [2, 3]).order('game_date', { ascending: false }).order('game_id', { ascending: false }))
  const teams = {}, names = {}, faces = {}
  for (const g of games) {
    for (const t of [g.away, g.home]) {
      const first = g.first_score_team ? (g.first_score_team === t ? 1 : 0) : null
      const ring = g.jump_win_team ? (g.jump_win_team === t ? 1 : 0) : null
      ;(teams[t] ||= []).push([first, ring, first === 1 && g.first_score_player ? String(g.first_score_player) : null])
    }
    if (g.first_score_player) faces[String(g.first_score_player)] = nhlMugLatest(g.first_score_player)
  }
  // his name: one lamp_box row of a game he scored in (goals > 0 keeps the read to a few rows a man), 40 men a read
  const ids = Object.keys(faces)
  const reads = []
  for (let i = 0; i < ids.length; i += 40) reads.push(db.from('lamp_box').select('player_id, name').in('player_id', ids.slice(i, i + 40).map(Number)).gt('goals', 0).limit(1000))
  for (const { data, error } of await Promise.all(reads)) {
    if (error) throw new Error(error.message)
    for (const r of data || []) names[String(r.player_id)] ||= r.name
  }
  return { teams, names, faces }
}
// TUDDY'S WALLS FROM THE OPENINGS (2026-10-31, Donovan: backfill the 2025 first TDs so TUDDY's wall has last season too): opening_games, sport 'nfl'
// (lib/nfl/openings.js: the grade step writes each game; scripts/backfill-nfl-openings.mjs filled 2025 from ESPN's own play-by-play, the scorer's id from
// nflverse's roster file), this season and last. Each club's games newest first, [scored the first TD 1|0|null, null (football has no ring), the scorer when it
// was this club's]. The label is ESPN's scoring-play name (first_score_name), so a man whose id never resolved still has one; his face needs the id.
async function nflOpeningWalls(db) {
  const top = await db.from('opening_games').select('season').eq('sport', 'nfl').order('season', { ascending: false }).limit(1)
  if (top.error) throw new Error(top.error.message)
  const cur = top.data?.[0]?.season
  if (!cur) return null
  const games = await pageAll(() => db.from('opening_games').select('game_id, game_date, home, away, first_score_team, first_score_player, first_score_name')
    .eq('sport', 'nfl').in('season', [cur, cur - 1]).in('season_type', [2, 3]).order('game_date', { ascending: false }).order('game_id', { ascending: false }))
  const photo = PHOTO_OF.nfl
  const teams = {}, names = {}, faces = {}
  for (const g of games) {
    for (const t of [g.away, g.home]) {
      const first = g.first_score_team ? (g.first_score_team === t ? 1 : 0) : null
      ;(teams[t] ||= []).push([first, null, first === 1 && g.first_score_player ? String(g.first_score_player) : null])
    }
    const id = g.first_score_player ? String(g.first_score_player) : null
    if (id && !names[id] && g.first_score_name) names[id] = g.first_score_name
    if (id && !faces[id]) faces[id] = photo(id)
  }
  return { teams, names, faces }
}
// the walls change once a night: held 30 minutes on this server instance, so the minute-fresh first-scorer list doesn't
// re-read two seasons of openings every minute
const HOLD_MS = 30 * 60 * 1000
const held = new Map()
async function heldWalls(sport, read, db) {
  const h = held.get(sport)
  if (h && Date.now() - h.at < HOLD_MS) return h.data
  const data = await read(db)
  held.set(sport, { at: Date.now(), data })
  return data
}
const WALLS_OF = { nhl: (db) => heldWalls('nhl', nhlOpeningWalls, db), nfl: (db) => heldWalls('nfl', nflOpeningWalls, db) }

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
    ...(walls ? { walls: (WALLS_OF[sport] ? await WALLS_OF[sport](db) : null) || firstWalls(sport, season) } : null),
    games: recent,
    season: { games: season.length, called: count('called'), board: count('board'), off: count('off'), known: count('called') + count('board') + count('off'), top: [...byPlayer.values()].sort((a, b) => b.n - a.n).slice(0, 10) },
  }
}
