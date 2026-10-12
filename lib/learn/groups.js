// THE GROUPS (2026-10-12, accuracy loop). Pure.
//
// Every row of a night (week) has a status (CALLED / ON THE BOARD / NOT ON THE BOARD, from lib/callStatus) and a
// result (produced = cleared the market's bar). The loop looks at five groups, and only these:
//
//   called            status 'called'                          (the called set)
//   calledHit/Miss    the called set split by result
//   gotAway           produced and NOT called                  WHAT GOT AWAY, in the loop's wide sense
//   gotAwayBoard      ... and he was ON THE BOARD              (the site's WHAT GOT AWAY list is the NOT ON THE BOARD part only)
//   gotAwayOff        ... and he was NOT ON THE BOARD
//   boardNoCall       status 'board' (on the board, not called), whatever happened
//   boardNoCallHit/Miss   that group split by result
//   notCalled         board + off, whatever happened          (the pool the model left behind)
//   notCalledMiss     ... that did not produce
//
// A row with produced === null (not graded, did not play) is in no group: a man who never played is void,
// never a miss and never a got-away.
import { wilson } from '../interval'
import { percentRanks } from './stats'

export const MIN_GROUP_N = 30   // no feature claim under this many rows in either group (label: tracking)

const settled = (r) => r.produced === true || r.produced === false

export function groupRows(rows) {
  const R = (rows || []).filter(settled)
  const g = {
    called: R.filter((r) => r.status === 'called'),
    notCalled: R.filter((r) => r.status !== 'called'),
  }
  g.calledHit = g.called.filter((r) => r.produced)
  g.calledMiss = g.called.filter((r) => !r.produced)
  g.gotAway = g.notCalled.filter((r) => r.produced)
  g.gotAwayBoard = g.gotAway.filter((r) => r.status === 'board')
  g.gotAwayOff = g.gotAway.filter((r) => r.status === 'off')
  g.notCalledMiss = g.notCalled.filter((r) => !r.produced)
  g.boardNoCall = R.filter((r) => r.status === 'board')
  g.boardNoCallHit = g.boardNoCall.filter((r) => r.produced)
  g.boardNoCallMiss = g.boardNoCall.filter((r) => !r.produced)
  g.off = R.filter((r) => r.status === 'off')
  g.all = R
  return g
}

/** { n, hits, rate (percent, 1 dp), range: Wilson 95% [lo, hi] percent } for a list of settled rows. */
export function rateOf(list) {
  const n = list.length
  const hits = list.filter((r) => r.produced).length
  return { n, hits, rate: n ? Math.round((1000 * hits) / n) / 10 : null, range: wilson(hits, n) }
}

/** The counts the site and the report both print. */
export function countsOf(rows) {
  const g = groupRows(rows)
  return {
    graded: g.all.length,
    called: rateOf(g.called),
    board: rateOf(g.boardNoCall),
    off: rateOf(g.off),
    all: rateOf(g.all),
    gotAway: { n: g.gotAway.length, onBoard: g.gotAwayBoard.length, notOnBoard: g.gotAwayOff.length },
    producedAll: g.all.filter((r) => r.produced).length,
  }
}

/** A Monday-start week key for a YYYY-MM-DD (UTC; the date is the game's own, never a wall clock). */
export function weekKey(ymd) {
  const t = Date.parse(`${ymd}T12:00:00Z`)
  if (!Number.isFinite(t)) return null
  const d = new Date(t)
  const back = (d.getUTCDay() + 6) % 7
  return new Date(t - back * 864e5).toISOString().slice(0, 10)
}

/** Rows -> [{ week, rows }] oldest first. */
export function byWeek(rows) {
  const m = new Map()
  for (const r of rows || []) { const k = weekKey(r.date); if (!k) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(r) }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, list]) => ({ week, rows: list }))
}

/** Distinct units (nights / weeks) in order. */
export const unitsOf = (rows) => [...new Set((rows || []).map((r) => r.unit))].sort()

/**
 * Put each row in a SCORE BAND inside its own unit (night / week): `bin` 0..bins-1 by the percent-rank of the model's stored
 * score among that unit's rows. A comparison inside a band asks "among rows the model scored alike", which is the only way
 * a feature can show something the score does not already say. A row with no score gets bin = null (left out of banded tests).
 */
export function withBins(rows, bins = 5) {
  const by = new Map()
  for (const r of rows) { if (!by.has(r.unit)) by.set(r.unit, []); by.get(r.unit).push(r) }
  const out = []
  for (const list of by.values()) {
    const pr = percentRanks(list.map((r) => (Number.isFinite(r.score) ? r.score : NaN)))
    list.forEach((r, i) => out.push({ ...r, bin: pr[i] == null ? null : Math.min(bins - 1, Math.floor(pr[i] * bins)) }))
  }
  return out
}
