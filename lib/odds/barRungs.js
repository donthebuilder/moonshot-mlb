// THE BAR RUNG, BUCKETS (2026-10-31, Donovan: "Jamal Murray 4 threes plus 150 ... a called player's 8 assists ... ten rebounds at plus money. That's what the model should be showing those picks as").
// odds_lines keeps ONE consensus line per player and market (lib/odds/lines.js): Murray's threes are stored at over 2.5 -150, never at 3.5 (4+ threes) at about +150, which is the bet
// the model CALLS (lib/nba/model.js NBA_MARKETS bar: points 25+, rebounds 10+, assists 8+, threes 4+, PRA 35+). So the Card saw -150 against a +120 floor, 3 calls in all.
// This stores the CALL'S OWN rung from the SGO event the tick already holds (no extra object, no new call), the way lib/odds/twoPlus.js stores the 1.5 rung:
//   a book's main line equal to the rung's line counts; so does an ALTERNATE entry in byBookmaker[book].altLines[] with that overUnder and a parsable price.
//   The price is the MEDIAN across the books that list it (implied probability, like lib/odds/priceAtLock.js), best = the longest. No book lists it = no row = no price: the
//   Card never guesses one. Same table, same market key as the main row, odd_id suffixed '@<line>' so it never collides; the Card's loadLines already chooses the lowest
//   rung that clears the market's line floor (lib/card/rules.js chooseRung), so the rung is used and the main -150 line is not. Over side only. NBA only.
// OWN MARKET KEY ('3pm_bar', 'ast_bar' ...): the odds displays pick "the line nearest even money" among a market's rows, so a rung stored as '3pm' would become the displayed
// main line. Only the Card's loadLines reads the _bar keys (lib/card/sources.js), beside the main rows.
export const BAR_SUFFIX = '_bar'
import { MARKETS, startsAt, gameDate } from './snap'
import { MIN_BAR } from '../card/rules'

const BAR_STATS = Object.freeze({ pts: 'points', reb: 'rebounds', ast: 'assists', '3pm': 'threePointersMade', pra: 'points+rebounds+assists' })
/** The over line of each market's call bar: 4+ threes = over 3.5. */
export const RUNG_LINE = Object.freeze(Object.fromEntries(Object.keys(BAR_STATS).map((k) => [k, MIN_BAR.nba[k] - 0.5])))

const american = (v) => {
  const n = Number(String(v ?? '').replace(/^\+/, ''))
  return Number.isInteger(n) && n !== 0 ? n : null
}
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const impliedOf = (a) => (a > 0 ? 100 / (a + 100) : -a / (-a + 100))
const americanOf = (p) => (p >= 0.5 ? -Math.round((100 * p) / (1 - p)) : Math.round((100 * (1 - p)) / p))
function median(xs) { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const at = (a, b) => a != null && Math.abs(a - b) < 1e-9

/** The over prices one odd lists at `line`, per book: [{ book, odds, alt }]. Pure. */
export function rungPricesAt(o, line) {
  const out = []
  const mainIs = at(num(o.bookOverUnder), line)
  for (const [book, b] of Object.entries(o.byBookmaker || {})) {
    if (b?.available === false) continue
    if (mainIs) {
      const odds = american(b.odds)
      if (odds != null && (b.overUnder == null || at(num(b.overUnder), line))) { out.push({ book, odds, alt: false }); continue }
    }
    for (const a of Array.isArray(b?.altLines) ? b.altLines : []) {
      if (a?.available === false || !at(num(a?.overUnder ?? a?.line), line)) continue
      const odds = american(a.odds)
      if (odds != null) { out.push({ book, odds, alt: true }); break }
    }
  }
  return out
}

/** { rows, players, matched } of bar-rung rows (odds_lines shape) for one NBA event. Pure. */
export function barRungRows(ev, snap, takenAt, match) {
  const m = MARKETS[ev.leagueID]
  if (ev.leagueID !== 'NBA' || !m) return { rows: [], players: 0, matched: 0 }
  const byStat = new Map(Object.entries(BAR_STATS).map(([k, stat]) => [stat, k]))
  const rows = []
  const seen = new Set()
  let matched = 0
  for (const [oddID, o] of Object.entries(ev.odds || {})) {
    const market = byStat.get(o.statID)
    if (!market || o.periodID !== 'game' || !o.playerID || o.betTypeID !== 'ou' || o.sideID !== 'over') continue
    const sp = ev.players?.[o.playerID]
    if (!sp) continue
    const line = RUNG_LINE[market]
    const prices = rungPricesAt(o, line)
    if (!prices.length) continue
    const ours = match ? match(sp, ev) : null
    if (!seen.has(o.playerID)) { seen.add(o.playerID); if (ours) matched += 1 }
    const side = ['home', 'away'].find((s) => ev.teams?.[s]?.teamID === sp.teamID)
    const alt = prices.some((p) => p.alt)
    const best = prices.reduce((a, p) => (!a || p.odds > a.odds ? p : a), null)
    rows.push({
      sport: m.sport, event_id: ev.eventID, game_date: gameDate(ev), starts_at: startsAt(ev), snap, taken_at: takenAt,
      market: `${market}${BAR_SUFFIX}`, stat: o.statID, bet: 'ou', side: 'over', odd_id: alt ? `${oddID}@${line}` : oddID,
      sgo_player_id: o.playerID, player_name: sp.name || null, team: side ? ev.teams[side].names?.short || null : null, our_player_id: ours,
      line, odds: americanOf(median(prices.map((p) => impliedOf(p.odds)))), fair_line: null, fair_odds: null, open_line: null, open_odds: null,
      best_line: line, best_odds: best.odds, best_book: best.book, books: prices.length,
    })
  }
  return { rows, players: seen.size, matched }
}
