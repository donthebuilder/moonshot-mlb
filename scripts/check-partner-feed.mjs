#!/usr/bin/env node
// THE PARTNER FEED (lib/posts/partnerPack.js): which leads go, when the post goes, the parlay price, the top 5, the words. TEST data, no network.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-partner-feed.mjs
import assert from 'node:assert/strict'
let failed = 0
const t = (name, fn) => { try { fn(); console.log(`PASS  ${name}`) } catch (e) { failed += 1; console.log(`FAIL  ${name}\n     ${e.message}`) } }
process.env.NEXT_PUBLIC_SITE_URL = 'https://site.test'
const P = await import('../lib/posts/partnerPack.js')
const H = 3600e3
const NOW = Date.parse('2026-10-22T23:30:00Z')
const leg = (name, start, extra = {}) => ({ name: `TEST ${name}`, team: 'TST', opp: 'OPP', player_id: name, start_at: new Date(start).toISOString(), board_pct: 99, price: { median: 150, best: 155 }, ...extra })
const row = (sport, slot, l, locks = NOW - H) => ({ sport, lane: 'bot', product: 'straight', slot, legs: [l], locks_at: new Date(locks).toISOString() })
const ROWS = [
  row('nhl', 1, leg('A', NOW + 1.5 * H)), row('nhl', 2, leg('B', NOW - 0.5 * H, { board_pct: 50 })),
  row('nfl', 1, leg('C', NOW + 0.75 * H, { price: { median: -110, best: -105 } })),
  row('nba', 1, leg('D', NOW + 2 * H), NOW + H),       // locks later: not in yet
  { ...row('mlb', 1, leg('E', NOW - H)) },               // started: never named
]
t('leads: one per product, locked and still pregame, in product order', () => {
  assert.deepEqual(P.leadPicks(ROWS, NOW).map((p) => `${p.sport}:${p.leg.name}`), ['nhl:TEST A', 'nfl:TEST C'])
})
t('the parlay is the stored prices multiplied; none when a leg has no price', () => {
  const picks = P.leadPicks(ROWS, NOW)
  assert.ok(P.parlayPrice(picks).median > 150)
  assert.equal(P.parlayPrice([picks[0], { sport: 'nfl', leg: { ...picks[1].leg, price: null } }]), null)
})
t('goTime: waits for a later Card lock, unless a lead starts within 15 minutes; goes once every Card has locked', () => {
  const leads = P.leadPicks(ROWS, NOW)
  assert.equal(P.goTime({ leads, lockTimes: [NOW - H, NOW + H], now: NOW }).go, false)
  assert.equal(P.goTime({ leads, lockTimes: [NOW - H, NOW + H], now: NOW + 0.6 * H }).go, true, 'TEST C starts in 9 minutes')
  assert.equal(P.goTime({ leads, lockTimes: [NOW - H], now: NOW }).go, true)
  assert.equal(P.goTime({ leads: [], lockTimes: [], now: NOW }).go, false)
})
t('words: straights + one parlay + the site link; no units, no status tags', () => {
  const picks = P.leadPicks(ROWS, NOW)
  const s = P.picksText({ day: '2026-10-22', picks })
  assert.match(s, /TEST A \(TST\) to score · \+150/); assert.match(s, /TEST C \(TST\) to score a TD · -110/)
  assert.match(s, /Both as one parlay: about \+\d+\. Every leg must hit\./); assert.match(s, /https:\/\/site\.test\//)
  assert.ok(!/CALLED|ON THE BOARD|\bunits?\b|straight\b/.test(s.replace(/straights/, '')), s)
  assert.ok(P.picksEmbed({ day: '2026-10-22', picks }).fields.some((f) => /dashnetwork|site\.test/.test(f.value)))
})
t('top 5: confirmed names only, by rank, games not started, at most 5 a product', () => {
  const c = (i, extra = {}) => ({ id: `p${i}`, name: `TEST P${i}`, team: 'TST', rank: i, startMs: NOW + H, ...extra })
  const sports = [{ sport: 'nhl', hasGames: true, cands: [c(3), c(1), c(2, { problem: { reason: 'goalie' } }), c(4), c(5), c(6), c(7)] }, { sport: 'nfl', hasGames: false, cands: [c(1)] }]
  const lists = P.topFive(sports, NOW)
  assert.deepEqual(lists.map((l) => l.names.map((x) => x.rank)), [[1, 3, 4, 5, 6]])
  assert.match(P.top5Text({ day: '2026-10-22', lists }), /LAMP · goals\n1\. TEST P1 \(TST\)/)
})
console.log(failed ? `\n${failed} FAILED` : '\nOK: partner feed')
process.exit(failed ? 1 : 0)
