// GET /api/card?sport=nhl|nfl|mlb|nba[&date=YYYY-MM-DD] -- THE CARD, read side (lib/card).
//   card     the newest locked card (or `date`): the bot's three straights and Two-Man, and Donovan's Two-Man once ITS lock has passed
//            (never before: his open entry is not public), each leg with the newest stored price on file or "none"
//   records  the three running records, never mixed: the bot's straights, the bot's Two-Man, Donovan's Two-Man -- K of N, the count the
//            legs' stored rates expect if they were independent, the 95% Wilson range, units at flat stakes only from 100 priced calls
// MEMBERS FIRST (2026-10-12): before any row of the Card is graded this answers the lead straight, the Long Shot, Donovan's rows and the records ONLY; the bot's Two-Man and straights
// #2-#3 are stripped on the server (lib/card/reveal.js) and only counted in `held`. Once a row is graded the whole Card is history and is returned. Nothing here writes. The table missing (migration not run) answers an empty card.
import { unstable_cache } from 'next/cache'
import { adminClient } from '../../../lib/supabase/admin'
import { easternToday } from '../../../lib/data'
import { CARD_SPORTS, CARD_WORDS, CARD_RULE_TEXT, CARD_LOCK_LEAD_MIN, STAKE, DOUBLE_SPORT, MARKETS, recordWords } from '../../../lib/card/core'
import { latestCardDate, readCard, recordRows, recordsFor, currentPrices, trackedFor } from '../../../lib/card/store'
import { HELD_LINE } from '../../../lib/card/reveal'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const buildRecords = (sport, today) => unstable_cache(async () => {
  const db = adminClient()
  if (!db) return null
  const rows = await recordRows(db, sport)
  const rec = await recordsFor(db, sport, rows)
  // the Double is cross-sport (rows of sport 'all'): its own record, the bot's and Donovan's, never mixed into a sport's
  const drec = await recordsFor(db, DOUBLE_SPORT, await recordRows(db, DOUBLE_SPORT))
  // TRACKED, NOT ON THE CARD (10-11): the picks the floors kept off the Card, their own graded record (null until the card_tracked table exists)
  const tr = await trackedFor(db, sport).catch(() => null)
  return {
    records: { ...rec, double: drec.double, donovan_double: drec.donovan_double, ...(tr ? { tracked: tr.records } : {}) },
    words: {
      straight: recordWords(rec.straight, { product: 'straight' }),
      volume: Object.fromEntries(Object.entries(rec.volume || {}).map(([k, v]) => [k, recordWords(v, { product: 'straight', label: `${MARKETS[sport]?.[k]?.label || k} straights` })])),
      two_man: recordWords(rec.two_man, { product: 'two_man' }),
      two_man_same_game: recordWords(rec.two_man_same_game, { product: 'two_man', label: 'same-game two-mans', sameGame: true }),
      donovan: recordWords(rec.donovan, { product: 'two_man', who: "Admin's Two-Man: " }),
      donovan_straight: recordWords(rec.donovan_straight, { product: 'straight', who: "Admin's straight: " }),
      donovan_n_man: recordWords(rec.donovan_n_man, { product: 'n_man', who: "Admin's N-man: " }),
      long_shot: recordWords(rec.long_shot, { product: 'long_shot' }),
      double: recordWords(drec.double, { product: 'double' }),
      donovan_double: recordWords(drec.donovan_double, { product: 'double', who: "Admin's Double: " }),
      ...(tr ? { tracked_straight: tr.words.straight, tracked_two_man: tr.words.two_man } : {}),
    },
  }
}, ['card-records-v4', sport, today], { revalidate: 600 })()

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const sport = String(q.get('sport') || 'nhl')
  if (!CARD_SPORTS.includes(sport)) return Response.json({ error: 'BAD REQUEST', detail: `the Card runs in ${CARD_SPORTS.join(', ')}` }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  const w = CARD_WORDS[sport]
  const empty = { sport, market: w.market, window: w.window, lockLeadMin: CARD_LOCK_LEAD_MIN, stakes: STAKE, rule: CARD_RULE_TEXT, date: null, rows: [], prices: {}, held: null, revealed: false, records: null, words: null }
  const db = adminClient()
  if (!db) return Response.json(empty, { headers: { 'Cache-Control': 'no-store' } })
  try {
    const now = Date.now()
    const want = q.get('date')
    const date = want && DATE_RE.test(want) ? want : await latestCardDate(db, sport, now)
    // THE PUBLIC VIEW (lib/card/reveal.js): until a row of this Card is graded the public gets the lead straight, the Long Shot and Donovan's rows;
    // the bot's Two-Man and straights #2-#3 are stripped HERE, on the server, before anything else (prices, JSON) is built from the rows. This route
    // has no members mode: a member reads the whole Card in #members before the reveal and on the site after it.
    const [card, dbl, rec] = await Promise.all([date ? readCard(db, sport, date, { now, audience: 'public' }) : { rows: [], held: { straights: 0, two_man: 0 }, revealed: false }, date ? readCard(db, DOUBLE_SPORT, date, { now, audience: 'public' }) : { rows: [] }, buildRecords(sport, easternToday())])
    const sportRows = card.rows
    // the Double is cross-sport: it rides every sport's page for the date (its rows are sport 'all'; its legs carry their own sport)
    const rows = [...sportRows, ...dbl.rows]
    const prices = sportRows.length ? await currentPrices(db, sport, sportRows.flatMap((r) => r.legs)) : new Map()
    // a leg's stored model rate feeds the "if independent" count on the server; the page never prints it, so it is not sent
    const pub = rows.map((r) => ({ ...r, legs: r.legs.map(({ rate, ...leg }) => leg) }))
    // `held` is a COUNT and a sentence, never a name: how many calls the members have that this response does not
    const held = card.held.straights + card.held.two_man > 0 ? { ...card.held, line: HELD_LINE } : null
    const body = { ...empty, date, rows: pub, prices: Object.fromEntries(prices), held, revealed: card.revealed, records: rec?.records || null, words: rec?.words || null }
    return Response.json(body, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } })
  } catch (e) {
    console.error(`[card] read ${sport}: ${e?.message || e}`)
    return Response.json({ error: 'LIVE DATA DELAYED', detail: 'The card could not be read.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
}
