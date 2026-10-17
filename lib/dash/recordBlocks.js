// THE RECORD, ONE SHAPE PER SPORT (2026-10-17, front door; Donovan: "make cohesive"). Pure: the readers' bodies in, plain rows out.
// MOONSHOT, TUDDY and LAMP each answer "did the calls do their job?" in the SAME table: Group | Scored (x of n) | Rate | 95% range | Base (every player).
// Every number is a count a reader already computed (nothing is typed or invented here):
//   mlb  lib/dash/pulse.js recordFrom (the locked record, lib/record/lockedRecord.js): one row per call type on its own bar, the base is every hitter on that bar.
//   nfl  the calibration reader's market ladder (lib/record/ladder.js marketLadderFrom): one row per CALLED market, the base is the report card's back-test.
//        TUDDY holds no called / on-the-board / not-on-the-board HIT RATE by group today (its record is a coverage count, lib/record/nfl.js eventCapture), so the
//        coverage count stays as a footnote and no group rate is made up.
//   nhl  the status ladder (lib/record/ladder.js ladderRows): CALLED / ON THE BOARD / NOT ON THE BOARD against every dressed skater; the words are callStatus's.
import { wilson } from '../interval'
import { ledgerAppHref } from '../ledger/views'
import { LADDER_SPORTS } from '../record/ladderSports'
import { marketCells, marketScope, ladderRows, ladderCells, ladderScopeShort, BASE_LABEL } from '../record/ladder'

const pct = (n) => (Number.isFinite(n) ? `${n.toFixed(1)}%` : '—')
const num = (n) => (Number.isFinite(n) ? n : null)

function mlbBlock(record) {
  const rows = (record?.rows || []).map((r) => {
    const ci = wilson(r.ok, r.n)
    return ci ? { _key: r.key, label: r.label, bar: r.bar, scored: `${r.ok} of ${r.n}`, ratev: num(r.pct), band: `${ci[0].toFixed(1)}–${ci[1].toFixed(1)}%`, base: r.base != null ? pct(r.base) : '—' } : null
  }).filter(Boolean)
  if (!rows.length) return null
  const late = record.lateNights?.length ? ` — ${record.lateNights.map((d) => d.slice(5).replace('-', '/')).join(', ')} --` : ''
  return {
    sport: 'mlb', question: 'did each call clear the bar it was made for?', href: '/called?sport=mlb', rows, heat: false,
    lead: record.callsLine,
    foot: `Regular season, ${record.window}, locked before first pitch.`,
    how: `The ${record.source || 'locked record'}: only calls whose board row was stamped before first pitch, graded on what happened (nights stamped after first pitch${late} are not counted), the same numbers as the tier table on the record page. "Every hitter" is the rate for everyone on the board on the same bar, which is the number a call has to beat. Each row is scored on the bar that call was made for, so the rows are different questions and are never ranked against each other; a call type with under 30 graded calls is left off until it has them.`,
    ledger: ledgerAppHref('mlb', 'record'),
  }
}

function nflBlock(ladder, rec) {
  const rows = (ladder?.rows || []).filter((r) => !r.floorTracking).map((r) => {
    const c = marketCells(r, ladder.minN)
    return { _key: r.key, label: `${r.label} calls`, bar: r.bar, scored: c.of, ratev: r.enough ? num(r.rate) : null, band: c.range || '—', base: r.base ? `${c.base} · ${c.baseN}` : '—' }
  })
  if (!rows.length) return null
  return {
    sport: 'nfl', question: 'did the calls clear the bar they were made for?', href: '/called?sport=nfl', rows, heat: false,
    foot: `${marketScope(ladder)} Each row is its own bar.`,
    aside: rec ? { label: 'COVERAGE', text: `${rec.onBoard} of ${rec.total} touchdown scorers were on the board (${Math.round((100 * rec.onBoard) / rec.total)}%), ${rec.called} of them CALLED, over ${rec.days} game days: coverage, not how often a call scores.` } : null,
    how: LADDER_SPORTS.nfl.foot,
    ledger: ledgerAppHref('nfl', 'record'),
  }
}

function nhlBlock(ladder, rec) {
  const lr = ladderRows(ladder)
  if (!lr.length) return null
  const base = ladderCells(ladder.base, ladder.minN)
  const rows = lr.map((r) => {
    const c = ladderCells(r, ladder.minN)
    const isBase = r.key === 'base'
    return { _key: r.key, label: isBase ? BASE_LABEL : r.word, status: isBase ? null : r.status, scored: c.of, ratev: num(r.rate), band: c.range || '—', base: isBase ? '—' : base.rate }
  })
  return {
    sport: 'nhl', question: 'did the skaters we called score?', href: '/called?sport=nhl', rows, heat: true,
    foot: ladderScopeShort(ladder),
    aside: rec ? { label: 'CAPTURE', text: `${rec.called} of ${rec.total} goal scorers were CALLED (${Math.round((100 * rec.called) / rec.total)}%), last ${rec.days} nights: coverage, not how often a call scores.` } : null,
    how: 'LAMP leads with its ladder: every dressed skater on the board, grouped by the status locked before puck drop, regular season only, with the count and a 95% range on each row. A skater who did not dress is out of every count.',
    ledger: ledgerAppHref('nhl', 'record'),
  }
}

/** The blocks to draw, in the one order (MOONSHOT, TUDDY, LAMP); a sport with nothing graded has no block. */
export function recordBlocks({ record, nflLadder, nflRecord, nhlLadder, nhlRecord }) {
  return [mlbBlock(record), nflBlock(nflLadder, nflRecord), nhlBlock(nhlLadder, nhlRecord)].filter(Boolean)
}
