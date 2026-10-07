#!/usr/bin/env node
// ONE MLB RECORD NUMBER (2026-10-06, ledger audit P0-2).
//   node --import ./scripts/_esm-resolve.mjs scripts/check-locked-record.mjs            TEST data (deterministic)
//   node --import ./scripts/_esm-resolve.mjs scripts/check-locked-record.mjs --real     the live calibration reader, read-only, before/after per surface
import { gradeNight, summarize } from '../lib/calibration/mlbCalibration.js'
import { lockedRecordFrom, lockedPickLine, lockedCallsLine, pickRate } from '../lib/record/lockedRecord.js'
import { lockedBeforeFirstPitch } from '../lib/record/mlbLocked.js'

let fail = 0
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); fail += !ok; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`) }

// ── TEST DATA: made-up players; first pitch 20:00Z; the 07 night is stamped AFTER first pitch ─────────────
const FP = Date.parse('2026-09-20T20:00:00Z')
const games = new Map([['1', { start: FP, type: 'R', state: 'Final', date: '2026-09-20' }]])
const por = (pid, role, hr, stamp) => ({ player_id: pid, player: `TEST ${pid}`, game_pk: 1, team: 'AAA', opp: 'BBB', game_pick_role: role, generated_at: stamp, scores: { hr, hrw: hr }, hr_overlay: {} })
const out = (pid, o) => [`1|${pid}`, { is_final: true, void: false, plate_appearances: 4, hits: 1, runs: 0, rbi: 0, total_bases: 1, home_runs: 0, ...o }]
const outcomes = new Map([out(1, { home_runs: 1, total_bases: 4 }), out(2, {}), out(3, { home_runs: 1 }), out(4, {})])
const night = gradeNight({
  date: '2026-09-20', games, outcomes,
  por: [
    por(1, 'TOP', 75, '2026-09-20T19:00:00Z'),   // locked an hour before first pitch, homered
    por(2, 'TOP', 55, '2026-09-20T19:59:59Z'),   // locked, no homer
    por(3, 'TOP', 20, '2026-09-20T20:00:01Z'),   // stamped one second AFTER first pitch: not a call, even though he homered
    por(4, '', 10, '2026-09-20T19:00:00Z'),      // on the board, no call
  ],
})
const sum = summarize(night.entries, { minN: 2 })
const top = sum.regular.tiers.find((t) => t.key === 'TOP')
eq('lock: a row stamped after first pitch is set aside', [top.n, top.hits, top.late], [2, 1, 1])
eq('lock: the board counts the locked rows only (3), one of them homered... two', [sum.regular.board, sum.regular.late], [3, 1])
eq('lockedBeforeFirstPitch: the same rule the bot-on-him join uses', [lockedBeforeFirstPitch({ generated_at: '2026-09-20T19:59:59Z' }, FP), lockedBeforeFirstPitch({ generated_at: '2026-09-20T20:00:00Z' }, FP), lockedBeforeFirstPitch({}, FP)], [true, false, false])
const hrBand = (b) => sum.regular.bands.hr.find((x) => x.band === b)
eq('bands: 70+ = 1 hitter-game, homered; 50-70 = 1, no homer; <30 = 1, no homer (the late row is out)', [hrBand('70+').n, hrBand('70+').hits, hrBand('50–70').n, hrBand('50–70').hits, hrBand('<30').n], [1, 1, 1, 0, 1])
const cal = { ...sum, since: '2026-09-09', through: '2026-09-21' }
const rec = lockedRecordFrom(cal)
eq('record: window and nights come from the data', [rec.nights, rec.from, rec.to, rec.window], [1, '2026-09-20', '2026-09-20', 'Sep 20–Sep 20'])
eq('record: TOP 1 of 2, board base from the same rows', [rec.picks.TOP.ok, rec.picks.TOP.n, rec.picks.TOP.pct, rec.picks.TOP.base], [1, 2, 50, 33.3])
eq('record: the sentence every surface prints', lockedCallsLine(rec, 2), '2 calls over 1 nights, locked before first pitch')
eq('record: under the minimum, no rate (the real minimum is 30)', pickRate({ ok: 1, n: 2, pct: null, enough: false }), '1/2, not enough calls yet')
eq('record: no locked record yet -> null, never a typed number', lockedRecordFrom({ regular: { nights: 0 } }), null)
console.log(fail ? `\n${fail} FAILED` : '\nTEST DATA: all green')

if (process.argv.includes('--real')) {
  const SITE = process.env.DASH_SITE || 'https://dashnetwork.vercel.app'
  const j = await (await fetch(`${SITE}/api/calibration?sport=mlb`)).json()
  const r = lockedRecordFrom(j)
  console.log(`\nREAL DATA (read-only) -- ${SITE}/api/calibration?sport=mlb, the reader every surface now uses`)
  console.log(`window ${r.window}, ${r.nights} nights, ${r.board.n.toLocaleString('en-US')} locked hitter-games, board HR base ${r.board.hrRate}%; set aside: ${r.setAside.late} stamped at/after first pitch (nights ${r.setAside.lateNights.join(', ') || 'none'}), ${r.setAside.void} void, ${r.setAside.pending} not final`)
  for (const k of ['TOP', 'HR', 'HIT', 'HRR', 'CONTACT']) console.log(`  ${k.padEnd(8)} ${pickRate(r.picks[k]).padEnd(26)} vs every hitter ${r.picks[k].base ?? '—'}%   (n ${r.picks[k].n})`)
  console.log(`\none-line pick record (Results tab): ${lockedPickLine(r)}`)
  const OLD = { TOP: '42/227 = 18.5%', HR: '31/229 = 13.5%', HIT: '142/220 = 64.5% vs 64.0%', CONTACT: '69/213 = 32.4% vs 39.0%' }
  console.log('\nBEFORE (hard-coded lib/cleanRecord.js, Sep 9-30, includes nights stamped after first pitch):', JSON.stringify(OLD))
}
process.exit(fail ? 1 : 0)
