#!/usr/bin/env node
// THE OTHER PAGES' MEMBER GATE, CHECKED (2026-10-17). lib/members/hide.js is what /called, /m, the card image routes and /api/ask use to keep tonight's
// not-started CALLED picks away from a visitor who is not a member. Plain node, TEST DATA only: every name, id and score below is made up for this check.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-pages-no-leak.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const { gateCalls, isOpenCall, boardCardModel, gateShareModel } = await import('../lib/members/hide.js')
const { FREE_CALLS_PER_SPORT } = await import('../lib/members/limits.js')

const fails = []
const ok = (cond, msg) => { if (!cond) fails.push(msg) }
const eq = (got, want, msg) => { if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(`${msg}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`) }

// TEST DATA ------------------------------------------------------------------------------------------------------
const NOW = Date.parse('2030-01-01T20:00:00Z')
const LATER = '2030-01-01T23:00:00Z', EARLIER = '2030-01-01T18:00:00Z'
const names = ['Testy One', 'Testy Two', 'Testy Three', 'Testy Four', 'Testy Five', 'Testy Six', 'Testy Seven']
const picks = names.map((name, i) => ({ player_id: `TESTID${i + 1}`, name, outcome: null }))
const hiddenNames = names.slice(FREE_CALLS_PER_SPORT)

// 1. isOpenCall: called + no result + not started (unknown start = not started)
ok(isOpenCall({ status: 'called', startMs: LATER, now: NOW }), 'a called pick before its game is open')
ok(isOpenCall({ status: 'called', startMs: null, now: NOW }), 'a called pick with no known start is open (server fails closed)')
ok(!isOpenCall({ status: 'called', startMs: EARLIER, now: NOW }), 'a started game is public')
ok(!isOpenCall({ status: 'called', startMs: LATER, graded: true, now: NOW }), 'a graded pick is public')
ok(!isOpenCall({ status: 'board', startMs: LATER, now: NOW }), 'ON THE BOARD is never held back')
ok(!isOpenCall({ status: 'off', startMs: LATER, now: NOW }), 'NOT ON THE BOARD is never held back')

// 2. a list (/called calls panel, /m Today): non-member = the first four, the rest counted and not named
{
  const v = gateCalls(picks, { member: false })
  eq(v.items.map((p) => p.name), names.slice(0, FREE_CALLS_PER_SPORT), 'non-member sees the first four')
  eq(v.hidden, picks.length - FREE_CALLS_PER_SPORT, 'the rest are only counted')
  const wire = JSON.stringify(v)
  for (const n of hiddenNames) ok(!wire.includes(n), `hidden name ${n} must not be in what a non-member is sent`)
  for (const p of picks.slice(FREE_CALLS_PER_SPORT)) ok(!wire.includes(p.player_id), `hidden id ${p.player_id} must not be in what a non-member is sent`)
  eq(gateCalls(picks, { member: true }), { items: picks, hidden: 0 }, 'a member sees the list exactly as it was')
  // public proof stays: a scorer or a graded pick is kept for everyone even past the four
  const pub = new Set(['TESTID6'])
  const v2 = gateCalls(picks, { member: false, isPublic: (p) => pub.has(p.player_id) })
  ok(v2.items.some((p) => p.name === 'Testy Six'), 'a pick that already scored keeps his name')
  ok(!v2.items.some((p) => p.name === 'Testy Five' || p.name === 'Testy Seven'), 'the other hidden picks stay hidden')
  // by place (the front door's previewOf): a started man in the first four uses up a place
  const started = new Set(['TESTID1'])
  const v3 = gateCalls(picks, { member: false, byPlace: true, isPublic: (p) => started.has(p.player_id) })
  eq(v3.items.map((p) => p.name), names.slice(0, FREE_CALLS_PER_SPORT), 'byPlace keeps the same four as the front door')
  eq(gateCalls([], { member: false }), { items: [], hidden: 0 }, 'an empty list stays empty')
}

// 3. a player card (image routes): a hidden pick is the plain ON THE BOARD card
{
  const m = { sport: 'mlb', status: 'called', statusWord: 'CALLED', name: 'Testy Eight', playerId: 'TESTID8', score: 91.7, scoreWord: 'HR SCORE', rankLine: ['#1 OF 40 ON THE BOARD'],
    callLine: 'TOP · HR', why: 'TEST WHY TEXT', price: { best: '+345', books: 6 }, role: 'TOP', stats: [{ label: 'ISO', value: '.300', pct: 90 }], stamps: [{ key: 'x' }] }
  const b = boardCardModel(m)
  eq(b.status, 'board', 'card status')
  eq([b.score, b.why, b.price, b.callLine, b.role, b.rankLine], [null, null, null, '', null, []], 'card carries no score, why, price, call line, role or rank')
  const wire = JSON.stringify(b)
  for (const bad of ['CALLED', '91.7', 'TEST WHY TEXT', '+345', 'TOP · HR']) ok(!wire.includes(bad), `the ON THE BOARD card must not carry "${bad}"`)
  ok(b.stats.length === 1 && b.name === m.name, 'public stats and the name stay')
}

// 4. a share card (list of rows / one pick): open CALLED rows read as ON THE BOARD, graded rows and a free man keep their label
{
  const row = (id, status, extra = {}) => ({ id, name: `Row ${id}`, rank: 1, status, score: 80 + Number(id.slice(-1)), pct: 90, tag: 'TEST TAG', line: 'TEST LINE', result: null, miss: false, ...extra })
  const model = { lead: row('T1', 'called'), rows: [row('T2', 'called'), row('T3', 'board'), row('T4', 'called', { result: { text: 'HIT', hot: true } }), row('T5', 'called')] }
  const g = gateShareModel(model, new Set(['T2']))
  ok(g.changed, 'a list with open calls is per viewer')
  eq(g.model.lead.status, 'board', 'the open lead is ON THE BOARD')
  eq([g.model.lead.score, g.model.lead.line, g.model.lead.tag], [null, '', ''], 'the open lead carries no score or line')
  eq(g.model.rows[0].status, 'called', 'a free-four man keeps his label')
  eq(g.model.rows[1].status, 'board', 'ON THE BOARD stays')
  eq(g.model.rows[2].status, 'called', 'a graded row keeps CALLED (public proof)')
  eq([g.model.rows[3].status, g.model.rows[3].score], ['board', null], 'the other open call is ON THE BOARD with no score')
  ok(!gateShareModel({ rows: [row('T9', 'board')] }, null).changed, 'a list with no open call is the same for everyone (shared cache stays)')
  ok(!gateShareModel({ lead: row('T9', 'called', { result: { text: 'MISS' } }), rows: [] }, null).changed, 'a graded list is the same for everyone')
  const pick = gateShareModel({ id: 'P1', status: 'called', result: null, score: 93, rung: 2, grade: 'A', bar: 0.5, tiles: [{ label: 'TD SCORE', value: '93' }, { label: 'BAR', value: '1' }] }, null)
  eq([pick.model.status, pick.model.score, pick.model.rung, pick.model.grade], ['board', null, null, null], 'a pick card loses its score, rung and grade')
  eq(pick.model.tiles.map((t) => t.label), ['BAR'], 'a pick card loses its score tile')
  const graded = gateShareModel({ id: 'P1', status: 'called', result: { word: 'HIT' }, score: 93 }, null)
  ok(!graded.changed && graded.model.score === 93, 'a graded pick card is public')
}

// 5. wiring: every page / route that can print tonight's called picks goes through the gate (so a new reader of the data cannot slip in unnoticed)
const root = new URL('..', import.meta.url).pathname
const read = (p) => readFileSync(join(root, p), 'utf8')
const gated = {
  'app/called/page.js': ['viewerIsMember', 'gateCalls'],
  'app/m/page.js': ['viewerIsMember', 'gateCalls'],
  'app/api/card/image/route.js': ['viewerIsMember', 'isOpenCall', 'boardCardModel', 'freeFourIds'],
  'app/api/card/share/route.js': ['viewerIsMember', 'gateShareModel', 'freeFourIds'],
  'app/api/ask/route.js': ['viewerIsMember', 'isOpenCall', 'freeFourIds'],
  // the phone swipe deck (2026-10-18): the same gate as /m, by place, started games public, per viewer (checked 2026-10-20: it was gated, only missing from this list)
  'app/api/phone/calls/route.js': ['viewerIsMember', 'gateCalls', 'byPlace: true', 'isOpenCall', 'private, no-store'],
}
for (const [file, needs] of Object.entries(gated)) for (const n of needs) ok(read(file).includes(n), `${file} must use ${n}`)
ok(/perViewer/.test(read('app/api/card/image/route.js')) && /perViewer/.test(read('app/api/card/share/route.js')), 'a per-viewer picture must not be put on the shared cache')
ok(/private, no-store/.test(read('app/api/card/image/route.js')) && /private, no-store/.test(read('app/api/card/share/route.js')), 'the image routes say private for a per-viewer picture')
// the server-side readers of tonight's called lists are known; anything new has to be added here on purpose, with its gate
const walk = (dir, out = []) => { for (const f of readdirSync(join(root, dir))) { const p = join(dir, f); const s = statSync(join(root, p)); if (s.isDirectory()) { if (f !== 'node_modules') walk(p, out) } else if (/\.(js|jsx)$/.test(f)) out.push(p) } return out }
const READERS = new Set(['app/(front)/page.js', 'app/m/page.js', 'components/home/QuickPicksLoader.js', 'lib/members/freeFour.js', 'lib/phone/todayCalls.js', 'app/api/phone/calls/route.js'])
for (const f of [...walk('app'), ...walk('components'), ...walk('lib')]) {
  if (f.startsWith('app/fantasy') || f.startsWith('components/fantasy') || f.startsWith('lib/fantasy')) continue
  if (/from '[./]+\/(lib\/)?phone\/todayCalls'/.test(read(f)) && !READERS.has(f)) fails.push(`${relative('.', f)} reads tonight's called lists (lib/phone/todayCalls) but is not on the gated list in this check`)
}

if (fails.length) { console.error(`FAIL (${fails.length})\n- ${fails.join('\n- ')}`); process.exit(1) }
console.log('PASS check-pages-no-leak: non-members never get a hidden pick (list, card, share card), members see what they always saw')
