// THE FIVE, CHECKED (2026-10-20). lib/posts/theFive.js: the pick (one per sport, then the best of the rest), the Friday timing, the post, the
// picture hand-off and the poster on a fake database. TEST data only (every name says Test).
//   node --import ./scripts/_esm-resolve.mjs scripts/check-the-five.mjs
import * as F from '../lib/posts/theFive.js'
import { xLen } from '../lib/posts/slate.js'
import { SWEARS, OVERCLAIM } from '../lib/facts/check.js'
import { receiptLineFor } from '../lib/posts/receiptLine.js'
import { kindInfo } from '../lib/dash/xSchedule.js'
import { tierOf } from '../lib/dash/xPolicy.js'

let bad = 0, n = 0
const ok = (c, m) => { n += 1; if (!c) { bad += 1; console.log('FAIL ' + m) } }
const FRI = '2026-10-23'
const cand = (sport, i, rank, of, extra = {}) => ({ sport, id: `${sport}-T${i}`, name: `Test ${sport.toUpperCase()} ${i}`, team: 'TST', rank, of, proof: `${i}.0 test units a game`, ...extra })
const sports = [
  { sport: 'nfl', cands: [cand('nfl', 1, 1, 300), cand('nfl', 2, 2, 300), cand('nfl', 3, 3, 300)] },
  { sport: 'nhl', cands: [cand('nhl', 1, 6, 400), cand('nhl', 2, 2, 400), cand('nhl', 3, 30, 400, { problem: { reason: 'goalie not confirmed', pending: true } })] },
  { sport: 'nba', cands: [cand('nba', 1, 10, 80), cand('nba', 2, 1, 80)] },
]

// 1. the pick: one per sport first (each sport's best), then the best of the rest by share, in share order; a man with a problem never
const p = F.pickFive(sports)
ok(p.length === 5, `five picks (${p.length})`)
ok(['nfl', 'nhl', 'nba'].every((s) => p.some((c) => c.sport === s)), 'every sport with a usable call is in it')
ok(p.map((c) => c.id).join() === 'nfl-T1,nhl-T2,nfl-T2,nfl-T3,nba-T2', `share order, NBA's best (1 of 80) still in: ${p.map((c) => c.id)}`)
ok(!p.some((c) => c.problem), 'nobody with an open problem')
ok(F.pickFive([{ sport: 'nhl', cands: [cand('nhl', 1, 1, 400), cand('nhl', 2, 1, 400)] }]).length === 2, 'never invents a fifth')

// 2. the timing: Friday from 3:45 PM Phoenix; three usable at least; waits for a LAMP lock until 5 PM
ok(F.fiveDue({ dow: 5, min: 15 * 60 + 45 }) && !F.fiveDue({ dow: 5, min: 15 * 60 + 44 }) && !F.fiveDue({ dow: 4, min: 18 * 60 }), 'due Friday from 3:45 PM Phoenix')
const wait = F.fiveTiming({ sports: [...sports.slice(0, 1), { ...sports[1], lockWait: { reason: 'lock not written' } }, sports[2]], clock: { dow: 5, min: 16 * 60 } })
ok(!wait.go && /waiting for nhl/.test(wait.reason), `waits for LAMP's lock (${wait.reason})`)
ok(F.fiveTiming({ sports: [...sports.slice(0, 1), { ...sports[1], lockWait: {} }, sports[2]], clock: { dow: 5, min: 17 * 60 } }).go, 'at 5 PM it goes without the late board')
ok(!F.fiveTiming({ sports: [{ sport: 'nhl', cands: [cand('nhl', 1, 1, 400)] }], clock: { dow: 5, min: 16 * 60 } }).go, 'fewer than three usable: no post')

// 3. the post: head, hook, five rows with the proof, the ask; the bare 280 drops the proofs, never a name; clean
const t = F.fiveText({ picks: p, day: FRI, limit: 890 })
const lines = t.split('\n')
ok(lines[0] === '\u{1F590}\u{FE0F} THE FIVE · WEEKEND OF OCT 23', `head: ${lines[0]}`)
ok(lines.includes('1. 🏈 Test NFL 1 (TST) · #1 of 300 · 1.0 test units a game'), `row one: ${lines.find((l) => l.startsWith('1.'))}`)
ok(lines[lines.length - 1] === "Who's your #1 of the five, network?", 'the ask is last')
const t280 = F.fiveText({ picks: p, day: FRI, limit: 280 })
ok(t280 && xLen(t280) <= 280 && p.every((c) => t280.includes(c.name)), `at 280 every name stays (${xLen(t280)})`)
ok(!/https?:|#[A-Za-z]/.test(t) && !SWEARS.test(t) && !OVERCLAIM.test(t) && !/%/.test(t), 'no link, hashtag, swear, overclaim or percent')
ok(F.fiveText({ picks: p.slice(0, 2), day: FRI }) === '', 'two names is not a post')
ok(F.weekendWords(FRI) === 'Weekend of Oct 23', 'the weekend words key on the Friday')

// 4. the kind: a slate post (it names our calls) so it carries the receipt line; event-driven; slate tier
ok(kindInfo('the_five')?.mode === 'event' && kindInfo('the_five')?.group === 'slate' && tierOf('the_five') === 'slate', 'the_five: event, slate group and tier')
ok(/Locked before each game/.test(receiptLineFor('the_five', { text: t }) || ''), 'it ends on the receipt line')

// 5. the picture hand-off: five tiles, each in its sport, #1 holo, the tag and the proof; a render that throws is null
let model = null
const png = await F.fivePicture({ picks: p, day: FRI, draw: async (m) => { model = m; return Buffer.from('PNG') }, face: async () => 'data:image/png;base64,AAA', logo: async () => ({ src: '', plate: false }), accent: 'TEST-ORANGE' })
ok(png && model.tiles.length === 5 && model.title === 'THE FIVE' && model.accent === 'TEST-ORANGE', 'the card model: five tiles, the title, the network colour')
ok(model.tiles[0].holo && model.tiles.slice(1).every((x) => x.shimmer && !x.holo), '#1 holo, the rest shimmer')
ok(model.tiles[0].tag === 'CALLED · TUDDY · #1 OF 300' && model.tiles[0].line === '1.0 test units a game' && model.tiles[0].sport === 'nfl', `tile one: ${JSON.stringify(model.tiles[0]).slice(0, 160)}`)
ok(await F.fivePicture({ picks: p, day: FRI, draw: async () => { throw new Error('boom') }, face: async () => '', logo: async () => ({}) }) === null, 'a render that throws: no picture, no throw')

// 6. the poster on a fake database (no X keys here): claims once, Discord gets the picture, the row records the picks
const store = []
const db = { from: () => {
  const st = {}
  const api = {
    select: () => api, match: (m) => { Object.assign(st, m); return api },
    maybeSingle: async () => ({ data: store.find((x) => x.day === st.day && x.kind === st.kind) || null, error: null }),
    upsert: (rows) => { const fresh = rows.filter((x) => !store.some((y) => y.day === x.day && y.kind === x.kind)); store.push(...fresh.map((x) => ({ ...x }))); return { select: async () => ({ data: fresh, error: null }) } },
    update: (patch) => ({ match: async (m) => { const row = store.find((x) => x.day === m.day && x.kind === m.kind); if (row) Object.assign(row, patch); return { error: null } } }),
    delete: () => ({ match: async () => ({ error: null }) }),
  }
  return api
} }
for (const k of ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET', 'X_BEARER_TOKEN']) delete process.env[k]
F._resetFiveForTests()
const clock = { day: FRI, dow: 5, min: 16 * 60 }
const stubs = { draw: async () => Buffer.from('PNG'), face: async () => '', logo: async () => ({ src: '', plate: false }) }
ok(await F.postFiveOnce(db, { day: FRI, clock: { ...clock, dow: 4 }, load: async () => sports, ...stubs }) === 'not-due', 'not on a Thursday')
const r1 = await F.postFiveOnce(db, { day: FRI, clock, load: async () => sports, ...stubs })
ok(/^posted/.test(r1), `posts (${r1})`)
const row = store.find((x) => x.kind === 'the_five')
ok(row?.payload?.picks?.length === 5 && row.payload.picture === true, 'the row records the five and the picture')
ok(await F.postFiveOnce(db, { day: FRI, clock, load: async () => sports, ...stubs }) === 'already-posted', 'once')
process.env.THE_FIVE_OFF = 'on'
ok(await F.postFiveOnce(db, { day: '2026-10-30', clock: { ...clock, day: '2026-10-30' }, load: async () => sports, ...stubs }) === 'off', 'THE_FIVE_OFF=on stops it')
delete process.env.THE_FIVE_OFF

// 7. the SQL and the wiring
const fs = await import('node:fs')
const sql = fs.readFileSync(new URL('../supabase/migrations/202610202200_the_five_kind.sql', import.meta.url), 'utf8')
ok(sql.includes("''the_five''") && /\) not valid'/.test(sql), 'the kind migration allows the_five, NOT VALID')
const route = fs.readFileSync(new URL('../app/api/dash/homers/tick/route.js', import.meta.url), 'utf8')
// 2026-10-21 (KNOWN-ISSUES #8): its own step, fiveTick, with tonight's MLB rows on the in-season path
ok(/async function fiveTick\(db, \{ mlb = undefined \} = \{\}\)/.test(route) && /if \(!fiveDue\(clock\)\) return 'not-due'/.test(route), 'fiveTick: its own step, not due = no reads')
ok(/load: slateLoader\(mlb \? \{ day: clock\.day, mlb \} : \{ day: clock\.day \}\)/.test(route), 'fiveTick: THE SLATE\'s loader, with MLB when it is handed in')
ok((route.match(/await fiveTick\(db/g) || []).length === 3, 'fiveTick called on all three paths (offseason, no MLB games, in season)')
ok(/fiveTick\(db, \{ mlb: \{ rows: boardUsable \? boardRows\(\) : \[\], live, hold: boardUsable \? null : \(boardHold \|\| 'no-board'\)/.test(route), 'in season: the same MLB rows and board gate THE SLATE gets')
const receipt = route.slice(route.indexOf('async function receiptTick'), route.indexOf('async function receiptTick') + 4000)
ok(!/postFiveOnce/.test(receipt.slice(0, receipt.indexOf('\n}\n'))), 'no longer posted from the receipt step (it had no MLB rows)')
const ws = F.pickFive([{ sport: 'mlb', cands: [cand('mlb', 1, 3, 180)] }, { sport: 'nhl', cands: [cand('nhl', 2, 1, 400), cand('nhl', 3, 2, 400)] }, { sport: 'nba', cands: [cand('nba', 4, 1, 120)] }])
ok(ws.some((c) => c.sport === 'mlb'), 'a World Series Friday (TEST data): MOONSHOT gets its one call')

console.log(bad ? `${bad}/${n} FAILED` : `check-the-five: ${n} checks passed (TEST data)`)
process.exit(bad ? 1 : 0)
