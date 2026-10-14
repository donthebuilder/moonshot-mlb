// NFL AND LONG-SHOT COLLECTIBLE PREVIEWS (lib/cards/collect). Nothing is written or posted.
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/render-collect-preview-nfl.mjs <outDir>
// NFL: a REAL 100-yard game from the game logs the site publishes (nfl_logs.json on the bot's data branch, the same file nfl_100_yards reads; names from the week file), ESPN headshot
// (identity checked by GSIS -> ESPN id, club, name; metadata gate; face-cropped to a square; brightened), four tiers (the earned one real, the others labelled style previews).
// Multi-TD and LONG SHOT: TEST rows (this session has no database read: touchdown plays and lock prices live in nfl_td_feed / odds_snap). They wear the monogram placeholder and say TEST DATA:
// a made-up price never sits beside a real man's face.
import { mkdirSync, writeFileSync } from 'node:fs'
import { nflLogYardRows } from '../lib/cards/moments.js'
import { collectModel } from '../lib/cards/collect/collectData.js'
import { renderCollect } from '../lib/cards/collect/collectCard.js'
import { faceBrightness } from '../lib/cards/collect/faceCheck.js'
import { fetchNfl, nflLogPaths, nflSlatePaths, nflSlateLooksReal } from '../lib/nfl/dataSource.js'
import { headshotIdFor } from '../lib/nfl/headshotIds.js'
import * as F from '../lib/cards/specialFixtures.js'

const out = process.argv[2]
if (!out) { console.error('usage: render-collect-preview-nfl.mjs <outDir>'); process.exit(2) }
mkdirSync(out, { recursive: true })
const sharp = (await import('sharp')).default
const made = []
const save = async (file, key, row, tier, o = {}) => {
  const c = await collectModel(key, row, { ...o, tier })
  if (!c) throw new Error(`no card for ${file}`)
  if (o.styleOnly === undefined) c.model.collect.styleOnly = tier !== c.earned   // a tier the event did not earn says so on its face
  const png = await renderCollect(c.model, { tier })
  writeFileSync(`${out}/${file}.png`, png)
  const face = await faceBrightness(c.model, tier, png, c.model.rawUri)
  const p = c.model.collect.portrait
  made.push({ file, tier, earned: c.earned, cardId: c.id.cardId, variant: c.model.collect.variant, portrait: p, face })
  console.log(`${file}.png ${png.length}B tier=${tier} earned=${c.earned} id=${c.id.cardId} view=${c.model.collect.variant.view.light}/${c.model.collect.variant.view.zoom} face ${face ? `raw ${face.raw} -> card ${face.card} (x${face.ratio})` : 'n/a'} portrait=${p.placeholder ? `PLACEHOLDER (${p.reason})` : `${p.provider} ${p.mode} ${p.width}x${p.height} brightness ${p.enhanced?.before}->${p.enhanced?.after}`}`)
  return c
}
const sheet = async (files, name) => {
  const cw = 480, ch = 672, gap = 24
  const tiles = await Promise.all(files.map(async (f, i) => ({ input: await sharp(`${out}/${f}.png`).resize(cw, ch).png().toBuffer(), left: gap + i * (cw + gap), top: gap })))
  await sharp({ create: { width: gap + files.length * (cw + gap), height: ch + 2 * gap, channels: 4, background: { r: 10, g: 12, b: 15, alpha: 1 } } }).composite(tiles).png().toFile(`${out}/${name}.png`)
  console.log(`${name}.png`)
}

// ── NFL: a real 100-yard game (this season's, the latest, a man the headshot table knows) ──
const [logs, week] = await Promise.all([fetchNfl(nflLogPaths()).catch(() => null), fetchNfl(nflSlatePaths(), nflSlateLooksReal).catch(() => null)])
if (!logs) throw new Error('the published game logs could not be read')
const names = new Map((week?.players || []).map((p) => [String(p.player_id), p.name]))
const rows = nflLogYardRows({ logs, names }).filter((r) => r.name && r.team && headshotIdFor(r.gsis_id) && r.season)
const season = Math.max(...rows.map((r) => r.season))
const recent = rows.filter((r) => r.season === season).sort((a, b) => (b.week || 0) - (a.week || 0))
// prefer a 150+ game of the latest week that has one (an ELITE card), else the latest 100-yard game
const mostRecent = recent[0]?.week
const pick = recent.filter((r) => r.week === mostRecent).sort((a, b) => Math.max(b.rush_yds || 0, b.rec_yds || 0) - Math.max(a.rush_yds || 0, a.rec_yds || 0))[0]
const row = { ...pick, home: pick.home }
console.log(`NFL real: ${row.name} ${row.team} vs ${row.opp} season ${row.season} week ${row.week} ${row.day || ''} rush ${row.rush_yds} rec ${row.rec_yds}`)
const earned = (await collectModel('nfl_100_yards', row, {})).earned
const last = row.name.split(' ').at(-1).toLowerCase()
for (const tier of ['base', 'star', 'elite', 'legend']) await save(`nfl-real-${tier}-${last}`, 'nfl_100_yards', row, tier, { styleOnly: tier !== earned })
await sheet(['base', 'star', 'elite', 'legend'].map((t) => `nfl-real-${t}-${last}`), 'nfl-four-tier-sheet')

// ── NFL multi-TD (TEST) ──
for (const tier of ['star', 'elite']) await save(`nfl-TEST-multitd-${tier}`, 'nfl_multi_td', F.TEST_MULTI_TD, tier, { test: true })

// ── LONG SHOT (TEST: a made-up price on a made-up man, with a stored lock-snapshot price shape) ──
const shot = { ...F.TEST_LONG_SHOT, price_source: 'lock', best: 2400, books: 4 }
for (const [tier, row2] of [['base', { ...shot, best: 2400 }], ['star', { ...shot, best: 800 }], ['elite', { ...shot, best: 1500 }], ['legend', { ...shot, best: 2400 }]]) await save(`longshot-TEST-${tier}`, 'long_shot_cashed', row2, tier, { test: true })
await sheet(['base', 'star', 'elite', 'legend'].map((t) => `longshot-TEST-${t}`), 'longshot-four-tier-sheet')
writeFileSync(`${out}/nfl-manifest.json`, JSON.stringify(made, null, 2))
