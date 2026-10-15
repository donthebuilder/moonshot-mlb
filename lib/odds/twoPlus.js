// 2+ PRICE CAPTURE (2026-10-15). The 2+ boards (2+ TD / 2+ HR / 2+ goals) and the Card's 2+ hook need a STORED book price for
// "to score 2 or more": an OVER 1.5 on the same stat as the anytime market (SGO: touchdowns / batting_homeRuns / points, over/under
// side, line 1.5). Server only, pure, no fetch: it reads the SGO event the odds tick ALREADY holds, so it costs no extra object
// and no new call.
//
// WHAT COUNTS (nothing is derived, nothing is implied from the anytime price or from our model):
//   1. a MAIN market of that stat whose own consensus line is 1.5 (bookOverUnder 1.5, over side), or
//   2. an ALTERNATE rung: byBookmaker[book].altLines[] entries (SGO's alternate lines) with overUnder 1.5 and a parsable price.
// A book that lists neither is not a row. The player's price is the MEDIAN across the books that list the 1.5 rung (in implied
// probability, like lib/odds/priceAtLock.js), best = the longest. No book lists it = no row = no price.
//
// Stored in odds_lines (no table change): market td2 / hr2 / goal2, bet 'ou', side 'over', line 1.5, snap 'list' | 'lock'.
// odd_id is the SGO odd id, plus '@1.5' for an alternate rung, so it never collides with a main row.
// Read by lib/card/sources.js loadTwoPlusPrices (snap list/lock only, never later than the lock).
import { startsAt, gameDate } from './snap'

export const TWO_LINE = 1.5
// league -> { our market key, SGO statID }. The statIDs are the anytime markets' own (lib/odds/snap.js MARKETS).
export const TWO_PLUS_MARKETS = Object.freeze({
  NFL: Object.freeze({ sport: 'nfl', market: 'td2', stat: 'touchdowns' }),
  MLB: Object.freeze({ sport: 'mlb', market: 'hr2', stat: 'batting_homeRuns' }),
  NHL: Object.freeze({ sport: 'nhl', market: 'goal2', stat: 'points' }),
})
export const TWO_PLUS_KEYS = Object.freeze(Object.values(TWO_PLUS_MARKETS).map((m) => m.market))
/** The odds_lines market key per sport. */
export const TWO_MARKET_OF = Object.freeze({ nfl: 'td2', mlb: 'hr2', nhl: 'goal2' })

const american = (v) => {
  const n = Number(String(v ?? '').replace(/^\+/, ''))
  return Number.isInteger(n) && n !== 0 ? n : null
}
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const impliedOf = (a) => (a > 0 ? 100 / (a + 100) : -a / (-a + 100))
const americanOf = (p) => (p >= 0.5 ? -Math.round((100 * p) / (1 - p)) : Math.round((100 * (1 - p)) / p))
function median(xs) {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const at15 = (line) => line != null && Math.abs(line - TWO_LINE) < 1e-9

/** The 1.5 over prices one odd lists, per book: [{ book, odds, alt }]. Pure. */
export function rungPrices(o) {
  const out = []
  const mainIs15 = at15(num(o.bookOverUnder))
  for (const [book, b] of Object.entries(o.byBookmaker || {})) {
    if (b?.available === false) continue
    if (mainIs15) {
      const odds = american(b.odds)
      if (odds != null && (b.overUnder == null || at15(num(b.overUnder)))) { out.push({ book, odds, alt: false }); continue }
    }
    for (const a of Array.isArray(b?.altLines) ? b.altLines : []) {
      if (a?.available === false || !at15(num(a?.overUnder ?? a?.line))) continue
      const odds = american(a.odds)
      if (odds != null) { out.push({ book, odds, alt: true }); break }
    }
  }
  return out
}

/** { rows, players, matched } of 2+ rows (odds_lines shape) for one event. Pure. */
export function twoPlusRows(ev, snap, takenAt, match) {
  const m = TWO_PLUS_MARKETS[ev.leagueID]
  if (!m) return { rows: [], players: 0, matched: 0 }
  const rows = []
  const seen = new Set()
  let matched = 0
  for (const [oddID, o] of Object.entries(ev.odds || {})) {
    if (o.statID !== m.stat || o.periodID !== 'game' || !o.playerID || o.betTypeID !== 'ou' || o.sideID !== 'over') continue
    const sp = ev.players?.[o.playerID]
    if (!sp) continue
    const prices = rungPrices(o)
    if (!prices.length) continue
    const ours = match ? match(sp, ev) : null
    if (!seen.has(o.playerID)) { seen.add(o.playerID); if (ours) matched += 1 }
    const side = ['home', 'away'].find((s) => ev.teams?.[s]?.teamID === sp.teamID)
    const alt = prices.some((p) => p.alt)
    const odds = americanOf(median(prices.map((p) => impliedOf(p.odds))))
    const best = prices.reduce((a, p) => (!a || p.odds > a.odds ? p : a), null)
    rows.push({
      sport: m.sport, event_id: ev.eventID, game_date: gameDate(ev), starts_at: startsAt(ev), snap, taken_at: takenAt,
      market: m.market, stat: o.statID, bet: 'ou', side: 'over', odd_id: alt ? `${oddID}@${TWO_LINE}` : oddID,
      sgo_player_id: o.playerID, player_name: sp.name || null, team: side ? ev.teams[side].names?.short || null : null, our_player_id: ours,
      line: TWO_LINE, odds, fair_line: null, fair_odds: null, open_line: null, open_odds: null,
      best_line: TWO_LINE, best_odds: best.odds, best_book: best.book, books: prices.length,
    })
  }
  return { rows, players: seen.size, matched }
}
