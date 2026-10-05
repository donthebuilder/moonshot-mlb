// THE WRITE-UP'S WORDS (BATCH-GAME-WRITEUP). The reference post is the
// template (x.com/CalledItHR/status/2106900494576701695): header, the game,
// each player's case + watch-out + price, the bottom line, the footer. Site,
// Discord and X all render from the same JSON (build.js), so they can't drift.
//
// THE CHECK is the fact engine's (lib/facts/check.js checkDraft), not a second
// one: every number in the body must be a value the JSON carries, every
// capitalised word a name or a template word in it, no superlatives, no
// betting words. The fixed footer is appended after the check.
import { checkDraft } from '../facts/check'
import { fmtOdds } from '../nfl/oddsMatch'

// The template's own words -- labels, not claims. No numbers here: every
// number in a post is a value the JSON carries.
const TEMPLATE = ['THE CALL', 'TUDDY', 'THE GAME', 'WHY', 'WATCH OUT', 'PRICE', 'BOTTOM LINE', 'Score', 'TD', 'TOP', 'RB', 'WR', 'TE',
  'QB', 'ET', 'AM', 'PM', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'of', '°F', 'percentile']

const PRICE = (p) => (p ? `${fmtOdds(p.odds)}${p.book ? ` at ${p.book}` : ''}${p.implied != null ? ` (implies ${p.implied}%)` : ''}` : null)

/** What the checker may draw on: names, values and template words from the JSON. */
export function factOf(w) {
  const vals = []
  const take = (ln) => { if (ln) vals.push(...(ln.v || [])) }
  w.game.forEach(take)
  w.players.forEach((p) => { p.why.forEach(take); p.watch.forEach(take) })
  return {
    names: [w.away, w.home, w.away_name, w.home_name, w.when, ...w.players.flatMap((p) => [p.name, p.team, p.opp, p.position, p.role, p.grade, p.status_word, p.price?.book]),
      ...w.noCall.flatMap((n) => [n.name, n.team, n.status_word]), ...w.game.map((g) => g.t),
      ...w.players.flatMap((p) => [`${p.position}s`, ...p.why.flatMap((l) => l.names || []), ...p.watch.flatMap((l) => l.names || [])])].filter(Boolean),
    values: [...vals, ...w.players.flatMap((p) => [p.tdScore, p.rank, p.of, p.posRank, p.posOf, p.price?.implied, p.price ? fmtOdds(p.price.odds) : null]),
      ...w.noCall.flatMap((n) => [n.rank, n.of])].filter((x) => x != null),
    template: TEMPLATE,
  }
}

function playerBlock(p) {
  const out = [`${p.name.toUpperCase()} · ${p.team} ${p.position} · ${p.status_word}${p.role === 'TOP' ? ' (TOP)' : ''}`,
    `Score ${p.tdScore} (${p.grade}) · #${p.rank} of ${p.of} on the TD board${p.posRank ? ` · #${p.posRank} of ${p.posOf} ${p.position}s` : ''}`]
  if (p.why.length) out.push('WHY', ...p.why.map((l) => `· ${l.t}`))
  if (p.watch.length) out.push('WATCH OUT', ...p.watch.map((l) => `· ${l.t}`))
  const pr = PRICE(p.price)
  if (pr) out.push(`PRICE ${pr}`)
  return out.join('\n')
}

/** The full write-up body (site + Discord + a long X post), without the footer. */
export function fullBody(w) {
  const head = [`🏈 THE CALL · ${w.away} @ ${w.home} · ${w.when}`, w.header.t]
  const game = w.game.length ? ['THE GAME', ...w.game.map((l) => l.t)].join('\n') : null
  const blocks = w.players.map(playerBlock)
  const bottom = ['BOTTOM LINE', ...w.bottom.map((l) => l.t)].join('\n')
  return [head.join('\n'), game, ...blocks, bottom].filter(Boolean).join('\n\n')
}

/** The 280-character X version: who, the status, the score -- the images carry the rest. */
export function shortBody(w) {
  const rows = w.players.map((p) => `${p.name} (${p.team} ${p.position}) · ${p.status_word}${p.role === 'TOP' ? ' (TOP)' : ''} · ${p.tdScore} ${p.grade} · #${p.rank} of ${p.of}`)
  const nc = w.noCall.map((n) => (n.name ? `${n.team}: ${n.name} is ${n.status_word}` : `${n.team}: no call`))
  return [`🏈 THE CALL · ${w.away} @ ${w.home} · ${w.when}`, ...rows, ...nc].join('\n')
}

/**
 * Render + check. Returns { ok, full, x, short, why[] }:
 *   full  -- body + footer (site, Discord)
 *   x     -- the long body if `xLimit` allows it, else the short one; + footer
 * A body that fails the check is never returned as ok; `why` says what failed.
 */
export function renderWriteup(w, { xLimit = 280 } = {}) {
  const fact = factOf(w)
  const full = fullBody(w)
  const short = shortBody(w)
  const why = []
  const cFull = checkDraft(full, fact, { limit: 4000 })
  if (!cFull.ok) why.push(...cFull.why.map((x) => `full: ${x}`))
  const cShort = checkDraft(short, fact, { limit: 280 - w.footer.length - 2 })
  if (!cShort.ok) why.push(...cShort.why.map((x) => `short: ${x}`))
  const longFits = full.length + 2 + w.footer.length <= xLimit
  return {
    ok: why.length === 0,
    full: `${full}\n\n${w.footer}`,
    x: `${longFits ? full : short}\n\n${w.footer}`,
    xIsLong: longFits,
    short: `${short}\n\n${w.footer}`,
    why,
  }
}
