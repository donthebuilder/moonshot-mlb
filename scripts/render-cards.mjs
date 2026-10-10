// RENDER THE PRODUCTION CARDS from REAL current data to PNG files (the same code the routes and the posts use: lib/cards/cardImage.js).
//   node --env-file=<env> --import ./scripts/proto-cards/_loader.mjs scripts/render-cards.mjs <outDir> [sport=nhl,mlb,nfl] [perSport=3] [width=1080]
// Needs network and a node_modules next to the repo. Prices come from stored odds when the env reaches the database; none otherwise.
import { mkdirSync, writeFileSync } from 'node:fs'
import { loadWindows, loadCandidates } from '../lib/card/sources.js'
import { loadPlayerModel, renderModel, dayCardImage } from '../lib/cards/cardImage.js'
import { latestCardDate } from '../lib/card/store.js'
import { LINT } from '../lib/cards/cardKit.js'
import { adminClient } from '../lib/supabase/admin.js'

const [outDir = '/tmp/cards', sportsArg = 'nhl,mlb,nfl', perArg = '3', widthArg = '1080'] = process.argv.slice(2)
mkdirSync(outDir, { recursive: true })
let db = null
try { db = adminClient() } catch { db = null }
const log = { used: [], lint: LINT }
for (const sport of sportsArg.split(',')) {
  const w = await loadWindows(sport)
  if (!w.ok || !w.windows.length) { console.log(sport, 'no window', w.why); continue }
  const win = w.windows.find((x) => x.first_start_ms > Date.now()) || w.windows[0]
  const c = await loadCandidates(sport, win, Date.now(), { all: false })
  const called = (c.cands || []).filter((x) => x.status === 'called').sort((a, b) => b.score - a.score).slice(0, Number(perArg))
  for (const p of called) {
    const loaded = await loadPlayerModel({ sport, id: p.player_id, date: win.card_date, db })
    if (!loaded.ok) { console.log(sport, p.name, loaded.why); continue }
    for (const side of ['front', 'back']) {
      const r = await renderModel(loaded.model, loaded.adapter, { side, width: Number(widthArg) })
      if (!r.ok) { console.log(sport, p.name, side, r.why); continue }
      const f = `${outDir}/${sport}-${String(p.name).toLowerCase().replace(/[^a-z]+/g, '-')}-${side}${Number(widthArg) === 1080 ? '' : `-${widthArg}`}.png`
      writeFileSync(f, r.png)
      console.log('wrote', f, r.png.length)
      if (side === 'back') log.used.push({ sport, name: p.name, day: win.card_date, seasons: r.back?.seasonsShown, price: loaded.model.price, poolNote: loaded.model.statNote })
    }
  }
}
if (db) for (const sport of sportsArg.split(',')) {
  const date = await latestCardDate(db, sport)
  if (!date) { console.log(sport, 'no stored card'); continue }
  for (const scope of ['free', 'full']) {
    const r = await dayCardImage({ sport, date, scope, width: Number(widthArg), db })
    if (!r.ok) { console.log(sport, 'day', scope, r.why); continue }
    writeFileSync(`${outDir}/${sport}-day-${scope}-${date}.png`, r.png)
    console.log('wrote day', sport, scope, date)
    log.used.push({ sport, day: date, kind: `day-${scope}`, straights: r.day.straights.map((x) => x.m.name), two: r.day.two?.legs.map((l) => l.m.name) || null, donovan: r.day.donovan?.legs.map((l) => l.m.name) || null })
  }
}
writeFileSync(`${outDir}/_render-log.json`, JSON.stringify({ ...log, lint: LINT }, null, 1))
console.log(JSON.stringify(log.used, null, 1), 'type-floor offenders:', LINT.length)
