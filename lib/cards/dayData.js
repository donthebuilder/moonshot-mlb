// THE DAY LINEUP'S DATA (server only, no JSX): the STORED rows of a card (lib/card/store.js cardRows: the bot's rows, Donovan's once his
// lock has passed) turned into the model lib/cards/dayCard.js draws. Nothing is picked or ranked here: the rows are the Card as locked.
// Faces and logos come from the sport's adapter (identity); a leg's price from stored odds with its book count (lib/cards/price.js);
// the Two-Man's combined price is the Card's own rowPrice (the two prices multiplied) and only when BOTH legs have one.
import { cardRows } from '../card/store'
import { CARD_WORDS, STAKE, rowPrice, fmtAmerican } from '../card/core'
import { adapterFor, hasCards } from './registry'
import { pricesForLegs } from './price'
import { brandOf, prettyDay, statusOf } from './model'

/** A stored leg as the card model the drawing wants. */
export async function legModel(sport, leg, adapter) {
  const ident = await adapter.identity(leg).catch(() => ({}))
  return {
    sport, brand: brandOf(sport), playerId: String(leg.player_id), name: leg.name || '', team: leg.team || '', opp: leg.opp || '', home: null,
    pos: ident.pos || leg.pos || null, number: ident.number ?? null, status: statusOf(leg.status), why: leg.why || null,
    face: ident.face || '', logo: ident.logo || '', logoPlate: Boolean(ident.logoPlate), tone: ident.tone || null, gameDate: leg.game_date, startAt: leg.start_at,
  }
}

const twoOf = async (sport, row, adapter, prices) => {
  const legs = await Promise.all(row.legs.map(async (l) => ({ m: await legModel(sport, l, adapter), price: prices.get(String(l.player_id)) ? { best: prices.get(String(l.player_id)).best, books: prices.get(String(l.player_id)).books } : null })))
  const both = rowPrice(row, row.legs.map((l) => prices.get(String(l.player_id))?.raw || null))
  return { stake: row.stake ?? STAKE.two_man, legs, price: both ? fmtAmerican(both.best) : null, note: row.note || null }
}

/**
 * The day model of one card from its stored rows. `scope`: 'full' (the whole Card) or 'free' (straight #1, plus Donovan's Two-Man).
 * { ok:false, why } when the sport has no cards, no table, or no rows for the date.
 */
export async function loadDayModel({ sport, date, db, scope = 'free', now = Date.now() }) {
  if (!hasCards(sport)) return { ok: false, status: 404, why: 'no cards for this sport' }
  if (!db) return { ok: false, status: 503, why: 'not configured' }
  const rows = await cardRows(db, sport, date, { now })
  if (!rows.length) return { ok: false, status: 404, why: 'no card locked for that day' }
  const adapter = await adapterFor(sport)
  const legs = rows.flatMap((r) => r.legs)
  const prices = await pricesForLegs(db, sport, legs)
  const straights = await Promise.all(rows.filter((r) => r.lane === 'bot' && r.product === 'straight').sort((a, b) => a.slot - b.slot).map(async (r) => ({
    slot: r.slot, stake: r.stake ?? STAKE.straight, m: await legModel(sport, r.legs[0], adapter),
    price: prices.get(String(r.legs[0].player_id)) ? { best: prices.get(String(r.legs[0].player_id)).best, books: prices.get(String(r.legs[0].player_id)).books } : null,
  })))
  const botTwo = rows.find((r) => r.lane === 'bot' && r.product === 'two_man')
  const donRow = rows.find((r) => r.lane === 'donovan' && r.product === 'two_man')
  const w = CARD_WORDS[sport]
  return {
    ok: true, rows,
    day: {
      sport, scope, league: brandOf(sport).league, brandName: brandOf(sport).name, market: w.market, dayWord: prettyDay(String(date).slice(0, 10)),
      straights: scope === 'full' ? straights : straights.slice(0, 1),
      two: scope === 'full' && botTwo ? await twoOf(sport, botTwo, adapter, prices) : null,
      donovan: donRow ? await twoOf(sport, donRow, adapter, prices) : null,
    },
  }
}

/** The whole Card is public record once every row is graded or every game has started (the route serves 'full' only then). */
export const cardIsRecord = (rows, now = Date.now()) => rows.length > 0 && (rows.every((r) => r.result != null) || !rows.some((r) => Date.parse(r.start_at) > now))
