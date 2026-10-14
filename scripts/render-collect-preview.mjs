// COLLECTIBLE CARD PREVIEWS (lib/cards/collect): a four-tier sheet for a REAL NHL hat trick, plus a LEGEND from a clearly labelled TEST row. Nothing is written to a database or posted.
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/render-collect-preview.mjs <outDir> [--game 2026020091] [--player 8480801]
//
// WHERE THE REAL ROWS COME FROM: the league's own play-by-play for the game (api-web.nhle.com, the feed lamp_goal_feed is built from), turned into lamp_goal_feed-shaped rows
// here. When this session could not read the database, this is the stored event's source of truth; the card id is the same either way (it hashes game, player, achievement,
// season and rules version, not the row's origin). `status` is left empty: a call label is the lock's and is never made up, so the card prints no CALLED word.
import { mkdirSync, writeFileSync } from 'node:fs'
import { nhlGameLines } from '../lib/cards/moments.js'
import { collectModel } from '../lib/cards/collect/collectData.js'
import { renderCollect } from '../lib/cards/collect/collectCard.js'
import * as F from '../lib/cards/specialFixtures.js'

const args = process.argv.slice(2)
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const out = args.find((a) => !a.startsWith('--') && a !== flag('--game') && a !== flag('--player'))
if (!out) { console.error('usage: render-collect-preview.mjs <outDir> [--game id] [--player id]'); process.exit(2) }
mkdirSync(out, { recursive: true })
const game = flag('--game', '2026020091'), player = flag('--player', '8480801')

const get = async (url) => { const r = await fetch(url, { headers: { 'User-Agent': 'DASHNetwork/1.0 (+https://dashnetwork.vercel.app)' } }); if (!r.ok) throw new Error(`${url} ${r.status}`); return r.json() }
const pbp = await get(`https://api-web.nhle.com/v1/gamecenter/${game}/play-by-play`)
const side = (id) => (id === pbp.homeTeam.id ? 'home' : 'away')
const abbrevOf = (id) => (id === pbp.homeTeam.id ? pbp.homeTeam.abbrev : pbp.awayTeam.abbrev)
const goals = pbp.plays.filter((p) => p.typeDescKey === 'goal' && String(p.details?.scoringPlayerId) === String(player))
if (!goals.length) { console.error('that player scored no goals in that game'); process.exit(1) }
const land = await get(`https://api-web.nhle.com/v1/player/${player}/landing`)
const name = `${land.firstName.default} ${land.lastName.default}`
const rows = goals.map((p, i) => {
  const d = p.details, team = abbrevOf(d.eventOwnerTeamId), opp = team === pbp.homeTeam.abbrev ? pbp.awayTeam.abbrev : pbp.homeTeam.abbrev
  const sit = String(p.situationCode), own = Number(sit[side(d.eventOwnerTeamId) === 'away' ? 1 : 2]), them = Number(sit[side(d.eventOwnerTeamId) === 'away' ? 2 : 1])
  return {
    game_id: Number(game), player_id: Number(player), goal_n: i + 1, day: pbp.gameDate, season: pbp.season, period: p.periodDescriptor.number, period_type: p.periodDescriptor.periodType,
    time_in_period: p.timeInPeriod, strength: own > them ? 'pp' : own < them ? 'sh' : 'ev', empty_net: false, team, opp, name, season_goals: d.scoringPlayerTotal,
    assists: [], score_after: `${pbp.awayTeam.abbrev} ${d.awayScore} · ${pbp.homeTeam.abbrev} ${d.homeScore}`, status: null, overturned_at: null,
  }
})
const real = nhlGameLines(rows).get(`${game}:${player}`)
console.log(`${name} ${rows[0].team} ${pbp.gameDate} goals=${real.goals.length} (${rows.map((r) => `${r.period}P ${r.time_in_period} ${r.strength}`).join(', ')})`)

// a TEST LEGEND: four goals by a made-up skater (the fixtures' own TEST rows); no real portrait is ever fetched for a TEST row
const testLegend = { ...F.TEST_HAT, goals: [...F.TEST_HAT.goals, { ...F.TEST_HAT.goals[2], goal_n: 4, time_in_period: '19:59' }] }

const made = []
const save = async (file, key, row, tier, o = {}) => {
  const c = await collectModel(key, row, o)
  if (!c) throw new Error(`no card for ${file}`)
  const png = await renderCollect(c.model, { tier })
  writeFileSync(`${out}/${file}.png`, png)
  made.push({ file, tier, earned: c.earned, cardId: c.id.cardId, portrait: c.model.collect.portrait, test: Boolean(o.test), styleOnly: tier !== c.earned })
  console.log(`${file}.png  ${png.length}B  tier=${tier} earned=${c.earned} id=${c.id.cardId} portrait=${c.model.collect.portrait.placeholder ? `PLACEHOLDER (${c.model.collect.portrait.reason})` : `${c.model.collect.portrait.provider} ${c.model.collect.portrait.width}x${c.model.collect.portrait.height}`}`)
}
for (const tier of ['base', 'star', 'elite', 'legend']) await save(`real-${tier}-${name.split(' ').at(-1).toLowerCase()}`, 'nhl_hat_trick', real, tier, { styleOnly: tier !== 'elite' })
await save('TEST-legend-4-goals', 'nhl_hat_trick', testLegend, 'legend', { test: true })
await save('TEST-goal-ot-star', 'nhl_goal', F.TEST_GOAL_OT, 'star', { test: true })
await save('TEST-goal-base', 'nhl_goal', F.TEST_GOAL, 'base', { test: true })

// the sheet: BASE, STAR, ELITE (real, style previews except ELITE which is earned) and the TEST LEGEND
const sharp = (await import('sharp')).default
const order = ['real-base-tkachuk', 'real-star-tkachuk', 'real-elite-tkachuk', 'TEST-legend-4-goals']
const cw = 480, ch = 672, gap = 24
const tiles = await Promise.all(order.map(async (f, i) => ({ input: await sharp(`${out}/${f}.png`).resize(cw, ch).png().toBuffer(), left: gap + i * (cw + gap), top: gap })))
await sharp({ create: { width: gap + 4 * (cw + gap), height: ch + 2 * gap, channels: 4, background: { r: 10, g: 12, b: 15, alpha: 1 } } }).composite(tiles).png().toFile(`${out}/four-tier-sheet.png`)
writeFileSync(`${out}/manifest.json`, JSON.stringify(made, null, 2))
console.log('four-tier-sheet.png')
