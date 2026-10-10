// SHADOW MODELS, MEASURED (BATCH-MODEL-V2 "PROVE IT", 2026-10-03). For /admin:
// each logged-only model's called picks, graded -- n, hits, rate with a 95%
// range -- beside the live model on the same nights and the base rate of
// every graded row in that market. Nothing here is public, and nothing
// switches on from it automatically: a shadow goes live only as a new
// model_version when its range clears the live one (Donovan's rule).
// Reads only called rows' `hit` (paged) plus head counts, so it stays small.
import { readPaged } from './record/paged'
import { VERSIONS } from './nhl/versions'
import { NBA_MARKETS, NBA_SHADOWS } from './nba/model'
import { readNhlRecords } from './record/nhl'
import { pricesFromRows, impliedOf, winProfit, priceKey } from './odds/priceAtLock'
import { valueCalls, VALUE_VERSION, VALUE_RULE } from './model/valueCall'
import { callStatus } from './callStatus'

const ci = (h, n) => (n ? 196 * Math.sqrt((h / n) * (1 - h / n) / n) : null)   // ±, in points
const line = (h, n) => ({ n, hit: h, pct: n ? Math.round((1000 * h) / n) / 10 : null, pm: n ? Math.round(10 * ci(h, n)) / 10 : null })

async function calledHits(db, table, { market = null, versions, since = null, statuses = ['called'] }) {
  const { data, error } = await readPaged(() => {
    let q = db.from(table).select('game_id, player_id, hit').in('model_version', versions).in('status', statuses).not('graded_at', 'is', null).not('hit', 'is', null)
    if (market) q = q.eq('market', market)
    if (since) q = q.gte('game_date', since)
    return q.order('game_id', { ascending: true }).order('player_id', { ascending: true })
  })
  if (error) throw new Error(error.message)
  return data
}
async function baseRate(db, table, { market = null, versions, since = null }) {
  const head = (hit) => {
    let q = db.from(table).select('player_id', { head: true, count: 'exact' }).in('model_version', versions).not('graded_at', 'is', null)
    q = hit ? q.eq('hit', true) : q.not('hit', 'is', null)
    if (market) q = q.eq('market', market)
    if (since) q = q.gte('game_date', since)
    return q
  }
  const [all, hits] = await Promise.all([head(false), head(true)])
  if (all.error || hits.error) throw new Error((all.error || hits.error).message)
  return line(hits.count || 0, all.count || 0)
}

// AGAINST THE BOOK (BATCH-MODEL-V2 M3, 2026-10-03): a call that clears a soft
// bar is not edge. For a graded call with the book's LOCK line on file
// (odds_lines, snap 'lock', the fair = no-vig line and price): did he clear
// OUR bar, did he beat THE BOOK'S line (actual > its line), and what the
// book's no-vig price said the chance of the over was. American -> p.
const pOf = (o) => (o == null ? null : o < 0 ? -o / (-o + 100) : 100 / (o + 100))
export async function readVsBook(db, { table, market, oddsMarket, sport, versions, bar }) {
  const { data: calls, error } = await readPaged(() => db.from(table).select('game_date, player_id, value, hit').eq('market', market).in('model_version', versions)
    .eq('status', 'called').not('graded_at', 'is', null).not('hit', 'is', null).order('game_date', { ascending: true }).order('player_id', { ascending: true }))
  if (error) throw new Error(error.message)
  if (!calls.length) return { n: 0 }
  const days = [...new Set(calls.map((c) => c.game_date))]
  const { data: lines, error: le } = await readPaged(() => db.from('odds_lines').select('game_date, our_player_id, fair_line, fair_odds, line, odds').eq('sport', sport).eq('market', oddsMarket)
    .eq('snap', 'lock').in('game_date', days).not('our_player_id', 'is', null).order('game_date', { ascending: true }).order('our_player_id', { ascending: true }))
  if (le) throw new Error(le.message)
  const by = new Map(lines.map((l) => [`${l.game_date}|${l.our_player_id}`, l]))
  let n = 0, cleared = 0, beat = 0, pSum = 0, pN = 0
  for (const c of calls) {
    const l = by.get(`${c.game_date}|${c.player_id}`)
    if (!l) continue
    const ln = l.fair_line ?? l.line
    if (ln == null) continue
    n++
    if (c.hit) cleared++
    if (Number(c.value) > Number(ln)) beat++
    const p = pOf(l.fair_odds ?? l.odds)
    if (p != null && Number(ln) === bar - 0.5) { pSum += p; pN++ }
  }
  return { calls: calls.length, n, cleared: line(cleared, n), beat: line(beat, n), bookP: pN ? Math.round((1000 * pSum) / pN) / 10 : null, bookPn: pN }
}

// THE VALUE CALL, GRADED (BATCH-MODEL-V2 M4, 2026-10-03). LAMP first: the
// only sport with both inputs frozen before the game -- every skater's locked
// score + status (lamp_goal_log, never rewritten) and every book's anytime-
// goal price at the lock snapshot (odds_snap, 5-15 min before puck drop). So
// the call is computed on read (lib/model/valueCall.js) with no table of its
// own; a price row counts only if it was taken before its game started.
// Beside it: the live model's CALLED picks on the same priced games -- the
// chalk it is meant to fix. Void (didn't dress) and ungraded rows are out.
const ODDS_SINCE = '2026-09-27'   // first odds_snap capture (NHL and NFL)
function priced(picks) {
  let hit = 0, imp = 0, roiMed = 0, roiBest = 0
  for (const p of picks) {
    imp += p.implied
    if (p.result === 'hit') { hit++; roiMed += winProfit(p.price.median); roiBest += winProfit(p.price.best) } else { roiMed -= 1; roiBest -= 1 }
  }
  const n = picks.length
  const r1 = (x) => Math.round(10 * x) / 10
  return { ...line(hit, n), implied: n ? r1((100 * imp) / n) : null, roiMed: n ? r1((100 * roiMed) / n) : null, roiBest: n ? r1((100 * roiBest) / n) : null }
}
/** Pure: graded records + lock prices -> { value, called, games, withCall, picks }. Exported for the check script. */
export function gradeValueCalls(records, prices, sport = 'nhl') {
  const byGame = new Map()
  for (const r of records) {
    if (r.result !== 'hit' && r.result !== 'miss') continue
    const price = prices.get(priceKey(sport, r.game_date, r.player_id))
    if (!price || !Number.isInteger(price.median)) continue
    if (!byGame.has(r.game_id)) byGame.set(r.game_id, [])
    byGame.get(r.game_id).push({ ...r, score: r.score == null ? NaN : Number(r.score), implied: impliedOf(price.median), price })
  }
  const games = [...byGame].map(([game_id, players]) => ({ game_id, players }))
  const calls = valueCalls(games)
  const picks = calls.filter((c) => c.pick).map((c) => c.pick)
  const called = games.flatMap((g) => g.players.filter((p) => p.status === 'called'))
  return { value: priced(picks), called: priced(called), games: games.length, withCall: picks.length, picks }
}
// The same rule on the goalpos shadow (lamp-goalpos-v1, ice time ranked within
// position): on the live board the value call lands on defencemen -- the TOI
// leg's known lean (they log the most minutes; the books price them long for
// a reason). That bias is the model's to fix, not the value rule's, so both
// tracks are graded and each says how many of its calls were defencemen.
const isD = (pos) => String(pos || '').toUpperCase().startsWith('D')
async function goalPosRecords(db) {
  const { data, error } = await readPaged(() => db.from('lamp_prop_log')
    .select('game_id, game_date, game_type, player_id, name, team, pos, score, status, hit, graded_at')
    .eq('market', 'GOAL').in('model_version', VERSIONS.goalpos).not('graded_at', 'is', null).neq('game_type', 1)
    .order('game_date', { ascending: true }).order('game_id', { ascending: true }).order('player_id', { ascending: true }))
  if (error) throw new Error(error.message)
  return data.map((r) => ({ ...r, result: r.hit == null ? 'void' : r.hit ? 'hit' : 'miss' }))
}
/** Pure: only price rows read before their game started (no start or no read time = out). */
export const beforeStart = (rows) => rows.filter((r) => r.taken_at && r.starts_at && Date.parse(r.taken_at) < Date.parse(r.starts_at))
async function lockPricesBeforeStart(db, sport, market, since) {
  const { data, error } = await readPaged(() => db.from('odds_snap')
    .select('sport, event_id, game_date, our_player_id, book, odds, available, fair_odds, open_odds, taken_at, starts_at')
    .eq('sport', sport).eq('market', market).eq('snap', 'lock').gte('game_date', since).not('our_player_id', 'is', null)
    .order('game_date', { ascending: true }).order('event_id', { ascending: true }).order('odd_id', { ascending: true }).order('book', { ascending: true }))
  if (error) throw new Error(error.message)
  const pre = beforeStart(data)
  return { prices: pricesFromRows(pre).prices, dropped: data.length - pre.length }
}
export async function readValueNhl(db) {
  const { rows, error } = await readNhlRecords(db, { since: ODDS_SINCE, graded: true })
  if (error) throw new Error(error.message)
  const { prices, dropped } = await lockPricesBeforeStart(db, 'nhl', 'goal', ODDS_SINCE)
  const track = (recs) => { const t = gradeValueCalls(recs, prices); return { ...t, dCalls: t.picks.filter((p) => isD(p.pos)).length } }
  return { version: VALUE_VERSION, rule: VALUE_RULE, dropped, live: track(rows), goalpos: track(await goalPosRecords(db)) }
}

// NFL (2026-10-03): TUDDY's TD board as frozen at each game's lock
// (board_lock, lib/boardLock.js) against the anytime-TD lock prices. Fills
// from the first NFL lock after the board_lock SQL ran; before that, empty.
export async function readValueNfl(db) {
  const { data, error } = await readPaged(() => db.from('board_lock')
    .select('game_id, game_date, player_id, name, team, pos, score, status, result, graded_at')
    .eq('sport', 'nfl').not('graded_at', 'is', null)
    .order('game_date', { ascending: true }).order('game_id', { ascending: true }).order('player_id', { ascending: true }))
  if (error) throw new Error(error.message)
  const { prices, dropped } = await lockPricesBeforeStart(db, 'nfl', 'td', ODDS_SINCE)
  const t = gradeValueCalls(data, prices, 'nfl')
  return { version: VALUE_VERSION, rule: VALUE_RULE, dropped, live: t }
}

// MLB (2026-10-03): the bot's locked pregame rows (por_rows_<date>.jsonl,
// written as each game reaches first pitch, never rewritten) against the
// anytime-HR lock prices. Status from lib/callStatus.js on the row's own role,
// board_rank and board_of -- board_of is logged from bot d6ae2ece on, so a
// night is graded from MLB_BOARD_OF_SINCE; a row with no role and no n is
// left out, never guessed. Graded off each game's final box (statsapi):
// 1+ HR = hit, no plate appearance = void, not final = not graded.
const POR = 'https://raw.githubusercontent.com/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT/data/public/data/current'
export const MLB_BOARD_OF_SINCE = '2026-10-04'
const BOX_FIELDS = 'gameData,status,abstractGameState,liveData,boxscore,teams,away,home,players,id,stats,batting,plateAppearances,homeRuns'

/** Pure: one game's slim live feed -> { final, byId: Map(id -> { pa, hr }) }. */
export function boxLines(feed) {
  const byId = new Map()
  for (const side of ['away', 'home']) {
    for (const [k, p] of Object.entries(feed?.liveData?.boxscore?.teams?.[side]?.players || {})) {
      const id = String(p?.person?.id ?? k.replace(/^ID/, ''))
      const b = p?.stats?.batting || {}
      byId.set(id, { pa: Number(b.plateAppearances) || 0, hr: Number(b.homeRuns) || 0 })
    }
  }
  return { final: feed?.gameData?.status?.abstractGameState === 'Final', byId }
}
/** Pure: por_rows + final boxes (Map pk -> boxLines) -> records in gradeValueCalls' shape. */
export function mlbRecordsFromPor(rows, boxes) {
  const seen = new Set()
  const out = []
  for (const r of rows) {
    const pk = String(r?.game_pk ?? ''), id = String(r?.player_id ?? '')
    if (!pk || !id || seen.has(`${pk}|${id}`)) continue
    seen.add(`${pk}|${id}`)
    const role = String(r.game_pick_role || '').trim()
    const rank = Number(r.scores?.board_rank), of = Number(r.scores?.board_of)
    if (!role && !(rank > 0 && of > 0)) continue          // can't be labelled: out
    const box = boxes.get(pk)
    if (!box?.final) continue                            // not graded yet
    const line = box.byId.get(id)
    out.push({
      game_id: pk, game_date: r.prediction_date, player_id: id, name: r.player, team: r.team, pos: null,
      score: Number(r.scores?.hr), status: callStatus({ role, board_rank: rank, board_of: of, on_board: true }),
      result: !line || line.pa === 0 ? 'void' : line.hr > 0 ? 'hit' : 'miss',
    })
  }
  return out
}
const jsonl = (t) => t.split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)] } catch { return [] } })
export async function readValueMlb(db, { today }) {
  const dates = []
  for (let t = Date.parse(`${MLB_BOARD_OF_SINCE}T12:00:00Z`); t <= Date.parse(`${today}T12:00:00Z`); t += 864e5) dates.push(new Date(t).toISOString().slice(0, 10))
  const rows = (await Promise.all(dates.map((d) => fetch(`${POR}/por_rows_${d}.jsonl`, { next: { revalidate: 3600 } })
    .then((r) => (r.ok ? r.text() : '')).then(jsonl).catch(() => [])))).flat()
  const pks = [...new Set(rows.map((r) => String(r.game_pk ?? '')).filter(Boolean))]
  const boxes = new Map(await Promise.all(pks.map((pk) => fetch(`https://statsapi.mlb.com/api/v1.1/game/${pk}/feed/live?fields=${BOX_FIELDS}`, { next: { revalidate: 3600 } })
    .then((r) => (r.ok ? r.json() : null)).then((j) => [pk, j ? boxLines(j) : null]).catch(() => [pk, null]))))
  const { prices, dropped } = await lockPricesBeforeStart(db, 'mlb', 'hr', MLB_BOARD_OF_SINCE)
  return { version: VALUE_VERSION, rule: VALUE_RULE, dropped, nights: dates.length, live: gradeValueCalls(mlbRecordsFromPor(rows, boxes), prices, 'mlb') }
}

/** [{ key, label, what, shadow, live?, base, since, note }] -- one entry per shadow. */
export async function readShadows(db) {
  const out = []
  // LAMP lamp-goalpos-v1 vs the live goal board, on the nights the shadow ran
  try {
    const sh = await calledHits(db, 'lamp_prop_log', { market: 'GOAL', versions: VERSIONS.goalpos })
    const games = new Set(sh.map((r) => r.game_id))
    const live = games.size ? (await calledHits(db, 'lamp_goal_log', { versions: VERSIONS.goal })).filter((r) => games.has(r.game_id)) : []
    out.push({ key: 'lamp-goalpos', label: 'LAMP goal · ice time within position', what: 'lamp-goalpos-v1 vs the live goal board (lamp-goal), same games',
      shadow: line(sh.filter((r) => r.hit).length, sh.length), live: line(live.filter((r) => r.hit).length, live.length), base: await baseRate(db, 'lamp_prop_log', { market: 'GOAL', versions: VERSIONS.goalpos }), note: 'called = 1+ goal' })
  } catch (e) { out.push({ key: 'lamp-goalpos', label: 'LAMP goal · ice time within position', error: e.message }) }
  // LAMP lamp-goalw-v1 (the live legs, fitted weights + a defence flag; .claude-notes/LAMP-GOALW-DEFINITION.md) vs the live
  // goal board on the games it locked: CALLED, then CALLED + ON THE BOARD (the promotion test reads the second line)
  try {
    const W = { market: 'GOAL', versions: VERSIONS.goalw }
    const both = ['called', 'board']
    const sh = await calledHits(db, 'lamp_prop_log', W)
    const games = new Set(sh.map((r) => r.game_id))
    const live = games.size ? (await calledHits(db, 'lamp_goal_log', { versions: VERSIONS.goal })).filter((r) => games.has(r.game_id)) : []
    out.push({ key: 'lamp-goalw', label: 'LAMP goal · weighted legs + defence flag', what: 'lamp-goalw-v1 vs the live goal board (lamp-goal), same games',
      shadow: line(sh.filter((r) => r.hit).length, sh.length), live: line(live.filter((r) => r.hit).length, live.length), base: await baseRate(db, 'lamp_prop_log', W), note: 'called = 1+ goal' })
    const shB = await calledHits(db, 'lamp_prop_log', { ...W, statuses: both })
    const liveB = games.size ? (await calledHits(db, 'lamp_goal_log', { versions: VERSIONS.goal, statuses: both })).filter((r) => games.has(r.game_id)) : []
    out.push({ key: 'lamp-goalw-board', label: 'LAMP goal · weighted, CALLED + ON THE BOARD', what: 'lamp-goalw-v1 vs the live goal board (lamp-goal), same games: the promotion test',
      shadow: line(shB.filter((r) => r.hit).length, shB.length), live: line(liveB.filter((r) => r.hit).length, liveB.length), base: await baseRate(db, 'lamp_prop_log', W), note: 'called or on the board = 1+ goal' })
  } catch (e) { out.push({ key: 'lamp-goalw', label: 'LAMP goal · weighted legs + defence flag', error: e.message }) }
  // BUCKETS PTS 25+ with this season's minutes (M2): vs the live PTS board's
  // called picks on the games the shadow locked (fills from opening night)
  try {
    const S = NBA_SHADOWS.pts
    const sh = await calledHits(db, 'buckets_log', { market: S.market, versions: [S.version] })
    const games = new Set(sh.map((r) => r.game_id))
    const live = games.size ? (await calledHits(db, 'buckets_log', { market: 'pts', versions: [NBA_MARKETS.pts.version] })).filter((r) => games.has(r.game_id)) : []
    out.push({ key: 'buckets-pts-mincur', label: "BUCKETS PTS 25+ · this season's minutes", what: `${S.version} vs the live PTS board (${NBA_MARKETS.pts.version}), same games`,
      shadow: line(sh.filter((r) => r.hit).length, sh.length), live: line(live.filter((r) => r.hit).length, live.length), base: await baseRate(db, 'buckets_log', { market: S.market, versions: [S.version] }), note: 'called = 25+ points' })
  } catch (e) { out.push({ key: 'buckets-pts-mincur', label: 'BUCKETS PTS · minutes shadow', error: e.message }) }
  for (const [m, key, bar] of [['PTS', 'pts', '1+ point'], ['AST', 'ast', '1+ assist']]) {
    try {
      const sh = await calledHits(db, 'lamp_prop_log', { market: m, versions: VERSIONS[key] })
      out.push({ key: `lamp-${key}`, label: `LAMP ${m === 'PTS' ? 'points' : 'assists'} (shadow market)`, what: `${VERSIONS[key].join(' + ')} called picks vs every graded skater`,
        shadow: line(sh.filter((r) => r.hit).length, sh.length), base: await baseRate(db, 'lamp_prop_log', { market: m, versions: VERSIONS[key] }), note: `called = ${bar}` })
    } catch (e) { out.push({ key: `lamp-${key}`, label: `LAMP ${m}`, error: e.message }) }
  }
  return out
}
