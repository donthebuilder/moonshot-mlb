// 🏒 READING A NIGHT'S BOARD — one function for every surface that shows
// it (the board route, the front door, /start). The LOCKED rows from
// lamp_goal_log for every game that has locked; for a game still outside
// its window a PREVIEW scored live by the same code path (goalBoard.js),
// flagged `preview: true` and never written. A preview is not a call and
// every caller prints the difference in capitals.
import { unstable_cache } from 'next/cache'
import { buildNight } from './goalBoard'
import { whyLine } from './goalModel'
import { versionsFor } from './versions'
import { MARKET as SOG } from './sogModel'
import { adminClient } from '../supabase/admin'
import { netLine } from './goalies'
import { readSpecialTeams, readRest, readPpGoals } from './spots'

export const LOCK_WINDOW_MS = 100 * 60 * 1000

// The markets the board reads (LAMP v2, 2026-09-27): GOAL is lamp_goal_log,
// every other market is lamp_prop_log under its own model version.
// market -> its key in lib/nhl/versions.js (the version is the DATE's: versionsFor)
export const BOARD_MARKETS = { GOAL: 'goal', SOG: 'sog', PTS: 'pts', AST: 'ast' }   // PTS / AST shown as TEST (10-02)

const ordP = (p) => { const n = Math.round(p); const r = n % 100; return `${n}${r >= 11 && r <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}` }
// each prop market's "why" in its own legs (lib/nhl/ptsModel.js / astModel.js)
const countWhy = (word, leg) => (pct, reason) => (!pct ? reason || '' : `${word} ${ordP(pct[leg])} · ice time ${ordP(pct.toi)}${pct.oppGaPg != null ? ` · opponent goals allowed ${ordP(pct.oppGaPg)}` : ''} percentile tonight`)
const WHY = { PTS: countWhy('points', 'ptsPg'), AST: countWhy('assists', 'astPg') }
const sogWhy = (pct, reason) => (!pct ? reason || '' : `shots ${ordP(pct.shotsPg)} · ice time ${ordP(pct.toi)}${pct.oppSaPg != null ? ` · opponent shots allowed ${ordP(pct.oppSaPg)}` : ''} percentile tonight`)

// v3: a rookie's row says so, with the numbers (LAMP-V3-DEFINITION "SHOWN")
const rookieNote = (k) => (k ? ` · rookie: ${k.games} NHL game${k.games === 1 ? '' : 's'}, rates pulled toward the average ${k.pos === 'D' ? 'defenceman' : 'forward'} (${k.priorGames} games of it)` : '')

export const shapeRow = (r, preview, market = 'GOAL') => ({
  playerId: r.player_id ?? r.playerId, name: r.name, pos: r.pos, team: r.team, opp: r.opp, home: r.home,
  score: r.score, rank: r.rank_in_game ?? r.rank, status: r.status, reason: r.reason || null,
  legs: r.legs?.ok === false ? null : r.legs, pct: r.pct, context: r.context,
  why: (market === SOG ? sogWhy(r.pct, r.reason) : WHY[market] ? WHY[market](r.pct, r.reason) : whyLine({ pct: r.pct, reason: r.reason })) + rookieNote(r.context?.rookie),
  dressed: r.dressed ?? null, goals: r.goals ?? null, value: r.value ?? null, hit: r.hit ?? null, preview,
})

// THE LOG, READ ONCE PER CHANGE (2026-09-27, COST CUT 7). A night's
// lamp_goal_log is ~350 KB (09-26: 488 rows) and every CDN miss of
// /api/lamp/board, the front door and /start re-read it, though its rows
// only change at a lock (new rows, locked_at) or a grade (graded_at = now()).
// So the freshness -- row count + newest locked_at + newest graded_at, no
// rows back -- is read first and the rows only when it moved. Per warm
// instance. lamp_goal_games (12 KB, updated in place all night) is read
// every time.
const _logs = new Map()   // key -> { stamp, rows }
async function readLog(db, date, market) {
  const q = (cols, opts) => (market === 'GOAL'
    ? db.from('lamp_goal_log').select(cols, opts).eq('game_date', date).eq('model_version', versionsFor(date).goal)
    : db.from('lamp_prop_log').select(cols, opts).eq('game_date', date).eq('market', market).eq('model_version', versionsFor(date)[BOARD_MARKETS[market]]))
  // THE STAMP, SHARED FOR TWO MINUTES (2026-10-03, egress round 2): the three
  // requests below ran on every read by every caller -- the board route per
  // market, stories, longshots, matchups, /start -- ~100 stamps an hour, the
  // API gateway's #5-#7 paths. The rows only move when the LAMP tick locks or
  // grades (every 10 min at most), so the stamp is kept in Next's shared
  // Data Cache for 120 s: one check per market per two minutes for the whole
  // deployment, a new lock seen within two minutes. Outside a Next request (a
  // script) it reads directly, as before.
  const readStamp = async () => {
    const [cnt, lk, gr] = await Promise.all([
      q('game_id', { count: 'exact', head: true }),
      q('locked_at').order('locked_at', { ascending: false, nullsFirst: false }).limit(1),
      q('graded_at').order('graded_at', { ascending: false, nullsFirst: false }).limit(1),
    ])
    const err = cnt.error || lk.error || gr.error
    if (err) throw new Error(err.message)
    return `${cnt.count}|${lk.data?.[0]?.locked_at || '-'}|${gr.data?.[0]?.graded_at || '-'}`
  }
  const key = `${market}|${date}`
  let stamp
  try {
    stamp = await unstable_cache(readStamp, ['lamp-log-stamp-v1', key], { revalidate: 120 })()
  } catch (e) {
    if (!/incrementalCache|static generation store|outside a request/i.test(String(e?.message))) return { data: null, error: e }
    try { stamp = await readStamp() } catch (e2) { return { data: null, error: e2 } }
  }
  const hit = _logs.get(key)
  if (hit && hit.stamp === stamp) return { data: hit.rows, error: null, stamp }
  // SHARED ACROSS INSTANCES (2026-09-28, egress audit): the Map is per warm
  // lambda, so every cold one re-read the night (~350 KB). The rows go in
  // Next's Data Cache under the same stamp -- one read per change for the
  // whole deployment. Outside a Next request (a script) it reads directly.
  // PER GAME, NOT PER NIGHT (2026-10-05, egress round 3): the lamp tick rewrites the rows
  // of every game inside the lock window every 10 minutes, so the night's stamp moved
  // ~25-30 times an evening and each move re-read the WHOLE night (~350 KB, legs / pct /
  // context jsonb). Now a move reads three small columns for the night, stamps each game
  // (rows | newest locked_at | newest graded_at), and each game's full rows sit in the
  // Data Cache under their own stamp: a lock that touches one game re-reads one game.
  const readGame = (gameId) => async () => { const r = await q('*').eq('game_id', gameId); if (r.error) throw new Error(r.error.message); return r.data || [] }
  const read = async () => {
    const idx = await q('game_id, locked_at, graded_at')
    if (idx.error) throw new Error(idx.error.message)
    const per = new Map()
    for (const r of idx.data || []) {
      const p = per.get(r.game_id) || { n: 0, lk: '', gr: '' }
      p.n += 1
      if ((r.locked_at || '') > p.lk) p.lk = r.locked_at || ''
      if ((r.graded_at || '') > p.gr) p.gr = r.graded_at || ''
      per.set(r.game_id, p)
    }
    const parts = await Promise.all([...per.entries()].map(([gid, p]) =>
      unstable_cache(readGame(gid), ['lamp-log-game-v1', market, date, String(gid), `${p.n}|${p.lk}|${p.gr}`], { revalidate: 86400 })()))
    return parts.flat()
  }
  let l
  try {
    l = { data: await unstable_cache(read, ['lamp-log-v2', key, stamp], { revalidate: 86400 })(), error: null }
  } catch (e) {
    l = /incrementalCache|static generation store|outside a request/i.test(String(e?.message)) ? await q('*') : { data: null, error: e }
  }
  if (!l.error) {
    _logs.delete(key)
    _logs.set(key, { stamp, rows: l.data || [] })
    while (_logs.size > 8) _logs.delete(_logs.keys().next().value)
  }
  return { ...l, stamp }
}

// lamp_goal_games, COLUMNS BY NEED (2026-09-28, egress audit). select('*')
// was ~12 KB a night per read, 3,200 reads a day once games are on, and half
// of it is `goalies` (only the graded net line reads it). The board route
// (Board + Slate show the net) reads GAME_COLS; /start, longshots, stories and
// Matchups pass { net: false }; the front door's pulse needs three columns.
const GAME_BASE = 'game_id, locked_at, graded_at, lineup_known, snapshots, starters'
const GAME_COLS = { full: `${GAME_BASE}, starters_actual, goalies`, board: GAME_BASE, pulse: 'game_id, locked_at, graded_at' }

/** The record's rows for a day, or empty lists when the table is not there yet. */
export async function readLocked(date, market = 'GOAL', { cols = 'full' } = {}) {
  const db = adminClient()
  if (!db) return { db: false, locked: [], games: [] }
  // The lock clock is shared: every market locks in the same snapshot as the
  // goal board, so lamp_goal_games says which games have locked.
  // THE GAMES READ, ONCE PER CHANGE TOO (2026-10-03, egress: ~2,300 reads a
  // day). Every write to lamp_goal_games -- a snapshot, a lock, a grade --
  // happens with a lamp_goal_log write that moves the log's freshness stamp,
  // so the games rows are cached under that stamp in Next's Data Cache.
  const l = await readLog(db, date, market)
  const readGames = async () => { const r = await db.from('lamp_goal_games').select(GAME_COLS[cols] || GAME_COLS.full).eq('game_date', date).eq('model_version', versionsFor(date).goal); if (r.error) throw new Error(r.error.message); return r.data || [] }
  let g
  try {
    g = { data: l.stamp ? await unstable_cache(readGames, ['lamp-games-v1', date, cols, l.stamp], { revalidate: 86400 })() : await readGames(), error: null }
  } catch (e) {
    g = /incrementalCache|static generation store|outside a request/i.test(String(e?.message)) ? await readGames().then((data) => ({ data, error: null }), (err) => ({ data: null, error: err })) : { data: null, error: e }
  }
  if (l.error) console.error(`[lamp board] log: ${l.error.message}`)
  if (g.error) console.error(`[lamp board] games: ${g.error.message}`)
  return { db: true, locked: l.error ? [] : l.data || [], games: g.error ? [] : g.data || [] }
}

/**
 * @returns {{ date, modelVersion, season, dbReady, games: Array<{game, locked, lockedAt, lineupKnown, graded, snapshots, locksAtUtc, net, startersActual, rows}> }}
 */
export async function readBoard(date, { market = 'GOAL', net = true } = {}) {
  const [{ db, locked, games }, night] = await Promise.all([readLocked(date, market, { cols: net ? 'full' : 'board' }), buildNight(date)])
  const previewOf = market === 'GOAL' ? night.byGame : night.sogByGame
  const lockedIds = new Set(games.filter((x) => x.locked_at).map((x) => Number(x.game_id)))
  // CONTEXT, NOT SCORE (lamp research step 2): special teams, rest and PP
  // goals are joined here, on the read, for display. They are never in
  // buildNight's rows and never written with a lock. A failed read costs the
  // columns ('—'), never the board.
  const clubs = [...new Set(night.day.games.flatMap((g) => [g.away.abbrev, g.home.abbrev]))]
  const st = await readSpecialTeams().catch((e) => { console.error(`[lamp board] special teams: ${e?.message}`); return null })
  const [rest, ppg] = await Promise.all([
    readRest(clubs, date).catch(() => ({})),
    st ? readPpGoals(clubs, st.season).catch(() => new Map()) : Promise.resolve(new Map()),
  ])
  const stBy = new Map((st?.teams || []).map((t) => [t.abbrev, t]))
  const sideSpot = (ab) => ({ rest: rest[ab]?.rest ?? null, b2b: Boolean(rest[ab]?.b2b), ppPct: stBy.get(ab)?.ppPct ?? null, pkPct: stBy.get(ab)?.pkPct ?? null })
  const out = night.day.games.map((g) => {
    const meta = games.find((x) => Number(x.game_id) === g.id) || null
    const isLocked = lockedIds.has(g.id)
    // A game that locked before this market existed has no rows for it:
    // nothing is previewed after a lock (a preview is not a call), it says so.
    const lockedRows = isLocked ? locked.filter((r) => Number(r.game_id) === g.id).map((r) => shapeRow(r, false, market)) : null
    const rows = isLocked ? lockedRows : (previewOf.get(g.id) || []).map((r) => shapeRow(r, true, market))
    rows.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || String(a.name).localeCompare(String(b.name)))
    const start = Date.parse(g.startUtc)
    // LOCKED, HONESTLY (2026-10-01, audit): the tick rewrites a game's rows
    // on every run inside the 100-minute window, and only the last write
    // before puck drop is the lock. Until the puck drops the written rows are
    // SETTING (they can still change); LOCKED only once it has dropped.
    const dropped = g.state !== 'pre' || Date.now() >= start
    return {
      game: g, locked: isLocked && dropped, setting: isLocked && !dropped, lockedAt: meta?.locked_at || null, lineupKnown: Boolean(meta?.lineup_known ?? night.lineups[g.id]),
      graded: Boolean(meta?.graded_at), snapshots: meta?.snapshots || 0,
      noMarketLock: Boolean(isLocked && !lockedRows?.length && market !== 'GOAL'),
      locksAtUtc: new Date(start - LOCK_WINDOW_MS).toISOString(),
      // The net: pregame null in v1 (no source in the feed); after grading,
      // who actually started and his line — real, from the boxscore.
      starters: meta?.starters || null, startersActual: meta?.starters_actual || null,
      net: meta?.graded_at ? netLine(meta?.goalies, meta?.starters_actual) : null,
      spots: { away: sideSpot(g.away.abbrev), home: sideSpot(g.home.abbrev) },
      rows: rows.map((r) => ({ ...r, ppg: ppg.get(Number(r.playerId)) ?? null })),
    }
  })
  return { date, market, modelVersion: versionsFor(date)[BOARD_MARKETS[market]], season: night.season, dbReady: db, spotsSeason: st ? { id: st.season, label: st.seasonLabel, stale: st.stale } : null, games: out }
}
