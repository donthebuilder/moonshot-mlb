// TEST DATA (labelled): every number below is made up for this check -- a made-up club "TST" against "OPP", made-up
// skaters, shots and goalies in the shape of the board / shot map / goalie routes. It is never shown on the site.
// Fails if a depth sentence prints a digit that is not in its own `v`, if a raw `v` is not in the input, if a
// recipe's arguments are not in the input or its `out` is not what DERIVE gives, if a thin sample still wrote a
// line, if a finished game read the as-of-now inputs, or if the same input writes two different texts.
//   node --import ./scripts/_esm-resolve.mjs scripts/writeups/test-nhl-depth.mjs
//   node --import ./scripts/_esm-resolve.mjs scripts/writeups/test-nhl-depth.mjs --live [--base https://dashnetwork.vercel.app] [--date YYYY-MM-DD]
// --live runs the same trace check on REAL data fetched from the site (the board, the shot maps, the goalies) and prints the sentences.
import { nhlDepth, nhlGameDepth, DERIVE, roundTo } from '../../lib/writeups/nhl.js'
import { XG_COEF } from '../../lib/nhl/xg.js'

let bad = 0
const fail = (m) => { bad++; console.error('FAIL', m) }
export const numbersIn = (text) => (String(text).match(/\d+(?:\.\d+)?/g) || []).map(Number)

/** the whole trace check on one set of sections; `input` is everything the sections were built from */
export function traceCheck(sections, input, label) {
  const flat = new Set()
  const walk = (x) => { if (x && typeof x === 'object') Object.values(x).forEach(walk); else if (x !== null && x !== '' && typeof x !== 'boolean' && Number.isFinite(Number(x))) flat.add(Number(x)) }
  walk(input)
  let n = 0
  for (const sec of sections) for (const l of sec.lines) {
    n++
    const at = `${label} [${sec.key}] "${l.t}"`
    if (!l.src) fail(`${at} has no source`)
    if (/probabilit|chance|%\s*to score/i.test(l.t)) fail(`${at} words a probability`)
    if (/expected goals/i.test(l.t) && !/^shots\./.test(l.src)) fail(`${at} says expected goals outside a shot-model line`)
    const outs = []
    for (const c of l.calc || []) {
      if (typeof DERIVE[c.op] !== 'function') { fail(`${at} unknown recipe ${c.op}`); continue }
      for (const a of c.args) if (!flat.has(a) && !outs.includes(a)) fail(`${at} recipe ${c.op} uses ${a}, which is not in the input`)
      const again = roundTo(DERIVE[c.op](...c.args), c.dp)
      if (again !== c.out) fail(`${at} recipe ${c.op} says ${c.out}, re-run gives ${again}`)
      outs.push(c.out)
    }
    for (const x of numbersIn(l.t)) if (!l.v.includes(x)) fail(`${at} prints ${x}, which is not in its v ${JSON.stringify(l.v)}`)
    for (const x of l.v) if (!flat.has(x) && !outs.includes(x)) fail(`${at} cites ${x}, which is neither in the input nor a recipe's output`)
  }
  return n
}

const zone = (sa, ga) => ({ sa, ga })
const SHOTS = {
  stale: false, season: 20262027,
  league: { slotShare: 0.37, games: 1300, sog: 73000 },
  all: {
    games: 20, attempts: 150, sog: 120, goals: 14, misses: 20, blocked: 10, slotShare: 0.4, distSog: 31, distGoal: 22,
    byStrength: { ev: 120, pp: 25, sh: 5 },
    types: { wrist: { att: 70, sog: 55, g: 8 }, snap: { att: 30, sog: 25, g: 4 }, 'tip-in': { att: 10, sog: 8, g: 2 } },
    xg: { version: 'lamp-xg-v1', total: 12.34, sog: 118, goals: 14 },
  },
  last10: { games: 10, sog: 70 },
}
const AGAINST = { all: { games: 22, sog: 700, slotShare: 0.4, xg: { total: 70.5, sog: 690, goals: 60 } }, league: { slotShare: 0.37, games: 1300, sog: 73000 }, stale: false }
const GOALIES = { season: 20262027, goalies: [
  { id: '99', name: 'Test Goalie', team: 'OPP', gp: 12, gs: 11, svPct: 0.9123, sa: 320 },
  { id: '98', name: 'Test Backup', team: 'OPP', gp: 5, gs: 4, svPct: 0.9, sa: 100 },
] }
const ZONES = { '99': { available: true, goalie: { ga: 28, sa: 320, zones: { slot: zone(100, 14), crease: zone(40, 8), l_point: zone(180, 6) } }, league: { zones: { slot: zone(20000, 2700), crease: zone(7000, 1400), l_point: zone(11000, 540) } } } }
const SPECIAL = { stale: false, teams: [
  { abbrev: 'TST', gp: 20, ppPct: 0.231, ppOppPg: 3.2, pkPct: 0.81, shPg: 2.9 },
  { abbrev: 'OPP', gp: 20, ppPct: 0.2, ppOppPg: 2.8, pkPct: 0.784, shPg: 3.4 },
] }
const mate = (id, pos, toi, shotsPg) => ({ playerId: id, team: 'TST', pos, legs: { toi, shotsPg } })
const ROW = {
  playerId: 1, name: 'Test Skater', pos: 'C', team: 'TST', opp: 'OPP',
  legs: { ok: true, gpPooled: 81.6, gpCur: 20, shotsPg: 3.2, goalsPg: 0.41, toi: 1259.5 }, pct: { toi: 91.4, shotsPg: 88, goalsPg: 80 },
  context: { oppGaPg: 3.4567, curSeason: 20262027 }, szn: { gp: 20, g: 8, s: 64 }, form: { l5: 3, gp5: 5, l10: 5, gp10: 10, drought: 0, drought_n: 20, droughtPlus: false },
}
const BG = {
  game: { id: 9, state: 'pre', season: 20262027, away: { abbrev: 'OPP' }, home: { abbrev: 'TST' } },
  spots: { away: { rest: 1, b2b: false }, home: { rest: 3, b2b: false } },
  rows: [ROW, mate(2, 'L', 1300, 3.4), mate(3, 'R', 1100, 2.1), mate(4, 'C', 1000, 2.0), mate(5, 'L', 900, 1.5), mate(6, 'R', 800, 1.4), mate(7, 'D', 1500, 2.2)],
}
const INP = { shots: SHOTS, against: { OPP: AGAINST }, goalies: GOALIES, zones: ZONES, special: SPECIAL, goalieK: XG_COEF.goalie.k }
const text = (secs) => secs.flatMap((s) => s.lines.map((l) => l.t))

if (process.argv.includes('--live')) {
  await live()
} else {
  // 1. the full TEST case: every section, every number traced
  const secs = nhlDepth(ROW, BG, INP)
  const keys = secs.map((s) => s.key)
  for (const k of ['role', 'shots', 'form', 'defence', 'goalie', 'rest', 'special']) if (!keys.includes(k)) fail(`full input did not write the ${k} section (got ${keys})`)
  let n = traceCheck(secs, { ROW, BG, INP }, 'player')
  const gsecs = nhlGameDepth(BG, INP)
  for (const k of ['grest', 'gspecial', 'ggoalie']) if (!gsecs.some((s) => s.key === k)) fail(`game scope did not write ${k}`)
  n += traceCheck(gsecs, { BG, INP }, 'game')
  const noDup = nhlDepth(ROW, BG, INP, { game: true })
  if (noDup.some((s) => ['goalie', 'rest', 'special'].includes(s.key))) fail('game: true still wrote the goalie / rest / special sections')
  // 2. deterministic
  if (JSON.stringify(nhlDepth(ROW, BG, INP)) !== JSON.stringify(secs)) fail('the same input wrote different text')
  // 3. thin samples write nothing
  const thin = (patch) => nhlDepth(patch.row ? { ...ROW, ...patch.row } : ROW, patch.bg || BG, patch.inp || INP)
  const has = (secs2, frag) => text(secs2).some((t) => t.includes(frag))
  if (has(thin({ inp: { ...INP, shots: { ...SHOTS, all: { ...SHOTS.all, attempts: 50, sog: 30, xg: { ...SHOTS.all.xg, sog: 30 }, types: SHOTS.all.types } } } }), 'attempts')) fail('thin shot sample (30 on goal) still wrote the attempts line')
  if (has(thin({ inp: { ...INP, shots: { ...SHOTS, all: { ...SHOTS.all, sog: 30, xg: { ...SHOTS.all.xg, sog: 30 } } } } }), 'his shots on goal came from the slot')) fail('30 shots on goal still wrote the slot line')
  if (has(thin({ inp: { ...INP, shots: { ...SHOTS, all: { ...SHOTS.all, xg: { ...SHOTS.all.xg, sog: 50 } } } } }), 'where the shot model')) fail('50 scored shots still wrote the finishing line')
  if (has(thin({ row: { form: { ...ROW.form, gp5: 2, gp10: 2 } } }), 'last 2 games')) fail('2 recent games still wrote a form line')
  if (has(thin({ row: { szn: { gp: 3, g: 1 } } }), 'goals in 3 games')) fail('3 season games still wrote the season line')
  if (has(thin({ row: { legs: { ...ROW.legs, toi: 200 } } }), 'per hour')) fail('200 seconds of ice time still wrote a per-60 rate')
  if (has(thin({ inp: { ...INP, against: { OPP: { ...AGAINST, all: { ...AGAINST.all, games: 6 } } } } }), 'the league average is')) fail('6 club games still wrote the shots-allowed line')
  if (has(thin({ inp: { ...INP, goalies: { season: 20262027, goalies: [{ ...GOALIES.goalies[0], gs: 5 }] } } }), 'Test Goalie')) fail('5 starts still wrote a goalie line')
  if (has(thin({ inp: { ...INP, zones: { 99: { ...ZONES['99'], goalie: { ...ZONES['99'].goalie, sa: 200 } } } } }), 'average goalie')) fail('200 shots faced still wrote the goalie quality line')
  if (has(thin({ inp: { ...INP, zones: { 99: { available: false } } } }), 'average goalie')) fail('an unavailable zone read still wrote the goalie quality line')
  if (has(thin({ inp: { ...INP, special: { teams: SPECIAL.teams.map((t) => ({ ...t, gp: 4 })) } } }), 'penalty kill')) fail('4 games still wrote the special teams line')
  if (has(thin({ bg: { ...BG, spots: { away: { rest: null }, home: { rest: 2 } } } }), 'of rest')) fail('a missing rest day still wrote the rest line')
  if (nhlDepth(ROW, BG, {}).some((s) => ['shots', 'defence', 'goalie', 'special'].includes(s.key) && s.lines.length && !['defence'].includes(s.key) && s.key !== 'shots')) fail('no inputs still wrote goalie / special lines')
  if (nhlDepth({ playerId: 2 }, { game: { id: 1, state: 'pre' } }, {}).length) fail('an empty row wrote lines')
  // 4. as of: a finished game reads nothing as of now, and no season line
  const fin = nhlDepth({ ...ROW, szn: null }, { ...BG, game: { ...BG.game, state: 'final' } }, INP)
  for (const k of ['goalie', 'special']) if (fin.some((s) => s.key === k)) fail(`a final game wrote the ${k} section from as-of-now inputs`)
  if (has(fin, 'attempts') || has(fin, 'his shots on goal came from the slot') || has(fin, 'allowed')) fail('a final game read the as-of-now shot maps')
  // 5. stale season is named
  const stale = nhlDepth(ROW, BG, { ...INP, shots: { ...SHOTS, stale: true }, against: { OPP: { ...AGAINST, stale: true } } })
  if (!has(stale, 'last season')) fail('a stale shot map did not say "last season"')
  if (has(stale, 'over his last 10') ) fail('a stale season wrote a last-10 line from last season')
  if (bad) { console.error(`${bad} failure(s)`); process.exit(1) }
  console.log(`ok: TEST data, ${n} sentences across ${secs.length} player sections and ${gsecs.length} game sections; every number traced to its input or its recipe; thin / final / stale cases hold`)
  console.log('\nsample (TEST data):'); for (const s of secs) { console.log(`  ${s.title}`); for (const l of s.lines) console.log(`    - ${l.t}`) }
}

async function live() {
  const arg = (k, d0) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d0 }
  const base = arg('--base', 'https://dashnetwork.vercel.app')
  const date = arg('--date', '')
  const get = async (path) => { const r = await fetch(`${base}${path}`); if (!r.ok) throw new Error(`${path} ${r.status}`); return r.json() }
  const board = await get(`/api/lamp/board${date ? `?date=${date}` : ''}`)
  const special = await get('/api/lamp/specialteams').catch(() => null)
  let total = 0
  console.log(`LIVE: board ${board.date}, ${board.games.length} games, ${base}`)
  for (const bg of board.games.slice(0, 2)) {
    const g = bg.game
    const pre = g.state === 'pre'
    const called = bg.rows.filter((r) => r.status === 'called')
    const inp = { special, goalieK: XG_COEF.goalie.k, against: {}, zones: {} }
    if (pre) {
      for (const c of [g.away.abbrev, g.home.abbrev]) inp.against[c] = await get(`/api/lamp/shots?against=${c}`).catch(() => null)
      const season = inp.against[g.home.abbrev]?.season || inp.against[g.away.abbrev]?.season
      inp.goalies = season ? await get(`/api/lamp/goalies?season=${season}`).catch(() => null) : null
      for (const c of [g.away.abbrev, g.home.abbrev]) {
        const b = inp.goalies?.goalies?.filter((x) => x.team === c).sort((a, z) => z.gs - a.gs)[0]
        if (b) inp.zones[b.id] = await get(`/api/lamp/goaliezones?goalie=${b.id}&season=${season}`).catch(() => null)
      }
    }
    console.log(`\n=== ${g.away.abbrev} @ ${g.home.abbrev} (${g.state}) ===`)
    const gs = nhlGameDepth(bg, inp)
    total += traceCheck(gs, { bg, inp }, 'live game')
    for (const s of gs) { console.log(`  ${s.title}`); for (const l of s.lines) console.log(`    - ${l.t}`) }
    for (const r of called.slice(0, 2)) {
      const mine = { ...inp, shots: pre ? await get(`/api/lamp/shots?player=${r.playerId}`).catch(() => null) : null }
      const ps = nhlDepth(r, bg, mine, { game: true })
      total += traceCheck(ps, { r, bg, mine }, `live ${r.name}`)
      console.log(`\n  ${r.name} (${r.team}, ${r.pos})`)
      for (const s of ps) { console.log(`   ${s.title}`); for (const l of s.lines) console.log(`     - ${l.t}`) }
    }
  }
  if (bad) { console.error(`${bad} failure(s)`); process.exit(1) }
  console.log(`\nok: live data, ${total} sentences, every number traced to the fetched input or its recipe`)
}
