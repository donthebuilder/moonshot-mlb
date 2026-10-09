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

function block(p) {
  const out = [`${p.name.toUpperCase()} · ${p.team}${p.position ? ` ${p.position}` : ''} · ${p.status_word}${p.role === 'TOP' ? ' (TOP)' : ''}`, ...p.markets.map(marketLine)]
  if (p.why.length) out.push('WHY', ...p.why.map((l) => `· ${l.t}`))
  if (p.watch.length) out.push('WATCH OUT', ...p.watch.map((l) => `· ${l.t}`))
  return out.join('\n')
}

export function nbaFull(w) {
  const game = w.game.length ? ['THE GAME', ...w.game.map((l) => l.t)].join('\n') : null
  return [[head(w), w.header.t].join('\n'), game, ...w.players.map(block), ['BOTTOM LINE', ...w.bottom.map((l) => l.t)].join('\n')].filter(Boolean).join('\n\n')
}

// X when the whole thing does not fit: the headliner's block and the bottom line
export const nbaMid = (w) => (w.players[0] ? [head(w), block(w.players[0]), ['BOTTOM LINE', ...w.bottom.map((l) => l.t)].join('\n')].join('\n\n') : null)

// the 280 version: who, which market, the status -- as many rows as fit, the game's TOP call first
export function nbaShort(w) {
  const row = (p) => `${p.name} (${p.team}${p.position ? ` ${p.position}` : ''}) · ${p.markets.map((m) => m.word).join(' + ')} · ${p.status_word}${p.role === 'TOP' ? ' (TOP)' : ''}`
  const room = 280 - w.footer.length - 2
  const rows = []
  for (const p of w.players) {
    const next = [head(w), ...rows, row(p)].join('\n')
    if (next.length > room) break
    rows.push(row(p))
  }
  return [head(w), ...rows].join('\n')
}
