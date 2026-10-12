// WHAT GOT AWAY, ANALYSED (2026-10-12, accuracy loop). Pure.
//
// "Got away" here is the wide sense: PRODUCED (cleared the market's bar) and NOT CALLED, split into the part that
// was ON THE BOARD and the part that was NOT ON THE BOARD at all. (The site's WHAT GOT AWAY list shows the NOT ON
// THE BOARD part for the night on screen; the ON THE BOARD part appears under CALLED IT there. This module counts
// both, and says which is which.)
//
// Three questions, each a groups comparison through lib/learn/separators.js:
//   c1  gotAway vs called            what the got-away rows looked like next to the called set
//   c2  gotAway vs notCalledMiss     among everyone the model did not call, what the producers had that the others lacked,
//                                    compared WITHIN SCORE BANDS (the one that can show a signal the score leaves on the table)
//   c3  calledHit vs calledMiss      the misses we called, and what separated them from the clears
import { groupRows, countsOf, byWeek, weekKey, withBins } from './groups'
import { separate } from './separators'

/** Per-week counts: how many got away, how many were on the board, the called set's rate. */
export function weeklyGotAway(rows) {
  return byWeek(rows).map(({ week, rows: list }) => {
    const c = countsOf(list)
    return { week, graded: c.graded, gotAway: c.gotAway, called: { n: c.called.n, hits: c.called.hits }, boardNoCall: { n: c.board.n, hits: c.board.hits } }
  })
}

export function analyzeGotAway(rows, opts = {}) {
  const g = groupRows(withBins(rows))
  return {
    counts: countsOf(rows),
    weekly: weeklyGotAway(rows),
    c1: separate(g.gotAway, g.called, opts),                              // the call rule is built from these features: read as a description of the set
    c2: separate(g.gotAway, g.notCalledMiss, { ...opts, banded: true }),    // inside the same score band: what the stored score does not already say
    c3: separate(g.calledHit, g.calledMiss, { ...opts, banded: true }),
  }
}

export { weekKey }
