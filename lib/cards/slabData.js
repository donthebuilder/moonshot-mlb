// THE SLAB'S DATA (server only, no JSX). Two sources, both stored and both already graded; nothing is graded here:
//   kind 'card'     one graded row of the Card (card_calls: result + leg_results), with its lane's record "K of N" (lib/card/core.js recordsOf)
//   kind 'receipt'  a night's stored receipt (homer_feed_posts kind 'receipt', payload.results: every named call that was graded, misses included)
// A row that is not graded yet answers 404 (a result card for a result that does not exist is never drawn). Words come from lib/cards/outcome.js.
import { cardRows, recordRows } from '../card/store'
import { CARD_WORDS, recordsOf, DOUBLE_SPORT, MIN_LONG_SHOTS } from '../card/core'
import { BRAND, sportKey } from '../routes'
import { adapterFor, hasCards } from './registry'
import { legModel } from './dayData'
import { legOutcome, productOutcome } from './outcome'
import { brandOf, prettyDay } from './model'

const LANE_WORDS = { straight: 'straights hit, this lane', two_man: 'Two-Men landed both legs', donovan: "Donovan's Two-Men landed both legs", double: 'Doubles landed both legs', donovan_double: "Donovan's Doubles landed both legs", long_shot: 'long shots landed' }
const PRODUCT_WORDS = { long_shot: 'LONG SHOT', double: 'THE DOUBLE' }
const HOUSE = 'DASH Network'

/** The slab model of one graded Card row. `lane`/`product`/`slot` pick the row ('bot' | 'donovan', 'straight' | 'two_man', 1..3). */
export async function loadSlabCard({ sport, date, lane = 'bot', product = 'straight', slot = 1, db, now = Date.now() }) {
  // the Double is the one cross-sport row (sport 'all'); its legs carry their own sport. Every other product belongs to a Card sport.
  const isDouble = product === 'double'
  if (isDouble ? sport !== DOUBLE_SPORT : !hasCards(sport)) return { ok: false, status: 404, why: 'no cards for this sport' }
  if (!db) return { ok: false, status: 503, why: 'not configured' }
  const rows = await cardRows(db, sport, date, { now })
  const row = rows.find((r) => r.lane === lane && r.product === product && Number(r.slot) === Number(slot))
  if (!row) return { ok: false, status: 404, why: 'no such card row' }
  if (row.result == null) return { ok: false, status: 404, why: 'not graded yet' }
  const adapters = {}
  const adapterOf = async (s) => (adapters[s] ||= await adapterFor(s))
  const words = row.leg_results || []
  const legs = await Promise.all(row.legs.map(async (l, i) => {
    const s = isDouble ? l.sport : sport
    if (!hasCards(s)) return { m: null, outcome: null }
    return {
      m: await legModel(s, l, await adapterOf(s)),
      outcome: legOutcome((words.find((w) => String(w.player_id) === String(l.player_id)) || words[i])?.result),
      market: CARD_WORDS[s].market,
    }
  }))
  if (legs.some((l) => !l.outcome || !l.m)) return { ok: false, status: 404, why: 'a leg has no result on file' }
  const key = lane === 'donovan' ? (isDouble ? 'donovan_double' : 'donovan') : product
  const rec = recordsOf(await recordRows(db, sport, { now }))[key]
  // the Long Shot is a COUNT until MIN_LONG_SHOTS are graded (no hit rate, no units; the same rule as the free post's text); K of N after
  const total = (rec?.graded || 0) + (rec?.voids || 0) + (rec?.pushes || 0)
  const record = product === 'long_shot' && (rec?.graded || 0) < MIN_LONG_SHOTS
    ? (total ? { k: null, n: total, label: `long shot${total === 1 ? '' : 's'} so far; counts only until ${MIN_LONG_SHOTS} are graded` } : null)
    : rec?.graded ? { k: rec.hits, n: rec.graded, label: LANE_WORDS[key] } : null
  const brand = isDouble ? null : brandOf(sport)
  return {
    ok: true,
    slab: {
      sport: isDouble ? null : sport, brandName: brand ? brand.name : HOUSE, kicker: isDouble ? 'THE CARD · THE DOUBLE' : `THE CARD · ${brand.league}`,
      product: PRODUCT_WORDS[product] || (product === 'straight' ? `STRAIGHT ${row.slot}` : lane === 'donovan' ? "DONOVAN'S TWO-MAN" : 'TWO-MAN'),
      market: isDouble ? 'one leg from each sport' : CARD_WORDS[sport].market, dayWord: prettyDay(String(row.card_date).slice(0, 10)),
      result: productOutcome(row.result), legs, record,
      note: 'Graded from the box score.',
    },
  }
}

/** The slab model of a night's stored receipt (cross-sport). */
export async function loadSlabReceipt({ day, db, results: given = null, only = null }) {
  // `given` = the night's graded calls handed in by the poster (the post's own, nothing is read back); `only` = the `${sport}:${id}` keys the
  // post TEXT names. The record counts the whole night (like the post's record line); the faces are only the named calls.
  if (!db && !given) return { ok: false, status: 503, why: 'not configured' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ''))) return { ok: false, status: 400, why: 'bad day' }
  let results = Array.isArray(given) ? given : null
  if (!results) {
    const { data, error } = await db.from('homer_feed_posts').select('payload').match({ day, kind: 'receipt' }).maybeSingle()
    results = !error && Array.isArray(data?.payload?.results) ? data.payload.results : []
  }
  if (!results.length) return { ok: false, status: 404, why: 'no receipt stored for that day' }
  const order = { cashed: 0, missed: 1, void: 2 }
  const keep = only ? new Set(only) : null
  const all = results.filter((r) => order[r.outcome] != null)
  const sorted = all.filter((r) => !keep || keep.has(`${r.sport}:${r.player_id}`)).sort((a, b) => order[a.outcome] - order[b.outcome] || String(a.name).localeCompare(String(b.name)))
  const adapters = {}
  const legs = await Promise.all(sorted.map(async (r) => {
    const sport = hasCards(r.sport) ? r.sport : null
    const adapter = sport ? (adapters[sport] ||= await adapterFor(sport)) : null
    const leg = { player_id: String(r.player_id), name: r.name || '' }
    const m = adapter ? await legModel(sport, leg, adapter) : { sport: sport || 'mlb', brand: brandOf('mlb'), playerId: leg.player_id, name: leg.name, team: '', opp: '', face: '', logo: '', logoPlate: false, tone: null }
    return { m, outcome: legOutcome(r.outcome), market: r.market || '', sportLabel: BRAND[sportKey(r.sport)]?.league || '' }
  }))
  if (!legs.length) return { ok: false, status: 404, why: 'no named call to show' }
  const c = { cashed: all.filter((r) => r.outcome === 'cashed').length, missed: all.filter((r) => r.outcome === 'missed').length }
  return {
    ok: true,
    slab: {
      sport: null, brandName: HOUSE, kicker: 'THE RECEIPT', product: 'NIGHT RECEIPT', market: 'every named call', dayWord: prettyDay(day),
      result: null, legs, record: c.cashed + c.missed ? { k: c.cashed, n: c.cashed + c.missed, label: 'cashed, every named call graded' } : null,
      note: 'Every call, graded.',
    },
  }
}
