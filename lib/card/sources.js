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

const MLB_API = 'https://statsapi.mlb.com/api/v1'
const jget = (url) => fetch(url, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
const bad = (why) => ({ ok: false, why })
const num = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }
const txt = (v) => String(v == null ? '' : v).trim()
/** A Poisson-style chance of one or more from an expected count per game. Stored with the leg as its model rate; never printed as a chance. */
const atLeastOne = (x) => (x != null && x >= 0 ? Math.round((1 - Math.exp(-x)) * 1000) / 1000 : null)

// ── NHL ──────────────────────────────────────────────────────────────────────
async function nhlWindows(now) {
  const day = await slateNight('nhl', now)
  const sd = reduceScoreDay(await scoreFor(day).catch(() => null))
  const list = sd.games.filter((g) => (g.gameType === 2 || g.gameType === 3) && g.scheduleState === 'OK')
  const starts = list.map((g) => Date.parse(g.startUtc)).filter(Number.isFinite)
  if (!starts.length) return { ok: true, windows: [] }
  return { ok: true, windows: [{ card_date: day, slate_key: day, first_start_ms: Math.min(...starts), last_start_ms: Math.max(...starts), label: day }] }
}
async function nhlCandidates(win, now, { all = false } = {}) {
  const night = await buildNight(win.card_date)
  const games = new Map(night.games.filter((g) => (g.gameType === 2 || g.gameType === 3) && g.scheduleState === 'OK').map((g) => [g.id, g]))
  const cands = []
  for (const r of night.rows) {
    const g = games.get(r.gameId)
    if (!g || (!all && r.status !== 'called') || !Number.isFinite(r.score)) continue
    cands.push({
      status: r.status,
      player_id: txt(r.playerId), name: txt(r.name), team: txt(r.team), opp: txt(r.opp), pos: txt(r.pos), game_id: String(r.gameId), game_date: g.date || win.card_date,
      start_ms: Date.parse(g.startUtc), score: r.score, rate: num(r.goalGameProbability), role: r.role || null,
      why: whyLine({ pct: r.pct, reason: r.reason }),
    })
  }
  return { ok: true, cands }
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
    for (const r of graded) out.set(`${gameId}|${r.playerId}`, { played: r.dressed === true, landed: r.hit === true })
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
async function nflCandidates(win, now, { all = false } = {}) {
  const [w, picks, gameCalls] = await Promise.all([nflWeek(), fetchNfl(nflPicksPaths(), nflPicksLooksReal).catch(() => null), fetchNfl(nflGameCallsPaths()).catch(() => null)])
  if (!w.ok) return w
  const games = w.week.games.filter((g) => { const t = Date.parse(String(g?.kickoff || '')); return Number.isFinite(t) && easternDate(t) === win.card_date })
  const gameOf = new Map()
  for (const g of games) { gameOf.set(g.home, g); gameOf.set(g.away, g) }
  const cands = []
  for (const p of w.week.players || []) {
    const g = gameOf.get(p.team)
    if (!g || typeof p.scores?.TD !== 'number' || p.on_bye) continue
    const board = boardRankFor(w.week, p.player_id)
    const onBot = onBotFor(picks?.card || null, p.player_id, { gameCalls, gameId: g.game_id })
    const status = tdCallStatus({ on_bot: onBot, td_board: board })
    if (!all && status !== 'called') continue
    if (nflNamingProblem(p)) continue                            // listed out / inactive: not a straight to put on a card
    cands.push({
      status,
      player_id: txt(p.player_id), name: txt(p.name), team: txt(p.team), opp: txt(p.opp), pos: txt(p.position), game_id: txt(g.game_id), game_date: win.card_date,
      start_ms: Date.parse(g.kickoff), score: p.scores.TD, rate: atLeastOne(num(p.stats?.xTD)), role: onBot?.market || null,
      why: nflProof(p, board?.rank, board?.of),
    })
  }
  return { ok: true, cands }
}
const NFL_FINAL_AFTER_MS = 4 * 3600e3   // not graded off the logs until the game has been over for certain
async function nflResults(rows, now) {
  const out = new Map()
  const logs = await fetchNfl(nflLogPaths()).catch(() => null)
  if (!logs) return out
  for (const r of rows) {
    const m = /^(\d{4})-w(\d{2})$/.exec(r.slate_key || '')
    if (!m || now < Date.parse(r.start_at) + NFL_FINAL_AFTER_MS) continue
    for (const l of r.legs) {
      if (now < Date.parse(l.start_at) + NFL_FINAL_AFTER_MS) continue
      const g = tdResult({ player_id: l.player_id, week: Number(m[2]), team: l.team }, logs, Number(m[1]))
      if (g) out.set(`${l.game_id}|${l.player_id}`, { played: g.result !== 'void', landed: g.result === 'hit' })
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
  return { ok: true, windows: [{ card_date: day, slate_key: day, first_start_ms: Math.min(...starts), last_start_ms: Math.max(...starts), label: day }] }
}
async function mlbCandidates(win, now, { all = false } = {}) {
  const [meta, rows] = await Promise.all([fetchRunMeta('today'), fetchBoardFull('today')])
  // the board must be THIS day's (the homers tick's own pregame guard): a stale board names the wrong men
  if (!meta || meta.slate_date !== win.card_date) return bad(`the board file is for ${meta?.slate_date || 'no day'}, not ${win.card_date}`)
  if (!Array.isArray(rows) || !rows.length) return bad('no board rows')
  const cands = []
  for (const r of rows) {
    const role = r.game_pick_role
    const status = callStatus({ role, board_rank: r.board_rank, board_of: r.board_of })
    // a straight's market is the home run itself: only the roles graded on one (TOP / HR) are candidates for the Card
    if (!all && (status !== 'called' || !hasRoleIn(role, HR_CALL_ROLES))) continue
    const start = Date.parse(r.game_time)
    const score = num(r.hr_score)
    if (!r.player_id || r.game_pk == null || !Number.isFinite(start) || score == null) continue
    const p = num(r.season_hr_game_probability)
    cands.push({
      status: status === 'called' && !hasRoleIn(role, HR_CALL_ROLES) ? 'board' : status,
      player_id: txt(r.player_id), name: txt(r.name), team: txt(r.team), opp: txt(r.opponent || r.opp), game_id: txt(r.game_pk), game_date: win.card_date,
      start_ms: start, score, rate: p != null && p > 0 && p < 1 ? p : null, role: txt(role) || null, why: mlbProof(r, num(r.board_rank), num(r.board_of)), _raw: r,
    })
  }
  return { ok: true, cands }
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
      if (pl?.person?.id != null && b) lines.set(String(pl.person.id), { pa: num(b.plateAppearances) ?? 0, hr: num(b.homeRuns) ?? 0 })
    }
    for (const l of rows.flatMap((r) => r.legs).filter((x) => x.game_id === gameId)) {
      const line = lines.get(String(l.player_id))
      out.set(`${gameId}|${l.player_id}`, { played: Boolean(line && line.pa > 0), landed: Boolean(line && line.hr > 0) })   // no plate appearance = did not play
    }
  }
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
/** `all: true` = the whole scored board of the window (Donovan's picker), each with its status word source; default = the CALLED players only (the lock). */
export async function loadCandidates(sport, win, now = Date.now(), opts = {}) {
  try { return await (LOADERS[sport]?.candidates(win, now, opts) || bad(`no loader for ${sport}`)) } catch (e) { return bad(String(e?.message || e)) }
}
export async function loadLegResults(sport, rows, now = Date.now()) {
  try { return rows.length ? await LOADERS[sport].results(rows, now) : new Map() } catch (e) { console.error(`[card] results ${sport}: ${e?.message || e}`); return new Map() }
}
