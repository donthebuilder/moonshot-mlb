#!/usr/bin/env node
// A GAME WEARS ITS OWN TOTAL (2026-10-10, Donovan: "do that site wide"). Every input is TEST data (clubs AAA/BBB, made-up numbers).
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/check-game-totals.mjs
// Covers: (1) the shared line renders a game's own total for every sport from a stored /api/totals row (projection, rank,
// graded-vs, the status word from lib/callStatus, final + OVER/UNDER once graded) and nothing when there is no row; (2) a game off the
// board wears no total in a list (totalRowFor), the open game keeps its plain projection; (3) every sport's game header and slate card
// reads it from the one shared component; (4) NO standalone Top Totals table remains on any Games/Slate tab, while the Ledger's record
// still lists Top Totals history.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import React from 'react'
import GameTotalLine, { GameTotalMark, totalRowFor } from '../components/GameTotalLine.js'
import { STATUS_WORD, totalsCallStatus } from '../lib/callStatus.js'
import { TOTALS_SPORTS } from '../lib/totals/core.js'

const { renderToStaticMarkup } = createRequire(`${process.cwd()}/package.json`)('react-dom/server')
let failed = 0
const t = async (what, fn) => { try { await fn(); console.log(`ok   ${what}`) } catch (e) { failed += 1; console.log(`FAIL ${what}\n     ${e.message}`) } }
const src = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
const html = (el) => renderToStaticMarkup(el)

// TEST rows, shaped like /api/totals' (a stored row plus the status the route derives)
const row = (over) => { const r = { game_id: 'T1', away: 'AAA', home: 'BBB', projected_total: 6.4, line: 6.4, line_source: 'projection', rank: 1, field_size: 10, called: true, ...over }; return { ...r, status: totalsCallStatus(r) } }

await t('every sport: a CALLED game prints its projection, rank, graded-vs and the CALLED word from lib/callStatus', () => {
  assert.deepEqual([...TOTALS_SPORTS].sort(), ['mlb', 'nba', 'nfl', 'nhl'])
  for (const sport of TOTALS_SPORTS) {
    const out = html(React.createElement(GameTotalLine, { sport, row: row({ projected_total: 6.4, line: 6.4 }) }))
    assert.match(out, /GAME TOTAL/, sport)
    assert.match(out, /data-game-total="T1"/, sport)
    assert.ok(out.includes(STATUS_WORD.called), `${sport}: the status word is lib/callStatus' own`)
    assert.match(out, /#1 this (night|week)/, sport)
    assert.match(out, /graded vs our number/, sport)
  }
})

await t('graded: final and OVER / UNDER appear once the game is graded, and not before', () => {
  const open = html(React.createElement(GameTotalLine, { sport: 'nhl', row: row({}) }))
  assert.ok(!/final/.test(open) && !/OVER|UNDER/.test(open))
  const over = html(React.createElement(GameTotalLine, { sport: 'nhl', row: row({ actual_total: 8, result: 'over', hit: true, line: 6.5, line_source: 'book', book_line: 6.5 }) }))
  assert.match(over, /final/); assert.match(over, /OVER/); assert.match(over, /graded vs book/)
  const under = html(React.createElement(GameTotalLine, { sport: 'mlb', row: row({ actual_total: 1, result: 'under', hit: false }) }))
  assert.match(under, /UNDER/)
})

await t('no row, no line: nothing is printed or invented', () => {
  assert.equal(html(React.createElement(GameTotalLine, { sport: 'mlb', row: null })), '')
  assert.equal(html(React.createElement(GameTotalLine, { sport: 'nba', row: undefined })), '')
  assert.equal(html(React.createElement(GameTotalMark, { row: null })), '')
})

await t('a game off the board wears no total in a list; the open game keeps its plain projection; the mark is for CALLED / ON THE BOARD only', () => {
  const calledRow = row({ game_id: 'A', rank: 1 }); const boardRow = row({ game_id: 'B', rank: 4, called: false }); const offRow = row({ game_id: 'C', rank: 10, called: false })
  assert.equal(calledRow.status, 'called'); assert.equal(boardRow.status, 'board'); assert.equal(offRow.status, 'off')
  const totals = { A: calledRow, B: boardRow, C: offRow }
  assert.equal(totalRowFor(totals, 'A'), calledRow); assert.equal(totalRowFor(totals, 'B'), boardRow)
  assert.equal(totalRowFor(totals, 'C'), null)
  assert.equal(totalRowFor(totals, 'C', true), offRow)
  assert.equal(totalRowFor(totals, 'nope', true), null); assert.equal(totalRowFor(null, 'A'), null)
  assert.match(html(React.createElement(GameTotalMark, { row: calledRow })), /total #1/)
  assert.ok(html(React.createElement(GameTotalMark, { row: calledRow })).includes(STATUS_WORD.called))
  assert.equal(html(React.createElement(GameTotalMark, { row: offRow })), '')
})

// where each sport's game header (the line) and slate card (the mark) live
const HEADERS = {
  mlb: ['components/tabs/Games.js', 'components/GameStrip.js'],
  nfl: ['components/nfl/NflSlate.js', 'components/nfl/NflSlate.js'],
  nhl: ['components/lamp/LampSlate.js', 'components/lamp/LampSlate.js'],
  nba: ['components/buckets/tabs/Slate.js', 'components/buckets/tabs/Slate.js'],
}
await t('every sport\'s game header renders its own total from the shared component, and its slate card carries the mark', () => {
  for (const [sport, [header, card]] of Object.entries(HEADERS)) {
    const h = src(header); const c = src(card)
    assert.ok(h.includes(`<GameTotalLine sport="${sport}"`), `${sport}: ${header} renders <GameTotalLine>`)
    assert.ok(h.includes(`useGameTotals('${sport}')`) || c.includes(`useGameTotals('${sport}')`), `${sport}: reads the stored rows`)
    assert.ok(c.includes('<GameTotalMark'), `${sport}: ${card} wears the slate-card mark`)
  }
  // the game pages that are not the slate's open game
  assert.ok(src('components/lamp/tabs/Game.js').includes('<GameTotalLine sport="nhl"'), 'LAMP game page')
  assert.ok(src('components/buckets/tabs/Game.js').includes('<GameTotalLine sport="nba"'), 'BUCKETS game page')
})

await t('NO standalone Top Totals table on any Games / Slate tab (only the Ledger\'s record view mounts <TopTotals>)', () => {
  for (const f of ['components/Dashboard.js', 'components/nfl/NflDashboard.js', 'components/lamp/LampDashboard.js', 'components/buckets/BucketsDashboard.js', 'components/tabs/Games.js', 'components/lamp/LampSlate.js', 'components/buckets/tabs/Slate.js', 'components/nfl/NflSlate.js']) {
    assert.ok(!/<TopTotals\b/.test(src(f)) && !/from '[./]*\/TopTotals'/.test(src(f)), `${f} mounts no TopTotals`)
  }
  const ledger = src('components/pages/LedgerShell.js')
  assert.ok(/<TopTotals sport=\{sport\} mode="record"/.test(ledger), 'the record still lists Top Totals history')
  assert.ok(/mode = 'slate'/.test(src('components/TopTotals.js')), 'the component and its modes are untouched')
})

await t('the Card is one compact line under each Games slate (MLB, NHL, NFL), never above the first game', () => {
  for (const [f, re] of [['components/Dashboard.js', /<Games [^\n]*\/>\}\n[^\n]*<CardSection sport="mlb" compact \/>/], ['components/lamp/LampDashboard.js', /<LampSlate [^\n]*\/>\}\n[^\n]*<CardSection sport="nhl" Table=\{LampTable\} compact \/>/], ['components/nfl/NflDashboard.js', /<Games [^\n]*\/>\}\n[^\n]*<CardSection sport="nfl" Table=\{NflTable\} compact \/>/]]) {
    assert.ok(re.test(src(f)), `${f}: the Card follows the slate, compact`)
  }
})

console.log(failed ? `\n${failed} FAILED` : '\nall ok')
process.exit(failed ? 1 : 0)
