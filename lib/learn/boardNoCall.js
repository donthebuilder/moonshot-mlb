// ON THE BOARD, NO CALL, ANALYSED (2026-10-12, accuracy loop). Pure.
//
// The rows the model put in the top third of the board but did not call: how often they cleared the bar next to
// the called set and the rest of the board (n and a 95% Wilson range beside every rate), and, inside the group,
// what separated the ones that cleared from the ones that did not.
//
// The rate comparison is a description of two counted groups. It is never printed as a chance on a player.
import { groupRows, rateOf, MIN_GROUP_N, withBins } from './groups'
import { separate } from './separators'

/** Do two Wilson ranges (percent) overlap? */
const overlap = (a, b) => Boolean(a && b) && a[0] <= b[1] && b[0] <= a[1]

export function analyzeBoardNoCall(rows, opts = {}) {
  const g = groupRows(withBins(rows))
  const called = rateOf(g.called), board = rateOf(g.boardNoCall), off = rateOf(g.off)
  const floor = called.n >= MIN_GROUP_N && board.n >= MIN_GROUP_N
  return {
    called, board, off,
    floor,
    rangesOverlap: overlap(called.range, board.range),
    // 'tracking' until both groups clear the floor; the word 'higher' / 'lower' is only said when the ranges do not overlap
    readout: !floor ? 'tracking' : overlap(called.range, board.range) ? 'not clearly different' : called.rate > board.rate ? 'called set higher' : 'board set higher',
    within: separate(g.boardNoCallHit, g.boardNoCallMiss, { ...opts, banded: true }),
  }
}
