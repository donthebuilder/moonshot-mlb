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
import { nbaFact, nbaFull, nbaShort, nbaMid } from './nbaText'

// The template's own words -- labels, not claims. No numbers here: every
// number in a post is a value the JSON carries.
const TEMPLATE = ['THE CALL', 'TUDDY', 'THE GAME', 'WHY', 'WATCH OUT', 'PRICE', 'BOTTOM LINE', 'Score', 'TD', 'TOP', 'RB', 'WR', 'TE',
  'QB', 'ET', 'AM', 'PM', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'of', '°F', 'percentile']

const PRICE = (p) => (p ? `${fmtOdds(p.odds)}${p.book ? ` at ${p.book}` : ''}${p.implied != null ? ` (implies ${p.implied}%)` : ''}` : null)

// BASEBALL (2026-10-05): the per-game CALL post, long -- lib/writeups/mlb.js's JSON.
const MLB_TEMPLATE = ['THE CALL', 'THE GAME', 'WHY', 'WATCH OUT', 'BOTTOM LINE', 'HR', 'HRR', 'HIT', 'CONTACT', 'TOP', 'ISO', 'RBI',
  'ET', 'AM', 'PM', 'Open', 'Closed', 'Roof', 'Locked', 'Graded', 'Bats', 'Score', 'of', '°F', 'mph']

function mlbFact(w) {
  const vals = []
  const take = (ln) => { if (ln) vals.push(...(ln.v || [])) }
  w.game.forEach(take)
  w.players.forEach((p) => { p.why.forEach(take); p.watch.forEach(take) })
  return {
    names: [w.away, w.home, w.when, ...w.game.map((g) => g.t), ...w.bottom.map((b) => b.t),
      ...w.players.flatMap((p) => [p.name, p.team, p.opp, p.role, p.status_word, p.bar, p.arm, p.scoreName]),
      ...w.noCall.flatMap((n) => [n.name, n.team, n.status_word])].filter(Boolean),
    values: [...vals, ...w.players.flatMap((p) => [p.score, p.rank, p.of, p.spot]), ...w.noCall.flatMap((n) => [n.rank, n.of])].filter((x) => x != null),
    template: MLB_TEMPLATE,
  }
}
function mlbBlock(p) {
  const out = [`${p.name.toUpperCase()} · ${p.team} · ${p.status_word}${p.role === 'TOP' ? ' (TOP)' : ''} — ${p.bar}`,
    [p.score != null ? `${p.scoreName} ${p.score}` : null, p.rank != null && p.of ? `#${p.rank} of ${p.of} on the board` : null, p.spot ? `bats ${p.spot}` : null].filter(Boolean).join(' · ')]
  if (p.why.length) out.push('WHY', ...p.why.map((l) => `· ${l.t}`))
  if (p.watch.length) out.push('WATCH OUT', ...p.watch.map((l) => `· ${l.t}`))
  return out.filter(Boolean).join('\n')
}
function mlbFull(w) {
  const head = [`⚾ THE CALL · ${w.away} vs ${w.home}${w.when ? ` · ${w.when}` : ''}`, w.header.t]
  const game = w.game.length ? ['THE GAME', ...w.game.map((l) => l.t)].join('\n') : null
  const bottom = ['BOTTOM LINE', ...w.bottom.map((l) => l.t)].join('\n')
  return [head.join('\n'), game, ...w.players.map(mlbBlock), bottom].filter(Boolean).join('\n\n')
}
// X when both players don't fit: the headliner's whole block and the bottom line
function mlbMid(w) {
  const head = [`⚾ THE CALL · ${w.away} vs ${w.home}${w.when ? ` · ${w.when}` : ''}`]
  const bottom = ['BOTTOM LINE', ...w.bottom.map((l) => l.t)].join('\n')
  return [head.join('\n'), mlbBlock(w.players[0]), bottom].join('\n\n')
}
// the 280 version (the old CALL post's shape); the problem line goes first if it doesn't fit
function mlbShort(w) {
  const p = w.players[0]
  const build = (withProblem) => [`⚾ THE CALL · ${w.away} vs ${w.home}${w.when ? ` · ${w.when}` : ''}`, '', `${p.name.toUpperCase()} — ${p.bar}`,
    p.why[0] ? `The case: ${p.why[0].t}.` : null, withProblem && p.watch[0] ? `The problem: ${p.watch[0].t}.` : null]
    .filter((x) => x !== null).join('\n')
  const room = 280 - w.footer.length - 2
  return build(true).length <= room ? build(true) : build(false)
}

// HOCKEY (2026-10-05): LAMP's two calls a game -- lib/writeups/nhl.js's JSON.
const NHL_TEMPLATE = ['THE CALL', 'LAMP', 'THE GAME', 'WHY', 'WATCH OUT', 'BOTTOM LINE', 'TOP', 'GOAL', 'C', 'LW', 'RW', 'D',
  'ET', 'AM', 'PM', 'NHL', 'Poisson', 'LAMP score', 'of']
function nhlFact(w) {
  const vals = []
  const take = (ln) => { if (ln) vals.push(...(ln.v || [])) }
  w.game.forEach(take)
  w.players.forEach((p) => { p.why.forEach(take); p.watch.forEach(take) })
  return {
    names: [w.away, w.home, w.when, ...w.game.map((g) => g.t), ...w.bottom.map((b) => b.t),
      ...w.players.flatMap((p) => [p.name, p.team, p.opp, p.position, p.role, p.status_word, ...p.why.flatMap((l) => l.names || [])]),   // a goalie named in a WHY line (the weak-spot sentence)
      ...w.noCall.flatMap((n) => [n.name, n.team, n.status_word])].filter(Boolean),
    values: [...vals, ...w.players.flatMap((p) => [p.score, p.rank, p.of, p.band?.n])].filter((x) => x != null),
    template: NHL_TEMPLATE,
  }
}
function nhlBlock(p) {
  const out = [`${p.name.toUpperCase()} · ${p.team} ${p.position} · ${p.status_word}${p.role === 'TOP' ? ' (TOP)' : ''}`,
    [p.score != null ? `LAMP score ${p.score}` : null, p.rank != null && p.of ? `#${p.rank} of ${p.of} tonight${p.band ? ` (${p.band.word})` : ''}` : null].filter(Boolean).join(' · ')]
  if (p.why.length) out.push('WHY', ...p.why.map((l) => `· ${l.t}`))
  if (p.watch.length) out.push('WATCH OUT', ...p.watch.map((l) => `· ${l.t}`))
  return out.filter(Boolean).join('\n')
}
const nhlHead = (w) => `🚨 THE CALL · ${w.away} @ ${w.home}${w.when ? ` · ${w.when}` : ''}`
function nhlFull(w) {
  const game = w.game.length ? ['THE GAME', ...w.game.map((l) => l.t)].join('\n') : null
  return [[nhlHead(w), w.header.t].join('\n'), game, ...w.players.map(nhlBlock), ['BOTTOM LINE', ...w.bottom.map((l) => l.t)].join('\n')].filter(Boolean).join('\n\n')
}
const nhlMid = (w) => (w.players[0] ? [nhlHead(w), nhlBlock(w.players[0]), ['BOTTOM LINE', ...w.bottom.map((l) => l.t)].join('\n')].join('\n\n') : null)
function nhlShort(w) {
  const rows = w.players.map((p) => `${p.name} (${p.team} ${p.position}) · ${p.status_word}${p.role === 'TOP' ? ' (TOP)' : ''}${p.score != null ? ` · LAMP score ${p.score}` : ''}`)
  const nc = w.noCall.map((n) => (n.name ? `${n.team}: ${n.name} is ${n.status_word}` : `${n.team}: no call`))
  return [nhlHead(w), ...rows, ...nc].join('\n')
}

// the sports with their own words (NFL is the default below, unchanged)
const SPORT_TEXT = { mlb: { fact: mlbFact, full: mlbFull, short: mlbShort, mid: mlbMid }, nhl: { fact: nhlFact, full: nhlFull, short: nhlShort, mid: nhlMid },
  // BASKETBALL (2026-10-09): BUCKETS' double-double / triple-double calls -- lib/writeups/nba.js's JSON
  nba: { fact: nbaFact, full: nbaFull, short: nbaShort, mid: nbaMid } }

/** What the checker may draw on: names, values and template words from the JSON. */
export function factOf(w) {
  if (SPORT_TEXT[w.sport]) return SPORT_TEXT[w.sport].fact(w)
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
  if (SPORT_TEXT[w.sport]) return SPORT_TEXT[w.sport].full(w)
  const head = [`🏈 THE CALL · ${w.away} @ ${w.home} · ${w.when}`, w.header.t]
  const game = w.game.length ? ['THE GAME', ...w.game.map((l) => l.t)].join('\n') : null
  const blocks = w.players.map(playerBlock)
  const bottom = ['BOTTOM LINE', ...w.bottom.map((l) => l.t)].join('\n')
  return [head.join('\n'), game, ...blocks, bottom].filter(Boolean).join('\n\n')
}

/** The 280-character X version: who, the status, the score -- the images carry the rest. */
export function shortBody(w) {
  if (SPORT_TEXT[w.sport]) return SPORT_TEXT[w.sport].short(w)
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
  // MLB's middle length: the headliner whole (checked like the rest)
  const mid = SPORT_TEXT[w.sport]?.mid?.(w) ?? null
  if (mid) { const c = checkDraft(mid, fact, { limit: 4000 }); if (!c.ok) why.push(...c.why.map((x) => `mid: ${x}`)) }
  const midFits = !longFits && mid != null && mid.length + 2 + w.footer.length <= xLimit
  return {
    ok: why.length === 0,
    full: `${full}\n\n${w.footer}`,
    x: `${longFits ? full : midFits ? mid : short}\n\n${w.footer}`,
    xIsLong: longFits || midFits,
    short: `${short}\n\n${w.footer}`,
    why,
  }
}

/**
 * renderWriteup, with the MLB path's fallback: when the LONG text fails the checker but the short
 * text alone passes, post the short text (site, Discord and X) instead of nothing. Never an unchecked
 * long post. { ...renderWriteup, fellBack: true, longWhy } in that case; a short that fails too stays not ok.
 */
export function renderWriteupSafe(w, opts = {}) {
  const r = renderWriteup(w, opts)
  if (r.ok) return { ...r, fellBack: false }
  const fact = factOf(w)
  const short = shortBody(w)
  if (!checkDraft(short, fact, { limit: 280 - w.footer.length - 2 }).ok) return { ...r, fellBack: false }
  return { ...r, ok: true, fellBack: true, longWhy: r.why, why: [], full: r.short, x: r.short, xIsLong: false }
}
