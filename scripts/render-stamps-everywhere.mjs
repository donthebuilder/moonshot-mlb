// STAMPS EVERYWHERE, BEFORE / AFTER (TEST data only). One PNG per card type: BEFORE (no stamp) on the left, AFTER (with the stamp) on the right, captioned TEST DATA.
// The stamps below are passed in by hand as labelled TEST values (the real ones come from stored game logs through lib/cards/situationData.js, never from this file).
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/render-stamps-everywhere.mjs [outDir]
import { mkdirSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'
import * as P from '../lib/cards/postseason.js'
import { renderPostseason } from '../lib/cards/postseasonCard.js'
import { renderDual } from '../lib/cards/dualCard.js'
import { renderNMan } from '../lib/cards/nManCard.js'
import { stressSet as dualSet } from './proto-cards/dualStressFixtures.mjs'
import { stressSet as nSet } from './proto-cards/nManStressFixtures.mjs'
import { row } from './poster-fixtures.mjs'

const OUT = process.argv[2] || '/Volumes/DONX/USERS/Kingdondondon/Desktop/AUDITS-TO-READ/STAMPS-EVERYWHERE'
mkdirSync(OUT, { recursive: true })
const T = (text, key = 'streak') => ({ key, label: key, text, explain: 'TEST' })
const bytes = async (x) => (Buffer.isBuffer(x) || x instanceof Uint8Array ? Buffer.from(x) : Buffer.from(await x.arrayBuffer()))
async function pair(name, before, after, cap) {
  const [a, b] = [await sharp(await bytes(await before)).png().toBuffer(), await sharp(await bytes(await after)).png().toBuffer()]
  const [ma, mb] = [await sharp(a).metadata(), await sharp(b).metadata()]
  const H = Math.max(ma.height, mb.height), bar = 56, gap = 24
  const W = ma.width + mb.width + gap
  const svg = Buffer.from(`<svg width="${W}" height="${bar}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${bar}" fill="#111"/><text x="16" y="36" font-family="Helvetica, Arial, sans-serif" font-size="26" font-weight="700" fill="#fff">${cap}  |  BEFORE (left), AFTER (right)  |  TEST DATA</text></svg>`)
  const out = await sharp({ create: { width: W, height: H + bar, channels: 4, background: '#111' } }).composite([
    { input: svg, left: 0, top: 0 }, { input: a, left: 0, top: bar }, { input: b, left: ma.width + gap, top: bar },
  ]).png().toBuffer()
  writeFileSync(`${OUT}/${name}.png`, out)
  console.log(`wrote ${name}.png ${W}x${H + bar}`)
}

// the TEST hitter (copied from scripts/check-postseason-cards.mjs)
const hs = (o) => ({ gamesPlayed: 1, plateAppearances: 4, atBats: 4, runs: 0, hits: 0, doubles: 0, triples: 0, homeRuns: 0, rbi: 0, baseOnBalls: 0, strikeOuts: 0, hitByPitch: 0, sacFlies: 0, totalBases: 0, stolenBases: 0, ...o })
const log = [
  { date: '2026-10-01', gameType: 'F', opponent: { id: 1, name: 'Test Opponent A' }, isHome: true, game: { gamePk: 1 }, stat: { ...hs({ hits: 2, doubles: 1, totalBases: 3, rbi: 1, runs: 1 }), summary: '2-4 | 2B, RBI' } },
  { date: '2026-10-02', gameType: 'F', opponent: { id: 1, name: 'Test Opponent A' }, isHome: true, game: { gamePk: 2 }, stat: { ...hs({ hits: 1, homeRuns: 1, totalBases: 4, rbi: 2, runs: 1, baseOnBalls: 1, plateAppearances: 5 }), summary: '1-4 | HR, BB' } },
  { date: '2026-10-05', gameType: 'D', opponent: { id: 2, name: 'Test Opponent B' }, isHome: false, game: { gamePk: 3 }, stat: { ...hs({ strikeOuts: 2 }), summary: '0-4 | 2 K' } },
  { date: '2026-10-11', gameType: 'L', opponent: { id: 3, name: 'Test Opponent C' }, isHome: false, game: { gamePk: 4 }, stat: { ...hs({ hits: 3, homeRuns: 2, totalBases: 9, rbi: 4, runs: 2, sacFlies: 1, plateAppearances: 5 }), summary: '3-4 | 2 HR, 4 RBI' } },
]
const sum = (k) => log.reduce((a, s) => a + (s.stat[k] || 0), 0)
const season = { ...Object.fromEntries(['plateAppearances', 'atBats', 'runs', 'hits', 'doubles', 'triples', 'homeRuns', 'rbi', 'baseOnBalls', 'strikeOuts', 'hitByPitch', 'sacFlies', 'totalBases', 'stolenBases'].map((k) => [k, sum(k)])), gamesPlayed: 4 }

// ── the model ──
const player = { id: '999001', name: 'Test Hitter', pos: 'DH', number: '7', season: '2026', team: 'NYY', teamName: 'New York Yankees', league: 'AL', bio: [['HT / WT', '6\' 2" · 200 lb']], hitting: { season: { ...season, avg: '.375', obp: '.450', slg: '1.000', ops: '1.450' }, log, career: { gamesPlayed: 11, atBats: 37, hits: 12, homeRuns: 5, rbi: 13, runs: 7, baseOnBalls: 5, strikeOuts: 14, avg: '.324', obp: '.395', slg: '.784', ops: '1.179' } }, pitching: { season: null, log: [], career: null }, face: '', logo: '', tone: null }

// ── posters (one pregame stamp, ONE slot on the portrait) ──
const site = { site: 'test.local' }
const H = await import('../lib/dash/homerCard.js')
const { goalCard } = await import('../lib/nhl/goalCard.js')
const { tdCard } = await import('../lib/nfl/tdCard.js')
const { spotlightCard } = await import('../lib/nfl/spotlightCard.js')
const mlbRow = row({ name: 'Test Hitter', day: '2026-10-12' })
const hsPick = { name: 'Test Hitter', team: 'NYY', player_id: '682829', ops: '1.012', avg: '.351', obp: '.420', slg: '.592', hr: 7, rbi: 19, games: 15, ab: 57, pitcher: 'Test Arm', season: { games: 140, avg: '.280', obp: '.350', slg: '.480', ops: '.830' } }
const run = async (name, cap, fn, stamp) => pair(name, fn({ ...site, stamps: [] }), fn({ ...site, stamps: [stamp] }), cap)
await run('mlb-homer-poster', 'MLB homer poster', (o) => H.homerCard(mlbRow, o), T('HR in 4 straight'))
await run('mlb-mlbhr-poster', 'MLB @MLBHR reply poster', (o) => H.mlbhrCard(mlbRow, { kind: 'solo', distance: 431, seasonHr: 31 }, { ...o, boardSize: 36, postedAt: '2026-01-02T22:05:00Z' }), T('2 HR from 30', 'milestone'))
await run('mlb-hotstretch-poster', 'MLB hot stretch poster', (o) => H.hotStretchCard('2026-10-12', hsPick, { ...o, window: 'month', windowLabel: 'LAST 15 GAMES' }), T('6 days since his last game', 'rest'))
await run('mlb-longshot-poster', 'MLB longshot poster', (o) => H.longshotCard('2026-10-12', { name: 'Test Hitter', team: 'NYY', opponent: 'BOS', player_id: '682829', role: 'TOP', hr_score: 88, over: 650, book: 'TestBook', pitcher: 'Test Arm', pitcherTeam: 'BOS', pitcherHr9: 1.74, blastPct: 18, barrelPct: 14, hardHitPct: 51 }, o), T('Birthday: turns 27', 'birthday'))
const goal = { name: 'Test Skater', team: 'EDM', opp: 'TOR', status: 'called', season: '20252026', player_id: '8478402', season_goals: 40, period: 2, time_in_period: '12:44', strength: 'pp', score_after: 'EDM 3, TOR 2', lamp_score: 91, rank_in_game: 1, day: '2026-10-12', assists: [{ name: 'Test Assistant' }] }
await run('nhl-goal-poster', 'NHL goal poster', (o) => goalCard(goal, o), T('Goal in 5 straight'))
const td = { scorerName: 'Test Receiver', team: 'BUF', opponent: 'MIA', position: 'WR', jersey: 14, gsisId: '00-0023459', day: '2026-10-12', kindWord: 'Passing TD', awayScore: 17, homeScore: 21, quarter: 3, clock: '4:12', parsed: { yards: 38, passer: 'Test Passer', kind: 'pass' }, onBot: { score: 87, rank: 2, market: 'TD', grade: 'A' }, tdBoard: { rank: 2, of: 120 }, seasonToDate: { td: 8, games: 9, last3Games: 3, last3Td: 4 }, defense: { tag: 'TARGET', detail: 'MIA allows 1.8 TD / game to WR1', role: 'WR1' } }
await run('nfl-td-poster', 'NFL touchdown poster', (o) => tdCard(td, o), T('TD in 3 straight'))
const spot = { name: 'Test Quarterback', team: 'BUF', player_id: '00-0023459', jersey: 17, position: 'QB', opp: 'MIA', day: '2026-10-12', seasonTd: 31, patd: 3, rutd: 2, rectd: 0, payd: 312, ruyd: 64, rec: 0, recyd: 0, avg: { td: 1.4, xtd: 1.2, payd: 250, ruyd: 22 } }
await run('nfl-spotlight-poster', 'NFL spotlight poster', (o) => spotlightCard(spot, { ...o, windowLabel: 'WEEK 5', statement: 'Five total touchdowns on Thursday night', context: 'TEST CONTEXT LINE' }), T('1 TD from 5', 'milestone'))

// ── postseason front (a NEW fact only: never the round) ──
const post = P.postseasonLine(player).model
await pair('mlb-postseason-front', renderPostseason({ ...post, stamps: [] }, { side: 'front' }), renderPostseason({ ...post, stamps: [T('First career postseason HR', 'first')] }, { side: 'front' }), 'MLB postseason card')

// ── two-man and N-man (ONE shared line under the title: a fact true for every leg) ──
const SPORTS = { mlb: { brandName: 'MOONSHOT', market: 'home run', opp: 'BOS' }, nfl: { brandName: 'TUDDY', market: 'anytime touchdown', opp: 'MIA' }, nhl: { brandName: 'LAMP', market: 'anytime goal', opp: 'TOR' } }
const dual0 = dualSet()[0].d
const n6 = nSet().find((x) => x.id === '01-six-typical').d
const as = (d, sport) => ({ ...d, sport, brandName: SPORTS[sport].brandName, market: SPORTS[sport].market, legs: d.legs.map((l) => ({ ...l, m: { ...l.m, sport, opp: SPORTS[sport].opp } })) })
for (const sport of ['mlb', 'nfl', 'nhl']) {
  const d = as(dual0, sport), n = as(n6, sport)
  await pair(`${sport}-two-man`, renderDual({ ...d, shared: null }), renderDual({ ...d, shared: `Both face ${SPORTS[sport].opp}` }), `${sport.toUpperCase()} two-man card`)
  await pair(`${sport}-n-man`, renderNMan({ ...n, shared: null }), renderNMan({ ...n, shared: `All ${n.legs.length} face ${SPORTS[sport].opp}` }), `${sport.toUpperCase()} N-man card`)
}
