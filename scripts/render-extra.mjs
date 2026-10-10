// RENDER THE DUAL (Two-Man) AND SLAB (result) CARDS from REAL stored data. The same code the routes use (lib/cards/cardImage.js).
//   node --env-file=<env> --import ./scripts/proto-cards/_loader.mjs scripts/render-extra.mjs <outDir> [sport,sport] [receiptDay]
// Dual: the latest stored Two-Man (bot, and Donovan's when he entered one). Slab: every graded straight / Two-Man on file for the sport, and
// the night receipt of `receiptDay` from its stored homer_feed_posts row. Nothing here sends anything.
import { mkdirSync, writeFileSync } from 'node:fs'
import { adminClient } from '../lib/supabase/admin.js'
import { dualCardImage, slabCardImage } from '../lib/cards/cardImage.js'
import { latestCardDate } from '../lib/card/store.js'
import { LINT } from '../lib/cards/cardKit.js'

const [outDir = '/tmp/cards', sportsArg = 'nhl,mlb,nfl', receiptDay = ''] = process.argv.slice(2)
mkdirSync(outDir, { recursive: true })
const db = adminClient()
const log = []
const save = (name, png, meta) => { writeFileSync(`${outDir}/${name}`, png); console.log('wrote', name); log.push({ name, ...meta }) }
for (const sport of sportsArg.split(',')) {
  const date = await latestCardDate(db, sport)
  if (!date) { console.log(sport, 'no stored card'); continue }
  for (const lane of ['bot', 'donovan']) {
    const r = await dualCardImage({ sport, date, lane, db, publicOnly: false })
    if (!r.ok) { console.log(sport, 'dual', lane, r.why); continue }
    save(`${sport}-dual-${lane}-${date}.png`, r.png, { sport, date, lane, legs: r.dual.legs.map((l) => l.m.name), price: r.dual.price, serial: r.dual.serial })
  }
  const { data: rows } = await db.from('card_calls').select('card_date,lane,product,slot').eq('sport', sport).not('result', 'is', null).order('card_date', { ascending: false }).limit(40)
  const seen = new Set()
  for (const row of rows || []) {
    const key = `${row.card_date}|${row.lane}|${row.product}|${row.slot}`
    if (seen.has(key) || seen.size >= 4) continue
    seen.add(key)
    const r = await slabCardImage({ kind: 'card', sport, date: String(row.card_date).slice(0, 10), lane: row.lane, product: row.product, slot: row.slot, db })
    if (!r.ok) { console.log(sport, 'slab', key, r.why); continue }
    save(`${sport}-slab-${String(row.card_date).slice(0, 10)}-${row.lane}-${row.product}${row.slot}.png`, r.png, { sport, key, outcomes: r.slab.legs.map((l) => [l.m.name, l.outcome]), record: r.slab.record })
  }
}
if (receiptDay) {
  const r = await slabCardImage({ kind: 'receipt', day: receiptDay, db })
  if (r.ok) save(`receipt-slab-${receiptDay}.png`, r.png, { day: receiptDay, outcomes: r.slab.legs.map((l) => [l.m.name, l.outcome]), record: r.slab.record })
  else console.log('receipt slab', r.why)
}
writeFileSync(`${outDir}/_render-extra-log.json`, JSON.stringify({ log, lint: LINT }, null, 1))
console.log('type-floor offenders:', LINT.length)
