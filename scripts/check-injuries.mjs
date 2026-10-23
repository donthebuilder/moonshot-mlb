#!/usr/bin/env node
// THE INJURY LAYER (lib/injuries), checked on TEST DATA: made-up clubs and players in ESPN's real response shape, a replaced fetch,
// a frozen clock. Nothing touches the network and nothing is written.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-injuries.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ST = await import('../lib/injuries/statuses.js')
const NM = await import('../lib/injuries/normalise.js')
const LK = await import('../lib/injuries/lookup.js')
const RD = await import('../lib/injuries/read.js')
const WD = await import('../lib/injuries/words.js')
const NC = await import('../lib/dash/namingChecks.js')
const PR = await import('../lib/dash/pushRules.js')
const SRC = await import('../lib/dash/pregameSources.js')
const CS = await import('../lib/callStatus.js')

let failed = 0
const ok = async (name, fn) => { try { await fn(); console.log(`ok   ${name}`) } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message.split('\n')[0]}`) } }

const NOW = Date.parse('2026-10-11T17:00:00Z')
const real = Date.now
Date.now = () => NOW

// ── TEST FIXTURES: ESPN's response shape, invented players ──
const line = (status, name, team, extra = {}) => ({
  id: String(Math.abs(hash(name))), status, date: extra.date || '2026-10-11T15:00Z', shortComment: extra.short || '', longComment: '',
  type: { description: status }, details: extra.details || {},
  athlete: { id: extra.espn || String(Math.abs(hash(name)) % 90000 + 1000), displayName: name, position: { abbreviation: extra.pos || 'WR' }, team: { abbreviation: team } },
})
function hash(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return h }
const feed = (clubs, ts = '2026-10-11T16:55:00Z') => ({ timestamp: ts, status: 'success', injuries: clubs.map(([name, ...ls]) => ({ id: name, displayName: name, injuries: ls })) })

const NFL = feed([
  ['Test Hawks', line('Out', 'Tess Receiver Jr.', 'WSH', { pos: 'WR', details: { type: 'Hamstring', location: 'Leg', detail: 'Not Specified', side: 'Not Specified' } }), line('Doubtful', 'Dax Runner', 'WSH', { pos: 'RB' }), line('Questionable', 'Quin Catcher', 'LAR', { pos: 'TE' }), line('Active', 'Hale Healthy', 'LAR'), line('Injured Reserve', 'Ira Reserve', 'LAR', { short: 'ir', details: { type: 'Ankle', returnDate: '2026-11-08' } }), line('Surprise Word', 'Odd Entry', 'LAR')],
])
const NHL = feed([['Test Ice', line('Out', 'Léon Skater', 'TB', { pos: 'C' }), line('Day-To-Day', 'Dee Winger', 'NJ', { pos: 'LW' }), line('Suspension', 'Sam Suspended', 'LA', { pos: 'D' }), line('Injured Reserve', 'Ivy Defender', 'SJ', { pos: 'D' })]])
const MLB = feed([['Test Diamond', line('60-Day-IL', 'Ike Pitcher', 'CHW', { pos: 'SP' }), line('10-Day-IL', 'Tim Catcher', 'AZ', { pos: 'C' }), line('Day-To-Day', 'Dan Outfielder', 'TB', { pos: 'RF' }), line('Out', 'Oscar Shortstop', 'WSH', { pos: 'SS' }), line('paternity', 'Pat Dad', 'TB', { pos: '1B' }), line('7-Day IL', 'Seven Day', 'TB'), line('15-Day-IL', 'Fif Teen', 'TB')]])
const NBA = feed([['Test Hoops', line('Out', 'Hank Guard', 'GS', { pos: 'G', espn: '90001' }), line('Day-To-Day', 'Dwight Forward', 'NY', { pos: 'F', espn: '90002' })]])
const snapOf = (sport, json, now = NOW) => RD.snapshotFrom(sport, json, now)
const prime = (sport, json, now = NOW) => RD.__setSnapshotForTest(sport, snapOf(sport, json, now), now)
const reset = () => { for (const s of RD.SPORTS) RD.__setSnapshotForTest(s, null) }

await ok('status table: every word the four sources send maps to the closed set; Active is dropped; unknown is dropped AND counted', () => {
  const m = { Out: 'OUT', Doubtful: 'DOUBTFUL', Questionable: 'QUESTIONABLE', 'Day-To-Day': 'DAY_TO_DAY', 'Injured Reserve': 'IL', '7-Day IL': 'IL', '10-Day-IL': 'IL', '15-Day-IL': 'IL', '60-Day-IL': 'IL', suspension: 'IL', Suspension: 'IL', paternity: 'OUT' }
  for (const [raw, want] of Object.entries(m)) assert.equal(ST.classify(raw), want, raw)
  assert.equal(ST.classify('Active'), null); assert.equal(ST.classify('Probable'), null)
  assert.deepEqual(ST.INJURY_STATUSES, ['OUT', 'DOUBTFUL', 'QUESTIONABLE', 'DAY_TO_DAY', 'IL'])
  for (const k of ST.INJURY_STATUSES) assert.ok(ST.STATUS_INFO[k].chip && ST.STATUS_INFO[k].explain)
  assert.deepEqual([...ST.BLOCKS].sort(), ['DOUBTFUL', 'IL', 'OUT'])
})
await ok('normalise NFL: club codes meet ours (WSH->WAS, LAR->LA), body part and note, time kept, healthy dropped, unknown counted', () => {
  const n = NM.normaliseEspn('nfl', NFL)
  assert.equal(n.entries.length, 4); assert.deepEqual(n.skipped, { 'Surprise Word': 1 })
  const t = n.entries.find((e) => e.name === 'Tess Receiver Jr.')
  assert.equal(t.status, 'OUT'); assert.equal(t.team, 'WAS'); assert.equal(t.note, 'Hamstring'); assert.equal(t.position, 'WR'); assert.equal(t.updatedAt, '2026-10-11T15:00:00.000Z'); assert.equal(t.source, 'espn'); assert.equal(t.player_id, null)
  assert.equal(n.entries.find((e) => e.name === 'Quin Catcher').team, 'LA')
  assert.equal(n.entries.find((e) => e.name === 'Ira Reserve').returnDate, '2026-11-08')
  assert.equal(n.entries.find((e) => e.name === 'Ira Reserve').note, 'Ankle')   // "ir" alone is not a note
  assert.equal(n.sourceAt, '2026-10-11T16:55:00.000Z')
})
await ok('normalise NHL / MLB / NBA: ESPN codes meet ours (TB->TBL, NJ->NJD, LA->LAK, CHW->CWS, AZ->ARI), IL words become IL, paternity is OUT', () => {
  const h = NM.normaliseEspn('nhl', NHL).entries
  assert.deepEqual(h.map((e) => [e.team, e.status]), [['TBL', 'OUT'], ['NJD', 'DAY_TO_DAY'], ['LAK', 'IL'], ['SJS', 'IL']])
  const b = NM.normaliseEspn('mlb', MLB).entries
  assert.deepEqual(b.map((e) => [e.team, e.status]), [['CWS', 'IL'], ['ARI', 'IL'], ['TB', 'DAY_TO_DAY'], ['WSH', 'OUT'], ['TB', 'OUT'], ['TB', 'IL'], ['TB', 'IL']])
  const a = NM.normaliseEspn('nba', NBA).entries
  assert.deepEqual(a.map((e) => [e.team, e.status, e.espnId]), [['GS', 'OUT', '90001'], ['NY', 'DAY_TO_DAY', '90002']])
})
await ok('id mapping: name + club (accents, Jr., punctuation), roster ids attached, ambiguous short names never guessed, NBA hits on the ESPN id', () => {
  const idx = LK.indexEntries('nhl', NM.normaliseEspn('nhl', NHL).entries)
  assert.equal(LK.findEntry(idx, { name: 'Leon Skater', team: 'TBL' }).status, 'OUT')       // accent stripped
  assert.equal(LK.findEntry(idx, { name: 'Leon Skater', team: 'TB' }).status, 'OUT')        // either club code
  assert.equal(LK.findEntry(idx, { name: 'Leon Skater', team: 'NJD' }), null)                // wrong club: not him
  assert.equal(LK.findEntry(idx, { name: 'D. Winger', team: 'NJD' }).status, 'DAY_TO_DAY')  // initial + surname, unambiguous on that club
  assert.equal(LK.findEntry(idx, { name: 'E. Winger', team: 'NJD' }), null)                  // wrong initial: not him
  assert.equal(LK.findEntry(idx, { name: 'Dee Wingers', team: 'NJD' }), null)
  const nfl = NM.normaliseEspn('nfl', NFL).entries
  const withIds = LK.attachIds('nfl', nfl, [{ player_id: '00-0030001', name: 'Tess Receiver', team: 'WAS' }, { id: '00-0030002', name: 'Quin Catcher', team: 'LA' }])
  assert.equal(withIds.find((e) => e.name.startsWith('Tess')).player_id, '00-0030001'); assert.equal(withIds.find((e) => e.name === 'Quin Catcher').player_id, '00-0030002')
  assert.equal(LK.findEntry(LK.indexEntries('nfl', withIds), { player_id: '00-0030001' }).name, 'Tess Receiver Jr.')   // by OUR id
  const twins = LK.indexEntries('nfl', [{ name: 'Al Smith', team: 'LA', status: 'OUT', player_id: null }, { name: 'Ab Smith', team: 'LA', status: 'OUT', player_id: null }])
  assert.equal(LK.findEntry(twins, { name: 'A. Smith', team: 'LA' }), null)
  const nba = LK.indexEntries('nba', NM.normaliseEspn('nba', NBA).entries)
  assert.equal(LK.findEntry(nba, { player_id: '90001' }).name, 'Hank Guard')
  assert.equal(LK.findEntry(LK.indexEntries('mlb', NM.normaliseEspn('mlb', MLB).entries), { player_id: '90001' }), null)   // only NBA ids are ESPN's
})
await ok('source down: unavailable, empty entries, a reason that never says nobody is out; the sync view is null', async () => {
  reset()
  const s = await RD.readInjuries('nhl', { now: NOW, fetchImpl: async () => { throw new Error('503') } })
  assert.equal(s.unavailable, true); assert.equal(s.ok, false); assert.deepEqual(s.entries, []); assert.match(s.reason, /unavailable/)
  assert.equal(RD.peekIndex('nhl', NOW), null)
  assert.equal(RD.verdictFor('nhl', { name: 'Leon Skater', team: 'TBL' }, NOW), null)
  assert.ok(!/nobody|no one/i.test(WD.UNAVAILABLE_LINE)); assert.match(WD.UNAVAILABLE_LINE, /unavailable/i)
  const bad = await RD.readInjuries('nfl', { now: NOW, force: true, fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }) })
  assert.equal(bad.unavailable, true)
  const empty = await RD.readInjuries('mlb', { now: NOW, force: true, fetchImpl: async () => ({ ok: true, json: async () => ({ injuries: [] }) }) })
  assert.equal(empty.unavailable, true)   // a feed that lists no clubs is a broken feed, not an empty report
})
await ok('cache: one fetch per sport per 20-minute window; a stale last-good snapshot is served flagged; past 6 hours it is unavailable', async () => {
  reset()
  let calls = 0
  const f = (json) => async () => { calls++; return { ok: true, json: async () => json } }
  await RD.readInjuries('nfl', { now: NOW, fetchImpl: f(NFL) }); await RD.readInjuries('nfl', { now: NOW + 5 * 60e3, fetchImpl: f(NFL) })
  assert.equal(calls, 1)
  await RD.readInjuries('nfl', { now: NOW + 21 * 60e3, fetchImpl: f(NFL) }); assert.equal(calls, 2)
  const down = async () => { throw new Error('boom') }
  const served = await RD.readInjuries('nfl', { now: NOW + 4 * 3600e3, fetchImpl: down })
  assert.equal(served.unavailable, false); assert.equal(served.stale, true); assert.ok(served.entries.length)
  const gone = await RD.readInjuries('nfl', { now: NOW + 8 * 3600e3, fetchImpl: down })
  assert.equal(gone.unavailable, true)
  const old = RD.snapshotFrom('nfl', feed([['Test Hawks', line('Out', 'Old News', 'LA')]], '2026-10-10T01:00:00Z'), NOW)
  assert.equal(old.stale, true)   // the source's own timestamp is old
  assert.equal(RD.snapshotFrom('nfl', NFL, NOW).stale, false)
  assert.equal(RD.TTL_S, 1200)
})

// ── GATING ──
const lead = (name, team, extra = {}) => ({ player_id: extra.id || name, name, team, ...extra })
await ok('naming, NFL: OUT and IL and DOUBTFUL are never named; QUESTIONABLE is held (pending); not listed passes; the bot\'s own tags still work', () => {
  reset(); prime('nfl', NFL)
  const out = NC.nflNamingProblem(lead('Tess Receiver', 'WAS')); assert.equal(out.pending, false); assert.match(out.reason, /out/)
  const d = NC.nflNamingProblem(lead('Dax Runner', 'WAS')); assert.equal(d.pending, false); assert.match(d.reason, /doubtful/)
  const il = NC.nflNamingProblem(lead('Ira Reserve', 'LA')); assert.equal(il.pending, false)
  const q = NC.nflNamingProblem(lead('Quin Catcher', 'LA')); assert.equal(q.pending, true); assert.match(q.reason, /questionable/)
  assert.equal(NC.nflNamingProblem(lead('Hale Healthy', 'LA')), null)
  assert.equal(NC.nflNamingProblem(lead('Someone Else', 'LA', { injury_status: 'OUT' })).pending, false)    // the bot's field, no layer needed
  assert.equal(NC.nflNamingProblem(lead('Bot Doubtful', 'LA', { injury_status: 'D' })).pending, false)
  assert.equal(NC.nflNamingProblem(lead('Bye Man', 'LA', { on_bye: true })).reason, 'on bye')
})
await ok('GRADING never reads the live report: a finished pick on a man the layer now lists out is not re-graded (nflOutProblem has no layer)', () => {
  reset(); prime('nfl', NFL)
  assert.equal(NC.nflOutProblem(lead('Tess Receiver', 'WAS')), null)            // layer says OUT; the grade path does not ask it
  assert.ok(NC.nflOutProblem(lead('Tess Receiver', 'WAS', { injury_status: 'OUT' })))   // the week file's own field still voids
  const src = fs.readFileSync(new URL('../lib/posts/nfl.js', import.meta.url), 'utf8')
  assert.match(src, /nflOutProblem\(week\) \? 'void'/)
})
await ok('naming, NHL: a skater listed OUT is a definite no whatever the goalie does; day-to-day is held; the goalie rule is unchanged', () => {
  reset(); prime('nhl', NHL)
  const out = NC.nhlNamingProblem(lead('Leon Skater', 'TBL', { oppGoalieConfirmed: true })); assert.equal(out.pending, false); assert.match(out.reason, /out/)
  const dtd = NC.nhlNamingProblem(lead('Dee Winger', 'NJD', { oppGoalieConfirmed: true })); assert.equal(dtd.pending, true); assert.match(dtd.reason, /day-to-day/)
  const sus = NC.nhlNamingProblem(lead('Sam Suspended', 'LAK', { oppGoalieConfirmed: true })); assert.equal(sus.pending, false)
  assert.equal(NC.nhlNamingProblem(lead('Fine Skater', 'TBL', { oppGoalieConfirmed: true })), null)
  assert.match(NC.nhlNamingProblem(lead('Fine Skater', 'TBL', { oppGoalieConfirmed: false })).reason, /goalie/)
  assert.equal(NC.nhlNamingProblem(lead('Fine Skater', 'TBL', { startsAt: '2026-10-11T16:00:00Z', oppGoalieConfirmed: true })).reason, 'game already started')
})
await ok('naming, MLB: OUT / IL never named; day-to-day in his posted lineup is named; the lineup and starter rules are unchanged', () => {
  reset(); prime('mlb', MLB)
  const base = { lineup_confirmed: true, pitcher_projected: false }
  assert.equal(NC.mlbNamingProblem({ ...lead('Oscar Shortstop', 'WSH'), ...base }).pending, false)
  assert.equal(NC.mlbNamingProblem({ ...lead('Ike Pitcher', 'CWS'), ...base }).pending, false)
  assert.equal(NC.mlbNamingProblem({ ...lead('Dan Outfielder', 'TB'), ...base }), null)          // day-to-day but IN the posted lineup
  assert.match(NC.mlbNamingProblem({ ...lead('Dan Outfielder', 'TB'), lineup_confirmed: false }).reason, /lineup/)
  assert.match(NC.mlbNamingProblem({ ...lead('Fine Bat', 'TB'), ...base, pitcher_projected: true }).reason, /starter/)
  assert.equal(NC.mlbNamingProblem({ ...lead('Fine Bat', 'TB'), ...base }), null)
})
await ok('naming, NBA: OUT never named; questionable / day-to-day named (the line prints the status word); ESPN id match', () => {
  reset(); prime('nba', NBA)
  assert.equal(NC.nbaNamingProblem({ player_id: '90001' }).pending, false)
  assert.equal(NC.nbaNamingProblem({ player_id: '90002' }), null)
  assert.equal(NC.nbaNamingProblem({ player_id: '99999', injury: 'out' }).pending, false)   // the board's own field is kept
})
await ok('no snapshot (source down): the layer adds nothing and the sport\'s own checks decide', () => {
  reset()
  assert.equal(NC.nflNamingProblem(lead('Tess Receiver', 'WAS')), null)
  assert.equal(NC.nhlNamingProblem(lead('Leon Skater', 'TBL', { oppGoalieConfirmed: true })), null)
})
await ok('every candidate pool goes through these checks: OUT is excluded and a held man is trimmed 30 minutes out (resolveNaming), Card/Slate/LAMP Slate/Long Shot/Double/write-ups', () => {
  reset(); prime('nfl', NFL)
  const rows = [lead('Tess Receiver', 'WAS'), lead('Quin Catcher', 'LA', { start: NOW + 3 * 3600e3 }), lead('Hale Healthy', 'LA')].map((r) => ({ ...r, start: r.start ?? NOW + 3 * 3600e3 }))
  const early = NC.resolveNaming({ rows, check: NC.nflNamingProblem, pickFrom: (rs) => rs, startOf: (r) => r.start, trim: true, now: NOW })
  assert.equal(early.state, 'held'); assert.deepEqual(early.pending.map((p) => p.id), ['Quin Catcher'])   // Q held, OUT already gone
  const late = NC.resolveNaming({ rows, check: NC.nflNamingProblem, pickFrom: (rs) => rs, startOf: (r) => r.start, trim: true, now: NOW + 2.6 * 3600e3 })
  assert.equal(late.state, 'go'); assert.deepEqual(late.picks.map((p) => p.player_id), ['Hale Healthy']); assert.deepEqual(late.trimmed, ['Quin Catcher'])
  // each pool's entry point uses the shared checks and primes the layer (static: the wiring cannot be quietly removed)
  const need = [['lib/card/sources.js', /injuryBlocked\('nhl'/], ['lib/card/sources.js', /injuryBlocked\('mlb'/], ['lib/card/sources.js', /nflNamingProblem\(p\)/], ['lib/card/post.js', /primeInjuries/], ['lib/card/post.js', /resolveNaming/],
    ['lib/posts/slate.js', /primeInjuries/], ['lib/posts/slate.js', /resolveNaming/], ['lib/posts/lampSlate.js', /primeInjuries/], ['lib/posts/lampSlate.js', /resolveNaming/],
    ['lib/dash/longshotsPost.js', /primeInjuries/], ['lib/dash/longshotsPost.js', /name: r\.name, team: r\.team/], ['lib/writeups/post.js', /layerOut/], ['lib/writeups/post.js', /primeInjuries\(\['nhl'\]\)/], ['lib/writeups/post.js', /primeInjuries\(\['nba'\]\)/],
    ['lib/dash/polls/post.js', /primeInjuries/], ['app/api/dash/homers/tick/route.js', /primeInjuries/], ['lib/facts/engine.js', /primeInjuries/]]
  for (const [f, re] of need) assert.match(fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'), re, `${f} ${re}`)
})
await ok('gating only: the layer never writes, never touches a model version, a score or a locked row; naming checks do not mutate their rows', () => {
  for (const f of ['statuses', 'normalise', 'teams', 'lookup', 'read', 'words']) {
    const src = fs.readFileSync(new URL(`../lib/injuries/${f}.js`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')
    assert.ok(!/supabase|\.from\(|\.insert\(|\.upsert\(|\.update\(|model_version|homer_feed|\blocked\b/i.test(src), `${f} touches storage or a model`)
  }
  reset(); prime('nfl', NFL)
  const row = Object.freeze(lead('Tess Receiver', 'WAS', { locked_status: 'called', score: 91, model_version: 'v9' }))
  const before = JSON.stringify(row)
  NC.nflNamingProblem(row); NC.injuryBlocked('nfl', row)
  assert.equal(JSON.stringify(row), before)
})
await ok('the chip sits BESIDE the call: CALLED stays callStatus\'s word and the chip says OUT (no word is re-derived in a component)', () => {
  const chip = fs.readFileSync(new URL('../components/injuries/InjuryChip.js', import.meta.url), 'utf8')
  const tbl = fs.readFileSync(new URL('../components/table/v2.js', import.meta.url), 'utf8')
  assert.ok(!/CALLED|ON THE BOARD|callStatus/.test(chip.replace(/\/\/.*$/gm, '')), 'the chip must not name or derive a call status')
  assert.match(tbl, /<CallStatusBadge status=\{status\}/); assert.match(tbl, /<InjuryChip entry=\{injEntry\}/)
  const { STATUS_WORD } = CS
  assert.equal(STATUS_WORD.called, 'CALLED'); assert.equal(ST.STATUS_INFO.OUT.chip, 'OUT')
})

// ── PUSHES ──
const aud = (extra = {}) => ({ nhl: new Set(['8470001']), mlb: new Set(['600001']), nfl: new Set(), nba: new Set(), nameOf: new Map([['8470001', 'Leon Skater'], ['600001', 'Oscar Shortstop']]), teamOf: new Map(), teamOfId: new Map([['nhl:8470001', 'TBL'], ['mlb:600001', 'WSH']]), ...extra })
const START = NOW + 3 * 3600e3
const nhlSnap = { ok: true, asOf: NOW, games: [{ id: 2026020001, gameType: 2, state: 'pre', date: '2026-10-11', startUtc: new Date(START).toISOString(), away: { abbrev: 'TBL' }, home: { abbrev: 'BOS' } }], starters: {} }
await ok('push NHL: a followed skater listed OUT -> one scratched event (no new category), claim-keyed, short copy; others silent; stale / unavailable / old report make nothing', () => {
  reset()
  const inj = snapOf('nhl', NHL)
  const ev = PR.nhlInjuryOutEventsFrom(nhlSnap, inj, '2026-10-11', aud(), NOW)
  assert.equal(ev.length, 1); assert.equal(ev[0].category, 'scratched'); assert.equal(ev[0].key, 'nhl:2026-10-11:2026020001:8470001:out'); assert.equal(ev[0].playerId, '8470001')
  assert.match(ev[0].title, /Leon Skater.*out/i); assert.ok(ev[0].body.length <= 96)
  assert.deepEqual(PR.nhlInjuryOutEventsFrom(nhlSnap, inj, '2026-10-11', aud(), NOW).map((e) => e.key), [ev[0].key])   // the same fact: the same key
  assert.equal(PR.nhlInjuryOutEventsFrom(nhlSnap, inj, '2026-10-11', aud({ nhl: new Set(['999']) }), NOW).length, 0)       // nobody follows him
  assert.equal(PR.nhlInjuryOutEventsFrom(nhlSnap, { ...inj, stale: true }, '2026-10-11', aud(), NOW).length, 0)
  assert.equal(PR.nhlInjuryOutEventsFrom(nhlSnap, { ...inj, unavailable: true, ok: false, entries: [] }, '2026-10-11', aud(), NOW).length, 0)
  assert.equal(PR.nhlInjuryOutEventsFrom(nhlSnap, inj, '2026-10-11', aud(), NOW + 40 * 60e3).length, 0)                   // injury read older than 30 minutes
  const oldRep = snapOf('nhl', feed([['Test Ice', line('Out', 'Léon Skater', 'TB', { date: '2026-10-01T10:00Z' })]]))
  assert.equal(PR.nhlInjuryOutEventsFrom(nhlSnap, oldRep, '2026-10-11', aud(), NOW).length, 0)                              // last touched 10 days ago: not news
  const dtd = snapOf('nhl', feed([['Test Ice', line('Day-To-Day', 'Léon Skater', 'TB')]]))
  assert.equal(PR.nhlInjuryOutEventsFrom(nhlSnap, dtd, '2026-10-11', aud(), NOW).length, 0)                                 // only OUT pushes
})
await ok('push MLB: a followed hitter listed OUT before his lineup posts -> one scratched event; none once the lineup is up (that scratch says it)', () => {
  reset()
  const inj = snapOf('mlb', MLB)
  const rows = [{ player_id: '600001', name: 'Oscar Shortstop', team: 'WSH', opponent: 'ATL', game_pk: 1, game_time: new Date(START).toISOString() }]
  const slate = (over = {}) => ({ games: [{ pk: 1, state: 'Preview', lineupPosted: false, awayId: 120, homeId: 144, lineup: { home: [], away: [] }, ...over }] })
  const day = PR.ET_DAYFOR ? PR.ET_DAYFOR(START) : '2026-10-11'
  const ev = PR.mlbInjuryOutEventsFrom(rows, slate(), inj, day, aud(), NOW)
  assert.equal(ev.length, 1); assert.equal(ev[0].category, 'scratched'); assert.equal(ev[0].key, `mlb:${day}:600001:injury-out:1`)
  assert.equal(PR.mlbInjuryOutEventsFrom(rows, slate({ lineupPosted: true }), inj, day, aud(), NOW).length, 0)
  assert.equal(PR.mlbInjuryOutEventsFrom(rows, slate({ state: 'Live' }), inj, day, aud(), NOW).length, 0)
  assert.equal(PR.mlbInjuryOutEventsFrom(rows, slate(), { ...inj, unavailable: true, ok: false, entries: [] }, day, aud(), NOW).length, 0)
})
await ok('push NFL / NBA scratches now read the SAME layer (no second reader): OUT only, unavailable -> no outs', async () => {
  reset()
  const live = { at: NOW, games: [{ game_id: 'g1', away: 'WAS', home: 'ZZZ', kickoff: new Date(START).toISOString(), state: 'pre' }] }
  const fakeAud = { teamOf: new Map([['k', 'WAS']]) }
  const s = await SRC.nflPregameSnap(fakeAud, { now: NOW, liveImpl: async () => live, planImpl: async () => new Map(), injuriesImpl: async () => snapOf('nfl', NFL) })
  assert.deepEqual(s.outs.map((o) => [o.name, o.team, o.gameId]), [['Tess Receiver Jr.', 'WAS', 'g1']])
  const s2 = await SRC.nflPregameSnap(fakeAud, { now: NOW, liveImpl: async () => live, planImpl: async () => new Map(), injuriesImpl: async () => ({ ok: false, unavailable: true, entries: [] }) })
  assert.deepEqual(s2.outs, [])
  const src = fs.readFileSync(new URL('../lib/dash/pregameSources.js', import.meta.url), 'utf8')
  assert.match(src, /readInjuries/)
})
await ok('copy: the new push words follow lib/copy/notifications.js (no nobody-is-out wording, fits the caps)', async () => {
  const C = await import('../lib/copy/notifications.js')
  const a = C.nhl.playerOut({ name: 'Test Skater', away: 'TST', home: 'EXA', whenMs: NOW, now: NOW })
  const b = C.mlb.injuryOut({ name: 'Sample Delta', away: 'TST', home: 'EXA', whenMs: NOW, now: NOW })
  for (const x of [a, b]) { assert.ok(x.title.length <= 48, x.title); assert.ok(x.body.length <= 96, x.body); assert.ok(!/nobody|—/.test(`${x.title}${x.body}`)) }
  assert.ok(C.CATALOG.some((r) => r.key === 'scratched' && r.sport === 'nhl' && r.variant === 'listed out'))
  assert.ok(C.CATALOG.some((r) => r.key === 'scratched' && r.sport === 'mlb' && /listed out/.test(r.variant)))
})
await ok('no new cron, no new push category, BUCKETS stays behind its gate', () => {
  const cfg = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  assert.ok(!cfg.crons.some((c) => /injur/i.test(c.path)))
  const route = fs.readFileSync(new URL('../app/api/injuries/route.js', import.meta.url), 'utf8')
  assert.match(route, /bucketsGuard/); assert.match(route, /sport === 'nba'/)
  const rules = fs.readFileSync(new URL('../lib/dash/pushRules.js', import.meta.url), 'utf8')
  const added = rules.slice(rules.indexOf('INJURY-LAYER SCRATCHES'))
  assert.ok(!/category: '(?!scratched|nhlinj|nbainj|mlbinj)/.test(added))   // nbainj (#159) and mlbinj (#168) are registered in lib/dash/alerts.js
})
await ok('words: slate / game count line says "N out" or nothing, never "0 out"', () => {
  assert.equal(WD.outCount([], ST.BLOCKS), ''); assert.equal(WD.outCount([{ status: 'QUESTIONABLE' }], ST.BLOCKS), '')
  assert.equal(WD.outCount([{ status: 'OUT' }, { status: 'IL' }, { status: 'DOUBTFUL' }, { status: 'DAY_TO_DAY' }], ST.BLOCKS), '3 out')
  const e = NM.normaliseEspn('nfl', NFL).entries
  assert.equal(LK.countLine(e), '3 out')
  const order = LK.forGame(LK.indexEntries('nfl', e), 'nfl', ['WAS', 'LA'], { isOurs: (x) => x.name === 'Quin Catcher' })
  assert.equal(order[0].name, 'Quin Catcher')                      // our board man first
  assert.deepEqual(order.slice(1).map((x) => x.status), ['OUT', 'IL', 'DOUBTFUL'].sort((a, b) => ST.STATUS_INFO[a].rank - ST.STATUS_INFO[b].rank))
})

Date.now = real
console.log(failed ? `\n${failed} FAILED` : '\nall injury checks passed')
process.exit(failed ? 1 : 0)
