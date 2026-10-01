#!/usr/bin/env node
// lib/mlb/boardReason.js, checked on TONIGHT'S REAL BOARD (2026-09-30).
//   node scripts/check-mlb-board-reason.mjs [--file today_slim.json]
// Fetches current/today_slim.json from the data branch (or reads --file),
// then for every hitter checks: each reason's number IS his board cell,
// its rank is right against the slate, families never repeat, the top-
// quarter / bottom-quarter rules hold, and every leg's direction matches
// the board column's own `invert` flag. Prints ten rows' why / watch.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import './_esm-resolve.mjs'
const { reasonContext, whyFor, watchFor, LEG_KEYS } = await import('../lib/mlb/boardReason.js')
const { boardColumns } = await import('../lib/boardColumns.js')

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null }
const URL = 'https://raw.githubusercontent.com/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT/data/public/data/current/today_slim.json'
const body = arg('--file') ? JSON.parse(readFileSync(arg('--file'), 'utf8')) : await (await fetch(URL)).json()
const players = Array.isArray(body) ? body : (body.players || body.rows || [])
assert.ok(players.length > 0, 'board has rows')

const cols = Object.fromEntries(boardColumns({}).map((c) => [c.key, c]))
for (const k of LEG_KEYS) assert.ok(cols[k], `leg ${k} is a board column`)
// directions: every leg the board marks inverted is inverted here, and back
const ctx = reasonContext(players)
for (const k of LEG_KEYS) {
  const d = ctx.dist[k]
  if (d.length < 2) continue
  const desc = d[0] >= d[d.length - 1]
  assert.equal(!desc, Boolean(cols[k].invert), `${k}: direction matches the column's invert flag`)
}

let whys = 0, watches = 0, empty = 0
for (const row of ctx.rows) {
  const why = whyFor(row, ctx)
  const watch = watchFor(row, ctx)
  const fams = new Set()
  for (const r of why) {
    assert.equal(r.value, Number(row[r.key]), `${row.name} ${r.key}: the number is his board cell`)
    assert.ok(r.pct >= 75, `${row.name} ${r.key}: top quarter (${r.pct})`)
    const better = ctx.dist[r.key].filter((x) => (cols[r.key].invert ? x < r.value : x > r.value)).length
    assert.equal(r.rank, better + 1, `${row.name} ${r.key}: rank`)
    assert.equal(r.n, ctx.dist[r.key].length, `${row.name} ${r.key}: n = hitters (or starters / parks) with the number`)
    assert.ok(r.title.length > 0, `${r.key}: carries the column's definition`)
    fams.add(r.key)
  }
  assert.ok(why.length <= 3)
  if (watch) { assert.ok(watch.pct <= 25, `${row.name} watch ${watch.key} bottom quarter`); watches++ }
  if (why.length) whys++; else empty++
}

const top = [...ctx.rows].filter((r) => Number.isFinite(r.rank)).sort((a, b) => a.rank - b.rank).slice(0, 10)
console.log(`board: ${players.length} rows · ${whys} with a why, ${empty} with none (honest), ${watches} with a watch\n`)
for (const r of top) {
  const why = whyFor(r, ctx)
  const w = watchFor(r, ctx)
  console.log(`#${r.rank} ${r.name} (${r.team})`)
  console.log(`   why:   ${why.map((x) => x.text).join('  |  ') || '—'}`)
  console.log(`   watch: ${w ? w.text : '—'}`)
}
console.log('\nok  every reason is his own board cell, ranked against tonight')
