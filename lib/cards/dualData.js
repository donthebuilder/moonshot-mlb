// THE DUAL CARD'S DATA (server only, no JSX): a Two-Man row of the Card as STORED (lib/card/store.js cardRows: the bot's row, Donovan's only
// once his lock has passed), its two legs as card models, each leg's stored price, the combined price (lib/card/core.js rowPrice, the two
// prices multiplied) only when BOTH legs have one, and the card's REAL sequence number in its lane's record for that sport.
//   serial = { n, of, caption }   n = this Two-Man's place among the lane's Two-Men locked so far (by card date), of = how many are locked
//   It comes from card_calls and from nothing else; if the table cannot be read it is null and the card draws no serial.
import { readCard, CARD_TABLE } from '../card/store'
import { ADMIN_TWO_MAN, cardNameOf, CARD_WORDS, CARD_VERSION, STAKE, rowPrice, fmtAmerican } from '../card/core'
import { adapterFor, hasCards } from './registry'
import { pricesForLegs } from './price'
import { legModel } from './dayData'
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
    return s ? { ...s, caption: lane === 'donovan' ? `${ADMIN_TWO_MAN.toUpperCase()} NO.` : 'TWO-MAN NO.' } : null
  } catch { return null }
}

/** The model of one Two-Man card, or { ok:false, status, why }. `lane`: 'bot' | 'donovan'. */
export async function loadDualModel({ sport, date, lane = 'bot', db, now = Date.now(), publicOnly = false }) {
  if (!hasCards(sport)) return { ok: false, status: 404, why: 'no cards for this sport' }
  if (!db) return { ok: false, status: 503, why: 'not configured' }
  // the bot's Two-Man is members content until a row of the Card is graded (lib/card/reveal.js): the PUBLIC view of the rows does not contain it,
  // so a public caller gets the same 404 whether it does not exist or is held (no oracle). The members poster asks for the whole Card in-process.
  const card = await readCard(db, sport, date, { now, audience: publicOnly ? 'public' : 'members' })
  const rows = card.rows
  const row = rows.find((r) => r.lane === (lane === 'donovan' ? 'donovan' : 'bot') && r.product === 'two_man')
  const none = { ok: false, status: 404, why: lane === 'donovan' ? "no admin Two-Man for that day" : 'no Two-Man for that day' }
  if (!row || row.legs.length !== 2) return none
  if (publicOnly && row.lane === 'bot' && !card.revealed) return none        // belt and braces: decided BEFORE anything is drawn or fetched
  const serial = await twoManSerial(db, { sport, lane: row.lane, cardDate: row.card_date, now })
  return { ok: true, rows, row, dual: await dualOfRow({ sport, row, db, serial }) }
}

/**
 * The dual card's model from a Two-Man row (STORED or, for Donovan's admin preview, shaped by lib/card/core.js donovanRow and never written): the legs'
 * faces/logos from the sport's adapter, each leg's stored price, the combined price only when BOTH legs have one. `label` overrides the plate
 * (a LATE entry is drawn as "LATE · DONOVAN'S TWO-MAN" and never gets a serial: it is not in the lane's record).
 */
export async function dualOfRow({ sport, row, db, serial = null, label = null }) {
  const adapter = await adapterFor(sport)
  const prices = await pricesForLegs(db, sport, row.legs)
  const legs = await Promise.all(row.legs.map(async (l) => {
    const p = prices.get(String(l.player_id))
    return { m: await legModel(sport, l, adapter), price: p ? { best: p.best, books: p.books } : null }
  }))
  const both = rowPrice(row, row.legs.map((l) => prices.get(String(l.player_id))?.raw || null))
  const isDon = row.lane === 'donovan' || row.lane === 'donovan_late'
  return {
    sport, brandName: brandOf(sport).name, market: CARD_WORDS[sport].market, dayWord: prettyDay(String(row.card_date).slice(0, 10)),
    lane: row.lane, label: (label === 'late' ? `LATE · ${isDon ? (cardNameOf(row) || ADMIN_TWO_MAN).toUpperCase() : 'TWO-MAN'}` : label) || (isDon ? (cardNameOf(row) || ADMIN_TWO_MAN).toUpperCase() : 'TWO-MAN'), rule: `${row.stake ?? STAKE.two_man} unit · both legs must land`,
    legs, price: both ? fmtAmerican(both.best) : null, serial,
  }
}

/**
 * The serial an ON-TIME entry of Donovan's WOULD carry on the card that posts (its place among his locked Two-Men, this one counted), for the admin
 * preview only. Reads card_calls; writes nothing. null when it cannot be read (the card then draws no serial, as the real one does).
 */
export async function previewSerial(db, { sport, cardDate, locksAt, version = CARD_VERSION }) {
  try {
    const { data, error } = await db.from(CARD_TABLE).select('card_date,lane,locks_at').eq('sport', sport).eq('lane', 'donovan').eq('product', 'two_man').eq('model_version', version).limit(2000)
    if (error || !Array.isArray(data)) return null
    const day = String(cardDate).slice(0, 10)
    const rows = [...data.filter((r) => String(r.card_date).slice(0, 10) !== day), { card_date: day, lane: 'donovan', locks_at: locksAt }]
    const s = serialOf(rows, { lane: 'donovan', cardDate: day, now: Number.MAX_SAFE_INTEGER })
    return s ? { ...s, caption: `${ADMIN_TWO_MAN.toUpperCase()} NO.` } : null
  } catch { return null }
}
