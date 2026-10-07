// WHERE THE BOOKS DISAGREE, for one quote (2026-10-07). Pure. Shared by the Odds board's
// BEST / SPREAD columns and the Line shop, so the two can never read a quote two ways.
// Reads quote.by_book (the detail payload: { book: { line, over } }); a quote without it
// has no spread (null), never a guess.
import { impliedPct } from '../odds'

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? NaN : Number(v))

/** Our feed's book keys are lowercase (draftkings ...); the bot's were display names. */
export const shortBook = (b) => ({ DraftKings: 'DK', Fanatics: 'FAN', FanDuel: 'FD', BetMGM: 'MGM', Caesars: 'CZR',
  draftkings: 'DK', fanatics: 'FAN', fanduel: 'FD', betmgm: 'MGM', caesars: 'CZR', espnbet: 'ESPN', bovada: 'BOV' }[b] || String(b || '').slice(0, 4).toUpperCase())

/**
 * @returns {{ books: [string, {line:any, over:any, under:any}][], atLine: {bk:string, over:number, need:number}[],
 *   best: object|null, worst: object|null, spread: number|null, lines: number[], split: boolean }}
 * spread = break-even points between the worst and the best price AT THE CONSENSUS LINE (two books on
 * different bars are two bets, never a price gap: that is `split`).
 */
export function bookSpread(q) {
  const books = q?.by_book && typeof q.by_book === 'object' ? Object.entries(q.by_book) : []
  const line = num(q?.line)
  const atLine = books
    .filter(([, b]) => Number.isFinite(num(b?.line)) && Math.abs(num(b.line) - line) < 1e-9 && Number.isFinite(num(b?.over)))
    .map(([bk, b]) => ({ bk, over: num(b.over), need: impliedPct(num(b.over)) }))
  const best = atLine.length ? atLine.reduce((a, b) => (b.over > a.over ? b : a)) : null
  const worst = atLine.length ? atLine.reduce((a, b) => (b.over < a.over ? b : a)) : null
  const spread = best && worst && atLine.length > 1 ? Math.round(10 * (worst.need - best.need)) / 10 : null
  const lines = [...new Set(books.map(([, b]) => num(b?.line)).filter(Number.isFinite))]
  return { books, atLine, best, worst, spread, lines, split: lines.length > 1 }
}
