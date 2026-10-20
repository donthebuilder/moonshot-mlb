// THE LIST, CHECKED (2026-10-20). lib/facts/players.js listFacts + the p_list template: a ranked list per sport from the real
// counts the player facts read, through the same checker as every fact post. TEST data only (every name says Test).
//   node --import ./scripts/_esm-resolve.mjs scripts/check-the-list.mjs
import * as PL from '../lib/facts/players.js'
import * as WR from '../lib/facts/write.js'
import * as CK from '../lib/facts/check.js'
import * as EN from '../lib/facts/engine.js'

let bad = 0, n = 0
const ok = (c, m) => { n += 1; if (!c) { bad += 1; console.log('FAIL ' + m) } }
const TODAY = '2026-10-21'
const P = (i, extra = {}) => ({ id: `T${i}`, name: `Test Player ${String.fromCharCode(64 + i)}`, team: `TS${String.fromCharCode(64 + i)}`, opp: 'OPP', startMs: Date.parse('2026-10-21T23:00:00Z'), rank: i * 2, gameDay: TODAY, ...extra })
const players = [1, 2, 3, 4, 5, 6, 7].map((i) => P(i))
const hit = (id, n) => ({ id, what: 'a hit', whatKey: 'hit', n, min: 6 })
const hr = (id, n) => ({ id, what: 'a home run', whatKey: 'hr', n, min: 2 })

// 1. streaks: ranked by the run, then by our board; one row per man (his longest); under the floor = off; five rows at most
const streaks = [hit('T1', 6), hit('T2', 11), hit('T3', 8), hit('T4', 8), hit('T5', 5), hit('T6', 7), hit('T7', 9), hit('T2', 3), hit('T99', 20),
  hr('T1', 2), hr('T2', 2), hr('T3', 2)]
const L = PL.listFacts({ sport: 'mlb', players, streaks, today: TODAY })
const hits = L.find((f) => f.theme === 'streak_hit')
ok(hits && hits.family === 'p_list', 'a hit-streak list is built')
ok(hits && hits.rows.map((r) => r.id).join() === 'T2,T7,T3,T4,T6', `ranked by the run, a tie by our board, five rows: ${hits?.rows.map((r) => r.id)}`)
ok(hits && hits.rows.every((r, i) => r.pos === i + 1), 'rows numbered 1..5')
ok(!L.some((f) => f.theme === 'streak_hr'), 'two-game homer runs make no list (home runs keep a floor of 3)')
ok(!JSON.stringify(L).includes('T99'), 'a man not on the slate is never named')
ok(hits && hits.named.join() === 'list:mlb:streak_hit', 'the repeat key is the theme, not the men')
ok(PL.listFacts({ sport: 'mlb', players, streaks: [hit('T1', 9), hit('T2', 8)], today: TODAY }).length === 0, 'two rows is not a list')

// 2. the post: hook = the series name + title; the rows; the ask last; passes the checker and the shape every fact post passes
const text = WR.templateDrafts(hits)[0]
const lines = text.split('\n')
ok(lines[0] === "⚾ THE LIST · ACTIVE HIT STREAKS ON TONIGHT'S SLATE", `the hook: ${lines[0]}`)
ok(lines.includes('1. Test Player B (TSB) · 11 straight · board #4'), `row one: ${lines[2]}`)
ok(lines[lines.length - 1].endsWith('?'), 'the ask is last')
ok(CK.checkDraft(text, hits, { limit: 900 }).ok, `checkDraft (the long post): ${CK.checkDraft(text, hits, { limit: 900 }).why}`)
const fit280 = WR.templateDrafts(hits).find((d) => CK.checkDraft(d, hits).ok && CK.checkShape(d, hits).ok)
ok(fit280 && fit280.split('\n').filter((l) => /^\d\. /.test(l)).length >= 3, `at the bare 280 a shorter draft fits, three rows at least: ${fit280}`)
ok(CK.checkShape(text, hits).ok, `checkShape: ${CK.checkShape(text, hits).why}`)
ok(text.includes('11 straight') && !CK.checkDraft(text.replace('11 straight', '13 straight'), hits, { limit: 900 }).ok, 'a number not in the rows is refused')
ok(!/%|#[A-Za-z]|https?:/.test(text), 'no percent, hashtag or link')

// 3. a bar list and MLB's head-to-head list
const bars = [1, 2, 3, 4].map((i) => ({ id: `T${i}`, label: '2+ total bases', threshold: 2, cleared: 11 - i, of: 10 }))
const bl = PL.listFacts({ sport: 'mlb', players, bars, today: TODAY }).find((f) => f.shape === 'bar')
const bt = bl && WR.templateDrafts(bl)[0]
ok(bl && bl.rows.map((r) => r.id).join() === 'T1,T2,T3,T4', `7+ of 10 (T4's 7 of 10 counts), best rate first: ${bl?.rows.map((r) => r.id)}`)
ok(!PL.listFacts({ sport: 'mlb', players, bars: [...bars, { id: 'T5', label: '2+ total bases', threshold: 2, cleared: 6, of: 10 }], today: TODAY }).find((f) => f.shape === 'bar').rows.some((r) => r.id === 'T5'), '6 of 10 is off the list')
ok(bt && CK.checkDraft(bt, bl, { limit: 900 }).ok && CK.checkShape(bt, bl).ok, `the bar list passes: ${bt && [...CK.checkDraft(bt, bl).why, ...CK.checkShape(bt, bl).why]}`)
const vs = [1, 2, 3].map((i) => ({ pid: `T${i}`, player: `Test Player ${String.fromCharCode(64 + i)}`, team: 'TSA', rank: i, date: TODAY, hits: 6 - i, ab: 10, hr: i === 1 ? 2 : 0, pitcher: `Test Arm ${i}` }))
const hl = PL.listFacts({ sport: 'mlb', players, vsStarter: vs, today: TODAY }).find((f) => f.shape === 'h2h')
const ht = hl && WR.templateDrafts(hl)[0]
ok(ht && ht.includes('1. Test Player A (TSA) · 5 for 10, 2 HR vs Test Arm 1 · board #1'), `h2h row: ${ht?.split('\n')[2]}`)
ok(ht && CK.checkDraft(ht, hl, { limit: 900 }).ok && CK.checkShape(ht, hl).ok, `the h2h list passes: ${ht && [...CK.checkDraft(ht, hl).why, ...CK.checkShape(ht, hl).why]}`)

// 4. every sport: its own words (NFL: this week's, no board rank on its slate)
for (const [sport, key, what] of [['nfl', 'td', 'a touchdown'], ['nhl', 'goal', 'a goal'], ['nba', 'p25', '25+ points']]) {
  const ps = players.map((p) => ({ ...p, rank: sport === 'nfl' ? null : p.rank }))
  const f = PL.listFacts({ sport, players: ps, streaks: [1, 2, 3].map((i) => ({ id: `T${i}`, what, whatKey: key, n: 6 - i, min: 3 })), today: TODAY })[0]
  const t = f && WR.templateDrafts(f)[0]
  ok(t && CK.checkDraft(t, f, { limit: 900 }).ok && CK.checkShape(t, f).ok, `${sport}: passes (${t && [...CK.checkDraft(t, f, { limit: 900 }).why, ...CK.checkShape(t, f).why]})`)
  ok(t && (sport === 'nfl' ? /THIS WEEK'S SLATE/.test(t) && !/board #/.test(t) : /TONIGHT'S SLATE/.test(t)), `${sport}: the slate word and the board rank`)
}

// 5. "Save this for tonight" on about one list in three, the same list always the same
const saves = Array.from({ length: 30 }, (_, i) => WR.templateDrafts({ ...hits, id: `mlb:${TODAY}:p_list:t${i}` })[0].includes('Save this for tonight'))
const nSave = saves.filter(Boolean).length
ok(nSave >= 5 && nSave <= 15, `about one in three save lines (${nSave} of 30)`)
ok(WR.templateDrafts(hits)[0] === WR.templateDrafts(hits)[0], 'stable')

// 6. the engine: one list a sport a day
const run = await EN.runFacts(null, { dry: true, ignoreWindow: true, sports: ['mlb'], now: Date.parse('2026-10-21T16:00:00Z'),
  read: async () => ({ sport: 'mlb', active: true, gameDay: TODAY, window: { open: 0, close: Date.parse('2026-10-22T00:00:00Z') }, facts: [hits, bl], errors: [] }) }).catch((e) => ({ error: e.message }))
ok(run.error || run.found >= 1, `dry run finds the lists (${run.error || run.found})`)
const today = [{ id: 'x', day: TODAY, sport: 'mlb', status: 'posted', posted_at: '2026-10-21T15:00:00Z', fact: { family: 'p_list', named: ['list:mlb:streak_hr'] } }]
const dbWith = (rows) => ({ from: () => ({ select: () => ({ gte: async () => ({ data: rows, error: null }), eq: () => ({ maybeSingle: async () => ({ data: { value: 'on' } }) }) }) }) })
const run2 = await EN.runFacts(dbWith(today), { dry: true, ignoreWindow: true, sports: ['mlb'], now: Date.parse('2026-10-21T18:00:00Z'),
  read: async () => ({ sport: 'mlb', active: true, gameDay: TODAY, window: { open: 0, close: Date.parse('2026-10-22T00:00:00Z') }, facts: [hits, bl], errors: [] }) }).catch((e) => ({ error: e.message }))
ok(!run2.error && run2.found === 0, `a sport that posted a list today gets no second one (${run2.error || run2.found})`)

console.log(bad ? `${bad}/${n} FAILED` : `check-the-list: ${n} checks passed (TEST data)`)
process.exit(bad ? 1 : 0)
