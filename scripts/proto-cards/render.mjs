// RENDER THE CARD PROTOTYPES from REAL current data to PNG files + one contact sheet. Prototype only: nothing
// here is imported by app/, no route is added, nothing deploys.
//   node --import ./scripts/proto-cards/_loader.mjs scripts/proto-cards/render.mjs [outDir] [only]
// Needs network (NHL api, MLB board + statsapi, the NFL data branch) and a node_modules next to the repo.
import { mkdirSync, writeFileSync } from 'node:fs'
import { loadWindows, loadNhl, loadMlb, loadNfl, cardLineup, prettyDay } from '../../lib/cards/proto/protoData.js'
import { playerCardA, playerCardB, gameCard, dayCard, LINT } from '../../lib/cards/proto/protoCards.js'
import { backOf, playerBack } from '../../lib/cards/proto/protoBack.js'
import { logoFor, inline } from '../../lib/cards/proto/protoData.js'
import { nhlTeam } from '../../lib/nhl/teams.js'
import { BRAND } from '../../lib/routes.js'

const OUT = process.argv[2] || '/Volumes/DONX/USERS/Kingdondondon/Desktop/AUDITS-TO-READ/CARD-PROTOTYPES'
mkdirSync(OUT, { recursive: true })
const made = []
const save = async (name, buf, meta) => { writeFileSync(`${OUT}/${name}`, buf); made.push({ name, ...meta }); console.log('wrote', name) }
const pickNowOf = (w) => Math.min(Date.now(), w.first_start_ms - 90 * 60e3)
const withDay = (m) => ({ ...m, dayWord: prettyDay(m.day) })
const log = {}

// ── NHL ──
const nw = (await loadWindows('nhl')).windows[0]
const nd = await loadNhl(nw, { pickNow: pickNowOf(nw) })
const top = nd.calledRows[0]
const nhlM = withDay(await nd.modelOf(top))
log.nhl = { name: nhlM.name, team: nhlM.team, face: Boolean(nhlM.face), logo: Boolean(nhlM.logo), stats: nhlM.stats.length }
const nhlBack = await backOf(nhlM)
for (const o of ['p']) {
  const tag = o === 'p' ? 'portrait' : 'landscape'
  await save(`nhl-A-${tag}.png`, await playerCardA(nhlM, o), { sport: 'nhl', kind: 'front A', o })
  await save(`nhl-B-${tag}.png`, await playerCardB(nhlM, o), { sport: 'nhl', kind: 'front B', o })
  await save(`nhl-back-${tag}.png`, await playerBack(nhlM, nhlBack, o), { sport: 'nhl', kind: 'back', o })
}
await save('nhl-A-portrait-TESTPRICE.png', await playerCardA({ ...nhlM, price: { best: '+110', books: 3, test: true } }, 'p'), { sport: 'nhl', kind: 'front A with a TEST price (layout demo only, not a stored price)', o: 'p' })
await save('nhl-A-portrait-NOFACE.png', await playerCardA({ ...nhlM, face: '', logo: '' }, 'p'), { sport: 'nhl', kind: 'front A, face + logo missing (fallback demo)', o: 'p' })
// game card: the featured player's game, its two calls
{
  const calls = nd.calledRows.filter((r) => r.gameId === top.gameId).sort((a, b) => b.score - a.score)
  const models = await Promise.all(calls.map(async (r) => withDay(await nd.modelOf(r))))
  const g = nd.night.games.find((x) => x.id === top.gameId)
  const mk = async (abbr) => { const t = nhlTeam(abbr); const lg = await logoFor('nhl', abbr); return { team: abbr, logo: lg.src, logoPlate: lg.plate, name: abbr, nick: t?.nickname || abbr, sub: t?.place || '', brand: BRAND.nhl, sport: 'nhl' } }
  const when = new Date(g.startUtc).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
  const gm = { sport: 'nhl', brand: { name: BRAND.nhl.name }, dayWord: nhlM.dayWord, when: `${when} ET`, away: await mk(g.away.abbrev), home: await mk(g.home.abbrev), calls: models }
  for (const o of ['p']) await save(`nhl-game-${o === 'p' ? 'portrait' : 'landscape'}.png`, await gameCard(gm, o), { sport: 'nhl', kind: 'game card', o })
}
// the day card (real Card selection)
const dayOf = async (sport, d, cands, w, modelFor) => {
  const lu = cardLineup(sport, cands, pickNowOf(w))
  const full = {
    sport, league: BRAND[sport].league, brandName: BRAND[sport].name, market: lu.market, dayWord: prettyDay(w.card_date),
    straights: await Promise.all(lu.straights.map(async (s) => ({ ...s, m: withDay(await modelFor(s.c)) }))),
    two: lu.two ? { ...lu.two, legs: await Promise.all(lu.two.legs.map(async (l) => ({ ...l, m: withDay(await modelFor(l.c)) }))) } : null,
  }
  for (const o of ['p']) { try { await save(`${sport}-card-${o === 'p' ? 'portrait' : 'landscape'}.png`, await dayCard(full, o), { sport, kind: 'THE CARD (day lineup)', o }) } catch (e) { console.log(`SKIP ${sport} day card ${o}: ${e.message}`) } }
  return full
}
const nhlDay = await dayOf('nhl', nd, nd.cands.cands, nw, (c) => nd.modelOf(nd.rowById(c.player_id)))
log.nhlCard = { straights: nhlDay.straights.map((s) => s.m.name), two: nhlDay.two?.legs.map((l) => l.m.name) || null }

// ── MLB ──
const mw = (await loadWindows('mlb')).windows[0]
const md = await loadMlb(mw, { pickNow: pickNowOf(mw) })
const mTop = [...md.cands.cands].filter((c) => c.status === 'called').sort((a, b) => b.score - a.score)[0]
const mlbM = withDay(await md.modelOf(mTop))
log.mlb = { name: mlbM.name, team: mlbM.team, face: Boolean(mlbM.face), logo: Boolean(mlbM.logo), stats: mlbM.stats.length }
const mlbBack = await backOf(mlbM)
for (const o of ['p']) {
  const tag = o === 'p' ? 'portrait' : 'landscape'
  await save(`mlb-A-${tag}.png`, await playerCardA(mlbM, o), { sport: 'mlb', kind: 'front A', o })
  await save(`mlb-back-${tag}.png`, await playerBack(mlbM, mlbBack, o), { sport: 'mlb', kind: 'back', o })
}
const mlbDay = await dayOf('mlb', md, md.cands.cands, mw, (c) => md.modelOf(c))
log.mlbCard = { straights: mlbDay.straights.map((s) => s.m.name), two: mlbDay.two?.legs.map((l) => l.m.name) || null }

// ── NFL ──
const ws = (await loadWindows('nfl')).windows
const fw = ws.find((x) => x.first_start_ms > Date.now()) || ws[0]
const fd = await loadNfl(fw, { pickNow: pickNowOf(fw) })
const fTop = [...fd.cands.cands].filter((c) => c.status === 'called').sort((a, b) => b.score - a.score)[0]
const nflM = withDay(await fd.modelOf(fTop))
log.nfl = { name: nflM.name, team: nflM.team, face: Boolean(nflM.face), logo: Boolean(nflM.logo), stats: nflM.stats.length, window: fw.label }
const nflBack = await backOf(nflM)
for (const o of ['p']) {
  const tag = o === 'p' ? 'portrait' : 'landscape'
  await save(`nfl-A-${tag}.png`, await playerCardA(nflM, o), { sport: 'nfl', kind: 'front A', o })
  await save(`nfl-back-${tag}.png`, await playerBack(nflM, nflBack, o), { sport: 'nfl', kind: 'back', o })
}
const nflDay = await dayOf('nfl', fd, fd.cands.cands, fw, (c) => fd.modelOf(c))
log.nflCard = { straights: nflDay.straights.map((s) => s.m.name), two: nflDay.two?.legs.map((l) => l.m.name) || null }

log.backs = { nhl: nhlBack.seasonsShown, mlb: mlbBack.seasonsShown, nfl: nflBack.seasonsShown }
log.typeFloorViolations = LINT
writeFileSync(`${OUT}/_render-log.json`, JSON.stringify(log, null, 1))

// ── the contact sheet ──
const by = (f) => made.filter(f)
const img = (x) => `<figure><img src="${x.name}" loading="lazy"><figcaption>${x.name}<br><small>${x.kind}</small></figcaption></figure>`
const section = (title, items) => `<h2>${title}</h2><div class="row ${items[0]?.o === 'p' ? 'portrait' : 'land'}">${items.map(img).join('')}</div>`
const html = `<!doctype html><meta charset="utf-8"><title>DASH card prototypes</title>
<style>body{background:#0b0b0d;color:#efe9dd;font:15px system-ui;margin:24px}h1{font-size:22px}h2{margin:32px 0 8px;font-size:17px;border-bottom:1px solid #333;padding-bottom:4px}
.row{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0}.portrait img{width:360px}.land img{width:600px}img{display:block;border-radius:6px;border:1px solid #333}figcaption{font-size:12px;color:#b9b2a8;margin-top:4px}</style>
<h1>DASH Network card prototypes (real data, ${new Date().toISOString().slice(0, 10)}). Prototype only: nothing wired, nothing deployed.</h1>
${[['nhl', 'NHL / LAMP'], ['mlb', 'MLB / MOONSHOT'], ['nfl', 'NFL / TUDDY']].map(([s, t]) => [
  section(`${t}: player card portrait (front A, front B, back)`, by((x) => x.sport === s && x.o === 'p' && /front|back/.test(x.kind))),
  section(`${t}: player card landscape`, by((x) => x.sport === s && x.o === 'l' && /front|back/.test(x.kind))),
  section(`${t}: THE CARD and game card`, by((x) => x.sport === s && /CARD|game/.test(x.kind))),
].join('')).join('')}`
writeFileSync(`${OUT}/contact-sheet.html`, html)
console.log(JSON.stringify(log, null, 1))
