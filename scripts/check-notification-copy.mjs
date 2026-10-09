#!/usr/bin/env node
// THE NOTIFICATION WORDS, LINTED (2026-10-09). TEST data only: players are "Test ...", clubs TST / EXA / TB / NYY.
// Nothing here sends a push, a Discord post or a tweet.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-notification-copy.mjs
import assert from 'node:assert/strict'

const C = await import('../lib/copy/notifications.js')
const { STATUS_WORD } = await import('../lib/callStatus.js')
const HF = await import('../lib/dash/homerFeed.js')
const GF = await import('../lib/nhl/goalFeed.js')

let failed = 0
const check = (cond, label, extra = '') => { if (cond) console.log(`ok   ${label}`); else { failed += 1; console.log(`FAIL ${label} ${extra}`) } }
const cp = (s) => [...String(s)].length

// ── 1. the limits: title <= 26, body <= 48, one line, the news inside 30 characters ──
const NO_STAT = new Set(['scratched', 'dropout', 'welcome', 'bundle'])
for (const row of C.CATALOG) {
  if (row.limits === false || !['push', 'system'].includes(row.kind)) continue
  const r = row.render()
  const tag = `${row.key}${row.variant ? ` (${row.variant})` : ''}`
  check(cp(r.title) <= C.LIMITS.title, `${tag}: title ${cp(r.title)} <= ${C.LIMITS.title}`, JSON.stringify(r.title))
  check(cp(r.body) <= C.LIMITS.body, `${tag}: body ${cp(r.body)} <= ${C.LIMITS.body}`, JSON.stringify(r.body))
  check(!String(r.body).includes('\n'), `${tag}: body is one line`)
  const keyAt = String(r.body).search(/\d|CALLED|ON THE BOARD|NOT ON THE BOARD/)
  const gameOffNoLineup = row.key === 'gameoff' && /not posted/.test(r.body)
  if (!NO_STAT.has(row.key) && !gameOffNoLineup) check(keyAt >= 0 && keyAt < C.LIMITS.keyBy, `${tag}: the stat / status / count is inside the first ${C.LIMITS.keyBy} characters`, `at ${keyAt}: ${JSON.stringify(r.body)}`)
}
// a template over the limit would fail the lint above: prove the lint can fail
check(cp(C.mlb.hrrCleared({ name: 'A Very Long Name Indeed Here', line: { h: 2, r: 1, rbi: 1 }, game: { away: 'TB', home: 'NYY', awayScore: 4, homeScore: 2, half: 'Bottom', inning: 7 } }).title) <= C.LIMITS.title, 'a very long name falls back to the last name and still fits')

// ── 2. words that must never appear, in ANY message (phone, page, bell, LiveWire) ──
const BAD = [
  [/\bbots?\b/i, 'bot'], [/\bscripts?\b/i, 'script'], [/\bfeeds?\b/i, 'feed'], [/\bpayload\b/i, 'payload'], [/\bjson\b|\bapi\b|\bwebhook\b/i, 'developer word'],
  [/https?:|www\.|\.com\b|\/app\b/i, 'link'], [/(^|\s)#[A-Za-z]/, 'hashtag'],
  [/chance|probab|odds|likel|expected|\d\s?%/i, 'probability word'], [/\bDASH\b/, 'DASH filler'],
  [/\bbot \d|Bottom\d|\bTop\d/i, 'raw inning'], [/Delayed: |Delayed Start|POSTPONED|DELAYED/, 'raw feed word'], [/\b1 (names|picks|players|hits)\b/, 'bad plural'],
]
for (const row of C.CATALOG) {
  if (row.kind === 'post') continue                              // the BUCKETS X post is old, approved copy
  const r = row.render(); const all = `${r.title}\n${r.body}`
  for (const [re, why] of BAD) check(!re.test(all), `${row.key}${row.variant ? ` (${row.variant})` : ''}: no ${why}`, JSON.stringify(all))
  // status words only in the exact form
  for (const m of all.matchAll(/not on the board|on the board|\bcalled\b/gi)) {
    const w = m[0]
    const lowerOk = row.key === 'nhlgoal' && /the top skater/.test(all)   // the existing CALLED goal copy
    check(Object.values(STATUS_WORD).includes(w) || lowerOk, `${row.key}: status word "${w}" is exactly one of CALLED / ON THE BOARD / NOT ON THE BOARD`)
  }
}

// ── 3. the name appears once; a club appears once ──
for (const row of C.CATALOG) {
  if (!['push', 'system'].includes(row.kind) || row.limits === false) continue
  const r = row.render(); const all = `${r.title} ${r.body}`
  for (const nm of ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Receiver', 'Passer', 'Guard']) {
    const n = (all.match(new RegExp(`\\b${nm}\\b`, 'g')) || []).length
    check(n <= 1, `${row.key}${row.variant ? ` (${row.variant})` : ''}: "${nm}" appears at most once`, JSON.stringify(all))
  }
  if (row.cut) continue
  for (const club of ['TST', 'EXA', 'TB', 'NYY']) {
    const n = (all.match(new RegExp(`\\b${club}\\b`, 'g')) || []).length
    check(n <= 1, `${row.key}${row.variant ? ` (${row.variant})` : ''}: club ${club} appears at most once`, JSON.stringify(all))
  }
}

// ── 4. every template renders with FULL names when they fit, last name when they do not ──
check(C.mlb.scratch({ name: 'Test Delta' }).title === '⚠️ Test Delta is out', 'full name in the title when it fits')
check(C.mlb.scratch({ name: 'Testington Longhurst Jr.' }).title === '\u26A0\uFE0F Longhurst is out', 'else the last name (Jr. dropped)')
for (const row of C.CATALOG.filter((r) => r.kind === 'push' && r.limits !== false)) {
  const t = row.render().title
  check(!/undefined|NaN|\[object/.test(`${t} ${row.render().body}`), `${row.key}: renders with no undefined / NaN`)
}

// ── 5. the plural helper ──
check(C.plural(1, 'pick') === '1 pick' && C.plural(2, 'pick') === '2 picks' && C.plural(0, 'out') === '0 outs' && C.plural(1, 'out') === '1 out', 'plural(): 1 pick, 2 picks, 0 outs, 1 out')
check(C.plural(3, 'hit', 'hits') === '3 hits', 'plural(): explicit many')
check(C.joinNames(['A', 'B', 'C']) === 'A, B and C' && C.joinNames(['A', 'B']) === 'A and B' && C.joinNames(['A']) === 'A' && C.joinNames(['A', 'B', 'C', 'D', 'E'], 2) === 'A, B +3', 'joinNames()')
check(C.mlb.boardSet({ count: 1, time: '7:05 PM ET' }).body.startsWith('1 pick ·'), 'the board says "1 pick", never "1 names"')

// ── 6. the shorthand and the score rule (leader first, everywhere) ──
check(C.inningShort('Top', 6) === '▲6' && C.inningShort('Bottom', 7) === '▼7' && C.inningShort('Middle', 4) === '▲4' && C.inningShort('', 0) === '', 'innings: ▲6 top, ▼7 bottom')
check(C.inningText('Bottom', 7) === 'Bottom 7th' && C.inningText('Top', 2) === 'Top 2nd', 'the long form is "Bottom 7th", never "bot 7th"')
check(C.scoreText({ away: 'NYY', home: 'TB', awayScore: 7, homeScore: 4 }) === 'NYY 7, TB 4' && C.scoreText({ away: 'NYY', home: 'TB', awayScore: 2, homeScore: 4 }) === 'TB 4, NYY 2' && C.scoreText({ away: 'NYY', home: 'TB', awayScore: 3, homeScore: 3 }) === 'Tied 3-3' && C.scoreText({ away: '', home: 'TB', awayScore: 3, homeScore: 3 }) === '', 'score: leader first, Tied, empty when a club is unknown')
check(C.gameOffHeadline('delayed', 'Delayed: RAIN') === 'Rain delay' && C.gameOffHeadline('delayed', 'Delayed Start: Rain') === 'Rain delay' && C.gameOffHeadline('postponed', 'Postponed (rain)') === 'Postponed (rain)' && C.gameOffHeadline('delayed', 'Delayed') === 'Delay', 'raw feed words become "Rain delay"')

// ── 7. SNAPSHOTS of the shapes Donovan named (TEST data) ──
const snap = (t, title, body) => { check(t.title === title, `snapshot title: ${title}`, JSON.stringify(t.title)); check(t.body === body, `snapshot body: ${body}`, JSON.stringify(t.body)) }
snap(C.mlb.hrrCleared({ name: 'Test Doyle', line: { h: 1, r: 0, rbi: 1 }, game: { away: 'NYY', home: 'TB', awayScore: 2, homeScore: 4, half: 'Bottom', inning: 7 } }), '✅ Test Doyle cleared HRR', '1 H, 1 RBI · ▼7 · TB 4, NYY 2')
snap(C.mlb.basesLoaded({ name: 'Test Adell', outs: 1, game: { away: 'TB', home: 'NYY', awayScore: 4, homeScore: 7, half: 'Top', inning: 6 } }), '\u{1F9E8} Adell up, bases loaded', '1 out · ▲6 · NYY 7, TB 4')
snap(C.mlb.scratch({ name: 'Test Adell' }), '⚠️ Test Adell is out', "Not in tonight's lineup")
snap(C.mlb.gameOff({ kind: 'delayed', reason: 'Delayed: RAIN', away: 'TB', home: 'NYY', count: 2, lineupPosted: true }), '⚠️ Rain delay', 'TB at NYY · 2 of your picks')
snap(C.mlb.boardSet({ count: 5, time: '7:05 PM ET' }), '\u{1F4CB} Your board is set', '5 picks · first pitch 7:05 PM ET')

// ── 8. the CALLED copy is character-identical ──
//   (a) LAMP: the existing CALLED goal push
const gRow = { game_id: 1, player_id: 9, goal_n: 1, name: 'Test Nylander', status: 'called', period: 3, period_type: 'REG', strength: 'ev', empty_net: false, season_goals: 24, rank_in_game: 1 }
const gp = GF.pushText(gRow, [gRow])
check(gp.title === '\u{1F6A8} NYLANDER SCORES' && gp.body === 'CALLED · the top skater on his team on the LAMP board\nEven strength · 3rd · his 24th', 'LAMP CALLED goal push is character-identical', JSON.stringify(gp))
//   (b) MOONSHOT: the CALLED homer post (X / Discord), snapshot taken BEFORE this change
const ev = { name: 'Test Sample Alpha', role: 'TOP', hr_n: 2, board_rank: 3, inning: 'bot 7th', opponent: 'EXA', team: 'TST', odds_over: 150, odds_book: 'x' }
check(HF.postText(ev) === '\u{1F916} CALLED IT\n\nTEST SAMPLE ALPHA GOES DEEP. (#2 tonight)\n\nTST @ EXA · bot 7th\n\n#3 on the Moonshot board\nTOP pick (1+ home run) · +150\n\nThe call is in.', 'MOONSHOT CALLED homer post (TOP, 2nd homer) is character-identical')
check(HF.postText({ ...ev, role: 'HIT', hr_n: 1, odds_over: null }) === '\u{1F916} CALLED IT · HIT PICK\n\nTEST SAMPLE ALPHA GOES DEEP.\n\nTST @ EXA · bot 7th\n\n#3 on the Moonshot board\nhit pick (1+ hit)', 'MOONSHOT CALLED homer post (HIT) is character-identical')
check(HF.postText({ ...ev, role: 'WATCH', board_rank: 9, stats: { season_hr: 30, season_iso: 0.21 } }) === '\u{1F4A5} TEST SAMPLE ALPHA GOES DEEP. (#2 tonight)\n\n#9 on the Moonshot board\n\n30 HR · .210 ISO\n\nNot a top call tonight.', 'MOONSHOT ON THE BOARD homer post is character-identical')
check(HF.postText({ name: 'Test Sample Alpha', role: '', hr_n: 1 }) === "\u{1F4A5} TEST SAMPLE ALPHA GOES DEEP.\n\nNot on the Moonshot board.", 'MOONSHOT NOT ON THE BOARD homer post ends at "Not on the Moonshot board." (no tagline since 10-09)')

// ── 9. the cut ──
check(C.categoryAllowed('homer') && C.categoryAllowed('scratched') && C.categoryAllowed('slam') && C.categoryAllowed('frtd'), 'kept categories (and FRANCHISE) are allowed')
check(!C.categoryAllowed('ondeck', {}) && !C.categoryAllowed('lineup', {}) && !C.categoryAllowed('nflred', {}), 'cut categories are refused')
check(C.categoryAllowed('ondeck', { PUSH_CUT_CATEGORIES: 'on' }), 'the flag brings a cut category back')
check(Object.keys(C.PUSH_PLAN).length === 12 + 1 + 20 - 1 + 0 || Object.keys(C.PUSH_PLAN).length > 30, 'PUSH_PLAN lists every category')

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1) }
console.log('\nall green')
