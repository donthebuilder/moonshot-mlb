#!/usr/bin/env node
// THE X SCHEDULER (stage 3 piece 4, 2026-10-09), checked on TEST DATA with a FAKE CLOCK, a fake database and no
// network: nothing here reads a real slate or posts to X or Discord.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-x-schedule.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'

delete process.env.X_SCHEDULE_OFF
delete process.env.X_POSTS_PAUSE
const S = await import('../lib/dash/xSchedule.js')
const P = await import('../lib/dash/xPolicy.js')
const G = await import('../lib/dash/xGate.js')
const polls = await import('../lib/dash/polls/kinds.js')
const { SCHEDULE, KIND_TAGS, mayPostNow, windowOpen, planDay, wallToMs, clockIn, payloadFor, untagged, kindInfo, tagOf } = S

let n = 0
const ok = async (name, fn) => { await fn(); n++; console.log(`ok  ${name}`) }
const TZ = SCHEDULE.tz
const DAY = '2026-10-14'   // a Wednesday (Phoenix)
const THU = '2026-10-15'
const at = (day, hhmm) => wallToMs(TZ, day, hhmm)
const PLAN_COUNT = (dow) => SCHEDULE.periods.reduce((a, p) => a + (dow === 4 && p.thursday ? p.thursday.slots : p.slots).length, 0)
// TEST games: sport + start only
const mk = (sport, count, day = DAY) => Array.from({ length: count }, (_, i) => ({ sport, startMs: Date.parse(`${day}T23:00:00Z`) + i * 36e5 }))

await ok('config: 20 planned posts a day = the policy cap, Thursday too; every period has a slot per lead', () => {
  assert.equal(SCHEDULE.dailyBudget, P.X_POLICY.dailyCap)
  assert.equal(PLAN_COUNT(3), 20); assert.equal(PLAN_COUNT(4), 20)
  assert.deepEqual(SCHEDULE.periods.map((p) => p.slots.length), [3, 3, 4, 4, 3, 2, 1])   // 12-6am 3, 6-9 3, 9-12 4, 12-3 4, 3-6 3, 6-9pm 2, 9pm-12 1
  for (const p of SCHEDULE.periods) { assert.equal(p.lead.length, p.slots.length); if (p.thursday) assert.equal(p.thursday.lead.length, p.thursday.slots.length) }
  assert.equal(SCHEDULE.minGapMin, 45); assert.equal(SCHEDULE.dropBeforeStartMin, 30)
})
await ok('the plan: every weekday has 20 slots, in order, 45+ minutes apart, each inside its own period', () => {
  for (let d = 12; d <= 18; d++) {
    const day = `2026-10-${d}`
    const slots = planDay(day, mk('mlb', 8, day))
    assert.equal(slots.length, 20, day)
    for (let i = 1; i < slots.length; i++) assert.ok(slots[i].at - slots[i - 1].at >= 45 * 60e3, `${day} slot ${i} gap`)
    for (const s of slots) { const p = SCHEDULE.periods.find((q) => q.id === s.period); const m = clockIn(TZ, s.at).min; assert.ok(m >= Number(p.from.slice(0, 2)) * 60 && m < Number(p.to.slice(0, 2)) * 60, `${day} ${s.phx} in ${p.id}`) }
  }
})
await ok('the plan: the approved windows have slots; Thursday night gets 3 (the ~11pm spike), 12-3pm is the busiest block with 6am-9am', () => {
  const w = planDay(DAY).map((s) => s.phx)
  for (const t of ['07:30', '08:30', '09:15', '12:30', '16:30', '18:15', '19:30']) assert.ok(w.includes(t), t)   // morning 7-10, midday 12-1, 4-5pm, evening 6-8
  const th = planDay(THU)
  assert.equal(th.filter((s) => s.period === '21-24').length, 3)
  assert.ok(th.some((s) => s.phx === '23:20'))
  assert.equal(planDay(DAY).filter((s) => s.period === '12-15').length, 4)
})
await ok('the plan: overnight is 3 posts (one ~1am, two ~4-5:30am), all tagged as the experiment; others are not', () => {
  const s = planDay(DAY)
  const over = s.filter((x) => x.experiment)
  assert.deepEqual(over.map((x) => x.phx), ['01:00', '04:15', '05:30'])
  assert.ok(over.every((x) => x.experiment === 'experiment_overnight'))
  assert.equal(s.filter((x) => !x.experiment && x.period === '00-06').length, 0)
})
await ok('Phoenix is converted with Intl: no DST, and ET follows Nov 1 2026 (EDT -4 -> EST -5)', () => {
  // Phoenix 07:00 is always 14:00Z
  assert.equal(new Date(at('2026-10-14', '07:00')).toISOString(), '2026-10-14T14:00:00.000Z')
  assert.equal(new Date(at('2026-11-02', '07:00')).toISOString(), '2026-11-02T14:00:00.000Z')
  assert.equal(new Date(at('2026-07-01', '07:00')).toISOString(), '2026-07-01T14:00:00.000Z')
  const et = (day, t) => planDay(day).find((s) => s.phx === t).et
  assert.equal(et('2026-10-31', '04:15'), '07:15')   // EDT: 7:15am ET
  assert.equal(et('2026-11-02', '04:15'), '06:15')   // EST: the same Phoenix slot is an hour earlier in New York
  assert.equal(et('2026-10-31', '12:30'), '15:30'); assert.equal(et('2026-11-02', '12:30'), '14:30')
  // the day Nov 1 itself: ET falls back at 2am ET; Phoenix day Nov 1 01:00 = 08:00Z = 03:00 EST
  assert.equal(planDay('2026-11-01').find((s) => s.phx === '01:00').et, '03:00')
  assert.equal(planDay('2026-10-31').find((s) => s.phx === '01:00').et, '04:00')
  // wallToMs works for ET too: midnight ET before and after the change
  assert.equal(new Date(wallToMs('America/New_York', '2026-11-01', '00:00')).toISOString(), '2026-11-01T04:00:00.000Z')
  assert.equal(new Date(wallToMs('America/New_York', '2026-11-02', '00:00')).toISOString(), '2026-11-02T05:00:00.000Z')
  assert.equal(S.etHoursSinceNoon(Date.parse('2026-10-31T14:00:00Z')), -2); assert.equal(S.etHoursSinceNoon(Date.parse('2026-11-02T14:00:00Z')), -3)
})

// ── a whole fake day, minute by minute ────────────────────────────────────────
const FACT_KINDS = ['hrleadersdow', 'bestair', 'storylines', 'matchup_hr', 'hot_week', 'hot_month', 'history_watch', 'longshots', 'multi_club', 'list_mlb', 'storyline_watch_1', 'pairswatch', 'matchuplines', 'hotcontact', 'dangercombos', 'backtoback', 'nfl_redzone', 'nfl_goalline', 'nfl_tdhistory', 'nhlhardest', 'nhl_longshots', 'list_nhl', 'longshot', 'matchup_career', 'nfl_spotlight', 'nfl_milestone', 'nfl_whyboard', 'nfl_longshots', 'list_nfl', 'nhl_multi_club']
function simulateDay(day, { games = [], postseason = false, supply = ['callofnight', ...FACT_KINDS, 'poll_pick', 'poll_over', 'nfl_poll_pick', 'numerology'], stepMin = 1 } = {}) {
  const posted = []
  const left = new Set(supply)
  const start = at(day, '00:00')
  for (let t = start; t < start + 864e5; t += stepMin * 60e3) {
    for (const kind of [...left]) {
      const r = mayPostNow({ kind, now: t, games, posted, postseason })
      if (r.ok) { posted.push({ kind, at: t }); left.delete(kind); break }   // one post per minute at most
    }
  }
  return posted
}
await ok('a full fake day: 20 or fewer, every post at or after a planned slot, 45-minute gaps, nothing in a closed period', () => {
  const posted = simulateDay(DAY, { games: [...mk('mlb', 6), ...mk('nhl', 5)] })
  assert.ok(posted.length <= 20 && posted.length >= 16, `posted ${posted.length}`)
  const slots = planDay(DAY).map((s) => s.at)
  posted.forEach((p, i) => {
    assert.ok(slots.some((s) => p.at >= s), 'not before the first slot')
    if (i) { assert.ok(p.at - posted[i - 1].at >= 45 * 60e3, `gap before ${p.kind}`); assert.notEqual(kindInfo(p.kind).group, kindInfo(posted[i - 1].kind).group, `${p.kind} after ${posted[i - 1].kind}`) }
  })
  // per-period counts never exceed the plan
  for (const per of SCHEDULE.periods) {
    const cnt = posted.filter((p) => p.at >= at(DAY, per.from) && p.at < at(DAY, per.to === '24:00' ? '24:00' : per.to)).length
    assert.ok(cnt <= per.slots.length, `${per.id}: ${cnt} > ${per.slots.length}`)
  }
  // nothing numerology/slate overnight (those tiers do not go out 12-6am)
  for (const p of posted) if (p.at < at(DAY, '06:00')) assert.ok(['fact', 'poll'].includes(P.tierOf(p.kind)), `${p.kind} overnight`)
})
await ok('a full fake day of only facts/polls/numerology tops out where xPolicy says: the last 4 of the 20 are held for the slate / write-up tiers', () => {
  const lots = ['callofnight', ...FACT_KINDS, 'poll_pick', 'poll_over', 'nfl_poll_pick', 'nhl_poll_guess', 'numerology']
  for (const day of [DAY, THU]) {
    const posted = simulateDay(day, { supply: lots })
    assert.equal(posted.length, 16, day)                                      // facts stop below 20 - 4, polls below 14, numerology below 12
    assert.ok(posted.every((p) => P.capAllows(p.kind, posted.indexOf(p))), 'each post was inside its tier\'s share when it went')
  }
  // with the lower tiers out of the way, the slate / write-up tier still gets all 20 slots' room
  const hi = simulateDay(DAY, { supply: ['callofnight', 'slate', 'nfl_bigweek'] })
  assert.ok(hi.length >= 2)
})
await ok('a post waits for its window: a fact before 06:00 only at the overnight slots, a slate not before 06:45', () => {
  assert.equal(mayPostNow({ kind: 'callofnight', now: at(DAY, '05:40') }).ok, false)    // slate is not an overnight tier
  assert.equal(mayPostNow({ kind: 'callofnight', now: at(DAY, '06:40') }).ok, false)    // before the first slot of 06-09
  assert.equal(mayPostNow({ kind: 'callofnight', now: at(DAY, '06:46') }).ok, true)
  assert.equal(mayPostNow({ kind: 'hrleadersdow', now: at(DAY, '01:10') }).ok, false)   // the 01:00 slot is the poll's for 30 minutes
  assert.equal(mayPostNow({ kind: 'hrleadersdow', now: at(DAY, '03:00') }).ok, true)    // an unfilled 01:00 slot is open to a fact after the grace
  assert.equal(mayPostNow({ kind: 'hrleadersdow', now: at(DAY, '00:30') }).ok, false)   // before 01:00
  assert.equal(mayPostNow({ kind: 'poll_pick', now: at(DAY, '01:05') }).ok, true)          // the ~1am night-owl slot leads with a poll
})
await ok('every poll kind (five formats x four sports) and the reveal carry a tag: polls FUN, the reveal INFO; the old botpoll kinds are retired', () => {
  const { POLL_KINDS, POLL_RESULT_KINDS } = polls
  for (const k of POLL_KINDS) assert.equal(tagOf(k), 'FUN', k)
  for (const k of POLL_RESULT_KINDS) assert.equal(tagOf(k), 'INFO', k)
  for (const k of ['botpoll', 'community_pick', 'nfl_botpoll', 'nfl_community']) assert.equal(tagOf(k), null, k)
  assert.equal(mayPostNow({ kind: 'poll_pick', now: at(DAY, '10:55') }).ok, true)      // the 10:50 slot leads with a poll
  assert.equal(mayPostNow({ kind: 'nfl_poll_over', now: at(DAY, '13:25') }).ok, true)   // the 13:20 slot too
})
await ok('the old schedule gap is fixed: 7am ET (4am Phoenix) is no longer a post time; 8-11pm ET is', () => {
  const sevenEt = Date.parse('2026-10-14T11:00:00Z')    // 7:00 EDT = 04:00 Phoenix
  assert.equal(clockIn(TZ, sevenEt).hour, 4)
  assert.equal(windowOpen({ kind: 'hrleadersdow', now: sevenEt }), true)   // overnight period allows facts (the East Coast morning experiment)...
  assert.equal(windowOpen({ kind: 'callofnight', now: sevenEt }), false)   // ...but not the slate
  assert.equal(windowOpen({ kind: 'numerology', now: Date.parse('2026-10-15T01:30:00Z') }), true)   // 9:30pm ET = 6:30pm Phoenix
})
await ok('45-minute gap: a second post inside 45 minutes waits, and the answer says when', () => {
  const r = mayPostNow({ kind: 'bestair', now: at(DAY, '13:55'), posted: [{ kind: 'hrleadersdow', at: at(DAY, '12:31') }] })   // 84 min later, a due slot
  assert.equal(r.ok, true)
  const r2 = mayPostNow({ kind: 'bestair', now: at(DAY, '13:55'), posted: [{ kind: 'hrleadersdow', at: at(DAY, '13:30') }] })
  assert.equal(r2.ok, false); assert.match(r2.reason, /45-minute gap/)
  assert.equal(r2.nextWindow.at, at(DAY, '13:30') + 45 * 60e3); assert.equal(r2.nextWindow.phx, '14:15')
  // 44 minutes is not enough, 45 is
  assert.equal(mayPostNow({ kind: 'bestair', now: at(DAY, '14:14'), posted: [{ kind: 'hrleadersdow', at: at(DAY, '13:30') }] }).ok, false)
  assert.equal(mayPostNow({ kind: 'bestair', now: at(DAY, '14:15'), posted: [{ kind: 'hrleadersdow', at: at(DAY, '13:30') }] }).ok, true)
})
await ok('no two posts of the same kind back to back (a matchup after a matchup waits; a different kind goes)', () => {
  const posted = [{ kind: 'matchup_hr', at: at(DAY, '12:31') }]
  const r = mayPostNow({ kind: 'matchup_career', now: at(DAY, '13:55'), posted })
  assert.equal(r.ok, false); assert.match(r.reason, /same kind back to back/)
  assert.equal(mayPostNow({ kind: 'bestair', now: at(DAY, '13:55'), posted }).ok, true)
  assert.equal(mayPostNow({ kind: 'matchup_career', now: at(DAY, '13:55'), posted: [{ kind: 'bestair', at: at(DAY, '12:31') }] }).ok, true)
  // two polls, or two numerology posts, in a row are the same kind too
  assert.match(mayPostNow({ kind: 'poll_over', now: at(DAY, '13:55'), posted: [{ kind: 'poll_pick', at: at(DAY, '12:31') }] }).reason, /same kind/)
})
await ok('priority near the budget follows xPolicy: numerology goes first, then polls, facts, write-ups, the slate last', () => {
  const day = DAY
  const filler = (k) => Array.from({ length: k }, (_, i) => ({ kind: `list_${i}`, at: at(day, '00:00') + i * 60e3 }))   // counted posts earlier today
  const now = at(day, '20:00')
  const allowed = (kind, used) => mayPostNow({ kind, now, posted: filler(used) }).ok
  assert.equal(allowed('numerology', 11), true);  assert.equal(allowed('numerology', 12), false)   // reserve 8
  assert.equal(allowed('poll_pick', 13), true);     assert.equal(allowed('poll_pick', 14), false)      // reserve 6
  assert.equal(mayPostNow({ kind: 'hrleadersdow', now, posted: filler(15) }).ok, true); assert.equal(mayPostNow({ kind: 'hrleadersdow', now, posted: filler(16) }).ok, false)   // reserve 4
  // the scheduler never contradicts the policy
  for (const kind of ['numerology', 'poll_pick', 'hrleadersdow', 'callofnight', 'nfl_bigweek']) for (let used = 0; used <= 20; used++) {
    const r = mayPostNow({ kind, now: at(day, '12:30'), posted: filler(used) })
    if (!P.capAllows(kind, used)) assert.equal(r.ok, false, `${kind} at ${used}`)
  }
  assert.match(mayPostNow({ kind: 'callofnight', now, posted: filler(20) }).reason, /daily budget/)
})
await ok('CALLED alerts, boards, receipts and write-ups tied to the game bypass windows, the gap and the budget', () => {
  const full = Array.from({ length: 25 }, (_, i) => ({ kind: `list_${i}`, at: at(DAY, '03:00') }))
  for (const kind of ['homer', 'td', 'nhlgoal', 'nba30', 'board', 'nfl_board', 'nhl_board', 'accountability', 'recap', 'board_results', 'nfl_results', 'weekly', 'monthly', 'call_776655', 'writeup_nfl_2026_06_KC_BUF', 'writeup_nhl_x', 'nfl_callsheet_reply', 'pregame']) {
    const r = mayPostNow({ kind, now: at(DAY, '03:10'), posted: full })
    assert.equal(r.ok, true, kind); assert.match(r.reason, /event-driven/)
  }
})
await ok('hold and drop: a post that is not due is held with the next window; 30 minutes before its game it is dropped', () => {
  const now = at(DAY, '03:00')
  const held = mayPostNow({ kind: 'numerology', now, startMs: now + 120 * 60e3 })
  assert.equal(held.ok, false); assert.equal(held.drop, false); assert.ok(held.nextWindow && held.nextWindow.at > now, 'a next window')
  assert.equal(held.nextWindow.phx, '18:15')                                  // numerology: the first evening slot that allows it
  const edge = mayPostNow({ kind: 'numerology', now, startMs: now + 31 * 60e3 })
  assert.equal(edge.drop, false)
  const dropped = mayPostNow({ kind: 'numerology', now, startMs: now + 30 * 60e3 })
  assert.equal(dropped.drop, true); assert.match(dropped.reason, /dropped/)
  assert.equal(mayPostNow({ kind: 'numerology', now, startMs: now - 60e3 }).drop, true)
  // a post that is ok is never a drop
  assert.equal(mayPostNow({ kind: 'poll_pick', now: at(DAY, '01:05'), startMs: at(DAY, '01:10') }).drop, false)
})
await ok('a held post retries on later ticks and goes at its window (the fake clock walks to the slot)', () => {
  let went = null
  for (let t = at(DAY, '12:00'); t < at(DAY, '14:00'); t += 60e3) if (mayPostNow({ kind: 'bestair', now: t }).ok) { went = t; break }
  assert.equal(went, at(DAY, '12:30'))
})
await ok('a slot belongs to its lead tier first; other tiers wait the 30-minute grace', () => {
  // 06:45 is the slate slot: a fact waits until 07:15 for it, the slate goes at 06:45
  assert.equal(mayPostNow({ kind: 'hrleadersdow', now: at(DAY, '06:50') }).ok, false)
  assert.equal(mayPostNow({ kind: 'callofnight', now: at(DAY, '06:50') }).ok, true)
  assert.equal(mayPostNow({ kind: 'hrleadersdow', now: at(DAY, '07:16') }).ok, true)
})
await ok('every scheduled kind carries exactly one tag; an unknown or untagged kind fails', () => {
  assert.deepEqual(untagged(), [])
  for (const [k, v] of Object.entries(KIND_TAGS)) {
    assert.ok(['scheduled', 'event', 'retired', 'members'].includes(v.mode), k)
    if (v.mode === 'scheduled' || v.mode === 'event') { assert.ok(['INFO', 'FUN'].includes(v.tag), `${k} tag`); assert.ok(v.group, `${k} group`) }
    else assert.equal(v.tag, undefined, `${k} (retired/members) carries no tag`)
  }
  // a kind with a missing tag is caught by the checker...
  assert.deepEqual(untagged({ ...KIND_TAGS, test_filler: { mode: 'scheduled', group: 'x', sport: 'mlb' } }), ['test_filler'])
  assert.deepEqual(untagged({ ...KIND_TAGS, test_filler: { mode: 'scheduled', tag: 'MISC', group: 'x' } }), ['test_filler'])
  // ...and one the table has never heard of does not post
  const r = mayPostNow({ kind: 'test_filler', now: at(DAY, '12:30') })
  assert.equal(r.ok, false); assert.match(r.reason, /no tag/)
  assert.equal(windowOpen({ kind: 'test_filler', now: at(DAY, '12:30') }), false)
  // a caller's tag that disagrees with the table is refused
  assert.match(mayPostNow({ kind: 'poll_pick', now: at(DAY, '01:05'), tag: 'INFO' }).reason, /tag mismatch/)
  assert.equal(mayPostNow({ kind: 'poll_pick', now: at(DAY, '01:05'), tag: 'FUN' }).ok, true)
  assert.equal(tagOf('hrleadersdow'), 'INFO'); assert.equal(tagOf('poll_pick'), 'FUN'); assert.equal(tagOf(P.RETIRED_KINDS[0]), null)
})
await ok('every kind the code can post is in the table (the policy list, the routes, the kind check) and nothing retired posts', () => {
  const kinds = new Set(Object.keys({ homer: 1, td: 1, nhlgoal: 1, nba30: 1, board: 1, nfl_board: 1, nhl_board: 1, nfl_callsheet_reply: 1, pregame: 1, callofnight: 1, thefour: 1, slate: 1, writeup: 1, accountability: 1, recap: 1, weekly: 1, monthly: 1, board_results: 1, nfl_results: 1, nfl_bigweek: 1, botpoll: 1, community_pick: 1, nfl_botpoll: 1, nfl_community: 1, numerology: 1 }))
  for (const k of P.RETIRED_KINDS) kinds.add(k)
  const scan = (file, res) => { const t = fs.readFileSync(file, 'utf8'); for (const re of res) for (const m of t.matchAll(re)) kinds.add(m[1]) }
  scan('app/api/dash/homers/tick/route.js', [/claimAndPostStat\(db, day, '([a-z_0-9]+)'/g, /claimSlot\(db, (?:day|yday), '([a-z_0-9]+)'/g, /kind: '([a-z_0-9]+)'/g, /kind: '([a-z_0-9]+)'/g])
  scan('app/api/dash/nfl/tick/route.js', [/kind: '(nfl_[a-z_0-9]+)'/g])
  scan('app/api/lamp/tick/route.js', [/kind: '([a-z_0-9]+)'/g])
  scan('lib/lists/post.js', [/kind: '([a-z_0-9]+)'/g])
  scan('lib/nhl/hardestShot.js', [/HARDEST_KIND = '([a-z]+)'/g])
  for (const f of fs.readdirSync('supabase/migrations')) if (/widen|writeups/.test(f)) scan(`supabase/migrations/${f}`, [/'([a-z][a-z_0-9]+)'(?=[,\s)])/g])
  const noise = new Set(['hr', 'text', 'true', 'false', 'null', 'public', 'day', 'kind', 'payload', 'now', 'id', 'game_id', 'stories', 'mlb', 'nfl', 'nhl', 'nba', 'ET', 'writeups_autopost', 'facts_autopost', 'post', 'tweet', 'on', 'off', 'a', 'b', 'x'])
  const unknown = [...kinds].filter((k) => !noise.has(k) && k.length > 3 && !kindInfo(k) && /^(?:[a-z]+_)*[a-z]+$/.test(k) && /(post|hot|call|board|list|club|result|recap|week|month|story|storyline|poll|pick|pair|long|nfl_|nhl|mlb|matchup|milest|fact|numer|hard|history|air|four|slate|night|streak|angle|sheet|birthday|funfact|back|danger|leader|revenge|writeup|account|pregame|reply|member|homer|td)/.test(k))
  assert.deepEqual(unknown, [], `kinds with no KIND_TAGS row: ${unknown.join(', ')}`)
  for (const k of P.RETIRED_KINDS) { assert.equal(S.modeOf(k), 'retired'); assert.equal(mayPostNow({ kind: k, now: at(DAY, '12:30') }).ok, false); assert.equal(windowOpen({ kind: k, now: at(DAY, '12:30') }), false) }
  for (const k of ['mlb_members_board', 'nfl_members_grade']) assert.equal(mayPostNow({ kind: k, now: at(DAY, '12:30') }).ok, false)
  // the policy's tier of every scheduled kind is one a period lets through somewhere
  const allowed = new Set(SCHEDULE.periods.flatMap((p) => p.allow))
  for (const [k, v] of Object.entries(KIND_TAGS)) if (v.mode === 'scheduled') assert.ok(allowed.has(P.tierOf(k)), `${k} (${P.tierOf(k)}) has a period`)
})
await ok('the overnight experiment: posts in 12-6am Phoenix carry experiment_overnight and their tag; other hours carry only the tag', () => {
  const night = mayPostNow({ kind: 'hrleadersdow', now: at(DAY, '04:20') })
  assert.equal(night.ok, true); assert.equal(night.experiment, 'experiment_overnight'); assert.equal(night.period, '00-06')
  assert.deepEqual(payloadFor('hrleadersdow', at(DAY, '04:20')), { x_tag: 'INFO', experiment: 'experiment_overnight' })
  assert.deepEqual(payloadFor('poll_pick', at(DAY, '01:10')), { x_tag: 'FUN', experiment: 'experiment_overnight' })
  assert.deepEqual(payloadFor('hrleadersdow', at(DAY, '12:35')), { x_tag: 'INFO' })
  assert.equal(mayPostNow({ kind: 'hrleadersdow', now: at(DAY, '12:35') }).experiment, null)
  assert.deepEqual(payloadFor('test_filler', at(DAY, '04:20')), {})
})
await ok('the sport mix follows the day\'s games; the MLB postseason is toned down', () => {
  // 1 MLB game, 9 NFL games: MLB share is small, so a 4th MLB post waits; NFL keeps posting
  const games = [...mk('mlb', 1), ...mk('nfl', 9)]
  const sh = S.sportShares(games); assert.ok(sh.mlb < 0.05 && sh.nfl > 0.95)
  const mlbOut = ['hrleadersdow', 'bestair', 'storylines'].map((kind, i) => ({ kind, at: at(DAY, '08:00') - (3 - i) * 50 * 60e3 }))
  const r = mayPostNow({ kind: 'hot_week', now: at(DAY, '13:20'), posted: mlbOut, games })
  assert.equal(r.ok, false); assert.match(r.reason, /mlb has its share/)
  assert.equal(mayPostNow({ kind: 'nfl_redzone', now: at(DAY, '13:20'), posted: mlbOut, games }).ok, true)
  // a cross-sport kind has no sport quota
  assert.equal(mayPostNow({ kind: 'numerology', now: at(DAY, '19:35'), posted: mlbOut, games }).ok, true)
  // postseason: at most 3 MLB facts a day, 1 slate, 1 write-up (counting the event-driven write-up already out)
  const facts3 = ['hrleadersdow', 'bestair', 'storylines'].map((kind, i) => ({ kind, at: at(DAY, '09:00') + i * 50 * 60e3 }))
  assert.equal(mayPostNow({ kind: 'hot_week', now: at(DAY, '13:20'), posted: facts3, postseason: false }).ok, true)
  const ps = mayPostNow({ kind: 'hot_week', now: at(DAY, '13:20'), posted: facts3, postseason: true })
  assert.equal(ps.ok, false); assert.match(ps.reason, /postseason: at most 3 fact/)
  assert.match(mayPostNow({ kind: 'callofnight', now: at(DAY, '13:00'), posted: [{ kind: 'thefour', at: at(DAY, '07:00') }, { kind: 'nfl_redzone', at: at(DAY, '11:30') }], postseason: true }).reason, /at most 1 slate/)
  assert.equal(mayPostNow({ kind: 'nfl_redzone', now: at(DAY, '13:20'), posted: facts3, postseason: true }).ok, true)   // another sport's facts are not MLB's
  // a polls / numerology post is not limited
  assert.equal(mayPostNow({ kind: 'numerology', now: at(DAY, '19:35'), posted: facts3, postseason: true }).ok, true)
})
await ok('X_SCHEDULE_OFF=on falls back to the old hours (hours since noon ET) and nothing else', () => {
  process.env.X_SCHEDULE_OFF = 'on'
  try {
    const t = (iso) => Date.parse(iso)
    // old hour -3 = 9am ET. 2026-10-14 12:30Z = 8:30am EDT -> before; 13:30Z = 9:30am EDT -> after
    assert.equal(mayPostNow({ kind: 'callofnight', now: t('2026-10-14T12:30:00Z'), legacyHour: -3 }).ok, false)
    assert.match(mayPostNow({ kind: 'callofnight', now: t('2026-10-14T12:30:00Z'), legacyHour: -3 }).reason, /X_SCHEDULE_OFF/)
    assert.equal(mayPostNow({ kind: 'callofnight', now: t('2026-10-14T13:30:00Z'), legacyHour: -3 }).ok, true)
    // the old schedule's 7am ET post (4am Phoenix) works again under the switch, and the gap/adjacency/budget are not applied
    assert.equal(mayPostNow({ kind: 'hrleadersdow', now: t('2026-10-14T11:30:00Z'), legacyHour: -5, posted: Array.from({ length: 25 }, (_, i) => ({ kind: `list_${i}`, at: t('2026-10-14T11:00:00Z') })) }).ok, true)
    assert.equal(windowOpen({ kind: 'hrleadersdow', now: t('2026-10-14T11:30:00Z'), legacyHour: -5 }), true)
    assert.equal(windowOpen({ kind: 'hrleadersdow', now: t('2026-10-14T10:30:00Z'), legacyHour: -5 }), false)
    // EST after Nov 1: 9:30am EST = 14:30Z; 13:30Z is only 8:30am
    assert.equal(mayPostNow({ kind: 'callofnight', now: t('2026-11-02T13:30:00Z'), legacyHour: -3 }).ok, false)
    assert.equal(mayPostNow({ kind: 'callofnight', now: t('2026-11-02T14:30:00Z'), legacyHour: -3 }).ok, true)
    // an unknown kind still does not post, and event kinds still go
    assert.equal(mayPostNow({ kind: 'test_filler', now: t('2026-10-14T13:30:00Z'), legacyHour: -3 }).ok, false)
    assert.equal(mayPostNow({ kind: 'homer', now: t('2026-10-14T07:30:00Z') }).ok, true)
  } finally { delete process.env.X_SCHEDULE_OFF }
})

// ── the gate (database side): a fake database, a fake clock ───────────────────
function fakeDb(rows) {
  const q = (table) => {
    const f = { table, preds: [] }
    const api = {
      select: () => api,
      not: () => api,
      gte: (c, v) => { f.preds.push((r) => String(r[c]) >= v); return api },
      lt: (c, v) => { f.preds.push((r) => String(r[c]) < v); return api },
      then: (res) => res({ data: (rows[table] || []).filter((r) => f.preds.every((p) => p(r))), error: null }),
    }
    return api
  }
  return { from: q }
}
await ok('scheduleGate reads today\'s counted posts (Phoenix day), holds with a logged reason, and learns of its own post at once', async () => {
  G._resetPostedCache()
  const rows = { homer_feed_posts: [{ kind: 'hrleadersdow', seen_at: new Date(at(DAY, '13:30')).toISOString() }, { kind: 'list_mlb', seen_at: new Date(at('2026-10-13', '12:00')).toISOString() }], fact_posts: [] }
  const db = fakeDb(rows)
  const now = at(DAY, '13:55')
  const r = await G.scheduleGate(db, { kind: 'bestair', day: DAY, now })
  assert.equal(r.ok, false); assert.match(r.reason, /45-minute gap/)       // yesterday's list is not today's
  const r2 = await G.scheduleGate(db, { kind: 'bestair', day: DAY, now: at(DAY, '14:16') })
  assert.equal(r2.ok, true)
  G.logPosted({ day: DAY, kind: 'bestair', tweetId: 'T1', now: at(DAY, '14:16') })   // the cache must see it at once
  const posted = await G.postedToday(db, at(DAY, '14:16'))
  assert.ok(posted.some((p) => p.kind === 'bestair'))
  const log = (await import('../lib/dash/xPostLog.js')).recentLog()
  assert.ok(log.some((e) => e.kind === 'bestair' && e.state === 'HELD' && /45-minute gap/.test(e.reason)))
  G._resetPostedCache()
})
await ok('scheduleGate: a scheduled kind reads the posted list fresh, so a post another instance made (not in this cache) holds the 45-minute gap', async () => {
  G._resetPostedCache()
  const rows = { homer_feed_posts: [], fact_posts: [] }
  const db = fakeDb(rows)
  const r1 = await G.scheduleGate(db, { kind: 'bestair', day: DAY, now: at(DAY, '14:00') })    // warms the 90 s cache with nothing posted
  assert.equal(r1.ok, true)
  rows.homer_feed_posts.push({ kind: 'hrleadersdow', seen_at: new Date(at(DAY, '14:00') + 20e3).toISOString() })   // ANOTHER instance posts
  const r2 = await G.scheduleGate(db, { kind: 'bestair', day: DAY, now: at(DAY, '14:00') + 40e3 })   // inside the 90 s
  assert.equal(r2.ok, false); assert.match(r2.reason, /45-minute gap/)
  G._resetPostedCache()
})
await ok('scheduleGate: a dropped post is logged DROPPED; X_SCHEDULE_OFF reads nothing from the database', async () => {
  G._resetPostedCache()
  const db = { from: () => { throw new Error('the database must not be read') } }
  const now = at(DAY, '03:00')
  const d = await G.scheduleGate(fakeDb({ homer_feed_posts: [], fact_posts: [] }), { kind: 'numerology', day: DAY, now, startMs: now + 10 * 60e3 })
  assert.equal(d.drop, true)
  assert.ok((await import('../lib/dash/xPostLog.js')).recentLog().some((e) => e.kind === 'numerology' && e.state === 'DROPPED'))
  process.env.X_SCHEDULE_OFF = 'on'
  try { assert.equal((await G.scheduleGate(db, { kind: 'callofnight', day: DAY, now: Date.parse('2026-10-14T13:30:00Z'), legacyHour: -3 })).ok, true) } finally { delete process.env.X_SCHEDULE_OFF }
  G._resetPostedCache()
})

// ── the wiring (static): the tick routes ask the scheduler, not the clock ─────
await ok('wiring: scheduled kinds in the tick routes use windowOpen / scheduleGate; the only hour checks left are receipts and non-X work', () => {
  const homers = fs.readFileSync('app/api/dash/homers/tick/route.js', 'utf8')
  const left = homers.split('\n').filter((l) => /etHoursSinceNoon\(\)\s*(>=|<)/.test(l) && !/^\s*\/\//.test(l)).map((l) => l.trim())
  assert.ok(left.every((l) => /ACCOUNTABILITY_HOUR|BOARD_RESULTS_HOUR|>= -9/.test(l)), `old hour checks still in homers tick: ${left.join(' | ')}`)
  assert.match(homers, /const open = windowOpen\(\{ kind, legacyHour: hourGate \}\)/)
  assert.match(homers, /scheduleGate\(db, \{ kind, day, legacyHour: hourGate \}\)/)
  assert.match(homers, /logPosted\(\{ day, kind: 'longshot'/)   // the MLB longshot tops up the posted list like every other post
  const nfl = fs.readFileSync('app/api/dash/nfl/tick/route.js', 'utf8')
  assert.equal(nfl.split('\n').filter((l) => /etHoursSinceNoon\(\)\s*(>=|<)/.test(l) && !/^\s*\/\//.test(l)).every((l) => /-9|MEMBERS_HOUR/.test(l)), true)
  assert.match(nfl, /scheduleGate\(db, \{ kind: sl\.kind/); assert.match(nfl, /scheduleGate\(db, \{ kind: 'nfl_milestone'/)
  const lamp = fs.readFileSync('app/api/lamp/tick/route.js', 'utf8')
  assert.ok(!/etHour >= /.test(lamp)); assert.match(lamp, /windowOpen\(\{ kind: 'nhl_longshots'/)
  assert.match(fs.readFileSync('lib/dash/longshotsPost.js', 'utf8'), /scheduleGate\(db, \{ kind, day, sport \}\)/)
})

console.log(`\n${n} checks passed`)
