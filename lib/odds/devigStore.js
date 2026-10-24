// WRITE LAMP's ANYTIME-GOAL DEVIG (2026-10-24). Server only. Insert-only into lamp_atg_devig; its own
// failure is logged and returned, never thrown into the odds snapshot (same rule as odds_game_totals).
// Kalshi depth is looked up only for the picks at or above EV_FLAG, at most KALSHI_MAX per call.
import { devigRows, EV_FLAG } from './devig'
import { openMarkets, matchMarket, depth } from './kalshi'

const KALSHI_MAX = 12

/** @param snapRowsArr the odds_snap rows just built for one snapshot (any number of NHL events)
 *  @param ymd the games' ET date (the Kalshi ticker's date)  @returns {{rows:number, kalshi:number, error?:string}} */
export async function saveAtgDevig(db, snapRowsArr, ymd) {
  try {
    const rows = devigRows((snapRowsArr || []).filter((r) => r.sport === 'nhl'))
    if (!rows.length) return { rows: 0, kalshi: 0 }
    let kalshi = 0
    const flagged = rows.filter((r) => r.best_ev_pct >= EV_FLAG).slice(0, KALSHI_MAX)
    if (flagged.length) {
      const markets = await openMarkets(ymd)
      for (const r of flagged) {
        const m = matchMarket(markets, r.player_name)
        if (!m) continue
        const d = await depth(m.ticker)
        if (!d) continue
        Object.assign(r, { kalshi_ticker: m.ticker, kalshi_yes_size: d.yes, kalshi_no_size: d.no, kalshi_trusted: d.trusted })
        kalshi += 1
      }
    }
    const w = await db.from('lamp_atg_devig').upsert(rows, { onConflict: 'event_id,sgo_player_id,snap,method', ignoreDuplicates: true })
    if (w.error) { console.error(`[odds tick] atg devig: ${w.error.message}`); return { rows: 0, kalshi, error: w.error.message } }
    return { rows: rows.length, kalshi }
  } catch (e) {
    console.error(`[odds tick] atg devig: ${e?.message}`)
    return { rows: 0, kalshi: 0, error: String(e?.message || e) }
  }
}
