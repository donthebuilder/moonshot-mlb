// THE CARD: THE READS (server only). One loader set per sport, keyed by the registry's sport key. Three questions:
//
//   loadWindows(sport, now)            -> { ok, why?, windows: [{ card_date, slate_key, first_start_ms, label }] }
//        the card windows of the slate, CHEAP (a schedule read): a night sport has one; the NFL has one per game day
//        (Thursday night, Sunday, Monday night ...), taken from the week file's own kickoffs.
//   loadCandidates(sport, window, now) -> { ok, why?, cands }
//        the CALLED players of that window, normalised to lib/card/core.js's candidate shape. HEAVIER: asked once, at the lock.
//        CALLED is the sport's own word, never re-derived here:
//          NHL  lib/nhl/goalModel.js scoreNight (the top skater of each club), scored by lib/nhl/goalBoard.js buildNight
//          NFL  lib/callStatus.js tdCallStatus over lib/nfl/tdFeed.js onBotFor (the TD ladder and the game calls), as lib/boardLock.js
//          MLB  lib/callStatus.js callStatus on the pregame role, narrowed to TOP / HR (the roles whose market IS the home run)
//   loadLegResults(sport, rows, now)   -> Map('<game_id>|<player_id>' | '<game_id>|*' -> { played, landed }) for FINAL games only
//        from the real box score (NHL boxscore, NFL game logs, MLB boxscore). A game that was never played has a '*' entry: { played:false }.
// A source that cannot be read is simply not ok: never a guess, never a made-up number.
import { easternDate } from '../data'
import { nflWindowsOf } from './core'
import { slateNight } from '../slateNight'
import { callStatus, tdCallStatus, hasRoleIn, HR_CALL_ROLES } from '../callStatus'
import { nhlGet, scoreFor } from '../nhl/api'
import { reduceScoreDay } from '../nhl/reduce'
import { buildNight } from '../nhl/goalBoard'
import { gradeRows as gradeNhlRows, whyLine } from '../nhl/goalModel'
import { fetchNfl, nflSlatePaths, nflSlateLooksReal, nflPicksPaths, nflPicksLooksReal, nflGameCallsPaths, nflLogPaths } from '../nfl/dataSource'
import { onBotFor, boardRankFor } from '../nfl/tdFeed'
import { tdResult } from '../boardLock'
import { nflNamingProblem } from '../dash/namingChecks'
import { fetchBoardFull, fetchRunMeta } from '../dash/board'
import { mlbProof } from '../posts/mlb'
import { nflProof } from '../posts/nfl'
import { pairRate, PAIR_BASELINE } from '../pairEvidence'
import { readPaged } from '../record/paged'
import { pricesFromRows } from '../odds/priceAtLock'
import { MARKETS } from './core'

const MLB_API = 'https://statsapi.mlb.com/api/v1'
const jget = (url) => fetch(url, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
const bad = (why) => ({ ok: false, why })
const num = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }
const txt = (v) => String(v == null ? '' : v).trim()
/** A Poisson-style chance of one or more from an expected count per game. Stored with the leg as its model rate; never printed as a chance. */
const ord = (n) => { const k = Math.round(n); const r = k % 100; return `${k}${r >= 11 && r <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][k % 10] || 'th'}` }
/** A volume pick's why: where he stands on his own market's board that night (a rank among real scored players, not a chance). */
const rankWhy = (label, rank, of) => (rank && of ? `ranks ${ord(rank)} of ${of} on ${label}` : null)
const atLeastOne = (x) => (x != null && x >= 0 ? Math.round((1 - Math.exp(-x)) * 1000) / 1000 : null)

// ── NHL ──────────────────────────────────────────────────────────────────────
async function nhlWindows(now) {
  const day = await slateNight('nhl', now)
  const sd = reduceScoreDay(await scoreFor(day).catch(() => null))
  const list = sd.games.filter((g) => (g.gameType === 2 || g.gameType === 3) && g.scheduleState === 'OK')
  const starts = list.map((g) => Date.parse(g.startUtc)).filter(Number.isFinite)
  if (!starts.length) return { ok: true, windows: [] }
  return { ok: true, windows: [{ card_date: day, slate_key: day, first_start_ms: Math.min(...starts), last_start_ms: Math.max(...starts), games: list.length, label: day }] }
}
async function nhlCandidates(win, now, { all = false } = {}) {
  const night = await buildNight(win.card_date)
  const games = new Map(night.games.filter((g) => (g.gameType === 2 || g.gameType === 3) && g.scheduleState === 'OK').map((g) => [g.id, g]))
  const shape = (r, g, extra) => ({
    status: r.status,
    player_id: txt(r.playerId), name: txt(r.name), team: txt(r.team), opp: txt(r.opp), pos: txt(r.pos), game_id: String(r.gameId), game_date: g.date || win.card_date,
    start_ms: Date.parse(g.startUtc), score: r.score, role: r.role || null, ...extra,
  })
  const goalAll = []
  for (const r of night.rows) {
    const g = games.get(r.gameId)
    if (g && Number.isFinite(r.score)) goalAll.push(shape(r, g, { rate: num(r.goalGameProbability), why: whyLine({ pct: r.pct, reason: r.reason }) }))
  }
  const sogAll = []
  for (const r of night.sogRows || []) {
    const g = games.get(r.gameId)
    if (g && Number.isFinite(r.score)) sogAll.push(shape(r, g, { rate: null, why: r.pct ? `shots ${ord(r.pct.shotsPg)} · ice time ${ord(r.pct.toi)} percentile tonight` : null }))
  }
  const called = (list) => list.filter((c) => c.status === 'called')
  const cands = all ? goalAll : called(goalAll)
  return {
    ok: true, cands, all: goalAll, games: win.games ?? games.size,
    byMarket: { anytime: { cands, board: goalAll.map((c) => c.score) }, sog: { cands: called(sogAll), board: sogAll.map((c) => c.score) } },
  }
}
async function nhlResults(rows) {
  const out = new Map()
  const ids = [...new Set(rows.flatMap((r) => r.legs.map((l) => `${l.game_id}|${l.game_date}`)))]
  for (const key of ids) {
    const [gameId, date] = key.split('|')
    const sd = reduceScoreDay(await scoreFor(date).catch(() => null))
    const g = sd.games.find((x) => String(x.id) === gameId)
    if (!g) continue
    if (g.scheduleState && g.scheduleState !== 'OK' && g.state !== 'final') { out.set(`${gameId}|*`, { played: false, landed: false }); continue }
    if (g.state !== 'final') continue
    // graded off a boxscore that is itself over and agrees with the final score (the tick's own rule, 2026-10-04 audit F1)
    const box = await nhlGet(`/gamecenter/${gameId}/boxscore`, 0).catch(() => null)
    if (!box?.playerByGameStats) continue
    const over = ['OFF', 'FINAL'].includes(String(box.gameState || '').toUpperCase())
    const agrees = Number(box.homeTeam?.score) === Number(g.home?.score) && Number(box.awayTeam?.score) === Number(g.away?.score)
    if (!over || !agrees) continue
    const legs = rows.flatMap((r) => r.legs).filter((l) => l.game_id === gameId)
    const graded = gradeNhlRows(legs.map((l) => ({ playerId: l.player_id })), box.playerByGameStats)
    const sog = new Map()
    for (const side of ['awayTeam', 'homeTeam']) for (const grp of ['forwards', 'defense']) for (const s of box.playerByGameStats?.[side]?.[grp] || []) sog.set(Number(s.playerId), num(s.sog))
    for (const r of graded) out.set(`${gameId}|${r.playerId}`, { played: r.dressed === true, landed: r.hit === true, values: { sog: sog.get(Number(r.playerId)) ?? null } })
  }
  return out
}

// ── NFL ──────────────────────────────────────────────────────────────────────
const nflSlateKey = (season, week) => `${season}-w${String(week).padStart(2, '0')}`
async function nflWeek() {
  const week = await fetchNfl(nflSlatePaths(), nflSlateLooksReal).catch(() => null)
  if (!week || !Array.isArray(week.games) || !week.games.length) return bad('no TUDDY week file')
  if (week.mode === 'preseason') return bad('preseason (the week file is not a regular-season board)')
  const season = Number(week.season); const wk = Number(week.week)
  if (!season || !wk) return bad('the week file names no season/week')
  return { ok: true, week, season, wk }
}
async function nflWindows() {
  const w = await nflWeek()
  if (!w.ok) return w
  const windows = nflWindowsOf(w.week.games, easternDate).map((x) => ({ ...x, slate_key: nflSlateKey(w.season, w.wk) }))
  return { ok: true, windows }
}
const NFL_VOLUME = { rec_yds: 'REC_YDS', rush_yds: 'RUSH_YDS' }   // our market key -> the week file's score key and the picks card's block key
async function nflCandidates(win, now, { all = false } = {}) {
  const [w, picks, gameCalls] = await Promise.all([nflWeek(), fetchNfl(nflPicksPaths(), nflPicksLooksReal).catch(() => null), fetchNfl(nflGameCallsPaths()).catch(() => null)])
  if (!w.ok) return w
  const games = w.week.games.filter((g) => { const t = Date.parse(String(g?.kickoff || '')); return Number.isFinite(t) && easternDate(t) === win.card_date })
  const gameOf = new Map()
  for (const g of games) { gameOf.set(g.home, g); gameOf.set(g.away, g) }
  const cands = []
  const allRows = []
  const inWindow = []
  for (const p of w.week.players || []) {
    const g = gameOf.get(p.team)
    if (!g || p.on_bye) continue
    inWindow.push({ p, g })
    if (typeof p.scores?.TD !== 'number') continue
    const board = boardRankFor(w.week, p.player_id)
    const onBot = onBotFor(picks?.card || null, p.player_id, { gameCalls, gameId: g.game_id })
    // a touchdown straight is a TOUCHDOWN call: the TD ladder or the game's call. A man on the card for another market (receiving yards ...)
    // is "on the bot" in tdFeed's wide sense, but he is not called for a touchdown.
    const tdCall = Boolean(onBot) && (onBot.market === 'TD' || onBot.market === 'GAME')
    const status = tdCallStatus({ on_bot: tdCall ? onBot : null, td_board: board })
    if (nflNamingProblem(p)) continue                            // listed out / inactive: not a straight to put on a card
    const c = {
      status,
      player_id: txt(p.player_id), name: txt(p.name), team: txt(p.team), opp: txt(p.opp), pos: txt(p.position), game_id: txt(g.game_id), game_date: win.card_date,
      start_ms: Date.parse(g.kickoff), score: p.scores.TD, rate: atLeastOne(num(p.stats?.xTD)), role: onBot?.market || null, slate_key: win.slate_key,
      why: nflProof(p, board?.rank, board?.of),
    }
    allRows.push(c)
    // the football pool is CALLED + ON THE BOARD (the top third of the TD board); never a man listed out
    if (all || status === 'called' || status === 'board') cands.push(c)
  }
  // the volume markets: CALLED = on the picks card's block for that market; ON THE BOARD = the top third of that market's board in this window
  const byMarket = { anytime: { cands, board: (allRows.length ? allRows : []).map((c) => c.score) } }
  for (const [key, blk] of Object.entries(NFL_VOLUME)) {
    const scored = inWindow.filter(({ p }) => typeof p.scores?.[blk] === 'number' && !nflNamingProblem(p))
      .sort((a, b) => (b.p.scores[blk] - a.p.scores[blk]) || String(a.p.name || '').localeCompare(String(b.p.name || '')))
    const cut = Math.ceil(scored.length / 3)
    const onCard = new Set((picks?.card?.[blk]?.rungs || []).map((r) => String(r.player_id)))
    const label = `this window's ${MARKETS.nfl[key].short} board`
    const list = []
    scored.forEach(({ p, g }, i) => {
      const status = onCard.has(String(p.player_id)) ? 'called' : i < cut ? 'board' : 'off'
      if (status === 'off') return
      list.push({
        status, player_id: txt(p.player_id), name: txt(p.name), team: txt(p.team), opp: txt(p.opp), pos: txt(p.position), game_id: txt(g.game_id), game_date: win.card_date,
        start_ms: Date.parse(g.kickoff), score: p.scores[blk], rate: null, role: key, why: rankWhy(label, i + 1, scored.length),
      })
    })
    byMarket[key] = { cands: list, board: scored.map(({ p }) => p.scores[blk]) }
  }
  return { ok: true, cands, all: allRows, games: win.games ?? games.length, byMarket }
}
const NFL_FINAL_AFTER_MS = 4 * 3600e3   // not graded off the logs until the game has been over for certain
async function nflResults(rows, now) {
  const out = new Map()
  const logs = await fetchNfl(nflLogPaths()).catch(() => null)
  if (!logs) return out
  for (const r of rows) {
    for (const l of r.legs) {
      const m = /^(\d{4})-w(\d{2})$/.exec(l.slate_key || r.slate_key || '')       // a Double's NFL leg carries its own week
      if (!m || now < Date.parse(l.start_at) + NFL_FINAL_AFTER_MS) continue
      const g = tdResult({ player_id: l.player_id, week: Number(m[2]), team: l.team }, logs, Number(m[1]))
      if (!g) continue
      const mine = (logs?.logs?.[l.player_id]?.log || []).find((x) => x.s === Number(m[1]) && x.w === Number(m[2]))
      out.set(`${l.game_id}|${l.player_id}`, { played: g.result !== 'void', landed: g.result === 'hit', values: { rec_yds: num(mine?.g_recyd), rush_yds: num(mine?.g_ruyd) } })
    }
  }
  return out
}

// ── MLB ──────────────────────────────────────────────────────────────────────
const MLB_TYPES = 'R,F,D,L,W'
async function mlbWindows(now) {
  const day = await slateNight('mlb', now)
  const j = await jget(`${MLB_API}/schedule?sportId=1&date=${day}&gameType=${MLB_TYPES}&fields=dates,games,gamePk,gameDate,status,detailedState`)
  const games = (j?.dates || []).flatMap((d) => d.games || []).filter((g) => !/postponed|cancel|suspend/i.test(String(g.status?.detailedState || '')))
  const starts = games.map((g) => Date.parse(g.gameDate)).filter(Number.isFinite)
  if (!starts.length) return { ok: true, windows: [] }
  return { ok: true, windows: [{ card_date: day, slate_key: day, first_start_ms: Math.min(...starts), last_start_ms: Math.max(...starts), games: new Set(games.map((g) => g.gamePk)).size, label: day }] }
}
async function mlbCandidates(win, now, { all = false } = {}) {
  const [meta, rows] = await Promise.all([fetchRunMeta('today'), fetchBoardFull('today')])
  // the board must be THIS day's (the homers tick's own pregame guard): a stale board names the wrong men
  if (!meta || meta.slate_date !== win.card_date) return bad(`the board file is for ${meta?.slate_date || 'no day'}, not ${win.card_date}`)
  if (!Array.isArray(rows) || !rows.length) return bad('no board rows')
  const cands = []
  const allRows = []
  const vol = { hit: { cands: [], board: [], field: 'hit_score', role: 'HIT', label: 'tonight\'s HIT board' }, hrr: { cands: [], board: [], field: 'hrr_score', role: 'HRR', label: 'tonight\'s H+R+RBI board' } }
  for (const r of rows) {
    const role = r.game_pick_role
    const status = callStatus({ role, board_rank: r.board_rank, board_of: r.board_of })
    const start = Date.parse(r.game_time)
    const score = num(r.hr_score)
    if (!r.player_id || r.game_pk == null || !Number.isFinite(start)) continue
    const base = { player_id: txt(r.player_id), name: txt(r.name), team: txt(r.team), opp: txt(r.opponent || r.opp), game_id: txt(r.game_pk), game_date: win.card_date, start_ms: start, rate: null, role: txt(role) || null }
    // the volume boards: every rated hitter is on the percentile board; a CALLED HIT / HRR role is a candidate for its own market
    for (const v of Object.values(vol)) { const sc = num(r[v.field] ?? (v.field === 'hrr_score' ? r.prod_score : undefined)); if (sc != null) v.board.push(sc) }
    for (const [key, v] of Object.entries(vol)) {
      const sc = num(r[v.field] ?? (v.field === 'hrr_score' ? r.prod_score : undefined))
      if (sc != null && status === 'called' && hasRoleIn(role, [v.role])) v.cands.push({ ...base, status: 'called', score: sc, why: null, _market: key })
    }
    if (score == null) continue
    const p = num(r.season_hr_game_probability)
    const c = {
      ...base,
      status: status === 'called' && !hasRoleIn(role, HR_CALL_ROLES) ? 'board' : status,
      score, rate: p != null && p > 0 && p < 1 ? p : null, why: mlbProof(r, num(r.board_rank), num(r.board_of)), _raw: r,
    }
    allRows.push(c)
    // a straight's market is the home run itself: only the roles graded on one (TOP / HR) are candidates for the Card
    if (all || (status === 'called' && hasRoleIn(role, HR_CALL_ROLES))) cands.push(c)
  }
  for (const [key, v] of Object.entries(vol)) {
    const sorted = [...v.cands].sort((a, b) => b.score - a.score)
    sorted.forEach((c, i) => { c.why = rankWhy(v.label, i + 1, v.board.length) })
  }
  return {
    ok: true, cands, all: allRows, games: win.games ?? new Set(allRows.map((c) => c.game_id)).size,
    byMarket: { anytime: { cands, board: allRows.map((c) => c.score) }, hit: { cands: vol.hit.cands, board: vol.hit.board }, hrr: { cands: vol.hrr.cands, board: vol.hrr.board } },
  }
}
/** The sentence for an MLB Two-Man's pair: the measured rule it meets (lib/pairEvidence PAIR_RULES), or that it meets none. From the two board rows. */
export function mlbPairNote(a, b) {
  if (!a?._raw || !b?._raw) return null
  const ev = pairRate(a._raw, b._raw)
  return ev.rule ? `${ev.rule.label}: ${ev.rate}% of such pairs both homered in the archive (a random pair: ${PAIR_BASELINE}%).` : `Meets none of the measured pair rules (a random pair: ${PAIR_BASELINE}% both homer).`
}
/** The sentence a sport's Two-Man carries about its pair (a table keyed by sport, not a ternary): MLB's measured pair rule; none elsewhere. */
export const pairNoteOf = (sport) => ({ mlb: mlbPairNote })[sport] || null
async function mlbResults(rows) {
  const out = new Map()
  for (const gameId of [...new Set(rows.flatMap((r) => r.legs.map((l) => l.game_id)))]) {
    const st = await jget(`${MLB_API}/schedule?sportId=1&gamePk=${gameId}&fields=dates,games,status,abstractGameState,detailedState`)
    const s = st?.dates?.[0]?.games?.[0]?.status
    if (/postponed|cancel/i.test(String(s?.detailedState || ''))) { out.set(`${gameId}|*`, { played: false, landed: false }); continue }
    if (s?.abstractGameState !== 'Final') continue
    const box = await jget(`${MLB_API}/game/${gameId}/boxscore`)
    if (!box?.teams) continue
    const lines = new Map()
    for (const side of ['away', 'home']) for (const pl of Object.values(box.teams[side]?.players || {})) {
      const b = pl?.stats?.batting
      if (pl?.person?.id != null && b) lines.set(String(pl.person.id), { pa: num(b.plateAppearances) ?? 0, hr: num(b.homeRuns) ?? 0, hits: num(b.hits) ?? 0, runs: num(b.runs) ?? 0, rbi: num(b.rbi) ?? 0 })
    }
    for (const l of rows.flatMap((r) => r.legs).filter((x) => x.game_id === gameId)) {
      const line = lines.get(String(l.player_id))
      out.set(`${gameId}|${l.player_id}`, {
        played: Boolean(line && line.pa > 0), landed: Boolean(line && line.hr > 0),   // no plate appearance = did not play
        values: line ? { hit: line.hits, hrr: line.hits + line.runs + line.rbi } : {},
      })
    }
  }
  return out
}

// ── THE STORED LINES AND PRICES (odds_lines / odds_snap, read-only) ────────────────────────────────────────────────
/**
 * The newest stored OVER line and price per player for one volume market, from odds_lines, taken at or before `now` (any snapshot: the Card locks an
 * hour before the first game, which can be before the book-line 'lock' snapshot of a late sport). Map(player_id -> { line, median, best, books, taken_at, snap }).
 * A player with no stored row is simply absent: no line, no pick (never a guessed line).
 */
export async function loadLines(db, sport, { ids, dates, lineMarket, now }) {
  const out = new Map()
  if (!ids?.length) return out
  const { data, error } = await db.from('odds_lines').select('our_player_id,market,side,line,odds,best_odds,books,taken_at,snap,game_date')
    .eq('sport', sport).eq('market', lineMarket).eq('side', 'over').in('game_date', dates).in('our_player_id', ids).lte('taken_at', new Date(now).toISOString())
    .order('taken_at', { ascending: false }).limit(3000)
  if (error) throw new Error(`odds_lines: ${error.message}`)
  for (const r of data || []) {
    const id = String(r.our_player_id)
    const line = num(r.line); const odds = Number.isInteger(r.odds) ? r.odds : num(r.odds)
    if (out.has(id) || line == null || !Number.isInteger(odds)) continue          // newest first: the first usable row wins
    out.set(id, { line, median: odds, best: Number.isInteger(r.best_odds) ? r.best_odds : odds, books: num(r.books), taken_at: r.taken_at, snap: r.snap || null })
  }
  return out
}

/**
 * The stored MEDIAN anytime price of every priced player of a game date, from the newest odds_snap snapshot of each player at or before `now`
 * (lib/odds/priceAtLock pricesFromRows: the median across available books). Map(player_id -> { median, best, books, taken_at }).
 */
export async function loadAnytimePrices(db, sport, date, now) {
  const { data, error } = await readPaged(() => db.from('odds_snap').select('sport,event_id,game_date,our_player_id,book,odds,available,fair_odds,open_odds,taken_at')
    .eq('sport', sport).eq('game_date', date).lte('taken_at', new Date(now).toISOString()).not('our_player_id', 'is', null)
    .order('event_id', { ascending: true }).order('odd_id', { ascending: true }).order('book', { ascending: true }))
  if (error) throw new Error(`odds_snap: ${error.message}`)
  const newest = new Map()
  for (const r of data) if (!newest.has(r.our_player_id) || r.taken_at > newest.get(r.our_player_id)) newest.set(r.our_player_id, r.taken_at)
  const { prices } = pricesFromRows(data.filter((r) => r.taken_at === newest.get(r.our_player_id)))
  const out = new Map()
  for (const [k, p] of prices) out.set(k.split(':')[2], { median: p.median, best: p.best, books: p.books, taken_at: p.taken_at })
  return out
}

// ── THE TABLE ────────────────────────────────────────────────────────────────
const LOADERS = {
  nhl: { windows: nhlWindows, candidates: nhlCandidates, results: nhlResults },
  nfl: { windows: nflWindows, candidates: nflCandidates, results: nflResults },
  mlb: { windows: mlbWindows, candidates: mlbCandidates, results: mlbResults },
}

export async function loadWindows(sport, now = Date.now()) {
  try { return await (LOADERS[sport]?.windows(now) || bad(`no loader for ${sport}`)) } catch (e) { return bad(String(e?.message || e)) }
}
/** `all: true` = the whole scored board of the window (Donovan's picker), each with its status word source; default = the CALLED players only (the lock). Also returns `all`, `games` and `byMarket`. */
export async function loadCandidates(sport, win, now = Date.now(), opts = {}) {
  try { return await (LOADERS[sport]?.candidates(win, now, opts) || bad(`no loader for ${sport}`)) } catch (e) { return bad(String(e?.message || e)) }
}

/**
 * EVERYTHING A CARD'S LOCK NEEDS for one window: the markets' eligible players, each volume pick with its stored line and price (a player with no
 * stored line stays in the list; planStraights skips him and says why), the window's game count, and, with `prices: true`, the stored median
 * anytime price of every priced player (the Long Shot and the Double). A read that fails says so; nothing is ever guessed.
 */
export async function loadCardInputs(db, sport, win, now = Date.now(), { prices = false } = {}) {
  const c = await loadCandidates(sport, win, now)
  if (!c.ok) return c
  // a price read that fails is retried (the caller asks again) until 15 minutes before the first game; after that the card locks without
  // what could not be read, and the skipped slots / the Long Shot say so
  const mayDegrade = Number.isFinite(win.first_start_ms) && win.first_start_ms - now <= 15 * 60e3
  const warn = []
  try {
    for (const [key, m] of Object.entries(c.byMarket || {})) {
      const def = MARKETS[sport]?.[key]
      if (def?.kind !== 'ou' || !m.cands.length) continue
      try {
        const lines = await loadLines(db, sport, { ids: [...new Set(m.cands.map((x) => x.player_id))], dates: [win.card_date], lineMarket: def.lineMarket, now })
        m.cands = m.cands.map((x) => { const l = lines.get(String(x.player_id)); return l ? { ...x, line: l.line, price: { median: l.median, best: l.best, books: l.books, taken_at: l.taken_at } } : x })
      } catch (e) { if (!mayDegrade) throw e; warn.push(`${key}: ${e?.message || e}`) }
    }
    let anyPrices = null
    if (prices) {
      try { anyPrices = await loadAnytimePrices(db, sport, win.card_date, now) } catch (e) { if (!mayDegrade) throw e; warn.push(`anytime prices: ${e?.message || e}`) }
    }
    return { ...c, prices: anyPrices, warn }
  } catch (e) { return bad(String(e?.message || e)) }
}

export async function loadLegResults(sport, rows, now = Date.now()) {
  try { return rows.length ? await LOADERS[sport].results(rows, now) : new Map() } catch (e) { console.error(`[card] results ${sport}: ${e?.message || e}`); return new Map() }
}
