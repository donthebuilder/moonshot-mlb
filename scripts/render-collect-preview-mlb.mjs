// MLB COLLECTIBLE PREVIEWS (lib/cards/collect): real multi-homer games, the action photograph full-bleed (identity validated, brightened), four tiers. Nothing is written or posted.
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/render-collect-preview-mlb.mjs <outDir> [--game 824950 --player 828599] [--also 849839:700250]
//
// WHERE THE REAL ROWS COME FROM: the MLB Stats API game feed (statsapi.mlb.com/api/v1.1/game/<pk>/feed/live), the league feed homer_feed is built from, turned into homer_feed-shaped
// rows here (this session had no database read). `role` and `on_board` are left empty: a call label is the lock's and is never made up, so these cards print no CALLED word.
import { mkdirSync, writeFileSync } from 'node:fs'
import { mlbGameLines } from '../lib/cards/moments.js'
import { collectModel } from '../lib/cards/collect/collectData.js'
import { renderCollect } from '../lib/cards/collect/collectCard.js'

const args = process.argv.slice(2)
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const out = args.find((a) => !a.startsWith('--') && a !== flag('--game') && a !== flag('--player') && a !== flag('--also'))
if (!out) { console.error('usage: render-collect-preview-mlb.mjs <outDir> [--game pk --player id] [--also pk:id]'); process.exit(2) }
mkdirSync(out, { recursive: true })
const game = flag('--game', '824950'), player = flag('--player', '828599')
const get = async (url) => { const r = await fetch(url, { headers: { 'User-Agent': 'DASHNetwork/1.0 (+https://dashnetwork.vercel.app)' } }); if (!r.ok) throw new Error(`${url} ${r.status}`); return r.json() }
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`

async function realRow(pk, pid) {
  const f = await get(`https://statsapi.mlb.com/api/v1.1/game/${pk}/feed/live`)
  const g = f.gameData
  const plays = f.liveData.plays.allPlays.filter((p) => p.result?.eventType === 'home_run' && String(p.matchup?.batter?.id) === String(pid))
  if (!plays.length) throw new Error('that batter hit no home run in that game')
  const topHalf = plays[0].about.halfInning === 'top'
  const team = topHalf ? g.teams.away.abbreviation : g.teams.home.abbreviation
  const opp = topHalf ? g.teams.home.abbreviation : g.teams.away.abbreviation
  const day = g.datetime.officialDate
  const rows = plays.map((p, i) => ({ day, player_id: String(pid), hr_n: i + 1, name: plays[0].matchup.batter.fullName, team, opponent: opp, game_pk: String(pk), inning: `${p.about.halfInning === 'top' ? 'top' : 'bot'} ${ordinal(p.about.inning)}`, home: !topHalf, role: null, on_board: false, board_rank: null, stats: {} }))
  return { line: mlbGameLines(rows).get(`${pk}:${pid}`), meta: { day, type: g.game.type, team, opp, hrs: rows.map((r) => r.inning) } }
}

const made = []
const save = async (file, row, tier, o = {}) => {
  const c = await collectModel('mlb_multi_hr', row, o)
  const png = await renderCollect(c.model, { tier })
  writeFileSync(`${out}/${file}.png`, png)
  const p = c.model.collect.portrait
  made.push({ file, tier, earned: c.earned, cardId: c.id.cardId, portrait: p })
  console.log(`${file}.png ${png.length}B tier=${tier} earned=${c.earned} id=${c.id.cardId} portrait=${p.placeholder ? `PLACEHOLDER (${p.reason})` : `${p.provider} ${p.mode} ${p.width}x${p.height} brightness ${p.enhanced?.before}->${p.enhanced?.after}${p.fellBackFrom ? ` fellBackFrom=${JSON.stringify(p.fellBackFrom)}` : ''}`}`)
  return c
}

const main = await realRow(game, player)
const last = main.line.name.split(' ').at(-1).toLowerCase()
console.log(`${main.line.name} ${main.meta.team} vs ${main.meta.opp} ${main.meta.day} (game type ${main.meta.type}) HR ${main.meta.hrs.join(', ')}`)
const earned = (await collectModel('mlb_multi_hr', main.line, {})).earned
for (const tier of ['base', 'star', 'elite', 'legend']) await save(`mlb-real-${tier}-${last}`, main.line, tier, { styleOnly: tier !== earned })
// the same man's headshot-only card (the fallback look) for comparison
await save(`mlb-headshot-fallback-${earned}-${last}`, main.line, earned, { mode: 'headshot' })

const also = flag('--also', '849839:700250')
if (also) {
  const [pk, pid] = also.split(':')
  const r = await realRow(pk, pid)
  console.log(`${r.line.name} ${r.meta.team} vs ${r.meta.opp} ${r.meta.day} (game type ${r.meta.type}: D = division series) HR ${r.meta.hrs.join(', ')}`)
  const e2 = (await collectModel('mlb_multi_hr', r.line, {})).earned
  await save(`mlb-real-${e2}-${r.line.name.split(' ').at(-1).toLowerCase()}-postseason`, r.line, e2)
}

const sharp = (await import('sharp')).default
const order = ['base', 'star', 'elite', 'legend'].map((t) => `mlb-real-${t}-${last}`)
const cw = 480, ch = 672, gap = 24
const tiles = await Promise.all(order.map(async (f, i) => ({ input: await sharp(`${out}/${f}.png`).resize(cw, ch).png().toBuffer(), left: gap + i * (cw + gap), top: gap })))
await sharp({ create: { width: gap + 4 * (cw + gap), height: ch + 2 * gap, channels: 4, background: { r: 10, g: 12, b: 15, alpha: 1 } } }).composite(tiles).png().toFile(`${out}/mlb-four-tier-sheet.png`)
writeFileSync(`${out}/mlb-manifest.json`, JSON.stringify(made, null, 2))
console.log('mlb-four-tier-sheet.png')
