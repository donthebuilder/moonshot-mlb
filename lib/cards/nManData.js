// THE N-MAN CARD'S DATA (server only, no JSX): HIS N-MAN (3 to 6 hand-picked players, all must land) as STORED in card_calls (lane 'donovan', product 'n_man'),
// or, for the admin preview, shaped by lib/card/core.js donovanRow and never written. Everything on the card is read from the row and from the stored prices:
//   legs      each leg's model (face, club, role from the sport's adapter), its stored best price and book count, and, once graded, its outcome
//   combined  the legs' BEST stored prices multiplied (lib/card/picker.js comboOf: the one multiplication), only when EVERY leg has one; otherwise "not all priced"
//   serial    this N-man's real place among his locked N-men for the sport (card_calls), or null (a LATE entry never has one)
//   graded    the ticket's result (CASHED / MISSED / VOID) and how many legs landed, from leg_results; null until the row is graded
// Public-safe like the dual card: his verified rows are public from their lock (readCard hides them before); a LATE row is never public and never read here
// (lib/card/store.js readCard returns lane 'bot' and 'donovan' only). No probability is printed; the words come from lib/cards/outcome.js.
import { readCard, CARD_TABLE } from '../card/store'
import { cardNameOf, adminNMan, CARD_WORDS, CARD_VERSION, STAKE } from '../card/core'
import { comboOf } from '../card/picker'
import { fmtAmerican } from '../card/core'
import { adapterFor, hasCards } from './registry'
import { pricesForLegs } from './price'
import { legModel } from './dayData'
import { brandOf, prettyDay } from './model'
import { legOutcome, productOutcome } from './outcome'

/** The place of one N-man among his locked N-men for the sport. `rows` = [{ card_date, lane, locks_at }]. Pure; exported for the test. */
export function nManSerialOf(rows, { cardDate, now = Date.now() }) {
  const locked = (rows || []).filter((r) => r.lane === 'donovan' && now >= Date.parse(r.locks_at))
  const dates = [...new Set(locked.map((r) => String(r.card_date).slice(0, 10)))].sort()
  const at = dates.indexOf(String(cardDate).slice(0, 10))
  return at < 0 ? null : { n: at + 1, of: dates.length, caption: 'N-MAN NO.' }
}

export async function nManSerial(db, { sport, cardDate, version = CARD_VERSION, now = Date.now() }) {
  try {
    const { data, error } = await db.from(CARD_TABLE).select('card_date,lane,locks_at').eq('sport', sport).eq('lane', 'donovan').eq('product', 'n_man').eq('model_version', version).limit(2000)
    if (error || !Array.isArray(data)) return null
    return nManSerialOf(data, { cardDate, now })
  } catch { return null }
}

/** The model of his N-man card for a game day, or { ok:false, status, why }. `publicOnly` (the route's setting) has no extra effect today: his row is public from its lock either way. */
export async function loadNManModel({ sport, date, db, now = Date.now() }) {
  if (!hasCards(sport)) return { ok: false, status: 404, why: 'no cards for this sport' }
  if (!db) return { ok: false, status: 503, why: 'not configured' }
  const card = await readCard(db, sport, date, { now, audience: 'public' })
  const row = card.rows.find((r) => r.lane === 'donovan' && r.product === 'n_man')
  if (!row || !(row.legs || []).length) return { ok: false, status: 404, why: "no admin N-man for that day" }
  const serial = await nManSerial(db, { sport, cardDate: row.card_date, now })
  return { ok: true, row, nman: await nManOfRow({ sport, row, db, serial }) }
}

/**
 * The card model from an n_man row (STORED, or shaped for the admin preview). `label` 'late' draws "LATE · <title>" with no serial (a LATE entry is not in his record).
 * A graded row carries `graded`; a row that is not graded draws the pregame card.
 */
export async function nManOfRow({ sport, row, db, serial = null, label = null }) {
  const adapter = await adapterFor(sport)
  const prices = await pricesForLegs(db, sport, row.legs)
  const words = row.leg_results || []
  const legs = await Promise.all(row.legs.map(async (l, i) => {
    const p = prices.get(String(l.player_id))
    const w = row.result != null ? (words.find((x) => String(x.player_id) === String(l.player_id)) || words[i])?.result : null
    return { m: await legModel(sport, l, adapter), price: p ? { best: p.best, books: p.books } : null, raw: p?.raw || null, outcome: legOutcome(w) }
  }))
  const combo = comboOf(legs.map((l) => l.raw))
  const title = cardNameOf(row) || adminNMan(row.legs.length)
  const outcomes = legs.map((l) => l.outcome)
  const graded = row.result != null && outcomes.every(Boolean)
    ? { result: productOutcome(row.result), landed: outcomes.filter((o) => o === 'cashed').length, of: outcomes.length }
    : null
  return {
    sport, brandName: brandOf(sport).name, market: CARD_WORDS[sport].market, dayWord: prettyDay(String(row.card_date).slice(0, 10)),
    lane: row.lane, label: label === 'late' ? `LATE · ${title.toUpperCase()}` : title.toUpperCase(),
    rule: `${row.stake ?? STAKE.n_man} unit · every leg must land`,
    legs, combined: { text: combo.best != null ? fmtAmerican(combo.best) : null, all: combo.all, priced: combo.priced, n: combo.n },
    serial: label === 'late' ? null : serial, graded,
  }
}

/** The serial an ON-TIME N-man WOULD carry on the card that posts (this one counted), for the admin preview only. Reads card_calls; writes nothing. */
export async function previewNManSerial(db, { sport, cardDate, locksAt, version = CARD_VERSION }) {
  try {
    const { data, error } = await db.from(CARD_TABLE).select('card_date,lane,locks_at').eq('sport', sport).eq('lane', 'donovan').eq('product', 'n_man').eq('model_version', version).limit(2000)
    if (error || !Array.isArray(data)) return null
    const day = String(cardDate).slice(0, 10)
    const rows = [...data.filter((r) => String(r.card_date).slice(0, 10) !== day), { card_date: day, lane: 'donovan', locks_at: locksAt }]
    return nManSerialOf(rows, { cardDate: day, now: Number.MAX_SAFE_INTEGER })
  } catch { return null }
}
