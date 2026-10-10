// THE DUAL CARD'S DATA (server only, no JSX): a Two-Man row of the Card as STORED (lib/card/store.js cardRows: the bot's row, Donovan's only
// once his lock has passed), its two legs as card models, each leg's stored price, the combined price (lib/card/core.js rowPrice, the two
// prices multiplied) only when BOTH legs have one, and the card's REAL sequence number in its lane's record for that sport.
//   serial = { n, of, caption }   n = this Two-Man's place among the lane's Two-Men locked so far (by card date), of = how many are locked
//   It comes from card_calls and from nothing else; if the table cannot be read it is null and the card draws no serial.
import { cardRows, CARD_TABLE } from '../card/store'
import { CARD_WORDS, CARD_VERSION, STAKE, rowPrice, fmtAmerican } from '../card/core'
import { adapterFor, hasCards } from './registry'
import { pricesForLegs } from './price'
import { legModel, cardIsRecord } from './dayData'
import { brandOf, prettyDay } from './model'

/** The place of one Two-Man among its lane's locked Two-Men. `rows` = [{ card_date, lane, locks_at }]. Pure; exported for the test. */
export function serialOf(rows, { lane, cardDate, now = Date.now() }) {
  const locked = (rows || []).filter((r) => r.lane === lane && (lane === 'bot' || now >= Date.parse(r.locks_at)))
  const dates = [...new Set(locked.map((r) => String(r.card_date).slice(0, 10)))].sort()
  const at = dates.indexOf(String(cardDate).slice(0, 10))
  return at < 0 ? null : { n: at + 1, of: dates.length }
}

export async function twoManSerial(db, { sport, lane, cardDate, version = CARD_VERSION, now = Date.now() }) {
  try {
    const { data, error } = await db.from(CARD_TABLE).select('card_date,lane,locks_at').eq('sport', sport).eq('lane', lane).eq('product', 'two_man').eq('model_version', version).limit(2000)
    if (error || !Array.isArray(data)) return null
    const s = serialOf(data, { lane, cardDate, now })
    return s ? { ...s, caption: lane === 'donovan' ? "DONOVAN'S TWO-MAN NO." : 'TWO-MAN NO.' } : null
  } catch { return null }
}

/** The model of one Two-Man card, or { ok:false, status, why }. `lane`: 'bot' | 'donovan'. */
export async function loadDualModel({ sport, date, lane = 'bot', db, now = Date.now(), publicOnly = false }) {
  if (!hasCards(sport)) return { ok: false, status: 404, why: 'no cards for this sport' }
  if (!db) return { ok: false, status: 503, why: 'not configured' }
  const rows = await cardRows(db, sport, date, { now })
  const row = rows.find((r) => r.lane === (lane === 'donovan' ? 'donovan' : 'bot') && r.product === 'two_man')
  if (!row || row.legs.length !== 2) return { ok: false, status: 404, why: lane === 'donovan' ? "no Donovan's Two-Man for that day" : 'no Two-Man for that day', rows }
  // the bot's Two-Man is members content until the Card is public record: decided BEFORE anything is drawn or fetched
  if (publicOnly && row.lane === 'bot' && !cardIsRecord(rows, now)) return { ok: false, status: 404, why: 'the Two-Man is not public yet' }
  const adapter = await adapterFor(sport)
  const prices = await pricesForLegs(db, sport, row.legs)
  const legs = await Promise.all(row.legs.map(async (l) => {
    const p = prices.get(String(l.player_id))
    return { m: await legModel(sport, l, adapter), price: p ? { best: p.best, books: p.books } : null }
  }))
  const both = rowPrice(row, row.legs.map((l) => prices.get(String(l.player_id))?.raw || null))
  const serial = await twoManSerial(db, { sport, lane: row.lane, cardDate: row.card_date, now })
  return {
    ok: true, rows, row,
    dual: {
      sport, brandName: brandOf(sport).name, market: CARD_WORDS[sport].market, dayWord: prettyDay(String(row.card_date).slice(0, 10)),
      lane: row.lane, label: row.lane === 'donovan' ? "DONOVAN'S TWO-MAN" : 'TWO-MAN', rule: `${row.stake ?? STAKE.two_man} unit · both legs must land`,
      legs, price: both ? fmtAmerican(both.best) : null, serial,
    },
  }
}
