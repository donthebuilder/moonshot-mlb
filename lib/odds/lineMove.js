// "LINE MOVED FROM X TO Y" (2026-10-07, Donovan: NFL has no odds history).
// Pure, no hooks: the move of ONE quote, from fields the feed already carries and the
// odds tick already stores (odds_snap / odds_lines: the feed's opening price, then our
// list / lock / close reads). Nothing is invented: no opening price on the quote means
// no move (null), never a guess, and a price that did not change is not a move.
//
//   quote.movement.opening_over / opening_line   the feed's opening (market-wide)
//   quote.over / quote.line                      our newest read
//   quote.movement.from_open_pp                  break-even points, now minus open (+ = shorter)
//   quote.snap                                   which read "now" is: list | lock | close
import { impliedPct } from '../odds'

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

/**
 * @returns {null | {from:number|null, to:number|null, fromLine:number|null, toLine:number|null,
 *   pp:number|null, dir:'shorter'|'longer'|'line'|null, lineChanged:boolean, snap:string|null}}
 */
export function lineMove(quote) {
  const m = quote?.movement
  if (!m) return null
  const from = num(m.opening_over)
  const to = num(quote.over)
  const fromLine = num(m.opening_line)
  const toLine = num(quote.line)
  const lineChanged = Boolean(m.line_changed) || (fromLine != null && toLine != null && Math.abs(fromLine - toLine) > 1e-9)
  let pp = num(m.from_open_pp)
  if (pp == null && !lineChanged && from != null && to != null) {
    const a = impliedPct(to), b = impliedPct(from)
    pp = a != null && b != null ? Math.round(10 * (a - b)) / 10 : null
  }
  if (lineChanged) return { from, to, fromLine, toLine, pp: null, dir: 'line', lineChanged: true, snap: quote.snap || null }
  if (from == null || to == null || from === to || pp == null || pp === 0) return null
  return { from, to, fromLine, toLine, pp, dir: pp > 0 ? 'shorter' : 'longer', lineChanged: false, snap: quote.snap || null }
}

/** One short line for a tooltip: "opened +900, now +1200 (lock read)". */
export function lineMoveText(mv, fmt) {
  if (!mv) return ''
  const read = mv.snap === 'lock' ? 'lock read' : mv.snap === 'close' ? 'close read' : mv.snap === 'list' ? 'morning read' : 'latest read'
  if (mv.lineChanged) return `the line moved: opened at ${mv.fromLine ?? '?'}, now ${mv.toLine ?? '?'} (${read})`
  const dir = mv.dir === 'shorter' ? `shortened ${Math.abs(mv.pp).toFixed(1)} points of break-even` : `drifted ${Math.abs(mv.pp).toFixed(1)} points of break-even`
  return `opened ${fmt(mv.from)}, now ${fmt(mv.to)} (${read}) -- ${dir}`
}
