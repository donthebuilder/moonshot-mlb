// THE SHARE CARDS' DATA (server only, no JSX): the real board, game, pitcher, pick and record the 📸 buttons ask for, read the way the pages read them,
// turned into the plain models lib/cards/shareCards.js draws. Before 2026-10-12 each button reshaped whatever its tab held in the browser and drew a
// canvas; now the button sends only WHICH card (sport, market, game, player) and this file reads the same sources the page reads:
//   MLB   lib/dash/board.js fetchBoardFull (today's board file), lib/data.js groupGames / groupPitchers, lib/callStatus.js callStatus, lib/scoring.js scoreFor
//   NFL   the week file / picks / results / logs (lib/nfl/dataSource.js), lib/card/sources.js candidates (the status is tdCallStatus), lib/nfl/teamTdModel.js
//   NHL   lib/nhl/boardRead.js readBoard (the same rows /api/lamp/board serves: status from scoreNight, graded results, the team model's expected goals)
//   NBA   lib/nba/boardRead.js readNbaBoard + lib/nba/teamModelRead.js, behind lib/nba/gate.js (BUCKETS hidden = answers like any missing page)
// Nothing is invented: a number the source does not hold is absent and its tile/row is not drawn; a card whose source is down or whose day has no data
// answers { ok:false, status:404|502, why } and the route says so in words (the button shows the reason). The status words are lib/callStatus's, the
// model scores are the boards' own 0-100 ranks (never a chance), nothing here prints a probability. PUBLIC data only: every field is already on a public board.
import { adapterFor, hasCards } from './registry'
import { loadWindows, loadCandidates } from '../card/sources'
import { brandOf, prettyDay, pctInPool, num } from './model'
import { logoFor } from './adapters/common'
import { nbaHeadshot } from '../nba/teams'
import { inline } from './cardKit'
import { callStatus, boardOfRows } from '../callStatus'
import { boardCompare } from '../boardOrder'
import { scoreFor } from '../scoring'
import { fetchBoardFull, fetchRunMeta } from '../dash/board'
import { groupGames, groupPitchers } from '../data'
import { nameOf, hrScore, n as nn, clean } from '../player'
import { slateNight } from '../slateNight'
import { easternDate } from '../data'
import { nflGameOf, nflTdResult, nflItem } from './nflRows'
import { mlbHeadshot, teamPrimary } from '../mlbTeams'
import { pitcherTiles } from '../pitcherTiles'
import { reportModel, headline } from '../reportModel'
import { backtestPaths } from '../dataSource'
import { NFL_DATA_BASE, fetchNfl, nflSlatePaths, nflSlateLooksReal, nflPicksPaths, nflPicksLooksReal, nflGameCallsPaths, nflResultsPaths, nflLogPaths, nflMatchupPaths, nflMatchupLooksReal } from '../nfl/dataSource'
import { tdStatusFor } from '../nfl/tdStatus'
import { slateTotals, TD_WORD } from '../nfl/teamTdModel'
import { nflHeadshot } from '../nfl/nflAssets'
import { nflTones } from '../nfl/teamColors'

const NFL_PROJ_LABEL = TD_WORD.toUpperCase()   // allow-probability: the team model's projected count of touchdowns (lib/nfl/teamTdModel.js)
const NHL_PROJ_LABEL = 'EXPECTED GOALS'   // allow-probability: the team model's projected count of goals (lib/nhl/teamProj.js)
const miss = (why, status = 404) => ({ ok: false, status, why })
const fin = (v) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
const ET = 'America/New_York'
/** A game time in the site's own zone, labelled (the server has no viewer: every card says ET). */
const etTime = (iso) => { try { const t = new Date(iso); return Number.isFinite(t.getTime()) ? `${t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: ET })} ET` : '' } catch { return '' } }
const etDay = (iso) => { try { const t = new Date(iso); return Number.isFinite(t.getTime()) ? t.toLocaleDateString('en-US', { weekday: 'short', timeZone: ET }) : '' } catch { return '' } }
/** The title strip's own facts (lib/cards/shareCards.js gameDesign): state pre | live | final, the score once there is one, and the line under the clubs (ET day and time before the game, the feed's own words while it is live, FINAL after). */
const stripOf = ({ state, away = null, home = null, line }) => ({ state, score: state !== 'pre' && fin(away) != null && fin(home) != null ? { away: fin(away), home: fin(home) } : null, whenLine: line })
const dayTime = (iso) => { const t = etTime(iso); const d = etDay(iso); return t ? `${d ? `${d.toUpperCase()}  ` : ''}${t}` : '' }
const ID_LIST = /^[A-Za-z0-9_-]{1,24}(,[A-Za-z0-9_-]{1,24}){0,59}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

export const SHARE_KINDS = ['ranked', 'game', 'pitcher', 'pick', 'record', 'postseason', 'series']
export const SHARE_SPORTS = ['mlb', 'nfl', 'nhl', 'nba']

// one read of a slate per instance per minute (the board files are ~4 MB): a share card never reads more often than the page does
const _memo = new Map()
async function memo(key, fn, ttl = 60e3) {
  const hit = _memo.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.v
  const v = await fn()
  if (_memo.size > 12) _memo.clear()
  _memo.set(key, { at: Date.now(), v })
  return v
}

// ── pictures ───────────────────────────────────────────────────────────────
/** face / logo / tone for each item { id, team, pos }, by the sport's own adapter (BUCKETS has none: ESPN's headshot and the club logo). */
async function pics(sport, items, ctx = {}) {
  const adapter = hasCards(sport) ? await adapterFor(sport) : null
  return Promise.all(items.map(async (it) => {
    if (!it) return {}
    try {
      if (adapter) {
        const g = await adapter.identity({ player_id: it.id, team: it.team, pos: it.pos }, ctx)
        return { face: g.face || '', logo: g.logo || '', logoPlate: Boolean(g.logoPlate), tone: g.tone || null, number: g.number ?? null, pos: g.pos || it.pos || null }
      }
      const lg = it.team ? await logoFor('nba', it.team) : { src: '', plate: false }
      return { face: await inline(nbaHeadshot(it.id)), logo: lg.src, logoPlate: lg.plate, tone: null, number: null, pos: it.pos || null }
    } catch { return {} }
  }))
}
// a club's colour by sport (a table, not a ternary): MLB's club colour, TUDDY's club tone; NHL / NBA marks carry their own
const TONE_OF = { mlb: (t) => teamPrimary(t), nfl: (t) => nflTones(t)[0] }
// the board's market key is upper case on LAMP / TUDDY and lower case on BUCKETS
const MARKET_CASE = { nba: (m) => m.toLowerCase() }
const clubOf = async (sport, team) => {
  if (!team) return { team: '', logo: '', logoPlate: false, tone: null }
  const lg = await logoFor(sport, team)
  const tone = TONE_OF[sport]?.(team) ?? null
  return { team, logo: lg.src, logoPlate: lg.plate, tone }
}

/**
 * The finished list model. items = [{ id, name, team, opp, where, pos, status, score, result, miss, tag, line }] in rank order (#1 first).
 * `pool` = every score on the board (the percentile for the heat); `lead` = draw #1 as the lead card; `total` = how many the board holds.
 */
async function finishList(sport, items, { kicker, right, headLabel, scoreWord, dayWord, lead = true, total = null, empty = '', note = '', banner = null, max = 8, pool = [], poolMin = 12, identityCtx = {} } = {}) {
  const shown = items.slice(0, (lead ? 1 : 0) + max)
  const pi = await pics(sport, shown, identityCtx)
  const row = (it, i) => ({
    rank: it.rank ?? i + 1, name: it.name, team: it.team, opp: it.opp || '', where: it.where || '', tag: it.tag || '',
    face: pi[i]?.face || '', logo: pi[i]?.logo || '', logoPlate: Boolean(pi[i]?.logoPlate), tone: pi[i]?.tone || null,
    status: it.status || null, score: it.score ?? null, result: it.result || null, miss: Boolean(it.miss),
    pct: it.score != null ? pctInPool(pool, it.score, { min: poolMin }) : null,
  })
  const rows = shown.map(row)
  const first = lead && rows.length ? { ...rows[0], pos: shown[0].pos || pi[0]?.pos || '', number: pi[0]?.number ?? null, scoreWord, line: shown[0].line || '' } : null
  const rest = lead ? rows.slice(1) : rows
  const all = total ?? items.length
  return {
    sport, brand: brandOf(sport), kicker, right, headLabel, dayWord, lead: first, banner, rows: rest, empty, note,
    more: Math.max(0, all - (first ? 1 : 0) - rest.length),
  }
}

// ── MOONSHOT (MLB) ─────────────────────────────────────────────────────────
const MLB_TYPES = { top: 'TOP BOARD', hr: 'THE BOARD', hrr: 'HRR BOARD', hit: 'HITS BOARD', tb: 'TOTAL BASES BOARD' }
const MLB_SCORE_WORD = { top: 'TOP SCORE', hr: 'HR SCORE', hrr: 'HRR SCORE', hit: 'HIT SCORE', tb: 'TB SCORE' }
const iso3 = (v) => v.toFixed(3).replace(/^0/, '')

async function mlbBoard(now) {
  return memo('mlb-board', async () => {
    const w = await loadWindows('mlb', now)
    if (!w.ok || !w.windows.length) return miss('no MLB slate today')
    const c = await loadCandidates('mlb', w.windows[0], now, { all: true })
    if (!c.ok) return miss(c.why)
    const raws = c.all.map((x) => x._raw)
    return { ok: true, win: w.windows[0], raws, boardOf: boardOfRows(raws) || raws.length }
  })
}
// the lead's one proof line, the numbers a bettor asks for first
function mlbLeadLine(p) {
  const bits = []
  if (nn(p?.season_hr, 0) > 0) bits.push(`SZN ${nn(p.season_hr, 0)} HR`)
  if (nn(p?.last5_hr, 0) > 0) bits.push(`L5 ${nn(p.last5_hr, 0)} HR`)
  const iso = nn(p?.season_iso, NaN)
  if (Number.isFinite(iso)) bits.push(`ISO ${iso3(iso)}`)
  const gs = nn(p?.games_since_last_hr, NaN)
  if (Number.isFinite(gs)) bits.push(gs === 0 ? 'WENT YARD LAST GAME' : `${gs}G SINCE HR`)
  return bits.join('  ·  ')
}
const mlbStatus = (p, rank, boardOf, byRank) => (byRank && boardOf > 0
  ? callStatus({ role: p?.game_pick_role, board_rank: rank, board_of: boardOf })
  : (String(p?.game_pick_role || '').trim() || (boardOf > 0 && Number(p?.board_rank) > 0) ? callStatus({ role: p?.game_pick_role, board_rank: p?.board_rank, board_of: boardOf }) : null))
const mlbItem = (p, rank, { boardOf, byRank = false, score = hrScore } = {}) => ({ rank, id: String(p.player_id), name: nameOf(p), team: clean(p.team, ''), opp: clean(p.opponent || p.opp, ''), status: mlbStatus(p, rank, boardOf, byRank), score: score(p), pos: '', line: '' })
const dedupe = (rows) => { const seen = new Set(); return rows.filter((p) => { const k = String(p.player_id); if (seen.has(k)) return false; seen.add(k); return true }) }

async function mlbRanked({ type = 'hr', ids = null, now }) {
  if (!MLB_TYPES[type]) return miss(`no card for the ${type} board`)
  const b = await mlbBoard(now)
  if (!b.ok) return b
  const idSet = ids ? new Set(ids) : null
  let list = dedupe(b.raws).filter((p) => !idSet || idSet.has(String(p.player_id)))
  const scoreOf = type === 'hr' ? hrScore : (p) => scoreFor(p, type)
  list = type === 'hr' || idSet ? [...list].sort(boardCompare) : [...list].sort((x, y) => scoreOf(y) - scoreOf(x))
  const items = list.map((p, i) => ({ ...mlbItem(p, i + 1, { boardOf: b.boardOf, byRank: !idSet && type !== 'hr', score: scoreOf }), line: i === 0 ? mlbLeadLine(p) : '' }))
  const dayWord = prettyDay(b.win.card_date)
  const word = MLB_SCORE_WORD[type]
  const pool = dedupe(b.raws).map(scoreOf).filter(Number.isFinite)
  const m = await finishList('mlb', items, {
    kicker: idSet ? 'MY WATCHLIST' : MLB_TYPES[type], right: `${items.length} ${idSet ? `HITTER${items.length === 1 ? '' : 'S'}` : 'RANKED'}`, headLabel: word, scoreWord: word, dayWord,
    empty: idSet ? "None of these hitters is on tonight's board." : `No ${type.toUpperCase()} picks yet.`, pool, total: items.length,
    note: idSet ? "HR score, MOONSHOT's own ranking" : `this board's own ${type.toUpperCase()} ranking`,
  })
  return { ok: true, model: m, name: idSet ? 'watchlist' : `board-${type}`, day: b.win.card_date }
}

const CALL_MARKET = { TOP: ['hr', 'HR'], HR: ['hr', 'HR'], HIT: ['hit', 'HIT'], HRR: ['hrr', 'HRR'], CONTACT: ['tb', 'TB'] }
const marketOf = (p) => CALL_MARKET[String(p?.game_pick_role || '').split('/')[0].trim().toUpperCase()] || ['hr', 'HR']

async function mlbGame({ game, now }) {
  const b = await mlbBoard(now)
  if (!b.ok) return b
  const gm = groupGames(b.raws).find((g) => String(g.game_pk) === String(game))
  if (!gm) return miss('that game is not on tonight\'s MLB board')
  const picks = gm.players.filter((p) => String(p?.game_pick_role || '').trim()).sort(boardCompare).slice(0, 12)
  const items = picks.map((p, i) => {
    const [type, tag] = marketOf(p)
    const it = { ...mlbItem(p, i + 1, { boardOf: b.boardOf, score: (x) => scoreFor(x, type) }), tag: `· ${tag}` }
    const hr = nn(p?.actual_hr, 0), h = nn(p?.actual_hits, 0)
    if (hr > 0 || h > 0) it.result = { text: [hr > 0 ? `${hr} HR` : null, h > 0 ? `${h} H` : null].filter(Boolean).join(' · '), hot: hr > 0 }
    return it
  })
  const [away, home] = await Promise.all([clubOf('mlb', gm.away), clubOf('mlb', gm.home)])
  const m = await finishList('mlb', items, {
    kicker: 'GAME CARD', right: gm.lineup_confirmed ? 'lineups in' : 'projected', headLabel: 'SCORE', dayWord: prettyDay(b.win.card_date), lead: false, max: 8,
    banner: { away, home, when: etTime(gm.game_time), ...stripOf({ state: 'pre', line: dayTime(gm.game_time) }), proj: null }, empty: 'No designated picks in this game.', pool: items.map((i) => i.score).filter(Number.isFinite), poolMin: 4, total: items.length,
  })
  return { ok: true, model: m, name: `game-${gm.away}-${gm.home}`, day: b.win.card_date }
}

async function mlbPitcher({ id, now }) {
  const b = await mlbBoard(now)
  if (!b.ok) return b
  const pit = groupPitchers(b.raws).find((p) => String(p.pitcher_id) === String(id))
  if (!pit) return miss('that starter is not on tonight\'s MLB board')
  const lineup = pit.lineup.map((l) => b.raws.find((r) => String(r.player_id) === String(l.player_id))).filter(Boolean)
  const src = (k) => { for (const r of lineup) { const v = r?.[k]; if (v !== null && v !== undefined && v !== '') return v } return null }
  const tiles = pitcherTiles({
    era: nn(pit.pitcher_era ?? src('pitcher_era'), null), whip: nn(pit.pitcher_whip ?? src('pitcher_whip'), null), hr9: nn(src('pitcher_hr9'), null), k9: nn(src('pitcher_k9'), null),
    fbAllowed: nn(src('pitcher_fb_rate'), null), hhAllowed: nn(src('pitcher_hardhit_allowed'), null), brlAllowed: nn(src('pitcher_barrel_allowed'), null),
    l3hr9: nn(src('pitcher_l3_hr9'), null), l3n: nn(src('pitcher_l3_starts_found'), 0),
  }).map((t) => ({ label: t.label, value: t.value, hot: t.tone === 'hot', cold: t.tone === 'cold' }))
  const bat = [...lineup].sort((x, y) => nn(y?.hr_score, 0) - nn(x?.hr_score, 0))[0] || null
  const team = clean(pit.team, '')
  const [ppic, bpic, club] = await Promise.all([
    inline(mlbHeadshot(String(pit.pitcher_id), 480, { strict: true })), bat ? inline(mlbHeadshot(String(bat.player_id), 240, { strict: true })) : '', clubOf('mlb', team),
  ])
  const model = {
    sport: 'mlb', brand: brandOf('mlb'), name: clean(pit.pitcher_name, 'Unknown'), team, opp: clean(pit.opponent_team, ''), throws: clean(pit.pitcher_throws, '') === '?' ? '' : clean(pit.pitcher_throws, ''),
    weakSide: clean(src('pitcher_weak_side'), ''), face: ppic, logo: club.logo, logoPlate: club.logoPlate, tone: club.tone, dayWord: prettyDay(b.win.card_date), tiles,
    topBat: bat ? { name: nameOf(bat), team: clean(bat.team, ''), opp: clean(bat.opponent, ''), score: hrScore(bat), face: bpic, tone: teamPrimary(bat.team) } : null,
  }
  return { ok: true, model, name: `pitcher-${model.name}`, day: b.win.card_date }
}

async function mlbRecord({ now }) {
  const [meta, bt] = await Promise.all([fetchRunMeta('today').catch(() => null), fetch(backtestPaths()[0], { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)])
  const today = meta?.slate_date || easternDate(now)
  const rm = bt ? reportModel(bt, today) : null
  if (!rm) return miss('the season record file is not published right now', 502)
  const h = headline(rm)
  // the product's standout rule: the top ~20% of the column glows in the accent, the bottom ~20% recedes (with five categories: the best, the lowest)
  const kept = rm.rows.filter((r) => r.n > 0)
  const rates = kept.map((r) => r.base)
  const rows = kept.map((r) => ({ label: r.cat.label, pct: r.base, hot: kept.length > 2 && r.base === Math.max(...rates), cold: kept.length > 2 && r.base === Math.min(...rates), line: `${r.ok}/${r.n}${r.letter !== '—' ? ` · last night ${r.letter}` : ''}` }))
  const model = {
    sport: 'mlb', brand: brandOf('mlb'), right: `${rm.dates.length} GRADED DAY${rm.dates.length === 1 ? '' : 'S'}`, dayWord: prettyDay(rm.lastDate || today),
    seasonOk: h.seasonOk, seasonN: h.seasonN, seasonPct: h.seasonPct, lockOk: h.lockOk, lockN: h.lockN, lockPct: h.lockPct, rows,
    note: h.lockNights ? `${h.lockNights} night${h.lockNights === 1 ? '' : 's'} frozen at first pitch — a frozen pick is never revised` : 'own-bar rate, pooled across every graded night',
  }
  return { ok: true, model, name: 'track-record', day: today }
}

// ── TUDDY (NFL) ────────────────────────────────────────────────────────────
async function nflSlate(now) {
  return memo('nfl-slate', async () => {
    const [week, picks, gameCalls, results, logs, matchup] = await Promise.all([
      fetchNfl(nflSlatePaths(), nflSlateLooksReal).catch(() => null), fetchNfl(nflPicksPaths(), nflPicksLooksReal).catch(() => null),
      fetchNfl(nflGameCallsPaths()).catch(() => null), fetchNfl(nflResultsPaths()).catch(() => null), fetchNfl(nflLogPaths()).catch(() => null),
      fetchNfl(nflMatchupPaths(), nflMatchupLooksReal).catch(() => null),
    ])
    if (!week || !Array.isArray(week.games) || !week.games.length) return miss('no TUDDY week file')
    if (week.mode === 'preseason') return miss('preseason: the week file is not a regular-season board')
    const w = await loadWindows('nfl', now)
    const cands = []
    const seen = new Set()
    for (const win of w.ok ? w.windows : []) {
      const c = await loadCandidates('nfl', win, now, { all: true })
      for (const x of c.ok ? c.all : []) if (!seen.has(x.player_id)) { seen.add(x.player_id); cands.push(x) }
    }
    if (!cands.length) return miss('nobody is on the TUDDY board this week')
    const sameWeek = results && Number(results.season) === Number(week.season) && Number(results.week) === Number(week.week)
    return { ok: true, week, picks, gameCalls, results: sameWeek ? results : null, logs, matchup, cands, windows: w.ok ? w.windows : [] }
  })
}
async function nflRanked({ ids = null, now }) {
  const s = await nflSlate(now)
  if (!s.ok) return s
  const idSet = ids ? new Set(ids.map(String)) : null   // MY WATCHLIST: only the players the viewer pinned, in board order
  const list = [...s.cands].filter((c) => fin(c.score) != null && (!idSet || idSet.has(String(c.player_id)))).sort((a, b) => b.score - a.score)
  if (!list.length) return miss(idSet ? 'none of those players is on the TUDDY board' : 'nobody is scored on the TUDDY board')
  const items = list.map((c, i) => nflItem(c, i + 1, s))
  const jersey = new Map((s.week.players || []).map((p) => [String(p.player_id), p.jersey_number]))
  items[0].line = jersey.get(String(items[0].id)) ? `#${jersey.get(String(items[0].id))}` : ''
  const day = s.windows[0]?.card_date || easternDate(now)
  const m = await finishList('nfl', items, {
    kicker: idSet ? 'MY WATCHLIST' : 'RANKINGS · ANYTIME TD', right: idSet ? `${items.length} PLAYER${items.length === 1 ? '' : 'S'}` : `${items.length} RANKED`, headLabel: 'TD SCORE', scoreWord: 'TD SCORE', dayWord: `Week ${s.week.week}`, pool: s.cands.map((c) => c.score).filter((v) => fin(v) != null), total: items.length, identityCtx: { week: s.week, matchup: s.matchup },
    note: "TUDDY's own touchdown score, the whole week",
  })
  return { ok: true, model: m, name: idSet ? 'watchlist' : 'rankings-anytime-td', day }
}
async function nflGame({ game, now }) {
  const s = await nflSlate(now)
  if (!s.ok) return s
  const g = (s.week.games || []).find((x) => String(x.game_id) === String(game))
  if (!g) return miss('that game is not on this week\'s TUDDY slate')
  const when = g.completed ? `FINAL ${g.away_score ?? 0}–${g.home_score ?? 0}` : g.state === 'in' ? `${g.away_score ?? 0}–${g.home_score ?? 0} · ${g.detail || 'LIVE'}` : (g.kickoff ? `${etDay(g.kickoff)} ${etTime(g.kickoff)}` : '')
  const tot = slateTotals(s.week, s.logs)[g.game_id] || null
  const proj = tot && Number.isFinite(tot.awayTd) && Number.isFinite(tot.homeTd)
    ? { label: NFL_PROJ_LABEL, away: tot.awayTd.toFixed(1), home: tot.homeTd.toFixed(1), total: Number.isFinite(tot.total) ? tot.total.toFixed(1) : null } : null
  const on = s.cands.filter((c) => (c.team === g.home || c.team === g.away) && c.status !== 'off' && fin(c.score) != null)
    .sort((a, b) => (a.status === 'called' ? 0 : 1) - (b.status === 'called' ? 0 : 1) || b.score - a.score)
  const items = on.map((c, i) => nflItem(c, i + 1, s))
  const [away, home] = await Promise.all([clubOf('nfl', g.away), clubOf('nfl', g.home)])
  const day = g.kickoff ? easternDate(Date.parse(g.kickoff)) : easternDate(now)
  const m = await finishList('nfl', items, {
    kicker: 'GAME CARD', right: g.completed ? 'final' : 'calls set before kickoff', headLabel: 'TD SCORE', dayWord: prettyDay(day), lead: false, max: 8, total: items.length,
    banner: { away, home, when, ...stripOf({ state: g.completed ? 'final' : g.state === 'in' ? 'live' : 'pre', away: g.away_score, home: g.home_score, line: g.completed ? 'FINAL' : g.state === 'in' ? (g.detail || 'LIVE') : dayTime(g.kickoff) }), proj }, empty: 'No player in this game is on the board.', pool: items.map((i) => i.score).filter(Number.isFinite), poolMin: 4, identityCtx: { week: s.week, matchup: s.matchup },
  })
  return { ok: true, model: m, name: `game-${g.away}-${g.home}`, day }
}

/** One TUDDY pick for one market: pregame (the market's score, bar, rung) or graded (HIT / MISS / VOID, actual against the bar). Season/week pick a graded archive week. */
async function nflPick({ id, market = 'TD', season = null, week = null, mode = 'week', now }) {
  const s = await nflSlate(now)
  if (!s.ok) return s
  const spec = (s.week.markets || []).find((m) => m.key === market) || s.picks?.card?.[market] || null
  if (!spec) return miss(`no ${market} market`)
  const p = (s.week.players || []).find((x) => String(x.player_id) === String(id))
  let graded = null
  if (season && week) {
    const key = `${season}_${mode === 'preseason' ? 'p' : 'w'}${String(week).padStart(2, '0')}`
    const r = await fetch(`${NFL_DATA_BASE}/nfl_results_${season}_${key.split('_')[1]}.json`, { cache: 'no-store' }).then((x) => (x.ok ? x.json() : null)).catch(() => null)
    const rung = r?.card?.[market]?.rungs?.find((x) => String(x.player_id) === String(id))
    if (!rung) return miss('that graded pick is not in the published week')
    graded = { rung, bar: r.bars?.[market] ?? spec.bar }
  } else if (s.results?.card?.[market]?.rungs) {
    const rung = s.results.card[market].rungs.find((x) => String(x.player_id) === String(id))
    if (rung && rung.actual !== undefined) graded = { rung, bar: s.results.bars?.[market] ?? spec.bar }
  }
  const rungNow = (s.picks?.card?.[market]?.rungs || []).find((x) => String(x.player_id) === String(id)) || null
  const base = graded?.rung || p
  if (!base) return miss('that player is not on the TUDDY board')
  const team = base.team || p?.team
  const [pic] = await pics('nfl', [{ id, team, pos: base.position || p?.position }], { week: s.week, matchup: s.matchup })
  const status = graded ? 'called' : rungNow ? 'called' : null
  const isVoid = graded && graded.rung.actual == null
  const hit = graded ? (isVoid ? null : Boolean(graded.rung.hit)) : null
  const score = graded ? fin(graded.rung.score) : fin(p?.scores?.[market])
  const model = {
    sport: 'nfl', brand: brandOf('nfl'), name: base.name || p?.name, team, opp: base.opp || p?.opp || '', position: base.position || p?.position || '', number: fin(p?.jersey_number),
    marketLabel: spec.label || market, score, bar: fin(graded?.bar ?? spec.bar), rung: rungNow?.rank || graded?.rung?.rank || null, grade: (graded?.rung?.grade || rungNow?.grade) || null,
    flags: p?.questionable || base.questionable ? 'Q' : '', status, actual: graded && !isVoid ? fin(graded.rung.actual) : null,
    result: graded ? { word: isVoid ? 'VOID' : hit ? 'HIT' : 'MISS', hit, note: isVoid ? 'cut, inactive, or a bye' : '' } : null,
    face: pic?.face || '', logo: pic?.logo || '', logoPlate: Boolean(pic?.logoPlate), tone: pic?.tone || null,
    dayWord: prettyDay(easternDate(now)),
    footLine: graded ? "graded against the market's own bar" : 'a 0–100 rank within this market',
  }
  return { ok: true, model, name: `${graded ? 'result' : 'pick'}-${market.toLowerCase()}-${model.name}`, day: easternDate(now) }
}

// ── LAMP (NHL) ─────────────────────────────────────────────────────────────
const NHL_MARKET_WORD = { GOAL: 'GOAL', SOG: 'SHOTS 3+' }
const NHL_RESULT_WORD = { GOAL: 'G', SOG: 'SOG' }
const nhlCount = (r, market) => { const v = market === 'GOAL' ? r.goals : r.value; return Number.isFinite(v) ? v : null }
function nhlItem(r, g, rank, market) {
  const base = { rank, id: String(r.playerId), name: r.name, team: r.team, opp: r.opp, where: `${r.home ? 'vs' : '@'} ${r.opp}`, pos: r.pos, status: r.status, score: r.score }
  if (!g.graded || r.status === 'off') return base
  if (r.dressed === false) return { ...base, result: { text: 'VOID', hot: false }, miss: true }
  const c = nhlCount(r, market)
  if (c == null) return base
  return { ...base, result: { text: r.hit ? `${c} ${NHL_RESULT_WORD[market] || ''}`.trim() : 'MISS', hot: Boolean(r.hit) }, miss: !r.hit }
}
async function nhlBoard(date, market, proj) {
  const { readBoard } = await import('../nhl/boardRead')
  return readBoard(date, { market, proj })
}
async function nhlRanked({ market = 'GOAL', date = null, ids = null, now }) {
  if (!NHL_MARKET_WORD[market]) return miss(`no card for the ${market} board`)
  const day = date || await slateNight('nhl', now)
  const board = await nhlBoard(day, market, false)
  const idSet = ids ? new Set(ids.map(String)) : null   // MY WATCHLIST: only the skaters the viewer follows, in board order
  const all = board.games.flatMap((g) => g.rows.filter((r) => r.score != null && (!idSet || idSet.has(String(r.playerId)))).map((r) => ({ r, g })))
  if (!all.length) return miss(idSet ? 'none of those skaters is on that night\'s board' : 'no skater is scored on that night\'s board')
  all.sort((a, b) => (b.r.score ?? 0) - (a.r.score ?? 0))
  const items = all.slice(0, 9).map((x, i) => nhlItem(x.r, x.g, i + 1, market))
  const f = all[0].r
  const bits = []
  if (fin(f.legs?.shotsPg) != null) bits.push(`${Number(f.legs.shotsPg).toFixed(2)} S/GP`)
  if (fin(f.legs?.goalsPg) != null) bits.push(`${Number(f.legs.goalsPg).toFixed(2)} G/GP`)
  if (fin(f.legs?.toi) != null) { const t = Math.round(f.legs.toi); bits.push(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')} TOI`) }
  if (fin(f.ppg) != null) bits.push(`${f.ppg} PP G`)
  items[0].line = bits.join('  ·  ')
  const word = NHL_MARKET_WORD[market]
  const m = await finishList('nhl', items, {
    kicker: idSet ? 'MY WATCHLIST' : `RANKINGS · ${word}`, right: idSet ? `${all.length} SKATER${all.length === 1 ? '' : 'S'}` : `${all.length} RANKED`, headLabel: `${word} SCORE`, scoreWord: `${word} SCORE`, dayWord: prettyDay(day), pool: board.games.flatMap((g) => g.rows.map((r) => r.score)).filter(Number.isFinite), total: all.length,
    note: `LAMP's own ${word} score`,
  })
  return { ok: true, model: m, name: idSet ? 'watchlist' : `rankings-${word.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, day }
}
async function nhlGame({ game, date = null, now }) {
  const day = date || await slateNight('nhl', now)
  const board = await nhlBoard(day, 'GOAL', true)
  const g = board.games.find((x) => String(x.game.id) === String(game))
  if (!g) return miss('that game is not on that night\'s LAMP slate')
  const away = g.game.away.abbrev, home = g.game.home.abbrev
  const st = g.game.state
  const when = st === 'final' ? `FINAL ${g.game.away.score ?? 0}–${g.game.home.score ?? 0}` : st === 'live' ? (g.game.statusLine || 'LIVE') : etTime(g.game.startUtc)
  const p = g.proj
  const proj = p && Number.isFinite(p.away?.goals) && Number.isFinite(p.home?.goals)
    ? { label: NHL_PROJ_LABEL, away: p.away.goals.toFixed(1), home: p.home.goals.toFixed(1), total: Number.isFinite(p.total) ? p.total.toFixed(1) : null } : null
  const on = g.rows.filter((r) => r.status !== 'off' && r.score != null).sort((a, b) => (a.status === 'called' ? 0 : 1) - (b.status === 'called' ? 0 : 1) || (b.score ?? 0) - (a.score ?? 0))
  const items = on.map((r, i) => nhlItem(r, g, i + 1, 'GOAL'))
  const [ac, hc] = await Promise.all([clubOf('nhl', away), clubOf('nhl', home)])
  const m = await finishList('nhl', items, {
    kicker: 'GAME CARD', right: g.locked ? 'calls set' : g.setting ? 'calls setting' : 'a preview, not a call yet', headLabel: 'GOAL SCORE', dayWord: prettyDay(g.game.date || day), lead: false, max: 8, total: items.length,
    banner: { away: ac, home: hc, when, ...stripOf({ state: st === 'final' ? 'final' : st === 'live' ? 'live' : 'pre', away: g.game.away.score, home: g.game.home.score, line: st === 'final' ? 'FINAL' : st === 'live' ? (g.game.statusLine || 'LIVE') : dayTime(g.game.startUtc) }), proj }, empty: 'No skater in this game has played enough NHL games to be on the board.', pool: items.map((i) => i.score).filter(Number.isFinite), poolMin: 4,
  })
  return { ok: true, model: m, name: `game-${away}-${home}`, day: g.game.date || day }
}

// ── BUCKETS (NBA): hidden until BUCKETS_PUBLIC, then like LAMP ─────────────
async function nbaRanked({ market = 'pts', date = null, now }) {
  const { NBA_MARKETS } = await import('../nba/model')
  const { ACTUAL_WORD, LEG_LABEL, fmtLeg } = await import('../nba/legs')
  if (!NBA_MARKETS[market]) return miss(`no card for the ${market} board`)
  const day = date || await slateNight('nba', now)
  const { readNbaBoard } = await import('../nba/boardRead')
  const b = await readNbaBoard(day, market)
  const finals = new Set((b.games || []).filter((g) => g.state === 'final').map((g) => String(g.id)))
  const rows = b.rows.filter((r) => r.score != null).sort((a, c) => c.score - a.score)
  if (!rows.length) return miss('no player is scored on that night\'s BUCKETS board')
  const items = rows.slice(0, 9).map((r, i) => {
    const base = { rank: i + 1, id: String(r.playerId), name: r.name, team: r.team, opp: r.opp, where: `${r.home ? 'vs' : '@'} ${r.opp}`, pos: r.pos, status: r.status, score: r.score }
    if (!finals.has(String(r.gameId)) || r.status === 'off') return base
    if (r.voidReason) return { ...base, result: { text: 'VOID', hot: false }, miss: true }
    if (r.actual == null) return base
    const word = market === 'first' ? (r.hit ? 'YES' : 'NO') : `${r.actual} ${ACTUAL_WORD[market] || ''}`.trim()
    return { ...base, result: { text: r.hit ? word : 'MISS', hot: Boolean(r.hit) }, miss: !r.hit }
  })
  const f = rows[0]
  items[0].line = (NBA_MARKETS[market].legs || []).filter((l) => fin(f.legs?.[l]) != null).slice(0, 3).map((l) => `${fmtLeg(l, f.legs[l])} ${LEG_LABEL[l] || l}`).join('  ·  ')
  const word = NBA_MARKETS[market].label || market.toUpperCase()
  const m = await finishList('nba', items, {
    kicker: `RANKINGS · ${word}`, right: `${rows.length} RANKED`, headLabel: `${word} SCORE`, scoreWord: `${word} SCORE`, dayWord: prettyDay(day), pool: rows.map((r) => r.score), total: rows.length,
    note: `BUCKETS' own ${word} score`,
  })
  return { ok: true, model: m, name: `rankings-${String(word).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, day }
}
async function nbaGame({ game, market = 'pts', date = null, now }) {
  const { NBA_MARKETS } = await import('../nba/model')
  const { ACTUAL_WORD } = await import('../nba/legs')
  if (!NBA_MARKETS[market]) return miss(`no card for the ${market} board`)
  const day = date || await slateNight('nba', now)
  const { readNbaBoard } = await import('../nba/boardRead')
  const { teamModelRows } = await import('../nba/teamModelRead')
  const { EXPECTED_POINTS_WORDS } = await import('../nba/teamModel')
  const [b, tmAll] = await Promise.all([readNbaBoard(day, market), teamModelRows(day).catch(() => null)])
  const g = (b.games || []).find((x) => String(x.id) === String(game))
  if (!g) return miss('that game is not on that night\'s BUCKETS slate')
  const final = g.state === 'final'
  const when = final ? `FINAL ${g.away.score ?? 0}–${g.home.score ?? 0}` : g.state === 'live' ? (g.detail || 'LIVE') : etTime(g.start)
  const tm = (tmAll?.games || tmAll?.rows || []).find?.((x) => String(x.gameId ?? x.id) === String(game)) || null
  const proj = tm && fin(tm.away?.pts) != null && fin(tm.home?.pts) != null
    ? { label: EXPECTED_POINTS_WORDS.toUpperCase(), away: tm.away.pts.toFixed(1), home: tm.home.pts.toFixed(1), total: fin(tm.total) != null ? Number(tm.total).toFixed(1) : null } : null
  const on = b.rows.filter((r) => String(r.gameId) === String(game) && r.status !== 'off' && r.score != null).sort((a, c) => (a.status === 'called' ? 0 : 1) - (c.status === 'called' ? 0 : 1) || c.score - a.score)
  const items = on.map((r, i) => {
    const base = { rank: i + 1, id: String(r.playerId), name: r.name, team: r.team, opp: r.opp, where: `${r.home ? 'vs' : '@'} ${r.opp}`, pos: r.pos, status: r.status, score: r.score }
    if (!final) return base
    if (r.voidReason) return { ...base, result: { text: 'VOID', hot: false }, miss: true }
    if (r.actual == null) return base
    const word = market === 'first' ? (r.hit ? 'YES' : 'NO') : `${r.actual} ${ACTUAL_WORD[market] || ''}`.trim()
    return { ...base, result: { text: r.hit ? word : 'MISS', hot: Boolean(r.hit) }, miss: !r.hit }
  })
  const locked = b.rows.some((r) => String(r.gameId) === String(game)) && b.rows.filter((r) => String(r.gameId) === String(game)).every((r) => r.locked !== false)
  const [ac, hc] = await Promise.all([clubOf('nba', g.away.abbrev), clubOf('nba', g.home.abbrev)])
  const m = await finishList('nba', items, {
    kicker: 'GAME CARD', right: `${NBA_MARKETS[market].label || market} · ${locked ? 'calls set' : 'a preview, not a call yet'}`, headLabel: 'SCORE', dayWord: prettyDay(day), lead: false, max: 8, total: items.length,
    banner: { away: ac, home: hc, when, ...stripOf({ state: final ? 'final' : g.state === 'live' ? 'live' : 'pre', away: g.away.score, home: g.home.score, line: final ? 'FINAL' : g.state === 'live' ? (g.detail || 'LIVE') : dayTime(g.start) }), proj }, empty: 'Nobody in this game has ten NBA games on file to be on the board.', pool: items.map((i) => i.score).filter(Number.isFinite), poolMin: 4,
  })
  return { ok: true, model: m, name: `game-${g.away.abbrev}-${g.home.abbrev}`, day }
}


/** One BUCKETS player for one market (the player page's 📸): his score and the legs it is made of, and once his game is final the result. */
async function nbaPick({ id, market = 'pts', date = null, now }) {
  const { NBA_MARKETS } = await import('../nba/model')
  const { ACTUAL_WORD, LEG_LABEL, fmtLeg } = await import('../nba/legs')
  if (!NBA_MARKETS[market]) return miss(`no card for the ${market} board`)
  const day = date || await slateNight('nba', now)
  const { readNbaBoard } = await import('../nba/boardRead')
  const b = await readNbaBoard(day, market)
  const r = b.rows.find((x) => String(x.playerId) === String(id))
  if (!r) return miss('that player is not on that night\'s BUCKETS board')
  const g = (b.games || []).find((x) => String(x.id) === String(r.gameId))
  const final = g?.state === 'final'
  const [pic] = await pics('nba', [{ id: r.playerId, team: r.team, pos: r.pos }])
  const legs = (NBA_MARKETS[market].legs || []).filter((l) => fin(r.legs?.[l]) != null).slice(0, 3).map((l) => ({ label: LEG_LABEL[l] || l, value: fmtLeg(l, r.legs[l]) }))
  const isVoid = final && Boolean(r.voidReason)
  const done = final && !isVoid && r.actual != null
  const word = NBA_MARKETS[market].label || market.toUpperCase()
  const model = {
    sport: 'nba', brand: brandOf('nba'), name: r.name, team: r.team, opp: r.opp, position: r.pos || '', number: null, marketLabel: word,
    score: r.score, status: r.status, tiles: [r.score != null ? { label: `${word} SCORE`.toUpperCase(), value: String(Math.round(r.score)), hot: r.score >= 80 } : null, ...legs].filter(Boolean),
    actual: done ? fin(r.actual) : null, bar: null,
    result: isVoid ? { word: 'VOID', hit: null, note: 'did not play' } : done ? { word: r.hit ? 'HIT' : 'MISS', hit: Boolean(r.hit), note: ACTUAL_WORD[market] ? `${r.actual} ${ACTUAL_WORD[market]}` : '' } : null,
    face: pic?.face || '', logo: pic?.logo || '', logoPlate: Boolean(pic?.logoPlate), tone: null, dayWord: prettyDay(day),
    footLine: final ? 'graded on the box score' : 'a 0–100 rank among tonight\'s players',
  }
  return { ok: true, model, name: `${String(r.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, day }
}

// ── THE POSTSEASON EDITIONS ────────────────────────────────────────────────
async function mlbPostseason({ now, id, season, side, group }) {
  const { loadPostseasonPlayer } = await import('./postseasonData')
  const r = await loadPostseasonPlayer({ id, season, group: group || null, now })
  return r.ok ? { ...r, model: { ...r.model, side: side || 'front' } } : r
}
async function mlbSeries({ now, team, season }) {
  const { loadSeriesEdition } = await import('./postseasonData')
  return loadSeriesEdition({ code: team, season, now })
}

// ── THE ONE ENTRY ──────────────────────────────────────────────────────────
const LOADERS = {
  ranked: { mlb: mlbRanked, nfl: nflRanked, nhl: nhlRanked, nba: nbaRanked },
  game: { mlb: mlbGame, nfl: nflGame, nhl: nhlGame, nba: nbaGame },
  pitcher: { mlb: mlbPitcher },
  pick: { nfl: nflPick, nba: nbaPick },
  record: { mlb: mlbRecord },
  // THE POSTSEASON EDITIONS (2026-10-12): MLB only, public stats only (lib/cards/postseasonData.js). postseason = one player (&id= the MLB id, &side=front|back, &group=hitting|pitching), series = one club's run (&team=NYY).
  postseason: { mlb: mlbPostseason },
  series: { mlb: mlbSeries },
}
/** { ok:true, kind, model, name, day } | { ok:false, status, why }. `q` is a plain object of the request's parameters. */
export async function loadShareModel(kind, sport, q = {}, now = Date.now()) {
  if (!SHARE_KINDS.includes(kind)) return miss('unknown card kind', 400)
  if (!SHARE_SPORTS.includes(sport)) return miss('no cards for that sport')
  const fn = LOADERS[kind]?.[sport]
  if (!fn) return miss(`no ${kind} card for ${sport}`)
  const str = (k, re, fb = null) => { const v = q[k]; return v == null || v === '' ? fb : re.test(String(v)) ? String(v) : false }
  const date = str('date', DATE)
  const ids = str('ids', ID_LIST)
  const id = str('id', /^[A-Za-z0-9_.-]{1,24}$/)
  const game = str('game', /^[A-Za-z0-9_-]{1,24}$/)
  const market = str('market', /^[A-Za-z0-9_]{1,12}$/)
  const type = str('type', /^[a-z]{2,8}$/)
  const season = str('season', /^\d{4}$/)
  const week = str('week', /^\d{1,2}$/)
  const mode = str('mode', /^(week|preseason)$/)
  if ([date, ids, id, game, market, type, season, week, mode].includes(false)) return miss('bad parameter', 400)
  const teamQ = str('team', /^[A-Za-z]{2,3}$/)
  const side = str('side', /^(front|back)$/)
  const group = str('group', /^(hitting|pitching)$/)
  if ([teamQ, side, group].includes(false)) return miss('bad parameter', 400)
  if ((kind === 'pitcher' || kind === 'pick' || kind === 'postseason') && !id) return miss('an id is needed', 400)
  if (kind === 'series' && !teamQ) return miss('a club code is needed', 400)
  if (kind === 'game' && !game) return miss('a game id is needed', 400)
  try {
    const r = await fn({ now, date, ids: ids ? ids.split(',') : null, id, game, market: market ? (MARKET_CASE[sport] || ((m) => m.toUpperCase()))(market) : undefined, type: type || undefined, season, week, mode: mode || 'week', team: teamQ || undefined, side: side || undefined, group: group || undefined })
    return r.ok ? { ...r, kind } : r
  } catch (e) {
    console.error(`[share] ${kind}/${sport}: ${e?.message || e}`)
    return miss('the source did not answer', 502)
  }
}
