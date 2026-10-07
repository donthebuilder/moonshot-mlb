#!/usr/bin/env node
// ONE MLB STATUS (2026-10-06, ledger audit P0-1). The in-app ledger / record / header read the graded file;
// /called reads homer_feed. Both must print the same word for the same hitter on the same night.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-ledger-status.mjs            TEST data (deterministic)
//   node --import ./scripts/_esm-resolve.mjs scripts/check-ledger-status.mjs --real     real night, read-only (public pages + the bot's data branch)
import { digestGradedNight } from '../lib/ledgerArchive.js'
import { nightToRows, nightTotals } from '../lib/calledLedger.js'
import { statusNights } from '../lib/record/mlbStatus.js'
import { toMlbEvent } from '../lib/record/mlb.js'
import { callStatus } from '../lib/callStatus.js'
import { totalsOf } from '../lib/tuddyLedger.js'

let fail = 0
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); fail += !ok; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`) }

// ── TEST DATA: made-up hitters, a made-up night ─────────────────────────────
// homer_feed rows as /called reads them (board of 90 -> the top third is #30)
const feedRows = [
  { day: 'T-1', player_id: 'p1', hr_n: 1, name: 'TEST Called', role: 'HR', on_board: true, board_rank: 80, board_of: '90', game_pk: 1 },
  { day: 'T-1', player_id: 'p2', hr_n: 1, name: 'TEST Top Third', role: null, on_board: true, board_rank: 30, board_of: '90', game_pk: 1 },
  { day: 'T-1', player_id: 'p3', hr_n: 1, name: 'TEST Below Cut', role: null, on_board: true, board_rank: 31, board_of: '90', game_pk: 1 },
  { day: 'T-1', player_id: 'p5', hr_n: 1, name: 'TEST Watch', role: 'WATCH', on_board: true, board_rank: 70, board_of: '90', game_pk: 1 },
]
const feed = statusNights(feedRows.map(toMlbEvent))
eq('feed: board size is stored once per night', feed['T-1'].of, 90)
eq('feed: status = callStatus of the row', feed['T-1'].st, { p1: 'called', p2: 'board', p3: 'off', p5: 'board' })

// the graded file for the same night: p4 has no feed row (tick missed it) but a graded slot
const graded = {
  date: 'T-1',
  graded_slots: [
    { player_id: 'p1', name: 'TEST Called', game_pick_role: 'HR', board_rank: 80, actual_hr: 1 },
    { player_id: 'p2', name: 'TEST Top Third', game_pick_role: '', board_rank: 30, actual_hr: 1 },
    { player_id: 'p3', name: 'TEST Below Cut', game_pick_role: '', board_rank: 31, actual_hr: 1 },
    { player_id: 'p4', name: 'TEST No Feed Row', game_pick_role: '', board_rank: 12, actual_hr: 2 },
    { player_id: 'p6', name: 'TEST No Feed Low', game_pick_role: '', board_rank: 60, actual_hr: 1 },
  ],
  hr_capture_report: { all_homer_entries: [
    { player_id: 'p1', name: 'TEST Called', team: 'AAA', hr: 1 }, { player_id: 'p2', name: 'TEST Top Third', team: 'AAA', hr: 1 },
    { player_id: 'p3', name: 'TEST Below Cut', team: 'BBB', hr: 1 }, { player_id: 'p4', name: 'TEST No Feed Row', team: 'BBB', hr: 2 },
    { player_id: 'p6', name: 'TEST No Feed Low', team: 'BBB', hr: 1 }, { player_id: 'p7', name: 'TEST Off Sheet', team: 'CCC', hr: 1 },
  ], caught_homer_entries: [] },
}
const night = digestGradedNight(graded, feed['T-1'])
const by = Object.fromEntries(night.all.map((r) => [r.pid, r.status]))
eq('in-app = /called for every hitter the feed has', [by.p1, by.p2, by.p3], [feed['T-1'].st.p1, feed['T-1'].st.p2, feed['T-1'].st.p3])
eq('no feed row, rank 12 of 90 -> ON THE BOARD (the same callStatus rule)', by.p4, callStatus({ role: '', board_rank: 12, board_of: 90 }))
eq('no feed row, rank 60 of 90 -> NOT ON THE BOARD', by.p6, 'off')
eq('never surfaced (no slot, no feed) -> NOT ON THE BOARD', by.p7, 'off')
const rows = nightToRows({ ...night, date: 'T-1' })
eq('rows carry the status word the Ledger prints', rows.map((r) => r.status).sort(), ['board', 'board', 'called', 'off', 'off', 'off'])
const t = nightTotals({ ...night, date: 'T-1' })
eq('totals count home runs (the 2-HR man is two), as /called does', [t.total, t.called, t.board, t.off, t.men], [7, 1, 3, 3, 6])

// a night with no feed at all (before the feed existed): the old rule, said once -- anyone on the sheet is ON THE BOARD
const noFeed = digestGradedNight(graded, null)
eq('no feed, no board size: a rated hitter is on the board (the rule /called keeps for a row with no size)', Object.fromEntries(noFeed.all.map((r) => [r.pid, r.status])).p3, 'board')
eq('no feed: a called role is still CALLED', Object.fromEntries(noFeed.all.map((r) => [r.pid, r.status])).p1, 'called')
// NFL: the tile counts TOUCHDOWNS, each at its own status (a man CALLED on one and ON THE BOARD on his other is one of each)
const nfl = totalsOf([
  { value: 2, status: 'called', byStatus: { called: 1, board: 1, off: 0 } },   // TEST scorer, two TDs, mixed
  { value: 1, status: 'off', byStatus: { called: 0, board: 0, off: 1 } },
  { value: 3, status: 'board', byStatus: { called: 0, board: 3, off: 0 } },
])
eq('NFL tile: 6 touchdowns by 3 scorers; per-touchdown statuses', [nfl.total, nfl.men, nfl.called, nfl.board, nfl.off], [6, 3, 1, 4, 1])
eq('NFL: a row from an older API (no byStatus) still counts its touchdowns at his status', totalsOf([{ value: 2, status: 'called' }]).called, 2)
console.log(fail ? `\n${fail} FAILED` : '\nTEST DATA: all green')

// ── REAL DATA (read-only): one recent night, /called's page against the in-app path ─────────────
if (process.argv.includes('--real')) {
  const SITE = process.env.DASH_SITE || 'https://dashnetwork.vercel.app'
  const DATA = 'https://raw.githubusercontent.com/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT/data/public/data/current'
  const html = await (await fetch(`${SITE}/called?sport=mlb`)).text()
  const text = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '|').replace(/\|+/g, '|')
  const GLYPH = { '🤖': 'called', '⚪': 'board', '💥': 'off' }
  const dayArg = process.argv.includes('--day') ? process.argv[process.argv.indexOf('--day') + 1] : null
  const MONTH = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' }
  // every night section on /called: "Sat, Oct 3|2| of |9| called ..." then the glyph + name rows
  const heads = [...text.matchAll(/\|((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), ([A-Z][a-z]{2}) (\d+))\|\d+\| of \|\d+\| called/g)].map((m) => ({ at: m.index, day: `2026-${MONTH[m[2]]}-${String(m[3]).padStart(2, '0')}` }))
  const nights = heads.map((h, i) => ({ day: h.day, body: text.slice(h.at, heads[i + 1]?.at ?? text.length) }))
  const want = dayArg ? nights.filter((n) => n.day === dayArg) : nights.filter((n) => /[🤖⚪💥]\|/u.test(n.body)).slice(0, 3)
  let checked = 0
  for (const n of want) {
    const calledSays = new Map()
    for (const m of n.body.matchAll(/(🤖|⚪|💥)\|([^|]+)\|/gu)) calledSays.set(m[2].trim(), GLYPH[m[1]])
    const g = await (await fetch(`${DATA}/graded_results_${n.day}.json`)).json().catch(() => null)
    if (!g) { console.log(`${n.day}: no graded file`); continue }
    // the feed as /called holds it: the statuses it printed, keyed by player id through the graded file's own names
    const idOf = new Map((g.hr_capture_report?.all_homer_entries || []).map((e) => [String(e.name).trim(), String(e.player_id)]))
    const st = {}
    for (const [name, status] of calledSays) if (idOf.has(name)) st[idOf.get(name)] = status
    const night = digestGradedNight(g, { of: null, st })
    let same = 0, diff = 0
    for (const r of night.all) {
      const c = calledSays.get(r.name)
      if (!c) continue
      const before = r.badged ? 'called' : r.onSheet ? 'board' : 'off'    // the OLD in-app rule
      const ok = r.status === c
      same += ok; diff += !ok; checked += 1
      console.log(`${n.day}  ${r.name.padEnd(22)} /called: ${c.padEnd(6)} in-app now: ${r.status.padEnd(6)} in-app before: ${before.padEnd(6)} ${ok ? '' : '  <-- MISMATCH'}${before !== c ? '  (was wrong)' : ''}`)
    }
    console.log(`${n.day}: ${same} match, ${diff} differ\n`)
    fail += diff
  }
  console.log(checked ? (fail ? `REAL DATA: ${fail} mismatches` : `REAL DATA: ${checked} hitters, in-app == /called`) : 'REAL DATA: nothing to compare (no night on /called with homers)')
}
process.exit(fail ? 1 : 0)
