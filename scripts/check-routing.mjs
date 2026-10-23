#!/usr/bin/env node
// THE ROUTING TABLE (lib/dash/routing.js). Plain node: node --import ./scripts/_esm-resolve.mjs scripts/check-routing.mjs
// 1. nothing that grades or shows a result is ever cut   2. every room name is one the channel module knows   3. lookups behave
const { ROUTES, PREFIX_ROUTES, routeOf, isCut, roomsOf, GRADING_KIND } = await import('../lib/dash/routing.js')
let fail = 0
const check = (name, ok, extra = '') => { if (!ok) fail += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  -- ${extra}` : ''}`) }
const ROOMS = new Set(['feed', 'sport', 'receipts', 'members', 'donovan', 'network', 'x', 'off'])
const all = [...Object.entries(ROUTES), ...PREFIX_ROUTES.map(([p, r]) => [p, r])]
for (const [k, r] of all) {
  check(`rooms known: ${k}`, r.rooms.every((x) => ROOMS.has(x)), r.rooms.join(','))
  check(`grading kind not cut: ${k}`, !(GRADING_KIND.test(k) && r.rooms.includes('off')))
}
for (const k of ['card_ls_result_nhl', 'nfl_members_grade', 'mlb_members_grade', 'card_result_mlb', 'card_double_result', 'card_don_mlb_n_man_1_result', 'receipt', 'weekly', 'monthly']) check(`stays on: ${k}`, !isCut(k))
check('writeup_nfl_<game> is cut (delivery only)', isCut('writeup_nfl_401872991'))
check('unlisted kind = null (old behaviour)', routeOf('not_a_kind_test') === null && roomsOf('not_a_kind_test') === null)
check('the live homer alert has a row: the product channel', roomsOf('homer')?.join() === 'sport')
check('card_today -> sport only', roomsOf('card_today')?.join() === 'sport')
// the hook narrowing (lib/dash/routeHooks.js), fake webhooks only
const { routeHooks } = await import('../lib/dash/routeHooks.js')
const U = (n) => `https://discord.com/api/webhooks/${n}/TEST-TOKEN`
Object.assign(process.env, { DISCORD_HOMER_WEBHOOK: U(1), DISCORD_MLB_WEBHOOKS: U(2), DISCORD_NFL_WEBHOOKS: U(3), DISCORD_NHL_WEBHOOKS: U(4), DISCORD_RECEIPTS_WEBHOOK: U(5), DISCORD_MEMBERS_WEBHOOK: U(6) })
const hooksAll = [U(1), U(2), U(3), U(4), U(5), U(6)]
check('cut kind sends nothing and is flagged cut', (() => { const r = routeHooks('writeup_nfl_401', 'nfl', hooksAll); return r.cut && r.hooks.length === 0 })())
check('unlisted kind keeps every hook', (() => { const r = routeHooks('not_a_kind_test', 'mlb', hooksAll); return !r.routed && r.hooks.length === 6 })())
check('card_today (sport room) narrows to the sport channel only', (() => { const r = routeHooks('card_today', 'mlb', [U(1), U(2)]); return r.routed && r.hooks.join() === U(2) })())
check('nhl_slate (sport room) never reaches the public feed', (() => { const r = routeHooks('nhl_slate', 'nhl', [U(1), U(4)]); return r.hooks.join() === U(4) })())
check('recap goes to the receipts room only', (() => { const r = routeHooks('recap_nhl', 'nhl', hooksAll); return r.hooks.join() === U(5) })())
check('members roundup goes to #members only', (() => { const r = routeHooks('members_roundup_nhl', 'nhl', [U(6)]); return r.hooks.join() === U(6) })())
check('a members kind sent with public hooks reaches nothing (never a free room)', routeHooks('members_roundup_nhl', 'nhl', [U(2), U(4)]).hooks.length === 0)
check('a moment: the free send lands in its product channel only, the #members send in #members only', routeHooks('moment_nhl_8478_20260201_ht3', 'nhl', [U(1), U(4)]).hooks.join() === U(4) && routeHooks('moment_nhl_8478_20260201_ht3', 'nhl', [U(6)]).hooks.join() === U(6))
check('X-only kinds are cut on Discord', isCut('card_ls_tuesday') && isCut('miss_reply') && !isCut('card_ls_result_nhl'))
check('the TUDDY kickoff alert is phone only; TUDDY WATCH goes to the product channel', isCut('alert_nflkick') && roomsOf('alert_nflboardred')?.join() === 'sport')
// THE NETWORK ROOM and the table deciding (2026-10-23)
check('receipt: the network room (#moonshot-mlb until DISCORD_OVERVIEW_WEBHOOK is set) + #called-it', (() => { const r = routeHooks('receipt', 'mlb', [U(1), U(2), U(5)]); return r.hooks.sort().join() === [U(2), U(5)].sort().join() })())
process.env.DISCORD_OVERVIEW_WEBHOOK = U(7)
check('receipt: with the network channel set, the network channel + #called-it, never #moonshot-mlb', (() => { const r = routeHooks('receipt', 'mlb', [U(1), U(2), U(5)]); return r.hooks.sort().join() === [U(5), U(7)].sort().join() })())
check('slate / the five / film room / by the numbers: the network channel only', ['slate', 'the_five', 'film_room', 'by_numbers', 'card_double_result'].every((k) => routeHooks(k, 'mlb', [U(2)]).hooks.join() === U(7)))
check('a no-cash receipt: #called-it only', routeHooks('receipt_nocash', 'mlb', [U(5)]).hooks.join() === U(5))
delete process.env.DISCORD_OVERVIEW_WEBHOOK
check('the hardest shot: #lamp, never #moonshot-mlb', routeHooks('nhlhardest', 'nhl', [U(1), U(2)]).hooks.join() === U(4))
check('no fallback: an unset product room sends nowhere', (() => { const k = process.env.DISCORD_NHL_WEBHOOKS; delete process.env.DISCORD_NHL_WEBHOOKS; const r = routeHooks('nhl_slate', 'nhl', [U(2)]); process.env.DISCORD_NHL_WEBHOOKS = k; return r.hooks.length === 0 })())
check('#members is never reached unless the poster asked for it', routeHooks('members_roundup_nhl', 'nhl', [U(2)]).hooks.length === 0)
console.log(fail ? `\n${fail} FAILED` : '\nall ok')
process.exit(fail ? 1 : 0)
