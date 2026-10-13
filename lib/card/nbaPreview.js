// BUCKETS' CARD, AS A PREVIEW (2026-10-12, BUCKETS parity pass). WHAT THE CARD WOULD PICK TONIGHT for NBA, with the very same rules and floors the other three sports lock
// with (lib/card/core.js planStraights, lib/card/rules.js): the straight slots by the size of the slate, one pick per game, the highest-scored CALLED player of each slot's
// market whose game has not started, an OVER at his stored book line and price, a stored line that clears the market's bar, a stored price of +120 or longer.
//
// THIS LOCKS NOTHING. No card_calls row is written, nothing is posted, no push is sent, and NBA is not in CARD_SPORTS (lib/card/core.js), so the lock tick never asks. The
// only reader is the gated route /api/buckets/card (admin, an early-access holder, or the public once BUCKETS is open). It is the answer to "could the Card run for BUCKETS?".
//
// HONEST WHEN THERE IS NOTHING: with no regular-season game it says so; with games but no stored book line and price for a called player (NBA odds are captured only once
// NBA_ODDS_CAPTURE is on, or BUCKETS is public) it says `no priced picks` and lists no pick. A pick is never given a made-up line or price, and a market with no stored
// line never fills a slot out of turn. There is no Two-Man here: BUCKETS has no yes/no market with a stored price (first basket and double-double have none).
import { playsFor, planStraights, marketOf, MARKETS, SLOTS, percentileOf } from './core'
import { lineFloorWords, straightVerdict } from './rules'

const fin = (v) => typeof v === 'number' && Number.isFinite(v)

/** What one pick is, for the page: who, which market, at what line and price. Pure. */
export function previewPick({ slot, market, cand }) {
  const def = marketOf('nba', market)
  return {
    slot, market, marketLabel: def?.label || market, player_id: String(cand.player_id), name: cand.name, team: cand.team, opp: cand.opp, game_id: String(cand.game_id),
    start_at: new Date(cand.start_ms).toISOString(), score: cand.score, line: cand.line ?? null, price: cand.price && Number.isInteger(cand.price.median) ? cand.price.median : null,
    books: cand.price?.books ?? null, why: cand.why || null, status: cand.status, board_pct: cand.board_pct ?? null,
  }
}

/**
 * The preview of one window. `byMarket` = { pts: { cands, board }, ... } (lib/card/sources.js loadCardInputs: each candidate carries its stored `line` and `price`);
 * `games` = the games in the window. Pure: the clock is `now`.
 * -> { games, plays, picks, skipped, tracked, priced, called, message }
 */
export function planNbaPreview({ byMarket, games, now }) {
  const plays = playsFor(games)
  const plan = planStraights({ sport: 'nba', n: plays.straights, byMarket, now })
  // what the pre-floor rule would have picked, where it fails a floor: tracked (kept apart from the Card), never dropped
  const tracked = []
  for (const { slot, market, cand } of planStraights({ sport: 'nba', n: plays.straights, byMarket, now, floors: false }).picks) {
    const v = straightVerdict('nba', market, cand)
    if (!v.ok) tracked.push({ ...previewPick({ slot, market, cand }), reason_code: v.code, reason: v.reason })
  }
  const all = Object.values(byMarket || {}).flatMap((m) => m.cands || [])
  const called = new Set(all.filter((c) => c.status === 'called').map((c) => `${c.player_id}`)).size
  const priced = all.filter((c) => fin(c.line) && c.price && Number.isInteger(c.price.median)).length
  const picks = plan.picks.map(previewPick)
  let message = null
  if (!plays.straights) message = 'No regular-season game in this window.'
  else if (!picks.length) message = priced ? 'No priced pick cleared the floors.' : 'No priced picks: no CALLED player has a stored book line and price yet.'
  return { games: plays.games, plays, picks, skipped: plan.skipped, tracked, priced, called, message }
}

/** The rules the preview runs by, in words, from the same config (so the page and the rules cannot drift). */
export function previewRules() {
  return {
    slots: SLOTS.nba.map((from) => from.map((k) => MARKETS.nba[k].label)),
    lineFloors: lineFloorWords('nba'),
    note: 'A preview of what the Card would pick. Nothing is locked, stored or posted.',
  }
}

/**
 * Tonight's preview from the live sources. Server only. `db` = a service client (the stored lines); without one the picks still come from the board but none has a
 * line, so the answer is the honest `no priced picks`. Never throws: { ok:false, why } on a failed read.
 */
export async function loadNbaPreview({ db = null, now = Date.now() } = {}) {
  const { loadWindows, loadCardInputs } = await import('./sources')
  const w = await loadWindows('nba', now)
  if (!w.ok) return { ok: false, why: w.why }
  const win = (w.windows || []).find((x) => x.last_start_ms > now - 6 * 3600e3) || null
  if (!win) return { ok: true, empty: true, rules: previewRules(), message: 'No regular-season NBA game tonight.' }
  const inputs = db ? await loadCardInputs(db, 'nba', win, now, { prices: false }) : await (await import('./sources')).loadCandidates('nba', win, now)
  if (!inputs.ok) return { ok: false, why: inputs.why }
  const plan = planNbaPreview({ byMarket: inputs.byMarket, games: win.games ?? inputs.games, now })
  return { ok: true, date: win.card_date, locksAt: new Date(win.first_start_ms - 60 * 60e3).toISOString(), firstStart: new Date(win.first_start_ms).toISOString(), rules: previewRules(), warn: inputs.warn || [], ...plan }
}

export { percentileOf }
