#!/usr/bin/env node
// THE ROUTING TABLE (lib/dash/routing.js). Plain node: node --import ./scripts/_esm-resolve.mjs scripts/check-routing.mjs
// 1. nothing that grades or shows a result is ever cut   2. every room name is one the channel module knows   3. lookups behave
const { ROUTES, PREFIX_ROUTES, routeOf, isCut, roomsOf, GRADING_KIND } = await import('../lib/dash/routing.js')
let fail = 0
const check = (name, ok, extra = '') => { if (!ok) fail += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  -- ${extra}` : ''}`) }
const ROOMS = new Set(['feed', 'sport', 'receipts', 'members', 'donovan', 'off'])
const all = [...Object.entries(ROUTES), ...PREFIX_ROUTES.map(([p, r]) => [p, r])]
for (const [k, r] of all) {
  check(`rooms known: ${k}`, r.rooms.every((x) => ROOMS.has(x)), r.rooms.join(','))
  check(`grading kind not cut: ${k}`, !(GRADING_KIND.test(k) && r.rooms.includes('off')))
}
for (const k of ['card_ls_result_nhl', 'nfl_members_grade', 'mlb_members_grade', 'card_result_mlb', 'card_double_result', 'card_don_mlb_n_man_1_result', 'receipt', 'weekly', 'monthly']) check(`stays on: ${k}`, !isCut(k))
check('writeup_nfl_<game> is cut (delivery only)', isCut('writeup_nfl_401872991'))
check('unlisted kind = null (old behaviour)', routeOf('homer') === null && roomsOf('homer') === null)
check('card_today -> sport only', roomsOf('card_today')?.join() === 'sport')
console.log(fail ? `\n${fail} FAILED` : '\nall ok')
process.exit(fail ? 1 : 0)
