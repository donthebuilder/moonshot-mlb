// LONGSHOT TUESDAY, CHECKED (2026-10-20). lib/card/longshotTuesday.js (the words and the timing) and lib/card/post.js (the posters).
// TEST data only (every name says Test).
//   node --import ./scripts/_esm-resolve.mjs scripts/check-longshot-tuesday.mjs
import * as T from '../lib/card/longshotTuesday.js'
import * as P from '../lib/card/post.js'
import { cleanPublic } from '../lib/card/text.js'

let bad = 0, n = 0
const ok = (c, m) => { n += 1; if (!c) { bad += 1; console.log('FAIL ' + m) } }
const glyph = (t) => [...String(t)].length
const TUE = '2026-10-27'
const NOW = Date.parse('2026-10-27T20:00:00Z')            // 4 PM ET
const H = 3600e3
const leg = (id, name, team, opp, median, startMs, market) => ({ player_id: id, name, team, opp, price: { median, best: median + 50 }, start_at: new Date(startMs).toISOString(), ...(market ? { market } : {}) })
const L = {
  nhl: leg('T1', 'Test Skater', 'TSA', 'TSB', 650, NOW + 3 * H),
  nba: leg('T2', 'Test Guard', 'TSC', 'TSD', 700, NOW + 4 * H),
  mlb: leg('T3', 'Test Slugger', 'TSE', 'TSF', 900, NOW + 5 * H),
}

// 1. the day is the card's own date
ok(T.isTuesday('2026-10-20') && T.isTuesday(TUE), 'Oct 20 and Oct 27, 2026 are Tuesdays')
ok(!T.isTuesday('2026-10-21') && !T.isTuesday('') && !T.isTuesday('nope'), 'a Wednesday, an empty or bad date is not')

// 2. the post: every leg, the registry order, the prices, the ask last; clean
const items = [{ sport: 'nba', leg: L.nba }, { sport: 'nhl', leg: L.nhl }, { sport: 'mlb', leg: L.mlb }]
const long = T.tuesdayText({ day: TUE, items, hardLimit: 890 })
const lines = long.text.split('\n')
ok(lines[0] === '\u{1F3AF} LONGSHOT TUESDAY · Oct 27', `the head: ${lines[0]}`)
ok(long.text.includes('🏒 NHL · Test Skater · TSA vs TSB') && long.text.includes('+650'), 'the NHL leg with its price')
ok(long.text.indexOf('Test Skater') < long.text.indexOf('Test Slugger') && long.text.indexOf('Test Slugger') < long.text.indexOf('Test Guard'), 'registry order: NHL, MLB, NBA (lib/card/core.js CARD_SPORTS)')
ok(lines[lines.length - 1].endsWith('?') && /most of these miss/i.test(long.text), 'honest and ends on the ask')
ok(cleanPublic(long.text) && !/https?:|#[A-Za-z]|\block/i.test(long.text), 'no link, hashtag or "lock"')
ok(long.named.join() === 'T1,T3,T2', `named: ${long.named}`)
const short = T.tuesdayText({ day: TUE, items, hardLimit: 280 })
ok(short.text && glyph(short.text) + 4 <= 280 && short.named.length === 3, `on the free limit every name still fits (${glyph(short.text)})`)
const four = T.tuesdayText({ day: TUE, items: [...items, { sport: 'nfl', leg: leg('T4', 'Test Receiver', 'TSG', 'TSH', 1200, NOW + 6 * H) }], hardLimit: 280 })
ok(four.text && four.named.length === 4, `four sports at 280: ${four.text ? glyph(four.text) : 'none'}`)
ok(T.tuesdayText({ day: TUE, items: [{ sport: 'nhl', leg: { ...L.nhl, price: null } }] }).text === '', 'a leg with no stored price is never named')
ok(/Does this one land\?$/.test(T.tuesdayText({ day: TUE, items: [items[1]] }).text), 'one leg reads as one')
const any = T.tuesdayText({ day: TUE, items: [{ sport: 'nba', leg: { ...L.nba, market: '3pm', line: 2.5 } }] })
ok(any.text && !/25 points/.test(any.text), `BUCKETS any-market leg says its own market: ${any.text.split('\n').find((l) => l.includes('Test Guard'))}`)

// 3. the result reply: only when all are graded; wins and misses alike
const res = [{ sport: 'nhl', name: 'Test Skater', result: 'hit' }, { sport: 'mlb', name: 'Test Slugger', result: 'miss' }, { sport: 'nba', name: 'Test Guard', result: 'miss' }]
ok(T.tuesdayResultText({ day: TUE, items: [...res.slice(0, 2), { ...res[2], result: null }] }).text === '', 'not until every leg is graded')
const rt = T.tuesdayResultText({ day: TUE, items: res }).text
ok(rt.includes('✓ Test Skater (NHL) · landed') && rt.includes('✗ Test Slugger (MLB) · missed') && rt.includes('One of them got there.'), `the result: ${rt}`)
ok(T.tuesdayResultText({ day: TUE, items: res.map((r) => ({ ...r, result: 'miss' })) }).text.includes('None of them got there this week.'), 'a week with none says so')
ok(cleanPublic(rt) && !/%|units/.test(rt), 'no rate, no units in the reply')

// 4. the timing
const row = (sport, l, extra = {}) => ({ sport, lane: 'bot', product: 'long_shot', card_date: TUE, locks_at: new Date(NOW - H).toISOString(), start_at: l.start_at, legs: [l], ...extra })
const straight = (sport) => ({ sport, lane: 'bot', product: 'straight', card_date: TUE, locks_at: new Date(NOW - H).toISOString(), legs: [{}] })
const win = (sport, games, firstMs) => ({ card_date: TUE, games, first_start_ms: firstMs, last_start_ms: firstMs + 3 * H })
ok(!T.tuesdayTiming({ day: '2026-10-28', rows: [row('nhl', L.nhl)], now: NOW }).go, 'not on a Wednesday')
const rows2 = [row('nhl', L.nhl), straight('nhl')]
const wait = T.tuesdayTiming({ day: TUE, rows: rows2, windows: { nba: [win('nba', 9, NOW + 4 * H)] }, now: NOW })
ok(!wait.go && /waiting for nba/.test(wait.reason), `an NBA full slate not locked yet: wait (${wait.reason})`)
ok(T.tuesdayTiming({ day: TUE, rows: rows2, windows: { nba: [win('nba', 3, NOW + 4 * H)] }, now: NOW }).go, 'a 3-game NBA night has no long shot: no wait')
// batch 3 (2026-10-26): a sport whose lock moment has PASSED with no bot row (BUCKETS: no stored over price clears the +120 floor, no anytime market) can no longer produce a long shot; the post must not wait for it until 20 minutes before the first leg
ok(T.tuesdayTiming({ day: TUE, rows: rows2, windows: { nba: [win('nba', 9, NOW + 30 * 60e3)] }, now: NOW }).go, 'a full NBA slate whose lock has passed with no card row is not waited for')

const late = T.tuesdayTiming({ day: TUE, rows: rows2, windows: { nba: [win('nba', 9, NOW + 4 * H)] }, now: NOW + 3 * H - 19 * 60e3 })
ok(late.go && late.legs.length === 1, `20 minutes before the first leg it goes without the late board (${late.reason})`)
const all = T.tuesdayTiming({ day: TUE, rows: [...rows2, row('nba', L.nba), straight('nba')], windows: { nba: [win('nba', 9, NOW + 4 * H)] }, now: NOW })
ok(all.go && all.legs.length === 2, 'every full slate locked: go with both')
ok(T.tuesdayTiming({ day: TUE, rows: [row('nhl', L.nhl, { locks_at: new Date(NOW + 60e3).toISOString() })], now: NOW }).legs.length === 0, 'a row not locked yet is not named')
ok(T.tuesdayTiming({ day: TUE, rows: [row('nhl', { ...L.nhl, start_at: new Date(NOW - 60e3).toISOString() })], now: NOW }).legs.length === 0, 'a leg whose game started is left out')
ok(T.tuesdayTiming({ day: TUE, rows: [row('nhl', L.nhl, { lane: 'donovan' })], now: NOW }).legs.length === 0, "only the bot's long shot")

// 5. the daily long shot no longer posts to X (the source says toX: false on both posters)
const src = (await import('node:fs')).readFileSync(new URL('../lib/card/post.js', import.meta.url), 'utf8')
const block = (name) => src.slice(src.indexOf(`export async function ${name}(`), src.indexOf('\n}\n', src.indexOf(`export async function ${name}(`)))
ok(/toX: false/.test(block('postLongShot')) && /toX: false/.test(block('postLongShotResult')), 'postLongShot and postLongShotResult are toX: false')
ok(/skipDiscord: true/.test(block('postLongshotTuesday')), 'the Tuesday post is X only')
const sql = (await import('node:fs')).readFileSync(new URL('../supabase/migrations/202610202000_longshot_tuesday_kinds.sql', import.meta.url), 'utf8')
ok(sql.includes(`''${T.TUESDAY_KIND}''`) && sql.includes(`''${T.TUESDAY_RESULT_KIND}''`) && /\) not valid'/.test(sql) && /regexp_replace\(d, '\^CHECK/.test(sql), 'the kinds migration allows both kinds, NOT VALID, from the live definition')

// 6. the result poster: waits for the next day, needs the Tuesday post, every leg graded
const post = { x_post_id: '123', payload: { picks: [{ sport: 'nhl', player_id: 'T1', name: 'Test Skater' }] } }
const graded = [row('nhl', L.nhl, { result: 'hit' })]
ok(await P.postLongshotTuesdayResult(null, { day: TUE, post, rows: graded, now: NOW }) === 'waiting-for-tomorrow', 'not on the Tuesday itself')
ok(await P.postLongshotTuesdayResult(null, { day: TUE, post: { payload: post.payload }, rows: graded, now: NOW + 24 * H }) === 'no-tuesday-post', 'no Tuesday post on X: no reply')
process.env.LONGSHOT_TUESDAY_OFF = 'on'
ok(await P.postLongshotTuesday(null, { day: TUE, legs: items }) === 'paused' && await P.postLongshotTuesdayResult(null, { day: TUE, post, rows: graded, now: NOW + 24 * H }) === 'paused', 'LONGSHOT_TUESDAY_OFF=on stops both')
delete process.env.LONGSHOT_TUESDAY_OFF

console.log(bad ? `${bad}/${n} FAILED` : `check-longshot-tuesday: ${n} checks passed (TEST data)`)
process.exit(bad ? 1 : 0)
