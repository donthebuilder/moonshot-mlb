#!/usr/bin/env node
// THE PUSH BRAKE, PERMISSION UX AND THE NEW PUSHES, on TEST data (2026-10-13). Made-up players ("Test ..."), clubs TST / EXA / TB / NYY, a fake clock, a fake
// database. Nothing is sent, nothing is read from a real table.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-push-brake.mjs
//
// WHAT THIS PROVES
//   1  bar cleared: three pushes + a final line became ONE push per hitter per night (the highest bar); never a push for a 0-for night
//   2  the nightly recap: once per person, only when something cleared, only after THEIR games are final, respects mute / the switch
//   3  the daily soft cap: 8 non-urgent, urgent exempt with its own 15; the clock is 6 am ET; the kill switch
//   4  the defaults footgun (nflred / nba30) and "saved settings win" (old keys carry over, the new key beats them)
//   5  Off, per-player mute (Pause tonight was removed 2026-10-13: a stale pausedUntil is ignored), the per-device sport filter
//   6  the new pushes: lineups are in, puck drop, NFL injury status, calls graded, weekly: audience, dedupe key, defaults, presets, plan, catalog
//   6g push parity outside MLB (2026-10-13): nflcalled / nflmulti / nflfinal, nhlmulti / nhlfinal / nhlinj, BUCKETS switches in the panel for a viewer who can see them
//   7  the card on the notification, the welcome line, the panel words
import assert from 'node:assert/strict'

// a browser for the panel module (alerts.js reads localStorage / window)
const mem = new Map()
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }
globalThis.window = { dispatchEvent() {}, addEventListener() {}, removeEventListener() {} }

const PR = await import('../lib/dash/pushRules.js')
const BR = await import('../lib/dash/pushBrake.js')
const NI = await import('../lib/dash/pushNightly.js')
const IO = await import('../lib/dash/pushNightlyIO.js')
const CP = await import('../lib/copy/notifications.js')
const AL = await import('../lib/dash/alerts.js')

let failed = 0
const check = (c, l, x = '') => { if (c) console.log(`ok   ${l}`); else { failed += 1; console.log(`FAIL ${l} ${x}`) } }

const DAY = '2026-10-09'
const NOW = Date.parse('2026-10-10T02:30:00Z')                 // 10:30pm ET, Friday 10-09
const game = (pk, over = {}) => ({ pk, gameDate: DAY, state: 'Live', settled: false, postponed: false, homeId: 147, awayId: 139, inning: 7, half: 'Bottom', homeScore: 3, awayScore: 2, lineup: { home: [], away: [] }, lineupPosted: true, ...over })
const line = (pk, over = {}) => ({ pk, name: 'Test Alpha', ab: 3, h: 0, hr: 0, tb: 0, r: 0, rbi: 0, d2: 0, d3: 0, k: 0, ...over })
const follow = (ids, extra = {}) => Object.fromEntries(ids.map((id) => [`mlb:${id}`, { sport: 'mlb', id: String(id), name: `Test ${id}`, team: 'NYY', at: 1, ...(extra[id] || {}) }]))
const stateOf = (ids, events = {}, extra = {}) => ({ dash_follow_v1: follow(ids, extra), dash_alerts_v1: { events } })
const aud = (ids) => ({ mlb: new Set(ids.map(String)) })
// what a default account that follows these men would actually be sent (the producer also builds the CUT categories; wants() is the gate)
const reach = (evs, ids) => evs.filter((e) => PR.wants(stateOf(ids || ['1', '2', '3', '4']), e))
const barEvents = (lines, games = [game(100)]) => reach(PR.mlbEventsFrom({ games, lines }, DAY, aud(Object.keys(lines)), {}, null), Object.keys(lines))

// ── 1. ONE BAR-CLEARED PUSH PER HITTER PER NIGHT ─────────────────────────────
{
  const L = { 1: line(100, { h: 2, ab: 3, tb: 2, r: 1, rbi: 0 }) }                   // two hits (and a run): used to be multihit AND hrr
  const ev = barEvents(L)
  const cats = ev.map((e) => e.category)
  check(cats.filter((c) => c === 'barcleared').length === 1 && !cats.some((c) => ['hrr', 'multihit', 'bigbases', 'finalline'].includes(c)), 'two hits and a run: ONE barcleared event, none of hrr / multihit / bigbases / finalline', cats.join())
  check(ev[0].title.endsWith('cleared 2 hits') && /^2-for-3/.test(ev[0].body), 'the push says the bar and the line', `${ev[0].title} | ${ev[0].body}`)
  const four = barEvents({ 1: line(100, { h: 2, ab: 3, tb: 4, d2: 1 }) })
  check(four.length === 1 && /cleared 4 bases$/.test(four[0].title), '4 total bases outranks 2 hits: "cleared 4 bases"', four[0]?.title)
  const three = barEvents({ 1: line(100, { h: 3, ab: 4, tb: 3 }) })
  check(three.length === 1 && /cleared 3 hits$/.test(three[0].title), '3 hits outranks 2 hits', three[0]?.title)
  const hrrOnly = barEvents({ 1: line(100, { h: 1, ab: 3, tb: 1, r: 1, rbi: 0 }) })
  check(hrrOnly.length === 1 && /cleared HRR$/.test(hrrOnly[0].title) && /^1 H, 1 R/.test(hrrOnly[0].body), 'one hit and a run: "cleared HRR", the parts in the body', `${hrrOnly[0]?.title} | ${hrrOnly[0]?.body}`)
  const homerOnly = barEvents({ 1: line(100, { h: 1, ab: 3, hr: 1, tb: 4, r: 1, rbi: 1 }) })
  check(homerOnly.map((e) => e.category).join() === 'homer', 'a lone homer is the HOMER push only (no bar on top)', homerOnly.map((e) => e.category).join())
  const homerPlus = barEvents({ 1: line(100, { h: 2, ab: 3, hr: 1, tb: 5, r: 1, rbi: 1 }) })
  check(homerPlus.map((e) => e.category).sort().join() === 'barcleared,homer' && /2 hits/.test(homerPlus.find((e) => e.category === 'barcleared').title) && /1 HR/.test(homerPlus.find((e) => e.category === 'barcleared').body), '2 hits + a homer: the homer push plus ONE "2 hits" push that carries "1 HR"', homerPlus.map((e) => `${e.category}:${e.title}|${e.body}`).join(' / '))
  const k1 = barEvents(L)[0].key
  const L2 = { 1: line(100, { h: 3, ab: 4, tb: 4, d2: 1 }) }
  check(barEvents(L2).find((e) => e.category === 'barcleared').key === k1, 'a later, higher bar has the SAME key: he is told once per night')
  check(/^mlb:2026-10-09:1:bar$/.test(k1), 'the key is the game\'s own date, the man, and "bar"', k1)
  check(PR.laneOf({ category: 'barcleared', priority: 2 }) === 'urgent', 'barcleared is never dropped by a lane window (the daily cap is the brake)')

  // finalline is gone: a settled line of any kind makes no event of its own
  const settled = barEvents({ 1: line(100, { h: 2, ab: 4, tb: 2, settled: true }) }, [game(100, { state: 'Final', settled: true })])
  check(!settled.some((e) => e.category === 'finalline'), 'a settled line produces no final-line push')
}

// ── 1b. NEVER A PUSH FOR A 0-FOR / NOTHING-CLEARED NIGHT ─────────────────────
{
  const zero = barEvents({ 1: line(100, { ab: 4, h: 0, tb: 0, k: 2, settled: true }), 2: line(100, { name: 'Test Bravo', ab: 3, h: 1, tb: 1, settled: true }) }, [game(100, { state: 'Final', settled: true })])
  check(zero.length === 0, '0-for-4 and 1-for-3 with nothing else, final: NO push of any kind', JSON.stringify(zero.map((e) => e.title)))
  for (const e of zero) assert.ok(!/Nothing cleared|0-for/.test(`${e.title} ${e.body}`))
  check(!CP.CATALOG.some((r) => /Nothing cleared/.test(JSON.stringify(r.render()))), 'no catalog row says "Nothing cleared"')
}

// ── 2. THE NIGHT RECAP ───────────────────────────────────────────────────────
{
  const wantsAll = PR.wants
  const finalG = game(100, { state: 'Final', settled: true })
  const lines = { 1: line(100, { h: 2, ab: 4, tb: 2 }), 2: line(100, { ab: 4 }), 3: line(100, { ab: 3, hr: 1, h: 1, tb: 4 }), 4: line(100, { ab: 0 }) }
  const snap = { games: [finalG], lines }
  const users = { u1: stateOf([1, 2, 3, 4], { recap: true }) }
  const ev = NI.mlbRecapEventsFrom(snap, users, wantsAll, NOW)
  check(ev.length === 1 && ev[0].category === 'recap' && ev[0].owner === 'u1', 'a recap is one owned event per person')
  check(ev[0].title === '\u{1F3C1} Your 3 hitters' && ev[0].body === '2 cleared, 1 did not', 'it counts the men who batted (3 of 4: one had no at-bat): "2 cleared, 1 did not"', `${ev[0].title} | ${ev[0].body}`)
  check(ev[0].key === `recap:${DAY}:u1`, 'its key is the game day and the person (once a night)', ev[0].key)
  check(NI.mlbRecapEventsFrom(snap, users, wantsAll, NOW + 60000).length === 1 && NI.mlbRecapEventsFrom(snap, users, wantsAll, NOW + 60000)[0].key === ev[0].key, 'a later sweep makes the SAME key (the claim table swallows it)')
  check(NI.mlbRecapEventsFrom(snap, { u1: stateOf([1, 2, 3, 4]) }, wantsAll, NOW).length === 0, 'off by default: nobody who never chose it gets one')
  check(NI.mlbRecapEventsFrom(snap, { u1: stateOf([1, 2, 3, 4], { finalline: true }) }, wantsAll, NOW).length === 1, 'a saved "final line" switch still means the recap (their choice carries over)')
  check(NI.mlbRecapEventsFrom({ games: [finalG], lines: { 2: lines[2] } }, { u1: stateOf([2], { recap: true }) }, wantsAll, NOW).length === 0, 'a night where NOTHING cleared: no recap, ever')
  check(NI.mlbRecapEventsFrom({ games: [game(100, { state: 'Live' })], lines }, users, wantsAll, NOW).length === 0, 'his game is still going: no recap yet')
  check(NI.mlbRecapEventsFrom({ games: [finalG, game(200, { state: 'Preview', lineupPosted: false, homeId: 147, awayId: 110 })], lines }, users, wantsAll, NOW).length === 0, 'a LATER game of his club tonight (not started) holds the recap until it is final')
  const lateNight = { games: [finalG, game(300, { gameDate: '2026-10-10', state: 'Preview', lineupPosted: false })], lines }
  check(NI.mlbRecapEventsFrom(lateNight, users, wantsAll, NOW).length === 1, 'tomorrow\'s game does not hold last night\'s recap')
  const other = { games: [finalG, game(400, { state: 'Live', homeId: 110, awayId: 111 })], lines }
  check(NI.mlbRecapEventsFrom(other, users, wantsAll, NOW).length === 1, 'a live game of a club he does not follow does not hold it')
  check(NI.mlbRecapEventsFrom(snap, { u1: stateOf([1, 2, 3, 4], { recap: true }, { 1: { mute: true }, 3: { mute: true } }) }, wantsAll, NOW).length === 0, 'muted men are not counted (only 2 left, 0 cleared: nothing to say)')
  const stale = { dash_follow_v1: follow([1, 3]), dash_alerts_v1: { events: { recap: true }, pausedUntil: NOW + 3600e3 } }
  check(NI.mlbRecapEventsFrom(snap, { u1: stale }, wantsAll, NOW).length === 1, 'a stale pausedUntil from the removed Pause tonight does nothing: the recap still goes')
  const two = { u1: stateOf([1, 3], { recap: true }), u2: stateOf([1, 2], { recap: true }) }
  const evs = NI.mlbRecapEventsFrom(snap, two, wantsAll, NOW)
  check(evs.length === 2 && evs.find((e) => e.owner === 'u2').body === '1 cleared, 1 did not', 'each person gets THEIR own count', evs.map((e) => e.body).join(' / '))
  check(CP.mlb.nightRecap({ total: 1, cleared: 1 }).body === '1 cleared' && CP.mlb.nightRecap({ total: 10, cleared: 3 }).title === '\u{1F3C1} Your 10 hitters' && CP.mlb.nightRecap({ total: 10, cleared: 3 }).body === '3 cleared, 7 did not', 'recap words: "Your 10 hitters" / "3 cleared, 7 did not"')
}

// ── 3. THE DAILY SOFT CAP ────────────────────────────────────────────────────
{
  const cfg = BR.brakeConfig({})
  check(cfg.on && cfg.daily === 8 && cfg.urgent === 15, 'default config: on, 8 a day, urgent 15', JSON.stringify(cfg))
  check(!BR.brakeConfig({ PUSH_BRAKE: 'off' }).on && BR.brakeConfig({ PUSH_DAILY_CAP: '5', PUSH_URGENT_CAP: '20' }).daily === 5 && BR.brakeConfig({ PUSH_DAILY_CAP: 'x' }).daily === 8, 'PUSH_BRAKE=off turns it off; the numbers are configurable; junk falls back')
  const soft = Array.from({ length: 12 }, (_, i) => ({ category: 'barcleared', priority: 2, key: `s${i}` }))
  const urgent = Array.from({ length: 20 }, (_, i) => ({ category: 'homer', priority: 0, key: `u${i}` }))
  let r = BR.applyDailyCaps(soft, { soft: 0, urgent: 0 }, cfg)
  check(r.send.length === 8 && r.held.length === 4, '12 bar-cleared events on a fresh day: 8 go, 4 are held', `${r.send.length}/${r.held.length}`)
  r = BR.applyDailyCaps(soft, { soft: 6, urgent: 0 }, cfg)
  check(r.send.length === 2 && r.held.length === 10, 'with 6 already sent today: 2 more')
  r = BR.applyDailyCaps([...soft, ...urgent.slice(0, 3)], { soft: 8, urgent: 0 }, cfg)
  check(r.send.length === 3 && r.send.every((e) => e.category === 'homer'), 'the soft cap spent: the urgent ones still go (exempt from it)')
  r = BR.applyDailyCaps(urgent, { soft: 0, urgent: 10 }, cfg)
  check(r.send.length === 5 && r.held.length === 15, 'urgent has its OWN cap: 15 a day (10 sent, 5 more)')
  check(BR.applyDailyCaps(soft, { soft: 50, urgent: 50 }, { ...cfg, on: false }).send.length === 12, 'kill switch: nothing held')
  const urgentCats = ['cardearned', 'scratched', 'gameoff', 'starter', 'lineupin', 'nhlcalled', 'boardup', 'lastcall', 'dropout']
  check(urgentCats.every((c) => BR.isUrgentClass({ category: c, priority: 3 })) && BR.isUrgentClass({ category: 'whatever', priority: 0 }), 'urgent class: CALLED goals, scratches, delays, cards, lineups-are-in, starters, the pregame four, any priority-0')
  const softCats = ['barcleared', 'recap', 'callsgraded', 'weekly', 'puckdrop', 'nflinj']
  check(softCats.every((c) => !BR.isUrgentClass({ category: c, priority: 3 })), 'non-urgent class: bar cleared, recap, receipt, weekly, puck drop, injury status')
  const t = BR.tallyLog([{ category: 'barcleared', priority: 2 }, { category: 'homer', priority: 0 }, { category: 'cardearned', priority: 1 }, { category: 'recap', priority: 3 }])
  check(t.soft === 2 && t.urgent === 2, 'the log tally: by class', JSON.stringify(t))
  // the push-day starts at 6 am ET (EDT in October, EST in January)
  check(new Date(BR.pushDayStart(Date.parse('2026-10-10T02:30:00Z'))).toISOString() === '2026-10-09T10:00:00.000Z', 'push-day start at 10:30pm ET is that morning\'s 6 am ET', new Date(BR.pushDayStart(Date.parse('2026-10-10T02:30:00Z'))).toISOString())
  check(new Date(BR.pushDayStart(Date.parse('2026-10-10T08:00:00Z'))).toISOString() === '2026-10-09T10:00:00.000Z', 'at 4 am ET it is still the previous push-day')
  check(new Date(BR.pushDayStart(Date.parse('2026-01-15T12:00:00Z'))).toISOString() === '2026-01-15T11:00:00.000Z', 'in winter 6 am ET is 11:00 UTC (EST)')
}

// ── 4. THE DEFAULTS FOOTGUN, AND SAVED SETTINGS WIN ──────────────────────────
{
  const ENV = process.env.PUSH_CUT_CATEGORIES
  const base = { dash_follow_v1: { 'nfl:abc': { sport: 'nfl', id: 'abc', name: 'Test Runner' }, 'nba:9': { sport: 'nba', id: '9', name: 'Test Guard' } } }
  const red = { category: 'nflred', sport: 'nfl', playerName: 'Test Runner' }
  const thirty = { category: 'nba30', sport: 'nba', playerId: '9' }
  process.env.PUSH_CUT_CATEGORIES = 'on'
  check(!PR.wants(base, red) && !PR.wants(base, thirty), 'PUSH_CUT_CATEGORIES=on, an account with NO saved settings: no red-zone alert and no 30-point alert (the defaults are off)')
  check(!PR.wants({ ...base, dash_alerts_v1: { events: {} } }, red) && !PR.wants({ ...base, dash_alerts_v1: { events: { homer: true } } }, thirty), 'a saved settings object that never mentioned them is the same')
  check(PR.wants({ ...base, dash_alerts_v1: { events: { nflred: true, nba30: true } } }, red) && PR.wants({ ...base, dash_alerts_v1: { events: { nflred: true, nba30: true } } }, thirty), 'a person who EXPLICITLY switched them on still gets them (their word wins)')
  if (ENV === undefined) delete process.env.PUSH_CUT_CATEGORIES; else process.env.PUSH_CUT_CATEGORIES = ENV
  check(!PR.wants({ ...base, dash_alerts_v1: { events: { nflred: true } } }, red), 'with the flag off, a cut category reaches nobody, switched on or not')

  const bar = { category: 'barcleared', sport: 'mlb', playerId: '1' }
  const mk = (events) => ({ dash_follow_v1: follow([1]), dash_alerts_v1: events === undefined ? undefined : { events } })
  check(PR.wants(mk(undefined), bar) && PR.wants(mk({}), bar), 'bar cleared is on for a new account and for one that saved other things')
  check(PR.wants(mk({ hrr: true, multihit: false, bigbases: false }), bar), 'OLD keys carry over: any of hrr / multihit / bigbases saved ON = bar cleared on')
  check(!PR.wants(mk({ hrr: false, multihit: false, bigbases: false }), bar), 'OLD keys carry over: all three saved OFF = bar cleared off (what they chose)')
  check(!PR.wants(mk({ barcleared: false, hrr: true }), bar) && PR.wants(mk({ barcleared: true, hrr: false }), bar), 'the NEW key beats the old ones when it is saved')
  const rc = { category: 'recap', owner: 'u', sport: 'mlb' }
  check(!PR.wants(mk(undefined), rc) && PR.wants(mk({ finalline: true }), rc) && !PR.wants(mk({ finalline: false }), rc) && PR.wants(mk({ recap: true }), rc), 'recap: off by default, a saved "final line" ON carries over, the new key wins')
  check(AL.alertPrefs().events.barcleared === true && AL.alertPrefs().events.recap === false, 'the panel agrees with the sender: bar cleared on, recap off, for a new device')
  mem.set('dash_alerts_v1', JSON.stringify({ events: { hrr: true, finalline: true, homer: true } }))
  check(AL.alertPrefs().events.barcleared === true && AL.alertPrefs().events.recap === true, 'the panel carries old saved keys over too', JSON.stringify(AL.alertPrefs().events))
  mem.delete('dash_alerts_v1')
}

// ── 5. OFF, MUTE, THE SPORT FILTER ────────────────────────────
{
  AL.setAlertPreset('essentials')
  check(AL.presetOf(AL.alertPrefs().events) === 'essentials', 'Essentials is Essentials')
  AL.setAlertPreset('off')
  const off = AL.alertPrefs()
  check(AL.presetOf(off.events) === 'off' && AL.PUSHABLE.every((k) => off.events[k] === false), 'the Off preset turns EVERY phone category off', JSON.stringify(Object.entries(off.events).filter(([, v]) => v)))
  check(AL.PRESETS.some((p) => p.key === 'off' && p.on.length === 0), 'Off is a preset with nothing in it')
  const offState = { dash_follow_v1: follow([1]), dash_alerts_v1: { events: off.events } }
  for (const c of ['homer', 'barcleared', 'scratched', 'cardearned', 'gameoff']) check(!PR.wants(offState, { category: c, sport: 'mlb', playerId: '1' }), `Off: ${c} reaches no phone`)
  AL.setAlertPreset('essentials')

  // Pause tonight is gone (2026-10-13): no code path exists for it, and a pausedUntil an old save still carries is ignored
  check(BR.next6amET === undefined && BR.isPaused === undefined && AL.setAlertPause === undefined, 'no pause code left in the brake or the panel')
  const t0 = Date.parse('2026-10-09T22:00:00Z')
  const hr = { category: 'homer', sport: 'mlb', playerId: '1', priority: 0 }
  const stale5 = { dash_follow_v1: follow([1]), dash_alerts_v1: { events: {}, pausedUntil: t0 + 3600e3 } }
  check(PR.wants(stale5, hr, t0 + 30 * 60e3) === true, 'a stale pausedUntil does not hold a homer')
  AL.setAlertMaster(true)
  check(AL.alertWanted(AL.alertPrefs(), { kind: 'hr', pri: 0 }, false) === true && !('pausedUntil' in AL.alertPrefs()), 'the page has no pause either (in-app toasts)')
  AL.setAlertMaster(false)

  // per-player mute
  const two = { dash_follow_v1: follow([1, 2], { 2: { mute: true } }), dash_alerts_v1: { events: {} } }
  check(PR.wants(two, { category: 'homer', sport: 'mlb', playerId: '1' }) && !PR.wants(two, { category: 'homer', sport: 'mlb', playerId: '2' }), 'a muted man sends nothing; his neighbour still does')
  check(!PR.wants(two, { category: 'gameoff', sport: 'mlb', playerIds: ['2'] }) && PR.wants(two, { category: 'gameoff', sport: 'mlb', playerIds: ['1', '2'] }), 'a game-level event counts only the un-muted men in it')
  const a = PR.audienceFrom({ x: two, y: { dash_follow_v1: follow([2]) } })
  check(a.mlb.has('1') && a.mlb.has('2'), 'the audience keeps a man muted by one person when another follows him un-muted')
  const b = PR.audienceFrom({ x: two })
  check(b.mlb.has('1') && !b.mlb.has('2'), 'the audience drops a man who every follower muted (no producer work for him)')

  // sports on this device
  check(PR.deviceWantsSport(['mlb'], 'mlb') && !PR.deviceWantsSport(['mlb'], 'nfl') && !PR.deviceWantsSport(['nhl'], 'mlb') && PR.deviceWantsSport(null, 'nfl') && PR.deviceWantsSport([], 'nhl'), 'sports on this device: a sport switched off sends this device nothing')
  check(PR.deviceWantsSport(['mlb'], 'fantasy') && PR.deviceWantsSport(['mlb'], 'all') && PR.deviceWantsSport(['mlb'], 'nba'), 'FRANCHISE, BUCKETS and the cross-sport notes pass every device')
}

// ── 6a. LINEUPS ARE IN ───────────────────────────────────────────────────────
{
  const row = (id, slot) => ({ id: String(id), name: `Test ${id}`, slot })
  const g = game(100, { state: 'Preview', lineupPosted: true, lineup: { home: [row(1, 2), row(5, 1), row(6, 3), row(7, 4), row(8, 5), row(9, 6), row(10, 7), row(11, 8), row(12, 9)], away: [20, 21, 22, 23, 24, 25, 26, 27, 28].map((i, n) => row(i, n + 1)) } })
  const board = PR.boardInfoFrom([{ player_id: '5', hr_score: 70, game_pick_role: 'TOP' }, { player_id: '6', hr_score: 60 }])
  const ev = PR.mlbEventsFrom({ games: [g], lines: {} }, DAY, aud([1, 5]), {}, board).filter((e) => e.category === 'lineupin')
  check(ev.length === 1 && ev[0].playerId === '1', 'a followed man who is NOT on the board and is in a posted lineup: ONE "lineups are in" event; the board man is left to the board push', ev.map((e) => e.playerId).join())
  check(ev[0].key === `mlb:${DAY}:1:lineupin:100` && /Test 1 is in the lineup$/.test(ev[0].title) && ev[0].body === 'bats 2nd · TB at NYY', 'one per man per game: key has the game; words', `${ev[0].key} | ${ev[0].title} | ${ev[0].body}`)
  check(PR.mlbEventsFrom({ games: [g], lines: {} }, DAY, aud([1]), {}, null).filter((e) => e.category === 'lineupin').length === 0, 'board not known yet: nothing (never a guess)')
  check(PR.mlbEventsFrom({ games: [{ ...g, state: 'Live' }], lines: {} }, DAY, aud([1]), {}, board).filter((e) => e.category === 'lineupin').length === 0, 'once the game has started: nothing')
  check(PR.mlbEventsFrom({ games: [{ ...g, lineupPosted: false, lineup: { home: [row(1, 2)], away: [] } }], lines: {} }, DAY, aud([1]), {}, board).filter((e) => e.category === 'lineupin').length === 0, 'lineup not fully posted: nothing (the existing lineup gate)')
  check(!PR.wants({ dash_follow_v1: follow([1]) }, ev[0]) && PR.wants({ dash_follow_v1: follow([1]), dash_alerts_v1: { events: { lineupin: true } } }, ev[0]), 'off by default, on when chosen')
  check(PR.laneOf(ev[0]) === 'urgent' && BR.isUrgentClass(ev[0]), 'lineups-are-in is never dropped and counts in the urgent class')
}

// ── 6b. PUCK DROP ────────────────────────────────────────────────────────────
{
  const start = NOW + 25 * 60000
  const nhlGame = (over = {}) => ({ id: 77, gameType: 2, date: DAY, state: 'pre', rawState: 'FUT', scheduleState: 'OK', startUtc: new Date(start).toISOString(), away: { abbrev: 'TST' }, home: { abbrev: 'EXA' }, ...over })
  const snap = (over = {}, starters = { 77: { away: { id: 'g1', name: 'Test G1', confirmed: true }, home: { id: 'g2', name: 'Test G2', confirmed: true } } }) => ({ ok: true, asOf: NOW, games: [nhlGame(over)], starters })
  const audience = { nhl: new Set(['10', 'g1']), teamOfId: new Map([['nhl:10', 'TST'], ['nhl:g1', 'TST']]), nameOf: new Map([['10', 'Test Skater'], ['g1', 'Test G1']]) }
  const run = (s, a = audience, prior = {}, opts = {}) => PR.nhlPregameEventsFrom(s, DAY, a, NOW, prior, opts).filter((e) => e.category === 'puckdrop')
  let ev = run(snap())
  check(ev.length === 1 && ev[0].key === `nhl:${DAY}:77:puckdrop` && ev[0].priority === 1 && ev[0].playerIds.length === 2, 'puck drop in 25 minutes with followed men: ONE event for the game, keyed by the game')
  check(ev[0].title === '\u{1F3D2} Puck drop in 25 min' && /^TST at EXA/.test(ev[0].body), 'words: "Puck drop in 25 min" / "TST at EXA · time"', `${ev[0].title} | ${ev[0].body}`)
  check(!/Test/.test(`${ev[0].title} ${ev[0].body}`), 'it names no player')
  check(PR.nhlPregameEventsFrom(snap(), DAY, audience, NOW, {}, {}).filter((e) => e.category === 'puckdrop').length === 1 && run(snap())[0].key === ev[0].key, 'a repeat sweep makes the same key')
  check(run({ ...snap(), games: [nhlGame({ startUtc: new Date(NOW + 45 * 60000).toISOString() })] }).length === 0, '45 minutes out: not yet')
  check(run({ ...snap(), games: [nhlGame({ startUtc: new Date(NOW - 5 * 60000).toISOString() })] }).length === 0, 'already past puck drop: nothing')
  check(run(snap({}, { 77: { away: { id: 'g1', confirmed: true }, home: { id: 'g2', confirmed: false } } })).length === 0, 'a goalie not confirmed: nothing (the lineup is not confirmed)')
  check(run(snap({}, {})).length === 0, 'no goalie source for the game: nothing')
  check(run(snap({ scheduleState: 'PPD' })).length === 0, 'a postponed game: no heads-up')
  check(run(snap(), audience, {}, { outIds: new Set(['10', 'g1']) }).length === 0, 'both followed men listed Out: nothing')
  ev = run(snap(), audience, {}, { outIds: new Set(['10']) })
  check(ev.length === 1 && ev[0].playerIds.join() === 'g1', 'one listed Out: only the other is counted')
  ev = run(snap(), audience, { '77:away': [{ id: 'gOld', name: 'Test Old' }, { id: 'g1', name: 'Test G1' }] })
  check(ev.length === 1, 'the confirmed goalie is still counted when he is the one confirmed now')
  const replaced = { ...audience, nhl: new Set(['gOld']), teamOfId: new Map([['nhl:gOld', 'TST']]), nameOf: new Map([['gOld', 'Test Old']]) }
  check(run(snap(), replaced, { '77:away': [{ id: 'gOld', name: 'Test Old' }] }).length === 0, 'a followed goalie ESPN replaced is not in the lineup: no heads-up for him')
  const st = (events) => ({ dash_follow_v1: { 'nhl:10': { sport: 'nhl', id: '10', name: 'Test Skater' } }, dash_alerts_v1: events ? { events } : undefined })
  const ev1 = run(snap())[0]
  check(!PR.wants(st(), ev1) && PR.wants(st({ puckdrop: true }), ev1), 'off by default, on when chosen')
  check(PR.laneOf(ev1) === 'urgent' && !BR.isUrgentClass(ev1), 'never lane-dropped, but it is a SOFT-capped (non-urgent) note')
}

// ── 6c. NFL INJURY STATUS ────────────────────────────────────────────────────
{
  const kick = NOW + 50 * 3600e3
  const snap = { ok: true, asOf: NOW, games: [{ game_id: 'g1', away: 'TST', home: 'EXA', kickoff: new Date(kick).toISOString(), state: 'pre' }], outs: [] }
  const ent = (over = {}) => ({ sport: 'nfl', team: 'TST', name: 'Test Receiver', status: 'QUESTIONABLE', updatedAt: new Date(NOW - 3600e3).toISOString(), ...over })
  const inj = (entries) => ({ ok: true, unavailable: false, stale: false, asOf: NOW, entries })
  const aud2 = { nfl: new Set([PR.followNameKey('Test Receiver')]), teamOf: new Map() }
  const run = (entries, a = aud2, s = snap) => PR.nflInjuryStatusEventsFrom(s, inj(entries), DAY, a, NOW, null)
  let ev = run([ent()])
  check(ev.length === 1 && ev[0].category === 'nflinj' && ev[0].title === '\u{1F3C8} Receiver is questionable' && ev[0].body === 'Injury report · TST at EXA · Mon 12:30 AM ET', 'a followed player listed questionable: one event, in the report\'s own word', ev[0] && `${ev[0].title} | ${ev[0].body}`)
  check(run([ent({ status: 'DOUBTFUL' })])[0].key !== ev[0].key && /doubtful$/.test(run([ent({ status: 'DOUBTFUL' })])[0].title), 'Q to D is a second event (the status is in the key)')
  check(run([ent()])[0].key === ev[0].key, 'the same word seen again has the same key')
  check(run([ent({ status: 'OUT' })]).length === 0, 'OUT is the scratch push, not this one')
  check(run([ent({ name: 'Test Other' })]).length === 0, 'someone nobody follows: nothing')
  check(run([ent({ updatedAt: new Date(NOW - 60 * 3600e3).toISOString() })]).length === 0, 'a line older than 48 hours is not news')
  check(run([ent({ updatedAt: null })]).length === 0, 'no stamp: not news')
  check(PR.nflInjuryStatusEventsFrom(snap, { ...inj([ent()]), stale: true }, DAY, aud2, NOW).length === 0, 'a stale or unavailable injury report makes nothing')
  check(run([ent()], aud2, { ...snap, games: [{ ...snap.games[0], state: 'in' }] }).length === 0, 'a game under way: nothing')
  const long = CP.nfl.injuryStatus({ name: 'Testington Vanderbilt-Hall', status: 'QUESTIONABLE', away: 'TST', home: 'EXA', whenMs: kick, now: NOW })
  check(!long.title.endsWith('…') && [...long.title].length <= CP.LIMITS.title, 'a long name falls back to "is Q" and still fits', long.title)
  const st = (events) => ({ dash_follow_v1: { 'nfl:x': { sport: 'nfl', id: 'x', name: 'Test Receiver' } }, dash_alerts_v1: events ? { events } : undefined })
  check(!PR.wants(st(), ev[0]) && PR.wants(st({ nflinj: true }), ev[0]), 'off by default, on when chosen')
}

// ── 6d. CALLS GRADED ─────────────────────────────────────────────────────────
{
  const settledAll = (players, games) => ({ ready: Object.values(games).every((l) => (l || []).every((g) => g.final)), waiting: ['x'] })
  const outcomeOf = (p, results) => results[p.sport]?.[p.id] || 'pending'
  const called = (sport, id) => ({ sport, id, name: `Test ${id}`, role: 'HR', game: 1 })
  const g1 = gradeCalled2([called('mlb', 'a'), called('mlb', 'b'), called('nhl', 'c'), called('mlb', 'd'), called('mlb', 'e')], { mlb: [{ id: 1, final: true }], nhl: [{ id: 1, final: true }] }, { mlb: { a: 'cashed', b: 'missed', d: 'cashed', e: 'void' }, nhl: { c: 'cashed' } })
  function gradeCalled2(c, games, results) { return NI.gradeCalled(c, { games, results, nightSettled: settledAll, outcomeOf }) }
  check(g1.ready && g1.cashed === 3 && g1.missed === 1 && g1.voids === 1, 'graded: 3 cashed, 1 missed, 1 did not play (outside the count)', JSON.stringify(g1))
  const ev = NI.callsGradedEvent('u1', DAY, g1)
  check(ev.title === '\u{1F4D2} Your CALLED picks' && ev.body === '3 of 4 cleared · 1 did not play' && ev.key === `calls:${DAY}:u1` && ev.owner === 'u1', 'words and key: "3 of 4 cleared", once per person per night', `${ev.title} | ${ev.body} | ${ev.key}`)
  check(NI.callsGradedEvent('u1', DAY, { ready: true, cashed: 0, missed: 3, voids: 0 }) === null, 'none cleared: no push (a night of misses is not pushed)')
  check(NI.callsGradedEvent('u1', DAY, { ready: false, cashed: 2, missed: 0, voids: 0 }) === null, 'not graded yet: no push')
  check(NI.gradeCalled([called('mlb', 'a')], { games: { mlb: [{ id: 1, final: true }] }, results: { mlb: {} }, nightSettled: settledAll, outcomeOf }).ready === false, 'a pick the grader calls "pending": wait')
  check(NI.gradeCalled([called('mlb', 'a')], { games: { mlb: [{ id: 1, final: false }] }, results: { mlb: { a: 'cashed' } }, nightSettled: settledAll, outcomeOf }).ready === false, 'his game is not final: wait')

  // the reads, with a fake database
  IO._resetNightlyForTests()
  const board = [{ player_id: 'a', name: 'Test a', game_pick_role: 'HR', game_pk: 1 }, { player_id: 'b', name: 'Test b', game_pick_role: 'WATCH', game_pk: 1 }, { player_id: 'z', name: 'Test z', game_pick_role: 'TOP', game_pk: 1 }]
  const mkUsers = (events = { callsgraded: true }) => ({ u1: stateOf(['a', 'b'], events), u2: stateOf(['a'], {}), u3: stateOf([], events) })
  let loaderCalls = 0
  const deps = (res, games) => ({
    loadBoard: async () => board, loadNhlCalled: async () => [],
    receiptLoader: () => async (players) => { loaderCalls += 1; return { results: res, games } },
    nightSettled: settledAll, outcomeOf,
  })
  const T = Date.parse('2026-10-09T23:30:00Z')                       // 7:30 pm ET (before 8 am ET the sender also looks at yesterday)
  const snapDone = { games: [{ pk: 1, settled: true }] }
  let out = await IO.callsGradedEvents({ db: null, snap: snapDone, stateByUser: mkUsers(), wantsFn: PR.wants, now: T, deps: deps({ mlb: { a: 'cashed' } }, { mlb: [{ id: 1, final: true }] }) })
  check(out.length === 1 && out[0].owner === 'u1' && out[0].body === '1 of 1 cleared', 'only the account that chose it AND follows a CALLED pick is told; WATCH is not a call', JSON.stringify(out.map((e) => [e.owner, e.body])))
  check(loaderCalls >= 1, 'the receipt loader was asked (once the games were final)')
  const before = loaderCalls
  out = await IO.callsGradedEvents({ db: null, snap: snapDone, stateByUser: mkUsers(), wantsFn: PR.wants, now: T + 60000, deps: deps({ mlb: { a: 'cashed' } }, { mlb: [{ id: 1, final: true }] }) })
  check(out.length === 0 && loaderCalls === before, 'a second sweep does the work again for nobody (done on this instance, and the claim key dedupes)')
  IO._resetNightlyForTests(); loaderCalls = 0
  out = await IO.callsGradedEvents({ db: null, snap: { games: [{ pk: 1, settled: false }] }, stateByUser: mkUsers(), wantsFn: PR.wants, now: T, deps: deps({}, { mlb: [{ id: 1, final: false }] }) })
  check(out.length === 0 && loaderCalls === 0, 'the slate says his game is still going: no schedule or box-score reads at all')
  IO._resetNightlyForTests()
  out = await IO.callsGradedEvents({ db: null, snap: snapDone, stateByUser: mkUsers({}), wantsFn: PR.wants, now: T, deps: deps({ mlb: { a: 'cashed' } }, { mlb: [{ id: 1, final: true }] }) })
  check(out.length === 0, 'off by default: nobody who never chose it is told')
  IO._resetNightlyForTests()
  out = await IO.callsGradedEvents({ db: null, snap: snapDone, stateByUser: mkUsers(), wantsFn: PR.wants, now: T, deps: deps({ mlb: { a: 'missed' } }, { mlb: [{ id: 1, final: true }] }) })
  check(out.length === 0, 'a night where none cleared: nothing')
  IO._resetNightlyForTests()
  const mutedState = { u1: stateOf(['a'], { callsgraded: true }, { a: { mute: true } }) }
  out = await IO.callsGradedEvents({ db: null, snap: snapDone, stateByUser: mutedState, wantsFn: PR.wants, now: T, deps: deps({ mlb: { a: 'cashed' } }, { mlb: [{ id: 1, final: true }] }) })
  check(out.length === 0, 'a muted man\'s pick is not counted for the person who muted him')
}

// ── 6e. THE WEEKLY NOTE ──────────────────────────────────────────────────────
{
  IO._resetNightlyForTests()
  const MON = Date.parse('2026-10-12T17:30:00Z')                  // Monday 1:30pm ET
  const SUN = Date.parse('2026-10-11T17:30:00Z')
  const fakeDb = (rows) => ({ from: () => { const q = { select: () => q, eq: () => q, in: () => q, gte: () => Promise.resolve({ data: rows, error: null }) }; return q } })
  const cards = { day: '2026-10-07', tier: 'elite' }
  const deps = { earnedFor: async () => ({ cards: [cards, { day: '2026-10-07', tier: 'star' }, { day: '2026-09-20', tier: 'elite' }] }), tierRank: (t) => ({ base: 0, star: 1, elite: 2, legend: 3 }[t] ?? 0), minTier: { mlb: 'elite', nhl: 'star', nfl: 'elite' } }
  const users = { u1: stateOf([1], { weekly: true }), u2: stateOf([1], {}) }
  check((await IO.weeklyEvents({ db: fakeDb([]), stateByUser: users, wantsFn: PR.wants, now: SUN, deps })).length === 0, 'Sunday: nothing')
  let out = await IO.weeklyEvents({ db: fakeDb([{ body: '3 of 5 cleared' }, { body: '1 of 2 cleared · 1 did not play' }]), stateByUser: users, wantsFn: PR.wants, now: MON, deps })
  check(out.length === 1 && out[0].owner === 'u1' && out[0].body === '1 card earned · 4 of 7 CALLED picks cleared', 'Monday: one note for the account that chose it; cards in the week (ELITE or up for MLB), calls summed from its own receipts', JSON.stringify(out.map((e) => e.body)))
  check(out[0].key === `weekly:2026-10-12:u1` && out[0].title === '\u{1F4CA} Last week', 'keyed by the Monday and the person (once a week)', out[0]?.key)
  IO._resetNightlyForTests()
  out = await IO.weeklyEvents({ db: fakeDb([]), stateByUser: { u1: stateOf([1], { weekly: true }) }, wantsFn: PR.wants, now: MON, deps: { ...deps, earnedFor: async () => ({ cards: [] }) } })
  check(out.length === 0, 'a person with nothing to report gets nothing')
  check(!PR.wants(stateOf([1], {}), { category: 'weekly', owner: 'u1' }) && PR.wants(stateOf([1], { weekly: true }), { category: 'weekly', owner: 'u1' }), 'off by default')
  const ev = NI.weeklyEvent('u', '2026-10-12', { cards: 3, cashed: 2, total: 5 })
  check(ev.body === '3 cards earned · 2 of 5 CALLED picks cleared', 'words: "3 cards earned · 2 of 5 CALLED picks cleared"', ev.body)
  check(NI.parseCallsBody('3 of 5 cleared · 1 did not play')?.total === 5 && NI.parseCallsBody('hello') === null, 'the receipt body parses back')
}

// ── 6f. PRESETS, PLAN, CATALOG, DEFAULTS ─────────────────────────────────────
{
  const NEW = ['barcleared', 'recap', 'callsgraded', 'lineupin', 'puckdrop', 'weekly', 'nflinj']
  const preset = (k) => AL.PRESETS.find((p) => p.key === k).on
  check(NEW.every((k) => AL.ALL_CATEGORIES.some((c) => c.key === k && c.push) && k in CP.PUSH_PLAN && CP.PUSH_PLAN[k].keep && CP.CATEGORY_COPY[k]), 'each new category has an alerts.js entry, a PUSH_PLAN row and panel words')
  check(NEW.every((k) => CP.CATALOG.some((r) => r.key === k)), 'each new category has a catalog row (so the copy lint covers it)')
  check(preset('essentials').includes('barcleared') && !preset('essentials').some((k) => ['recap', 'callsgraded', 'lineupin', 'puckdrop', 'weekly', 'nflinj'].includes(k)), 'Essentials: bar cleared in; the recap, receipt, lineups, puck drop, weekly and injury status out')
  check(['recap', 'callsgraded', 'lineupin', 'puckdrop', 'nflinj', 'barcleared'].every((k) => preset('closely').includes(k)) && !preset('closely').includes('weekly'), 'Following closely: adds recap, receipt, lineups, puck drop and injury status; the weekly note is not in it')
  check(preset('everything').includes('weekly') && NEW.every((k) => preset('everything').includes(k)), 'Everything includes the weekly note and every new one')
  check(!['hrr', 'multihit', 'bigbases', 'finalline'].some((k) => AL.CATEGORIES.some((c) => c.key === k)), 'the four merged switches are no longer offered in the panel')
  check(['hrr', 'multihit', 'bigbases', 'finalline'].every((k) => AL.ALL_CATEGORIES.some((c) => c.key === k && c.merged)), '...but stay valid keys (a saved one still resolves)')
  // server defaults vs the panel: a new account hears exactly Essentials
  const fresh = { dash_follow_v1: follow([1]) }
  const p = (cat, extra = {}) => PR.wants(fresh, { category: cat, sport: 'mlb', playerId: '1', owner: 'u', ...extra })
  check(NEW.every((k) => p(k) === (k === 'barcleared')), 'a new account: ONLY bar cleared of the seven is on', NEW.map((k) => `${k}:${p(k)}`).join())
  check(AL.CATEGORIES.filter((c) => c.scope === 'personal' && c.push && AL.PRESETS[0].on.includes(c.key)).every((c) => c.group !== undefined), 'every Essentials category has a group the panel can draw')
  const groups = new Set(AL.CATEGORIES.map((c) => c.group))
  check(['All', 'Moonshot', 'Tuddy', 'Lamp', 'Cards', 'Franchise', 'Buckets'].every((g) => groups.has(g)) && groups.size === 7, 'groups: the panel draws exactly these seven (Buckets only for a viewer who can see BUCKETS, see 6g)', [...groups].join())
  check(['scratched', 'gameoff'].every((k) => AL.CATEGORIES.find((c) => c.key === k).group === 'All'), 'scratched and gameoff sit under ALL SPORTS (they fire for every sport)')
}

// ── 6g. PUSH PARITY OUTSIDE MLB (2026-10-13, parity audit gap 1) ─────────────────────────────────────────────────
// NFL: nflcalled, nflmulti, nflfinal. NHL: nhlmulti, nhlfinal, nhlinj. BUCKETS: nba30 / nbacalled in the panel for a viewer who can see it. Test data only.
{
  const NEWP = ['nflcalled', 'nflmulti', 'nflfinal', 'nhlmulti', 'nhlfinal', 'nhlinj']
  const BK = ['nba30', 'nbacalled']
  const preset = (k) => AL.PRESETS.find((p) => p.key === k).on
  check([...NEWP, ...BK].every((k) => AL.ALL_CATEGORIES.some((c) => c.key === k && c.push) && k in CP.PUSH_PLAN && CP.PUSH_PLAN[k].keep && CP.CATEGORY_COPY[k] && AL.CATEGORIES.some((c) => c.key === k)), 'each parity category has an alerts.js entry, a kept PUSH_PLAN row, panel words, and is offered')
  check([...NEWP, ...BK].every((k) => CP.CATALOG.some((r) => r.key === k)), 'each parity category has a catalog row (so the copy lint covers it)')
  // OFF until chosen, everywhere: the server default, the panel default, Essentials
  const fresh = { dash_follow_v1: Object.fromEntries([['nfl:t', { sport: 'nfl', id: 't', name: 'Test Runner', team: 'TST' }], ['nhl:9', { sport: 'nhl', id: '9', name: 'Test Skater', team: 'TST' }], ['nba:7', { sport: 'nba', id: '7', name: 'Test Guard', team: 'TST' }]]) }
  const probe = (cat, sport, extra = {}) => PR.wants(fresh, { category: cat, sport, playerName: 'Test Runner', playerId: sport === 'nhl' ? '9' : sport === 'nba' ? '7' : undefined, ...extra })
  check(NEWP.every((k) => probe(k, k.startsWith('nfl') ? 'nfl' : 'nhl') === false) && BK.every((k) => probe(k, 'nba') === false), 'a new account hears none of them (default OFF)')
  check([...NEWP, ...BK].every((k) => !preset('essentials').includes(k)), 'Essentials has none of them')
  check(['nflmulti', 'nhlmulti', 'nhlinj'].every((k) => preset('closely').includes(k)) && !['nflcalled', 'nflfinal', 'nhlfinal', ...BK].some((k) => preset('closely').includes(k)), 'Following closely: the multi-TD, multi-goal and NHL injury notes; no finals, no CALLED-for-everyone, no BUCKETS')
  check(['nflmulti', 'nflfinal', 'nhlmulti', 'nhlfinal', 'nhlinj'].every((k) => preset('everything').includes(k)) && !['nflcalled', 'nhlcalled', ...BK].some((k) => preset('everything').includes(k)), 'Everything: every personal one; never an "everyone" alert, and never BUCKETS (opening it switches nothing on)')
  // their word wins once chosen
  const chosen = (k, sport, extra) => PR.wants({ ...fresh, dash_alerts_v1: { events: { [k]: true } } }, { category: k, sport, playerName: 'Test Runner', ...extra })
  check(chosen('nflmulti', 'nfl') && chosen('nflfinal', 'nfl', { playerNames: ['Test Runner'] }) && chosen('nhlinj', 'nhl', { playerId: '9' }), 'switched on, the follower hears it')
  check(!chosen('nflmulti', 'nfl', { playerName: 'Somebody Else' }), '...and only for a name he follows')
  check(chosen('nflcalled', 'nfl', { everyone: true, playerName: 'Somebody Else' }) && !PR.wants(fresh, { category: 'nflcalled', sport: 'nfl', everyone: true }), 'nflcalled: needs its switch, then reaches a follower for any CALLED scorer')

  // ── the cap and the lanes ──
  const prio = { nhlinj: 1, nflfinal: 3, nhlfinal: 3, nflmulti: 2, nhlmulti: 2 }
  check(!Object.keys(prio).some((k) => BR.isUrgentClass({ category: k, priority: prio[k] })), 'the personal parity notes are NOT urgent: each counts against the daily soft cap')
  check(BR.isUrgentClass({ category: 'nflcalled', priority: 4 }) && BR.isUrgentClass({ category: 'nhlcalled', priority: 4 }), 'nflcalled rides the urgent class like nhlcalled (a CALLED touchdown), and is off by default')
  const mkE = (category, i) => ({ category, key: `k${i}`, priority: prio[category] })
  const capped = BR.applyDailyCaps(['nflmulti', 'nhlmulti', 'nflfinal', 'nhlfinal', 'nflmulti', 'nhlmulti', 'nflfinal', 'nhlfinal', 'nflmulti', 'nhlmulti'].map(mkE), { soft: 0, urgent: 0 }, BR.brakeConfig({}))
  check(capped.send.length === 8 && capped.held.length === 2, 'ten of them in a day: 8 sent, 2 held by the soft cap')
  check(Object.keys(prio).every((k) => PR.laneOf({ category: k, priority: prio[k] }) === 'urgent'), 'once-per-game notes ride the lane that is never dropped (the cap is their brake)')

  // ── NFL: a multi-TD game, and any CALLED touchdown ──
  const aNfl = { nfl: new Set([PR.followNameKey('Test Runner'), PR.followNameKey('Test Passer')]), teamOf: new Map([[PR.followNameKey('Test Runner'), 'TST'], [PR.followNameKey('Test Passer'), 'TST']]) }
  const gNfl = { game_id: 'G1', state: 'in', period: 3, home: 'EXA', away: 'TST', home_score: 14, away_score: 17, kickoff: '2026-10-11T17:00:00Z' }
  const lineBy = (over) => ({ game_id: 'G1', name: 'Test Runner', team: 'TST', ...over })
  const snapNfl = (...ls) => ({ games: [gNfl], lines: new Map(ls.map((l, i) => [`l${i}`, l])) })
  const cat = (evs, c) => evs.filter((e) => e.category === c)
  const one = cat(PR.nflEventsFrom(snapNfl(lineBy({ rushing_tds: 1, receiving_tds: 1 })), '2026-10-11', aNfl), 'nflmulti')
  check(one.length === 1 && one[0].priority === 2 && /Test Runner has 2 TDs/.test(one[0].title) && /^2 TDs · Q3/.test(one[0].body), 'two scoring touchdowns: one nflmulti note', `${one[0]?.title} | ${one[0]?.body}`)
  const three = cat(PR.nflEventsFrom(snapNfl(lineBy({ rushing_tds: 2, receiving_tds: 1 })), '2026-10-11', aNfl), 'nflmulti')
  check(three.length === 1 && three[0].key === one[0].key, 'a third touchdown is the SAME key (claimed once in dash_push_seen: no second note)')
  check(cat(PR.nflEventsFrom(snapNfl(lineBy({ rushing_tds: 1 })), '2026-10-11', aNfl), 'nflmulti').length === 0, 'one touchdown: no multi note')
  const qb = cat(PR.nflEventsFrom(snapNfl(lineBy({ name: 'Test Passer', passing_tds: 3 })), '2026-10-11', aNfl), 'nflmulti')
  check(qb.length === 1 && /3 TD passes/.test(qb[0].body) && cat(PR.nflEventsFrom(snapNfl(lineBy({ name: 'Test Passer', passing_tds: 2 })), '2026-10-11', aNfl), 'nflmulti').length === 0, 'a quarterback: three thrown, not two')
  check(cat(PR.nflEventsFrom(snapNfl(lineBy({ name: 'Nobody Followed', rushing_tds: 2 })), '2026-10-11', aNfl), 'nflmulti').length === 0, 'a man nobody follows: no multi note')
  const boardC = new Map([[PR.followNameKey('Other Man'), { status: 'called', rank: 2 }], [PR.followNameKey('Board Man'), { status: 'board', rank: 8 }]])
  const calledEv = cat(PR.nflEventsFrom(snapNfl(lineBy({ name: 'Other Man', rushing_tds: 1 }), lineBy({ name: 'Board Man', rushing_tds: 1 })), '2026-10-11', aNfl, boardC), 'nflcalled')
  check(calledEv.length === 1 && calledEv[0].everyone === true && calledEv[0].priority === 4 && /^CALLED/.test(calledEv[0].body) && /:called$/.test(calledEv[0].key), 'nflcalled: only the CALLED scorer, "everyone", its own :called key, the word CALLED', calledEv.map((e) => e.body).join('|'))
  check(cat(PR.nflEventsFrom(snapNfl(lineBy({ name: 'Other Man', rushing_tds: 1 })), '2026-10-11', aNfl, null), 'nflcalled').length === 0 && cat(PR.nflEventsFrom(snapNfl(lineBy({ name: 'Other Man', rushing_tds: 0 })), '2026-10-11', aNfl, boardC), 'nflcalled').length === 0, 'no board, or no touchdown: no nflcalled (never a guess)')
  const followedCalled = PR.nflEventsFrom(snapNfl(lineBy({ name: 'Test Runner', rushing_tds: 1 })), '2026-10-11', aNfl, new Map([[PR.followNameKey('Test Runner'), { status: 'called', rank: 1 }]]))
  check(cat(followedCalled, 'nfltd').length === 1 && cat(followedCalled, 'nflcalled').length === 1 && cat(followedCalled, 'nfltd')[0].key !== cat(followedCalled, 'nflcalled')[0].key, 'a followed CALLED scorer: his own nfltd (P0) and the nflcalled stay two different keys')

  // ── NFL: the final score ──
  const NOWF = Date.parse('2026-10-11T21:30:00Z')
  const snapF = (g) => ({ ok: true, asOf: NOWF, games: [{ game_id: 'G1', away: 'TST', home: 'EXA', kickoff: '2026-10-11T17:00:00Z', plannedKickoff: '2026-10-11T17:00:00Z', state: 'post', away_score: 17, home_score: 20, ...g }], outs: [] })
  const fin = cat(PR.nflPregameEventsFrom(snapF(), '2026-10-11', aNfl, NOWF), 'nflfinal')
  check(fin.length === 1 && fin[0].priority === 3 && fin[0].title === '\u{1F3C1} EXA 20, TST 17 F' && fin[0].body === '2 of your players' && fin[0].key === 'nfl:2026-10-11:G1:final', 'nflfinal: score leader first, one note, a stable claim key', `${fin[0]?.title} | ${fin[0]?.body}`)
  check(cat(PR.nflPregameEventsFrom(snapF({ kickoff: '2026-10-08T17:00:00Z' }), '2026-10-11', aNfl, NOWF), 'nflfinal').length === 0, 'a final from days ago is not news (no backfill on deploy)')
  check(cat(PR.nflPregameEventsFrom(snapF({ state: 'in' }), '2026-10-11', aNfl, NOWF), 'nflfinal').length === 0 && cat(PR.nflPregameEventsFrom(snapF({ home_score: null }), '2026-10-11', aNfl, NOWF), 'nflfinal').length === 0, 'a game still on, or with no score: nothing')
  check(cat(PR.nflPregameEventsFrom(snapF({ status_name: 'STATUS_POSTPONED', away_score: 0, home_score: 0 }), '2026-10-11', aNfl, NOWF), 'nflfinal').length === 0 && cat(PR.nflPregameEventsFrom(snapF({ status_name: 'STATUS_POSTPONED' }), '2026-10-11', aNfl, NOWF), 'gameoff').length === 1, 'a postponed game (ESPN files it as post) is the game-off push, never a final')
  check(cat(PR.nflPregameEventsFrom(snapF({ away: 'AAA', home: 'BBB' }), '2026-10-11', aNfl, NOWF), 'nflfinal').length === 0, 'a game with nobody you follow: nothing')

  // ── NHL: a second goal, the final, day-to-day ──
  const goalRow = (n, over = {}) => ({ game_id: 7, player_id: '9', name: 'Test Skater', day: '2026-10-11', goal_n: n, status: 'off', confirmed_at: 't', overturned_at: null, push_sent: false, game_type: 2, period: 2, period_type: 'REG', strength: 'ev', score_after: 'TST 3 · EXA 2', ...over })
  const audN = { nhl: new Set(['9']), nameOf: new Map([['9', 'Test Skater']]), teamOfId: new Map([['nhl:9', 'TST']]) }
  const multi = (rows, a = audN) => PR.nhlEventsFrom(rows, a, rows).filter((e) => e.category === 'nhlmulti')
  const m2 = multi([goalRow(1), goalRow(2)])
  check(m2.length === 1 && m2[0].priority === 2 && m2[0].title === '\u{1F6A8} Test Skater has 2 goals' && m2[0].body === 'P2 · TST 3, EXA 2', 'nhlmulti: his second goal, one note, with the period and the score', `${m2[0]?.title} | ${m2[0]?.body}`)
  const m3 = multi([goalRow(2), goalRow(3)])
  check(m3.length === 1 && m3[0].key === m2[0].key, 'his 2nd and 3rd arriving in one sweep: still ONE nhlmulti, the same key as before')
  check(multi([goalRow(1)]).length === 0 && multi([goalRow(2, { player_id: '55' })]).length === 0 && multi([goalRow(2, { overturned_at: 't' })]).length === 0 && multi([goalRow(2, { game_type: 1 })]).length === 0, 'one goal, an unfollowed man, an overturned goal, preseason: no multi note')
  const gNhl = (over = {}) => ({ id: 7, gameType: 2, date: '2026-10-11', startUtc: '2026-10-11T23:00:00Z', state: 'final', rawState: 'OFF', scheduleState: 'OK', away: { abbrev: 'TST', score: 3 }, home: { abbrev: 'EXA', score: 2 }, outcome: 'REG', ...over })
  const NOWN = Date.parse('2026-10-12T02:10:00Z')
  const snapN = (g) => ({ ok: true, asOf: NOWN, games: [g], starters: {} })
  const nf = cat(PR.nhlPregameEventsFrom(snapN(gNhl()), '2026-10-11', audN, NOWN), 'nhlfinal')
  check(nf.length === 1 && nf[0].title === '\u{1F3C1} TST 3, EXA 2 F' && nf[0].key === 'nhl:2026-10-11:7:final' && nf[0].priority === 3, 'nhlfinal: the score, leader first, one note', `${nf[0]?.title}`)
  const nfot = cat(PR.nhlPregameEventsFrom(snapN(gNhl({ outcome: 'OT', away: { abbrev: 'TST', score: 3 }, home: { abbrev: 'EXA', score: 4 } })), '2026-10-11', audN, NOWN), 'nhlfinal')
  check(nfot[0]?.title === '\u{1F3C1} EXA 4, TST 3 F/OT', 'an overtime finish says so: F/OT', nfot[0]?.title)
  check(cat(PR.nhlPregameEventsFrom(snapN(gNhl({ startUtc: '2026-10-08T23:00:00Z' })), '2026-10-11', audN, NOWN), 'nhlfinal').length === 0 && cat(PR.nhlPregameEventsFrom(snapN(gNhl({ state: 'live', rawState: 'LIVE' })), '2026-10-11', audN, NOWN), 'nhlfinal').length === 0 && cat(PR.nhlPregameEventsFrom(snapN(gNhl({ gameType: 1 })), '2026-10-11', audN, NOWN), 'nhlfinal').length === 0, 'an old final, a game still on, a preseason final: nothing')
  const inj = (status, over = {}) => ({ ok: true, asOf: NOWN, entries: [{ sport: 'nhl', team: 'TST', player_id: '9', name: 'Test Skater', status, updatedAt: '2026-10-11T20:00:00Z', ...over }] })
  const gPre = gNhl({ state: 'pre', rawState: 'FUT', startUtc: '2026-10-12T23:00:00Z', away: { abbrev: 'TST' }, home: { abbrev: 'EXA' } })
  const ij = PR.nhlInjuryStatusEventsFrom(snapN(gPre), inj('DAY_TO_DAY'), '2026-10-12', audN, NOWN)
  check(ij.length === 1 && ij[0].category === 'nhlinj' && ij[0].priority === 1 && /is day-to-day$/.test(ij[0].title) && /:inj:DAY_TO_DAY$/.test(ij[0].key), 'nhlinj: a followed skater listed day-to-day, one note keyed by the word', `${ij[0]?.title}`)
  check(PR.nhlInjuryStatusEventsFrom(snapN(gPre), inj('OUT'), '2026-10-12', audN, NOWN).length === 0 && PR.nhlInjuryStatusEventsFrom(snapN(gPre), inj('DAY_TO_DAY', { updatedAt: '2026-10-01T00:00:00Z' }), '2026-10-12', audN, NOWN).length === 0 && PR.nhlInjuryStatusEventsFrom(snapN(gPre), { ...inj('DAY_TO_DAY'), stale: true }, '2026-10-12', audN, NOWN).length === 0, 'Out is the scratch push (not this one); an old line and a stale snapshot make nothing')

  // ── BUCKETS in the panel: only for a viewer who can see it ──
  const fs = await import('node:fs')
  const panel = fs.readFileSync(new URL('../components/AlertsPanel.js', import.meta.url), 'utf8')
  check(/useCanSee\('nba'\)/.test(panel) && /const cats = CATEGORIES\.filter\(\(c\) => nbaOpen \|\| c\.sport !== 'nba'\)/.test(panel) && /if \(!mine\.length\) return null/.test(panel), 'the panel hides the BUCKETS group and its switches unless BUCKETS is open to the viewer')
  check(!/CATEGORIES\.filter/.test(panel.replace(/const cats = CATEGORIES\.filter[^\n]*/, '')), 'every panel list goes through the filtered `cats`, never CATEGORIES directly')
  check(AL.CATEGORIES.filter((c) => c.group === 'Buckets').every((c) => c.sport === 'nba') && AL.CATEGORIES.filter((c) => c.sport === 'nba').map((c) => c.key).sort().join() === 'nba30,nbacalled,nbafinal,nbainj', 'the basketball switches are nba30, nbacalled and (2026-10-20, BUCKETS public) nbafinal and nbainj, all in the Buckets group')
  check(PR.wants({ ...fresh, dash_alerts_v1: { events: { nba30: true } } }, { category: 'nba30', sport: 'nba', playerId: '7' }) && !PR.wants({ ...fresh, dash_alerts_v1: { events: { nbacalled: false } } }, { category: 'nbacalled', sport: 'nba', everyone: true }), 'nba30 reaches a follower who switched it on; nbacalled stays off until chosen')
  const tick = fs.readFileSync(new URL('../app/api/dash/push/tick/route.js', import.meta.url), 'utf8')
  check(/if \(!bucketsPublic\(\)\) return \{ events: \[\], unswept: \[\] \}/.test(tick) && /if \(!bucketsPublic\(\) \|\| !audience\?\.nba\?\.size\) return \[\]/.test(tick), 'the sender still produces no BUCKETS event until BUCKETS is public')
}

// ── 7. WORDS: the welcome line, the panel, homer parity, the card ────────────
{
  check(CP.WELCOME.body === 'Homers, goals, touchdowns, who is out.' && [...CP.WELCOME.body].length <= CP.LIMITS.body, 'the welcome line says what Essentials really sends', CP.WELCOME.body)
  check(CP.CATEGORY_COPY.scratched[0] === 'Out or lineup change' && !/Scratch/.test(Object.values(CP.CATEGORY_COPY).map((v) => v[0]).join('|')), '"Scratch" is "Out or lineup change" for every sport')
  check(!/starting five/i.test(CP.CATEGORY_COPY.starter[1]) && /starting five/.test(CP.STARTER_DETAIL_WITH_NBA), 'the starter line leaves the basketball word out until BUCKETS is open')
  const L = { h: 2, ab: 3, tb: 5, r: 1, rbi: 1 }
  const G = { away: 'TST', home: 'EXA', awayScore: 2, homeScore: 3, half: 'Bottom', inning: 7 }
  check(CP.mlb.homer({ name: 'Test Alpha', n: 1, line: L, game: G, called: true }).body === 'CALLED · HR · 2-for-3 · ▼7 · EXA 3, TST 2', 'CALLED homer words are character-identical')
  check(CP.mlb.homer({ name: 'Test Alpha', n: 1, line: L, game: G, status: 'board', rank: 7 }).body.startsWith('ON THE BOARD #7 · HR'), 'a board hitter\'s homer says ON THE BOARD #7')
  check(CP.mlb.homer({ name: 'Test Alpha', n: 1, line: L, game: G, status: 'off' }).body.startsWith('NOT ON THE BOARD · HR'), 'a hitter off the board says NOT ON THE BOARD')
  check(CP.mlb.homer({ name: 'Test Alpha', n: 1, line: L, game: G }).body === 'HR · 2-for-3 · ▼7 · EXA 3, TST 2', 'no board known: no word (never a guess)')
  const sn = { games: [game(100)], lines: { 1: line(100, { hr: 1, h: 1, ab: 3, tb: 4 }), 2: line(100, { name: 'Test B', hr: 1, h: 1, ab: 3, tb: 4 }), 3: line(100, { name: 'Test C', hr: 1, h: 1, ab: 3, tb: 4 }) } }
  const board = PR.boardInfoFrom([{ player_id: '1', hr_score: 90, game_pick_role: 'TOP' }, { player_id: '2', hr_score: 80, game_pick_role: 'WATCH' }])
  const homers = PR.mlbEventsFrom(sn, DAY, aud([1, 2, 3]), {}, board).filter((e) => e.category === 'homer')
  const body = (id) => homers.find((e) => e.playerId === id).body
  check(body('1').startsWith('CALLED · HR') && body('2').startsWith('ON THE BOARD #2 · HR') && body('3').startsWith('NOT ON THE BOARD · HR'), 'the sender gives each homer its word from lib/callStatus (CALLED / ON THE BOARD #n / NOT ON THE BOARD)', homers.map((e) => e.body).join(' / '))
  const noBoard = PR.mlbEventsFrom(sn, DAY, aud([1]), {}, null).filter((e) => e.category === 'homer')
  check(noBoard.length === 1 && !/BOARD|CALLED/.test(noBoard[0].body), 'board not yet known: the homer carries no status word', noBoard[0]?.body)
  const c = CP.cards.earned({ name: 'Kirill Kaprizov', tierWord: 'ELITE', kicker: 'HAT TRICK', line: '3 GOALS', team: 'TST', opp: 'EXA' })
  check(/earned ELITE( card)?$/.test(c.title) && c.body === 'New card: hat trick · 3 goals · TST-EXA' && !c.title.endsWith('…'), 'card earned: the title has its verb ("Kaprizov earned ELITE"), the body the card', `${c.title} | ${c.body}`)
  check(CP.cards.earned({ name: 'Test Skater', tierWord: 'ELITE', kicker: 'HAT TRICK', line: '3 GOALS', team: 'TST', opp: 'EXA' }).title === '\u{1F0CF} Skater earned ELITE card', 'a name that fits with "card" keeps it: "Skater earned ELITE card"')
  // the picture on the notification
  const F = await import('../lib/cards/specialFixtures.js')
  const hat = PR.cardEarnedEventsFrom('nhl', F.TEST_HAT_ROWS, { nhl: new Set(['11']) })[0]
  check(/^\/api\/card\/special\?moment=nhl_hat_trick&id=[^&]+&sport=nhl&w=540$/.test(hat.image), 'a card-earned push carries the baseball-card picture (the server card)', hat.image)
  const SW = (await import('node:fs')).readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
  check(/image,/.test(SW) && /\\\/api\\\/card\\\/special/.test(SW), 'the service worker shows that image, and only a same-site card path')
  check(!/poster|canvas/i.test(SW.replace(/\/\*[\s\S]*?\*\//g, '')), 'no poster or canvas image anywhere in the worker\'s notification code')
}

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1) }
console.log('\nall green')
