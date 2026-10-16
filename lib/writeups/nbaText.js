// THE WRITE-UP'S WORDS, BASKETBALL (2026-10-09). The twin of the hockey words in lib/writeups/text.js, kept here so
// that file stays the shared frame: fact (what the checker may draw on), full (site, #members, a long X post),
// short (the 280 version) and mid. The numbers and names come from the JSON lib/writeups/nba.js builds.
import { NBA_TEMPLATE } from './nba'

export function nbaFact(w) {
  const vals = []
  const take = (ln) => { if (ln) vals.push(...(ln.v || [])) }
  w.game.forEach(take)
  w.players.forEach((p) => { p.why.forEach(take); p.watch.forEach(take) })
  return {
    names: [w.away, w.home, w.when, ...w.game.map((g) => g.t), ...w.bottom.map((b) => b.t),
      ...w.players.flatMap((p) => [p.name, p.team, p.opp, p.position, p.role, p.status_word, p.injury, ...p.markets.flatMap((m) => [m.word, m.role])]),
      ...w.noCall.flatMap((n) => [n.team, n.status_word])].filter(Boolean),
    values: [...vals, ...w.players.flatMap((p) => [p.score, ...p.markets.flatMap((m) => [m.score, m.rank, m.of])])].filter((x) => x != null),
    template: NBA_TEMPLATE,
  }
}

const head = (w) => `🏀 THE CALL · ${w.away} @ ${w.home}${w.when ? ` · ${w.when}` : ''}`
const marketLine = (m) => `${m.word.toUpperCase()} · BUCKETS score ${m.score}${m.rank != null && m.of ? ` · #${m.rank} of ${m.of} tonight` : ''}${m.role === 'TOP' ? ' · TOP' : ''}`

// LAYOUT (Donovan, 2026-10-16: no solid stacks): blocks joined by one blank line (the same frame as lib/writeups/text.js).
const blocks = (parts) => parts.map((b) => (Array.isArray(b) ? b.filter(Boolean).join('\n') : b)).filter(Boolean).join('\n\n')
function block(p) {
  return blocks([
    [`${p.name.toUpperCase()} · ${p.team}${p.position ? ` ${p.position}` : ''} · ${p.status_word}${p.role === 'TOP' ? ' (TOP)' : ''}`, ...p.markets.map(marketLine)],
    p.why.length ? ['WHY', ...p.why.map((l) => `· ${l.t}`)] : null,
    p.watch.length ? ['WATCH OUT', ...p.watch.map((l) => `· ${l.t}`)] : null,
  ])
}

export function nbaFull(w) {
  const game = w.game.length ? ['THE GAME', ...w.game.map((l) => l.t)] : null
  return blocks([head(w), w.header.t, game, ...w.players.map(block), ['BOTTOM LINE', ...w.bottom.map((l) => l.t)]])
}

// X when the whole thing does not fit: the headliner's block and the bottom line
export const nbaMid = (w) => (w.players[0] ? blocks([head(w), block(w.players[0]), ['BOTTOM LINE', ...w.bottom.map((l) => l.t)]]) : null)

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
