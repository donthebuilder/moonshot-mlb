// LAMP ANYTIME-GOAL DEVIG (2026-10-24). Pure, no fetch, server only. Reads the odds_snap-shaped
// rows lib/odds/snap.js already built from the SGO event the tick holds, so it costs no object.
//
// The fair price is the FEED's own no-vig market price (`fair_odds`), the same number the
// retired scripts/nhl/lamp-atg-devig.py used. Each book's price is judged against it:
//   EV = fair_p * payout - (1 - fair_p), per 1 unit staked.
// Nothing is estimated: a player with no fair price, or a book with no price, is not a row.
// Output is stored as fair_odds and EV only -- NHL never prints a probability.
export const METHOD = 'sgo-fair-v1'
export const EV_FLAG = 5 // % -- the Kalshi depth lookup is only spent on picks at or above this

const probOf = (a) => (a > 0 ? 100 / (a + 100) : -a / (-a + 100))
const evOf = (fairP, a) => fairP * (a > 0 ? a / 100 : 100 / -a) - (1 - fairP)
const r2 = (n) => Math.round(n * 100) / 100

/**
 * @param rows odds_snap-shaped rows for ONE snapshot of one event (market 'goal')
 * @returns one object per player, best EV first, shaped for lamp_atg_devig (Kalshi fields null)
 */
export function devigRows(rows) {
  const by = new Map()
  for (const r of rows || []) {
    if (r.market !== 'goal' || r.available === false || !Number.isInteger(r.odds)) continue
    if (!Number.isInteger(r.fair_odds)) continue
    const k = `${r.event_id}|${r.sgo_player_id}`
    if (!by.has(k)) by.set(k, { head: r, books: {} })
    by.get(k).books[r.book] = r.odds
  }
  const out = []
  for (const { head, books } of by.values()) {
    const fairP = probOf(head.fair_odds)
    const detail = {}
    let best = null
    for (const [book, odds] of Object.entries(books)) {
      const ev = r2(evOf(fairP, odds) * 100)
      detail[book] = { odds, ev_pct: ev }
      if (!best || ev > best.ev || (ev === best.ev && odds > best.odds)) best = { book, odds, ev }
    }
    out.push({
      event_id: head.event_id, sgo_player_id: head.sgo_player_id, snap: head.snap, method: METHOD,
      game_date: head.game_date, starts_at: head.starts_at, taken_at: head.taken_at,
      player_name: head.player_name, team: head.team, our_player_id: head.our_player_id,
      fair_odds: head.fair_odds, open_fair_odds: Number.isInteger(head.open_fair_odds) ? head.open_fair_odds : null,
      best_book: best.book, best_odds: best.odds, best_ev_pct: best.ev, books: detail,
      kalshi_ticker: null, kalshi_yes_size: null, kalshi_no_size: null, kalshi_trusted: null,
    })
  }
  return out.sort((a, b) => b.best_ev_pct - a.best_ev_pct)
}
