// THE SLAB'S DATA (server only, no JSX). Two sources, both stored and both already graded; nothing is graded here:
//   kind 'card'     one graded row of the Card (card_calls: result + leg_results), with its lane's record "K of N" (lib/card/core.js recordsOf)
//   kind 'receipt'  a night's stored receipt (homer_feed_posts kind 'receipt', payload.results: every named call that was graded, misses included)
// A row that is not graded yet answers 404 (a result card for a result that does not exist is never drawn). Words come from lib/cards/outcome.js.
import { cardRows, recordRows } from '../card/store'
import { CARD_WORDS, recordsOf } from '../card/core'
import { BRAND, sportKey } from '../routes'
import { adapterFor, hasCards } from './registry'
import { legModel } from './dayData'
import { legOutcome, productOutcome } from './outcome'
import { brandOf, prettyDay } from './model'

const LANE_WORDS = { straight: 'straights hit, this lane', two_man: 'Two-Men landed both legs', donovan: "Donovan's Two-Men landed both legs" }
const HOUSE = 'DASH Network'

/** The slab model of one graded Card row. `lane`/`product`/`slot` pick the row ('bot' | 'donovan', 'straight' | 'two_man', 1..3). */
export async function loadSlabCard({ sport, date, lane = 'bot', product = 'straight', slot = 1, db, now = Date.now() }) {
  if (!hasCards(sport)) return { ok: false, status: 404, why: 'no cards for this sport' }
  if (!db) return { ok: false, status: 503, why: 'not configured' }
  const rows = await cardRows(db, sport, date, { now })
  const row = rows.find((r) => r.lane === lane && r.product === product && Number(r.slot) === Number(slot))
  if (!row) return { ok: false, status: 404, why: 'no such card row' }
  if (row.result == null) return { ok: false, status: 404, why: 'not graded yet' }
  const adapter = await adapterFor(sport)
  const words = row.leg_results || []
  const legs = await Promise.all(row.legs.map(async (l, i) => ({
    m: await legModel(sport, l, adapter),
    outcome: legOutcome((words.find((w) => String(w.player_id) === String(l.player_id)) || words[i])?.result),
    market: CARD_WORDS[sport].market,
  })))
  if (legs.some((l) => !l.outcome)) return { ok: false, status: 404, why: 'a leg has no result on file' }
  const rec = recordsOf(await recordRows(db, sport, { now }))[lane === 'donovan' ? 'donovan' : product]
  const key = lane === 'donovan' ? 'donovan' : product
  return {
    ok: true,
    slab: {
      sport, brandName: brandOf(sport).name, kicker: `THE CARD · ${brandOf(sport).league}`,
      product: product === 'straight' ? `STRAIGHT ${row.slot}` : lane === 'donovan' ? "DONOVAN'S TWO-MAN" : 'TWO-MAN',
      market: CARD_WORDS[sport].market, dayWord: prettyDay(String(row.card_date).slice(0, 10)),
      result: productOutcome(row.result), legs,
      record: rec?.graded ? { k: rec.hits, n: rec.graded, label: LANE_WORDS[key] } : null,
      note: 'Graded from the box score.',
    },
  }
}

/** The slab model of a night's stored receipt (cross-sport). */
export async function loadSlabReceipt({ day, db }) {
  if (!db) return { ok: false, status: 503, why: 'not configured' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ''))) return { ok: false, status: 400, why: 'bad day' }
  const { data, error } = await db.from('homer_feed_posts').select('payload').match({ day, kind: 'receipt' }).maybeSingle()
  const results = Array.isArray(data?.payload?.results) ? data.payload.results : []
  if (error || !results.length) return { ok: false, status: 404, why: 'no receipt stored for that day' }
  const order = { cashed: 0, missed: 1, void: 2 }
  const sorted = results.filter((r) => order[r.outcome] != null).sort((a, b) => order[a.outcome] - order[b.outcome] || String(a.name).localeCompare(String(b.name)))
  const adapters = {}
  const legs = await Promise.all(sorted.map(async (r) => {
    const sport = hasCards(r.sport) ? r.sport : null
    const adapter = sport ? (adapters[sport] ||= await adapterFor(sport)) : null
    const leg = { player_id: String(r.player_id), name: r.name || '' }
    const m = adapter ? await legModel(sport, leg, adapter) : { sport: sport || 'mlb', brand: brandOf('mlb'), playerId: leg.player_id, name: leg.name, team: '', opp: '', face: '', logo: '', logoPlate: false, tone: null }
    return { m, outcome: legOutcome(r.outcome), market: r.market || '', sportLabel: BRAND[sportKey(r.sport)]?.league || '' }
  }))
  const c = { cashed: legs.filter((l) => l.outcome === 'cashed').length, missed: legs.filter((l) => l.outcome === 'missed').length }
  return {
    ok: true,
    slab: {
      sport: null, brandName: HOUSE, kicker: 'THE RECEIPT', product: 'NIGHT RECEIPT', market: 'every named call', dayWord: prettyDay(day),
      result: null, legs, record: c.cashed + c.missed ? { k: c.cashed, n: c.cashed + c.missed, label: 'cashed, every named call graded' } : null,
      note: 'Every call, graded.',
    },
  }
}
