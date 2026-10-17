// THE WRITE-UP'S WORDS, BASKETBALL (2026-10-09). The twin of the hockey words in lib/writeups/text.js, kept here so
// that file stays the shared frame: fact (what the checker may draw on), full (site, #members, a long X post),
// short (the 280 version) and mid. The numbers and names come from the JSON lib/writeups/nba.js builds.
import { NBA_TEMPLATE } from './nba'
import { blocks, nameLine, statusLine, whyBlock, watchBlock, gameBlock, bottomBlock, playerLineWords } from './layout'

export function nbaFact(w) {
  const vals = []
  const take = (ln) => { if (ln) vals.push(...(ln.v || [])) }
  w.game.forEach(take)
  w.players.forEach((p) => { p.why.forEach(take); p.watch.forEach(take) })
  return {
    names: [w.away, w.home, w.when, ...w.game.map((g) => g.t), ...w.bottom.map((b) => b.t), ...playerLineWords(w.players),
      ...w.players.flatMap((p) => [p.name, p.team, p.opp, p.position, p.role, p.status_word, p.injury, ...p.markets.flatMap((m) => [m.word, m.role])]),
      ...w.noCall.flatMap((n) => [n.team, n.status_word])].filter(Boolean),
    values: [...vals, ...w.players.flatMap((p) => [p.score, ...p.markets.flatMap((m) => [m.score, m.rank, m.of])])].filter((x) => x != null),
    template: NBA_TEMPLATE,
  }
}

const head = (w) => `🏀 THE CALL · ${w.away} @ ${w.home}${w.when ? ` · ${w.when}` : ''}`
// one line a market: "DOUBLE-DOUBLE · BUCKETS score 91 · #1 of 14 players tonight" (the TOP flag only where it differs from the man's own status line)
const marketLine = (m, p) => `${m.word.toUpperCase()} · BUCKETS score ${m.score}${m.rank != null && m.of ? ` · #${m.rank} of ${m.of} players tonight` : ''}${m.role === 'TOP' && p.role !== 'TOP' ? ' · TOP' : ''}`

function block(p) {
  return blocks([
    // a man called in three markets would stack five lines: the markets get their own block then
    p.markets.length > 2 ? [nameLine(p), statusLine(p)] : [nameLine(p), statusLine(p), ...p.markets.map((m) => marketLine(m, p))],
    p.markets.length > 2 ? p.markets.map((m) => marketLine(m, p)) : null,
    whyBlock(p.why),
    watchBlock(p.watch),
  ])
}

export function nbaFull(w) {
  return blocks([head(w), w.header.t, gameBlock(w), ...w.players.map(block), bottomBlock(w)])
}

// X when the whole thing does not fit: the headliner's block and the bottom line
export const nbaMid = (w) => (w.players[0] ? blocks([head(w), block(w.players[0]), bottomBlock(w)]) : null)

// the 280 version: who, which market, the status -- as many rows as fit, the game's TOP call first
export function nbaShort(w) {
  const row = (p) => `${p.name} (${p.team}${p.position ? ` ${p.position}` : ''}) · ${p.markets.map((m) => m.word).join(' + ')} · ${p.status_word}${p.role === 'TOP' ? ' (TOP)' : ''}`
  const room = 280 - w.footer.length - 2
  // label, a blank line, the rows; a row is never dropped for the blank line (it is dropped first)
  const rows = []
  for (const p of w.players) {
    if ([head(w), ...rows, row(p)].join('\n').length > room) break
    rows.push(row(p))
  }
  const spaced = [head(w), '', ...rows].join('\n')
  return spaced.length <= room ? spaced : [head(w), ...rows].join('\n')
}
