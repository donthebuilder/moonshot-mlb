// THE COLLECTIBLE BACK, preview PNGs (lib/cards/collect/collectBack.js). Nothing is written or posted.
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/render-collect-back-preview.mjs <outDir> [--live]
// TEST rows (labelled TEST DATA on the face) in every tier, both faces. With --live the stat table is a REAL player's table from the sport's own source (NHL landing, MLB
// statsapi, NFL logs) beside the TEST model: the table is real, the card around it is a labelled test.
import { mkdirSync, writeFileSync } from 'node:fs'
import { collectBackModel } from '../lib/cards/collect/collectBackData.js'
import { renderCollectBack } from '../lib/cards/collect/collectBack.js'
import { TIERS } from '../lib/cards/moments.js'
import { adapterFor } from '../lib/cards/registry.js'
import * as F from '../lib/cards/specialFixtures.js'

const out = process.argv[2]
if (!out) { console.error('usage: render-collect-back-preview.mjs <outDir> [--live]'); process.exit(2) }
const live = process.argv.includes('--live')
mkdirSync(out, { recursive: true })
const sharp = (await import('sharp')).default

const FIXTURE_BACK = {
  bio: [['HT / WT', `6'0" · 205 lb`], ['SHOOTS', 'R'], ['BORN', 'TEST'], ['DRAFTED', 'TEST DATA']],
  cols: [['YEAR', 1.25, 'season'], ['TEAM', 1.9, 'tm'], ['GP', 0.95, 'gp'], ['G', 0.9, 'g'], ['A', 0.9, 'a'], ['PTS', 1.1, 'pts'], ['+/-', 1, 'pm'], ['SOG', 1.1, 'sog'], ['S%', 1, 'shp'], ['TOI', 1.1, 'toi']],
  rows: [2021, 2022, 2023, 2024, 2025, 2026].map((y, i) => ({ season: `${y - 1}-${String(y).slice(2)}`, tm: 'Test Club', gp: String(60 + i), g: String(10 + i), a: String(12 + i), pts: String(22 + 2 * i), pm: `+${i}`, sog: String(150 + i), shp: '9.5', toi: '18:00' })),
  career: { season: 'NHL TOTALS', tm: '', gp: '400', g: '90', a: '100', pts: '190', pm: '+15', sog: '1000', shp: '9.0', toi: '18:00' },
  playoffs: { season: 'PLAYOFFS', tm: '', gp: '20', g: '5', a: '6', pts: '11', pm: '+2', sog: '50', shp: '10.0', toi: '19:00' },
  title: 'CAREER STATS', note: 'TEST DATA: a fixture table, not a real player.', seasonsShown: [], source: 'fixture',
}
const REAL = { nhl: '8478402', mlb: '545361', nfl: null }

const cases = [['nhl-hat', 'nhl_hat_trick', F.TEST_HAT, 'nhl'], ['mlb-multihr', 'mlb_multi_hr', F.TEST_MULTI_HR, 'mlb'], ['nfl-multitd', 'nfl_multi_td', F.TEST_MULTI_TD, 'nfl']]
const files = []
for (const [name, key, row, sport] of cases) {
  let back = FIXTURE_BACK
  if (live && REAL[sport]) {
    const adapter = await adapterFor(sport)
    const b = await adapter.backOf({ playerId: REAL[sport], sport, pos: null, number: null, team: 'XXX' }).catch(() => null)
    if (b && b.rows.length) back = b
  }
  for (const tier of TIERS) {
    for (const face of ['stats', 'brand']) {
      const c = await collectBackModel(key, row, { test: true, face, back, tier })
      if (!c) throw new Error(`no card for ${name}`)
      c.model.collect.styleOnly = tier !== c.earned
      c.model.collect.issue = tier === 'base' ? '' : tier === 'star' ? '41' : 'PREVIEW'
      const png = await renderCollectBack(c.model, c.back, { tier, face })
      const f = `${name}-${tier}-${face}`
      writeFileSync(`${out}/${f}.png`, png)
      files.push(f)
      console.log(`${f}.png ${png.length}B id=${c.id.cardId}`)
    }
  }
}
for (const name of cases.map((c) => c[0])) {
  for (const face of ['stats', 'brand']) {
    const fl = TIERS.map((t) => `${name}-${t}-${face}`)
    const cw = 480, ch = 672, gap = 24
    const tiles = await Promise.all(fl.map(async (f, i) => ({ input: await sharp(`${out}/${f}.png`).resize(cw, ch).png().toBuffer(), left: gap + i * (cw + gap), top: gap })))
    await sharp({ create: { width: gap + fl.length * (cw + gap), height: ch + 2 * gap, channels: 4, background: { r: 10, g: 12, b: 15, alpha: 1 } } }).composite(tiles).png().toFile(`${out}/${name}-${face}-sheet.png`)
  }
}
