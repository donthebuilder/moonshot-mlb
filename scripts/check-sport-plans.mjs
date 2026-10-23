#!/usr/bin/env node
// SPORT_PLANS_ON (lib/posts/sportPlans.js): the ONE "Tonight's plays" post per sport per day, and the one poll question.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-sport-plans.mjs
// ALL DATA IS TEST DATA (labelled TEST). Nothing is sent: the poster and the database are fakes.
import './_no-injury-net.mjs'
import { readFileSync } from 'node:fs'
let fail = 0
const check = (name, ok, extra = '') => { if (!ok) fail += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  -- ${extra}` : ''}`) }
process.env.NEXT_PUBLIC_SITE_URL = 'https://site.test'
delete process.env.SPORT_PLANS_ON
const P = await import('../lib/posts/sportPlans.js')
const { formatOrder } = await import('../lib/dash/polls/build.js')
const { _resetTakenForTests } = await import('../lib/dash/postClaim.js')
const { GRADING_KIND } = await import('../lib/dash/routing.js')

// switch off = nothing folded
check('default OFF', P.sportPlansOn() === false)
check('off: no kind is held back', !['card_mlb', 'slate', 'nhl_slate', 'board', 'list_nfl', 'card_today'].some(P.foldedForDiscord))
check('off: poll order is the old rotation', formatOrder({ category: 'fun' }, 'pick')[0] === 'board' && formatOrder({ category: 'board' }, 'pick')[0] === 'over')
process.env.SPORT_PLANS_ON = 'on'
check('on: switch reads', P.sportPlansOn() === true)
for (const k of ['card_mlb', 'card_nfl', 'card_nhl', 'slate', 'nhl_slate', 'card_today', 'list_mlb', 'list_nfl', 'list_nhl', 'board', 'nfl_board', 'nhl_board']) check(`on: folded ${k}`, P.foldedForDiscord(k))
// results and grades are never folded
for (const k of ['card_result_mlb', 'card_ls_result_nhl', 'card_double_result', 'mlb_members_grade', 'nfl_members_grade', 'receipt', 'weekly', 'monthly', 'poll_result', 'nfl_poll_result', 'card_members_nhl', 'board_results', 'nfl_results']) check(`on: NOT folded ${k}`, !P.foldedForDiscord(k))
check('plays kind never matches the grading kinds', !GRADING_KIND.test('plays_nhl'))
check('on: poll question is on the board (the lead) every day', formatOrder({ category: 'board' }, 'pick')[0] === 'board' && formatOrder(null, null)[0] === 'board')

// the text: header, the lead pick only, a site link
const lead = 'TEST Player One (TST vs ABC), anytime goal. CALLED.'
const t = P.playsText({ sport: 'nhl', day: '2026-10-16', leadText: lead })
console.log('\n--- TEST EXAMPLE ---\n' + t + '\n--------------------\n')
check('text has the header, the lead and a site link', /TONIGHT'S PLAYS/.test(t) && t.includes(lead) && t.includes('https://site.test/'))
check('text with no lead is empty (nothing invented)', P.playsText({ sport: 'nhl', day: '2026-10-16', leadText: '' }) === '')
check('no probability printed', !/\d\s?%/.test(t))

// delivery: one claim, one send, and a second call sends nothing
_resetTakenForTests()
const rows = new Map(); const sent = []
const db = { from: () => {
  const q = { _op: null, _row: null, _m: null,
    upsert(r) { q._op = 'up'; q._row = r[0]; return q }, select() { return q }, update() { q._op = 'upd'; return q }, delete() { q._op = 'del'; return q },
    match(m) { q._m = m; return q },
    then(res) {
      if (q._op === 'up') { const k = `${q._row.day}|${q._row.kind}`; const fresh = !rows.has(k); if (fresh) rows.set(k, q._row); return res({ data: fresh ? [{ day: q._row.day }] : [], error: null }) }
      if (q._op === 'del') rows.delete(`${q._m.day}|${q._m.kind}`)
      return res({ data: null, error: null })
    } }
  return q } }
const send = async (text, opts, hooks) => { sent.push({ text, opts, hooks }); return { ok: true } }
const a = await P.deliverPlays(db, { sport: 'nhl', day: '2026-10-16', leadText: lead, send, hooks: 'https://discord.com/api/webhooks/1/TEST' })
const b = await P.deliverPlays(db, { sport: 'nhl', day: '2026-10-16', leadText: lead, send, hooks: 'https://discord.com/api/webhooks/1/TEST' })
check('first call posts once', a === 'plays: posted' && sent.length === 1, a)
check('second call posts nothing', b === 'plays: already-posted' && sent.length === 1, b)
check('claim row is plays_nhl', rows.has('2026-10-16|plays_nhl'))
const failSend = async () => ({ ok: false })
_resetTakenForTests()
const c = await P.deliverPlays(db, { sport: 'mlb', day: '2026-10-16', leadText: lead, send: failSend, hooks: 'x' })
check('a failed send releases the claim (retry allowed)', c === 'plays: not-sent' && !rows.has('2026-10-16|plays_mlb'), c)

// wiring: the guards sit on the Discord send of every owned poster, and the old send is the else-branch
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
check('postOnce guards the Discord send', /folded \? \{ ok: false \}/.test(src('lib/dash/longshotsPost.js')) || /built\.skipDiscord \|\| folded/.test(src('lib/dash/longshotsPost.js')))
check('slate guards the Discord send', /foldedForDiscord\(KIND\) \? \{ ok: false \}/.test(src('lib/posts/slate.js')))
check('lampSlate guards the Discord send', /foldedForDiscord\(KIND\) \? \{ ok: false \}/.test(src('lib/posts/lampSlate.js')))
// the BOARD kinds: Discord delivery folds with the switch, the row is still claimed and written, X is untouched, off = the old send
const mlbTick = src('app/api/dash/homers/tick/route.js'), nflTick = src('app/api/dash/nfl/tick/route.js')
check('mlb board: Discord send is guarded by foldedForDiscord("board")', /foldedForDiscord\('board'\) \? \{ ok: false \} : await postToDiscord\(text, \{ kind: 'board', sportKey: 'mlb' \}, FEED_WEBHOOKS\(\)\)/.test(mlbTick))
check('mlb board: the claim comes BEFORE the guarded send (row still claimed)', mlbTick.indexOf("claimSlot(db, day, 'board')") > 0 && mlbTick.indexOf("claimSlot(db, day, 'board')") < mlbTick.indexOf("foldedForDiscord('board')"))
check('mlb board: row still written after the send', /update\(patch\)\.match\(\{ day, kind: 'board' \}\)/.test(mlbTick))
check('mlb board: X post is not behind the guard', /if \(hasX\(\)\) \{\s*const r = await postToX\(text, \{ kind: 'board' \}\)/.test(mlbTick))
check('nfl board: Discord send is guarded by foldedForDiscord(sl.kind)', /foldedForDiscord\(sl\.kind\) \? false[^\n]*\n\s*: \(await postToDiscord\(text, \{ png, kind: sl\.kind, sportKey: 'nfl' \}, FEED_WEBHOOKS\(\)\)\)\.ok/.test(nflTick))
check('nfl board: the claim comes BEFORE the guarded send', nflTick.indexOf('await claimSlot(db, day, sl.kind)') > 0 && nflTick.indexOf('await claimSlot(db, day, sl.kind)') < nflTick.indexOf('foldedForDiscord(sl.kind)'))
check('nfl board: the guard cannot touch another slot (nothing else is folded in the NFL slots)', !['nfl_whyboard', 'nfl_milestone', 'nfl_results', 'nfl_spotlight', 'nfl_bigweek', 'nfl_redzone', 'nfl_goalline', 'nfl_tdhistory', 'nfl_longshots', 'nfl_multi_club'].some(P.foldedForDiscord))
check('nfl board: row still written after the send', /update\(patch\)\.match\(\{ day, kind: sl\.kind \}\)/.test(nflTick))
// poll boards carry a poll and are never folded
check('on: poll boards are NOT folded', !['poll_board', 'nfl_poll_board', 'nhl_poll_board', 'nba_poll_board'].some(P.foldedForDiscord))
// switch off again: byte-identical (nothing held back)
delete process.env.SPORT_PLANS_ON
check('off again: board kinds are delivered', !['board', 'nfl_board', 'nhl_board'].some(P.foldedForDiscord))
console.log(fail ? `\n${fail} FAILED` : '\nall ok')
process.exit(fail ? 1 : 0)
