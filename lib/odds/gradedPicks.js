// GRADED PICKS, PRICED (odds plan step 3 prep, 2026-09-27). Server only.
//
// Every graded pick -- hits AND misses, which is what an ROI needs -- in one
// shape, joined to its lock price (lib/odds/priceAtLock.js). Grading is
// reused, never redone (the plan's rule):
//
//   MLB  graded_results_<date>.json on the bot's data branch: graded_slots,
//        one per pick category (lib/graded.js explains the doubles). One HR
//        price per PLAYER, so slots merge per player: his roles joined, got_hr
//        OR'd. Status from lib/callStatus.js on those roles. `hrCall` marks the
//        TOP / HR roles -- the calls whose market IS the home run (see
//        lib/dash/mlbhr.js mayClaimHomer); a HIT or CONTACT call's HR price is
//        in the table but is not that call's own market.
//        Not final = not graded. No plate appearance = void.
//   NFL  nfl_results_<season>_wNN.json: card.TD.rungs, the week's designated
//        TD calls, hit true/false (null = not graded yet). CALLED only -- the
//        week's full board is not archived with its scores, so there is no
//        ON THE BOARD population to grade. Five calls a week.
//   NHL  lamp_goal_log via lib/record/nhl.js readNhlRecords (graded, regular
//        season and playoffs; preseason stays out, the record's own rule).
//
// THE JOIN. MLB and NHL: sport + the game's own date + our player id. NFL's
// results file carries no game date, so a call is joined to the one lock
// price that player has in the seven days up to the file's graded_at; two
// prices in that window = ambiguous, left unpriced.
import { callStatus } from '../callStatus'
import { readNhlRecords } from '../record/nhl'
import { readNbaRecords } from '../record/nba'
import { NBA_MARKETS } from '../nba/model'
import { readLockPrices, priceKey } from './priceAtLock'
import { readPaged } from '../record/paged'

const DATA = 'https://raw.githubusercontent.com/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT/data/public/data/current'
const HR_CALL = /\b(TOP|HR)\b/

const getJson = async (url) => {
  try {
    const r = await fetch(url, { cache: 'no-store' })
    return r.ok ? await r.json() : null
  } catch { return null }
}
const days = (since, until) => {
  const out = []
  for (let t = Date.parse(`${since}T12:00:00Z`); t <= Date.parse(`${until}T12:00:00Z`); t += 864e5) out.push(new Date(t).toISOString().slice(0, 10))
  return out
}

/** Pure: one graded file -> one pick per player. Exported for tests. */
export function mlbPicksFromGraded(date, payload) {
  const by = new Map()
  for (const s of payload?.graded_slots || []) {
    if (s?.player_id == null) continue
    const id = String(s.player_id)
    const p = by.get(id) || { sport: 'mlb', game_date: date, player_id: id, name: s.name, team: s.team, roles: new Set(), final: true, pa: 0, hr: 0 }
    for (const r of String(s.game_pick_role || '').split('/')) if (r.trim()) p.roles.add(r.trim().toUpperCase())
    p.final = p.final && Boolean(s.is_final)
    p.pa = Math.max(p.pa, Number(s.plate_appearances) || 0)
    p.hr = Math.max(p.hr, Number(s.actual_hr) || 0, s.got_hr ? 1 : 0)
    by.set(id, p)
  }
  return [...by.values()].map((p) => {
    const role = [...p.roles].join('/')
    return {
      sport: 'mlb', game_date: p.game_date, player_id: p.player_id, name: p.name, team: p.team, role,
      status: callStatus({ role, on_board: true }),   // on the graded sheet = on the board
      hrCall: HR_CALL.test(role),
      result: !p.final ? null : p.pa === 0 ? 'void' : p.hr > 0 ? 'hit' : 'miss',
    }
  })
}

/** Pure: one NFL results file -> its TD calls. */
export function nflPicksFromResults(payload) {
  const graded = String(payload?.graded_at || '').slice(0, 10) || null
  return (payload?.card?.TD?.rungs || []).map((r) => ({
    sport: 'nfl', game_date: null, graded_date: graded, week: payload.week, player_id: String(r.player_id), name: r.name, team: r.team,
    status: 'called', result: r.hit === true ? 'hit' : r.hit === false ? 'miss' : null,
  }))
}

// ── THE CARD AGAINST THE BOOK'S LINE (2026-09-27, TUDDY depth step 1) ─────
// The TD rungs price off odds_snap. The other six markets' lines have been
// saved at lock in odds_lines since e3d4f99 (first NFL lock rows 09-27). The
// card's BAR (e.g. 40+ receiving yards) is not the BOOK's line (e.g. 52.5),
// so this is a different question, graded on its own and never mixed with
// "did he clear our bar": did he go OVER the book's line at lock, and what
// would the over have paid at the lock price.
export const NFL_LINE_MARKETS = { REC_YDS: 'rec_yds', REC: 'rec', RUSH_YDS: 'rush_yds', RUSH_ATT: 'rush_att', PASS_YDS: 'pass_yds', KICK_PTS: 'kick_pts' }

/** Pure: one NFL results file -> its non-TD rungs with the stat he put up. */
export function nflLineRungsFromResults(payload) {
  const graded = String(payload?.graded_at || '').slice(0, 10) || null
  const out = []
  for (const [mk, line] of Object.entries(NFL_LINE_MARKETS)) {
    for (const r of payload?.card?.[mk]?.rungs || []) {
      out.push({
        sport: 'nfl', market: mk, lineMarket: line, week: payload.week, graded_date: graded,
        player_id: String(r.player_id), name: r.name, team: r.team,
        bar: payload.card[mk].bar ?? null, actual: Number.isFinite(Number(r.actual)) && r.actual !== null ? Number(r.actual) : null,
        ourResult: r.hit === true ? 'hit' : r.hit === false ? 'miss' : null,
      })
    }
  }
  return out
}

/** Pure: the book's verdict on the over. A line is x.5 almost always; a whole-number tie is a push. */
export function overResult(actual, line) {
  if (!Number.isFinite(actual) || !Number.isFinite(line)) return null
  return actual > line ? 'hit' : actual < line ? 'miss' : 'push'
}

/**
 * Pure: join rungs to lock lines. `lines` = odds_lines rows (snap 'lock', side
 * 'over'). A rung takes the one lock line for his id + market with a game
 * date in the 7 days up to its graded date; none or two -> unpriced.
 */
export function joinLockLines(rungs, lines) {
  const by = new Map()
  for (const l of lines) {
    if (l.snap !== 'lock' || (l.side && l.side !== 'over')) continue
    const k = `${l.our_player_id}|${l.market}`
    if (!by.has(k)) by.set(k, [])
    by.get(k).push(l)
  }
  return rungs.map((r) => {
    const lo = r.graded_date ? new Date(Date.parse(`${r.graded_date}T12:00:00Z`) - 7 * 864e5).toISOString().slice(0, 10) : null
    const hits = (by.get(`${r.player_id}|${r.lineMarket}`) || []).filter((l) => lo && l.game_date > lo && l.game_date <= r.graded_date)
    const l = hits.length === 1 ? hits[0] : null
    return {
      ...r,
      line: l ? Number(l.line) : null,
      // roiTable's price shape: the consensus over price at lock, and the best book's.
      price: l && Number.isFinite(Number(l.odds)) ? { median: Number(l.odds), best: Number.isFinite(Number(l.best_odds)) ? Number(l.best_odds) : Number(l.odds), book: l.best_book || null } : null,
      game_date: l?.game_date || null,
      result: l ? overResult(r.actual, Number(l.line)) : null,
      ambiguous: hits.length > 1,
    }
  })
}

/** Every graded non-TD rung for the weeks given, joined to its lock line. */
export async function pricedLinePicks(db, { season, weeks = [] }) {
  const rungs = []
  for (const w of weeks) {
    // eslint-disable-next-line no-await-in-loop
    const f = await getJson(`${DATA}/nfl_results_${season}_w${String(w).padStart(2, '0')}.json`)
    if (f) rungs.push(...nflLineRungsFromResults(f))
  }
  const graded = rungs.filter((r) => r.actual != null && r.graded_date)
  if (!graded.length) return { picks: [], counts: { rungs: rungs.length, graded: 0, priced: 0, ambiguous: 0 }, error: null }
  const dates = graded.map((r) => r.graded_date).sort()
  const since = new Date(Date.parse(`${dates[0]}T12:00:00Z`) - 7 * 864e5).toISOString().slice(0, 10)
  const { data: lines, error } = await readPaged(() => db.from('odds_lines')
    .select('our_player_id, market, side, snap, line, odds, best_odds, best_book, game_date')
    .eq('sport', 'nfl').eq('snap', 'lock').gte('game_date', since).lte('game_date', dates.at(-1))
    .order('game_date', { ascending: true }).order('odd_id', { ascending: true }))
  if (error) return { picks: [], counts: null, error }
  const picks = joinLockLines(graded, lines || [])
  return {
    picks,
    counts: { rungs: rungs.length, graded: graded.length, priced: picks.filter((p) => p.price).length, ambiguous: picks.filter((p) => p.ambiguous).length },
    error: null,
  }
}

/**
 * Every graded pick for `sport` between two dates, each with `price` (or
 * null when no lock price exists). Also returns the join's own counts.
 * NFL takes { season, weeks: [1, 2, ...] } instead of dates for the files.
 */
export async function pricedPicks(db, { sport, since, until, season = null, weeks = [], weekWindow = null }) {
  const lock = await readLockPrices(db, { sport, since, until })
  if (lock.error) return { picks: [], error: lock.error }
  let picks = []
  if (sport === 'mlb') {
    for (const d of days(since, until)) {
      // eslint-disable-next-line no-await-in-loop
      const g = await getJson(`${DATA}/graded_results_${d}.json`)
      if (g) picks.push(...mlbPicksFromGraded(d, g))
    }
    for (const p of picks) p.price = lock.prices.get(priceKey('mlb', p.game_date, p.player_id)) || null
  } else if (sport === 'nhl') {
    const { rows, error } = await readNhlRecords(db, { since, until })
    if (error) return { picks: [], error }
    picks = rows.map((r) => ({ sport: 'nhl', game_date: r.game_date, player_id: String(r.player_id), name: r.name, team: r.team, status: r.status, result: r.result }))
    for (const p of picks) p.price = lock.prices.get(priceKey('nhl', p.game_date, p.player_id)) || null
  } else if (sport === 'nba') {
    // every market's CALLED rows (the first-basket model logs as first_fg, lib/nba/boardRead WRITE_AS)
    for (const [k, d] of Object.entries(NBA_MARKETS)) {
      const market = k === 'first' ? 'first_fg' : k
      // eslint-disable-next-line no-await-in-loop
      const { rows, error } = await readNbaRecords(db, { since, until, status: 'called', market })
      if (error) return { picks: [], error }
      picks.push(...rows.map((r) => ({ sport: 'nba', game_date: r.game_date, player_id: String(r.player_id), name: r.name, team: r.team, status: r.status, result: r.result, market, role: d.label })))
    }
    // the one NBA price on file is the first-basket market's (lib/odds/snap.js MARKETS.NBA):
    // a points / rebounds / ... call is never priced against it
    for (const p of picks) p.price = p.market === 'first_fg' ? lock.prices.get(priceKey('nba', p.game_date, p.player_id)) || null : null
  } else if (sport === 'nfl') {
    for (const w of weeks) {
      // eslint-disable-next-line no-await-in-loop
      const f = await getJson(`${DATA}/nfl_results_${season}_w${String(w).padStart(2, '0')}.json`)
      if (f) picks.push(...nflPicksFromResults(f))
    }
    const byPlayer = new Map()
    for (const [k, v] of lock.prices) {
      const [, date, id] = k.split(':')
      if (!byPlayer.has(id)) byPlayer.set(id, [])
      byPlayer.get(id).push({ date, ...v })
    }
    for (const p of picks) {
      // THE WEEK'S OWN DATES when the caller knows them (weekWindow(week) ->
      // [lo, hi], 2026-10-04): a regraded file's graded_at is the regrade day,
      // which put a week-1 call's window in October and found no price.
      const win = weekWindow && p.week != null ? weekWindow(p.week) : null
      const lo = win ? win[0] : p.graded_date ? new Date(Date.parse(`${p.graded_date}T12:00:00Z`) - 7 * 864e5).toISOString().slice(0, 10) : null
      const hi = win ? win[1] : p.graded_date
      const inWeek = (byPlayer.get(p.player_id) || []).filter((x) => lo && (win ? x.date >= lo : x.date > lo) && x.date <= hi)
      p.price = inWeek.length === 1 ? inWeek[0] : null
      if (inWeek.length === 1) p.game_date = inWeek[0].date
      else if (win) p.game_date = win[0]
    }
  }
  const graded = picks.filter((p) => p.result === 'hit' || p.result === 'miss')
  return {
    picks,
    counts: { picks: picks.length, graded: graded.length, priced: graded.filter((p) => p.price).length, ambiguous: lock.ambiguous },
    error: null,
  }
}
