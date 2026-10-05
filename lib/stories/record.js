// STORIES, FROZEN AT THE START AND GRADED AFTER (BATCH-STORYLINES-PAGE step 3).
// Server only (a service-role client). One entry point per tick:
//
//   storiesTick(db, sport)
//     FREEZE  every game whose start is less than FREEZE_MS away (and not yet
//             passed) and has no rows yet: the engine's stories for it, with
//             the board chip as it stands, written ONCE (insert, conflict
//             does nothing). Nothing is ever written at or after the start.
//     GRADE   frozen rows of games now final, on lib/stories/grade.js's rules,
//             against the player's own line (MLB box score, NFL graded lines,
//             NHL box score). Only grading columns are touched.
//     BASE    once every game of a day is final: the same bars for everyone
//             who played that day (storyline_base_nights), so "productive"
//             reads beside what the whole slate did.
//
//   readRecord(db, sport, gameIds)   the frozen rows for those games (the page
//                                    shows them, graded, once a game starts)
//   readSummary(db, sport)           HOW STORIES DID, per type
//
// The heavy engine load only happens when a game is inside its freeze window
// with nothing frozen; every other tick costs a schedule read and one small
// select. Sports come off the IO table -- no sport branch.
import { loadStories } from './index'
import { gradeStory, baseBars } from './grade'
import { gamesByTeam } from './nfl'
import { nflSlatePaths, nflResultsPaths, fetchNfl } from '../nfl/dataSource'
import { scoreFor, nhlGet, TTL } from '../nhl/api'
import { reduceScoreDay } from '../nhl/reduce'
import { scoreboardFor, reduceScoreboard, summaryFor, reduceBox } from '../nba/api'
import { easternToday } from '../data'

export const FREEZE_MS = 15 * 60 * 1000
const shift = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10)
const http = (ps) => ps.filter((p) => /^https?:/.test(p))
const mlbApi = (p) => fetch(`https://statsapi.mlb.com/api/v1${p}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
const MLB_STATE = { Preview: 'pre', Live: 'live', Final: 'final' }
const NFL_STATE = { pre: 'pre', in: 'live', post: 'final' }

// games(): [{ game_id, start, state, day }] for today and yesterday
// lines(games): Map(player_id -> line) from those (final) games
const IO = {
  // BUCKETS (2026-10-03): the ESPN scoreboard and box. storyline_log's sport
  // check must allow 'nba' (RUN-IN-SUPABASE-2026-10-03-nba-stories.sql);
  // until it does the freeze write fails, is logged, and nothing else moves.
  nba: {
    async games() {
      const out = []
      for (const day of [shift(easternToday(), -1), easternToday()]) {
        // preseason is not a record night (BUCKETS: excluded unless ?pre=1)
        for (const g of reduceScoreboard(await scoreboardFor(day).catch(() => null)).filter((x) => x.seasonType !== 1)) out.push({ game_id: String(g.id), start: g.start, state: g.state, day })
      }
      return out
    },
    async lines(games) {
      const m = new Map(); m.failed = new Set()
      await Promise.all(games.map(async (g) => {
        const players = reduceBox(await summaryFor(g.game_id, true).catch(() => null))
        // a failed read or a box with no players yet is not a game nobody played in: leave it open
        if (!players.length) { m.failed.add(String(g.game_id)); return }
        for (const b of players) if (!b.dnp) m.set(String(b.id), { pts: +b.pts || 0, reb: +b.reb || 0, ast: +b.ast || 0, tpm: +b.tpm || 0 })
      }))
      return m
    },
  },
  mlb: {
    async games() {
      const out = []
      for (const day of [shift(easternToday(), -1), easternToday()]) {
        const j = await mlbApi(`/schedule?sportId=1&date=${day}&fields=dates,games,gamePk,gameDate,status,abstractGameState`)
        for (const g of j?.dates?.[0]?.games || []) out.push({ game_id: String(g.gamePk), start: g.gameDate, state: MLB_STATE[g?.status?.abstractGameState] || 'pre', day })
      }
      return out
    },
    async lines(games) {
      const m = new Map()
      await Promise.all(games.map(async (g) => {
        const box = await mlbApi(`/game/${g.game_id}/boxscore?fields=teams,home,away,players,person,id,stats,batting,atBats,hits,homeRuns,totalBases,runs,rbi`)
        for (const side of ['home', 'away']) for (const pl of Object.values(box?.teams?.[side]?.players || {})) {
          const b = pl?.stats?.batting
          if (pl?.person?.id && b && b.atBats != null) m.set(String(pl.person.id), { ab: +b.atBats || 0, h: +b.hits || 0, hr: +b.homeRuns || 0, tb: +b.totalBases || 0, r: +b.runs || 0, rbi: +b.rbi || 0 })
        }
      }))
      return m
    },
  },
  nfl: {
    async games() {
      const data = await fetchNfl(http(nflSlatePaths())).catch(() => null)
      return [...new Map([...gamesByTeam(data).values()].map((g) => [g.game_id, g])).values()]
        .map((g) => ({ game_id: g.game_id, start: g.kickoff, state: NFL_STATE[g.state] || 'pre', day: g.day, away: g.away, home: g.home }))
    },
    async lines(games) {
      // nfl_results.json: the week's graded line for every man who recorded
      // one. A player it does not list has no line (void), never a miss.
      // The file is the whole week: keep the players whose club played in
      // these games (the week file says who plays for whom), so a Sunday's
      // base rate is Sunday's.
      const [j, week] = await Promise.all([fetchNfl(http(nflResultsPaths())).catch(() => null), fetchNfl(http(nflSlatePaths())).catch(() => null)])
      const clubs = new Set(games.flatMap((g) => [g.away, g.home]).filter(Boolean))
      const teamOf = new Map((week?.players || []).map((p) => [String(p.player_id), p.team]))
      return new Map(Object.entries(j?.lines || {}).filter(([pid]) => clubs.has(teamOf.get(String(pid)))).map(([pid, l]) => [String(pid), l]))
    },
  },
  nhl: {
    async games() {
      const out = []
      for (const day of [shift(easternToday(), -1), easternToday()]) {
        const d = reduceScoreDay(await scoreFor(day).catch(() => null))
        for (const g of d.games || []) if (g.scheduleState === 'OK') out.push({ game_id: String(g.id), start: g.startUtc, state: g.state, day })
      }
      return out
    },
    async lines(games) {
      const m = new Map(); m.failed = new Set()
      await Promise.all(games.map(async (g) => {
        // FRESH AND FINAL OR NOT AT ALL (2026-10-05 scan; LAMP's tick got this on 10-03).
        // A cached box could be mid-game, and a failed read became `null` -> every
        // story of the game graded "void", permanently. Such a game is left open.
        const box = await nhlGet(`/gamecenter/${g.game_id}/boxscore`, 0).catch(() => null)
        if (!box?.playerByGameStats || !['OFF', 'FINAL'].includes(String(box.gameState || '').toUpperCase())) { m.failed.add(String(g.game_id)); return }
        for (const side of ['awayTeam', 'homeTeam']) for (const grp of ['forwards', 'defense']) for (const s of box?.playerByGameStats?.[side]?.[grp] || []) {
          m.set(String(s.playerId), { g: +s.goals || 0, a: +s.assists || 0, pts: +s.points || 0, sog: +s.sog || 0 })
        }
      }))
      return m
    },
  },
}

/** Pure: a story + its board chip -> the row written at the freeze. */
export function frozenRow(s) {
  return {
    sport: s.sport, day: s.day, game_id: String(s.game_id), player_id: String(s.player_id), type: s.type,
    name: s.name, team: s.team, opp: s.opp, text: s.text,
    numbers: { ...(s.numbers || {}), _parts: s.parts, _icon: s.icon },   // the row's own drawing, kept with it
    rarity: s.rarity, source: s.source,
    board_status: s.board?.status ?? null, board_score: Number.isFinite(Number(s.board?.score)) ? Number(s.board.score) : null,
  }
}

/** Pure: which games freeze now -- inside the window, not started, nothing frozen yet. */
export function freezeDue(games, frozenIds, now = Date.now()) {
  return games.filter((g) => {
    const t = Date.parse(g.start || '')
    return Number.isFinite(t) && now < t && t - now <= FREEZE_MS && g.state === 'pre' && !frozenIds.has(String(g.game_id))
  })
}

async function frozenGameIds(db, sport, ids) {
  if (!ids.length) return new Set()
  const { data, error } = await db.from('storyline_log').select('game_id').eq('sport', sport).in('game_id', ids).limit(5000)
  if (error) throw new Error(`storyline_log read: ${error.message}`)
  return new Set((data || []).map((r) => String(r.game_id)))
}

async function freeze(db, sport, games) {
  const inWindow = games.filter((g) => { const t = Date.parse(g.start || ''); return Number.isFinite(t) && t > Date.now() && t - Date.now() <= FREEZE_MS })
  if (!inWindow.length) return { frozen: 0 }
  const due = freezeDue(inWindow, await frozenGameIds(db, sport, inWindow.map((g) => g.game_id)))
  if (!due.length) return { frozen: 0 }
  const { stories } = await loadStories(sport)
  const want = new Set(due.map((g) => g.game_id))
  // The lock rule, asked again right before the write: a game that started
  // while the engine was loading gets nothing.
  const startOf = new Map(due.map((g) => [g.game_id, Date.parse(g.start)]))
  const rows = stories.filter((s) => want.has(String(s.game_id)) && Date.now() < startOf.get(String(s.game_id))).map(frozenRow)
  if (!rows.length) return { frozen: 0, games: due.length }
  const { error } = await db.from('storyline_log').upsert(rows, { onConflict: 'sport,game_id,player_id,type', ignoreDuplicates: true })
  if (error) throw new Error(`storyline_log write: ${error.message}`)
  return { frozen: rows.length, games: due.length }
}

async function grade(db, sport, games) {
  const finals = games.filter((g) => g.state === 'final')
  if (!finals.length) return { graded: 0 }
  const { data: open, error } = await db.from('storyline_log').select('sport,day,game_id,player_id,type,numbers')
    .eq('sport', sport).is('graded_at', null).in('game_id', finals.map((g) => g.game_id)).limit(5000)
  if (error) throw new Error(`storyline_log read: ${error.message}`)
  if (!open?.length) return { graded: 0 }
  const lines = await IO[sport].lines(finals.filter((g) => open.some((r) => r.game_id === g.game_id)))
  return gradeRows(db, sport, open, lines)
}

/** Grade these open rows against Map(player_id -> line). Only grading columns are written. */
export async function gradeRows(db, sport, open, lines) {
  const at = new Date().toISOString()
  let graded = 0
  // rows of a game whose box could not be read stay open for the next pass
  open = open.filter((r) => !lines.failed?.has(String(r.game_id)))
  for (let i = 0; i < open.length; i += 10) {
    await Promise.all(open.slice(i, i + 10).map(async (r) => {
      const res = gradeStory(r, lines.get(String(r.player_id)) || null)
      // A game- or team-level story has no player line: closed with no
      // outcome (never "did not play"), and never counted.
      const patch = res ? { bar: res.bar, outcome: res.outcome, outcome_strong: res.outcome_strong, graded_at: at } : { graded_at: at }
      const { error: e } = await db.from('storyline_log').update(patch)
        .match({ sport, game_id: r.game_id, player_id: r.player_id, type: r.type }).is('graded_at', null)
      if (e) console.error(`[stories] grade ${sport} ${r.game_id}/${r.player_id}/${r.type}: ${e.message}`)
      else graded += 1
    }))
  }
  return { graded }
}

async function base(db, sport, games) {
  const days = [...new Set(games.map((g) => g.day).filter(Boolean))]
  let written = 0
  for (const day of days) {
    const dayGames = games.filter((g) => g.day === day)
    if (!dayGames.length || dayGames.some((g) => g.state !== 'final')) continue
    const { count } = await db.from('storyline_base_nights').select('bar', { count: 'exact', head: true }).eq('sport', sport).eq('day', day)
    if (count) continue
    // Only a day with stories frozen on it gets a base row (the record starts on ship day).
    const { count: had } = await db.from('storyline_log').select('game_id', { count: 'exact', head: true }).eq('sport', sport).in('game_id', dayGames.map((g) => g.game_id))
    if (!had) continue
    const lines = [...(await IO[sport].lines(dayGames)).values()]
    if (!lines.length) continue
    const rows = baseBars(sport).map(([bar, test]) => ({ sport, day, bar, players: lines.length, hits: lines.filter(test).length }))
    const { error } = await db.from('storyline_base_nights').upsert(rows, { onConflict: 'sport,day,bar' })
    if (error) console.error(`[stories] base ${sport} ${day}: ${error.message}`)
    else written += rows.length
  }
  return { base: written }
}

/** Freeze, grade, base -- one call per product tick. Never throws. */
export async function storiesTick(db, sport) {
  if (!db || !IO[sport]) return { skipped: 'no-db' }
  try {
    const games = await IO[sport].games()
    if (!games.length) return { games: 0 }
    const f = await freeze(db, sport, games)
    const g = await grade(db, sport, games)
    const b = await base(db, sport, games)
    return { games: games.length, ...f, ...g, ...b }
  } catch (e) {
    console.error(`[stories] ${sport} tick: ${e?.message}`)
    return { error: e?.message }
  }
}

/** The frozen rows for these games, in the engine's story shape + outcome. */
export async function readRecord(db, sport, gameIds) {
  if (!db || !gameIds.length) return []
  const { data, error } = await db.from('storyline_log').select('*').eq('sport', sport).in('game_id', gameIds.map(String)).limit(5000)
  if (error) throw new Error(`storyline_log read: ${error.message}`)
  return (data || []).map((r) => ({
    sport, day: r.day, game_id: r.game_id, player_id: r.player_id, name: r.name, team: r.team, opp: r.opp, type: r.type,
    icon: r.numbers?._icon || '•', parts: r.numbers?._parts || [{ t: 'text', v: r.text }], text: r.text,
    rarity: r.rarity, source: r.source, frozen: true, frozenAt: r.frozen_at,
    board: r.board_status ? { status: r.board_status, score: r.board_score } : null,
    outcome: r.outcome ? { bar: r.bar, base: r.outcome, strong: r.outcome_strong } : null,
  }))
}

/** HOW STORIES DID: per type, graded stories vs came true (+ the base rate on the same bar). */
export async function readSummary(db, sport) {
  if (!db) return null
  const [{ data: rows, error }, { data: bases }] = await Promise.all([
    db.from('storyline_log').select('type,bar,outcome,outcome_strong,day').eq('sport', sport).not('graded_at', 'is', null).neq('outcome', 'void').limit(20000),
    db.from('storyline_base_nights').select('day,bar,players,hits').eq('sport', sport).limit(20000),
  ])
  if (error) throw new Error(`storyline_log read: ${error.message}`)
  const baseBy = new Map()
  for (const b of bases || []) { const o = baseBy.get(b.bar) || { players: 0, hits: 0 }; o.players += b.players; o.hits += b.hits; baseBy.set(b.bar, o) }
  const by = new Map()
  for (const r of rows || []) {
    const o = by.get(r.type) || { type: r.type, bars: new Set(), n: 0, hit: 0, strongN: 0, strongHit: 0, since: r.day }
    o.bars.add(r.bar); o.n += 1; if (r.outcome === 'hit') o.hit += 1
    if (r.outcome_strong) { o.strongN += 1; if (r.outcome_strong === 'hit') o.strongHit += 1 }
    if (r.day < o.since) o.since = r.day
    by.set(r.type, o)
  }
  return [...by.values()].map((o) => {
    const bar = o.bars.size === 1 ? [...o.bars][0] : null
    return { type: o.type, bar, n: o.n, hit: o.hit, strongN: o.strongN, strongHit: o.strongHit, since: o.since, base: bar && baseBy.get(bar) ? baseBy.get(bar) : null, baseStrong: bar && baseBy.get(`${bar}_strong`) ? baseBy.get(`${bar}_strong`) : null }
  }).sort((a, b) => b.n - a.n)
}
