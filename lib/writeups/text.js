// THE WRITE-UP'S WORDS (BATCH-GAME-WRITEUP). The reference post is the
// template (x.com/CalledItHR/status/2106900494576701695): header, the game,
// each player's case + watch-out + price, the bottom line, the footer. Site,
// Discord and X all render from the same JSON (build.js), so they can't drift.
//
// THE CHECK is the fact engine's (lib/facts/check.js checkDraft), not a second
// one: every number in the body must be a value the JSON carries, every
// capitalised word a name or a template word in it, no superlatives, no
// betting words. The fixed footer is appended after the check: the whole of it on
// the site and Discord, only its receipt line on X (2026-10-20).
import { checkDraft } from '../facts/check'
import { fmtOdds } from '../nfl/oddsMatch'
import { bookName } from '../odds/shop'   // "draftkings" -> "DraftKings" (2026-10-26)
import { nbaFact, nbaFull, nbaShort, nbaHead, nbaBlock } from './nbaText'
import { callVoice, withVoice, VOICE_WORDS } from './voice'
import { blocks, cap, nameLine, statusLine, whyBlock, watchBlock, gameBlock, bottomBlock, playerLineWords } from './layout'

// The template's own words -- labels, not claims. No numbers here: every
// number in a post is a value the JSON carries.
const TEMPLATE = ['THE CALL', 'TUDDY', 'Why', 'Watch out', 'Price', 'BOTTOM LINE', 'Score', 'TD', 'TOP', 'RB', 'WR', 'TE',
  'QB', 'ET', 'AM', 'PM', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'of', '°F', 'players', 'top']

// LAYOUT: lib/writeups/layout.js (Donovan, 2026-10-16 no solid stacks; 2026-10-17 one plain layout for all four sports).
/**
 * The 280-character short version's frame: label, a blank line, the rows, then `extra` (one more block: the headliner's
 * case) when it fits. `room` = the characters left. The extra goes first, then the blank under the label; a row never.
 */
const shortFrame = (headLine, rows, room, extra = null) => {
  const tries = [extra ? [headLine, '', ...rows, '', extra] : null, [headLine, '', ...rows], [headLine, ...rows]].filter(Boolean).map((a) => a.join('\n'))
  return tries.find((t) => t.length <= room) ?? tries[tries.length - 1]
}
/** "The case for D'Andre Swift: 4.8 red-zone touches a game." -- the headliner's first Why line (its numbers are the JSON's). */
export const caseLine = (p) => (p?.why?.[0]?.t ? `The case for ${p.name}: ${String(p.why[0].t).replace(/[.]$/, '')}.` : null)

/** What a 280 version may run: 280, less its footer (Discord's whole footer; on X only the receipt line, 2026-10-20). */
export const shortRoom = (w) => 280 - (w.footer ? w.footer.length + 2 : 0)

const PRICE = (p) => (p ? `${fmtOdds(p.odds)}${p.book ? ` at ${bookName(p.book)}` : ''}${p.implied != null ? ` (implies ${p.implied}%)` : ''}` : null)

// BASEBALL (2026-10-05): the per-game CALL post, long -- lib/writeups/mlb.js's JSON.
const MLB_TEMPLATE = ['THE CALL', 'Why', 'Watch out', 'BOTTOM LINE', 'HR', 'HRR', 'HIT', 'CONTACT', 'TOP', 'ISO', 'RBI',
  'ET', 'AM', 'PM', 'Open', 'Closed', 'Roof', 'Locked', 'Graded', 'Bats', 'Score', 'of', '°F', 'mph', 'players', 'top']

function mlbFact(w) {
  const vals = []
  const take = (ln) => { if (ln) vals.push(...(ln.v || [])) }
  w.game.forEach(take)
  w.players.forEach((p) => { p.why.forEach(take); p.watch.forEach(take) })
  return {
    names: [w.away, w.home, w.when, ...w.game.map((g) => g.t), ...w.bottom.map((b) => b.t),
      ...w.players.flatMap((p) => [p.name, p.team, p.opp, p.role, p.status_word, p.bar, p.arm, p.scoreName]), ...playerLineWords(w.players),
      ...w.noCall.flatMap((n) => [n.name, n.team, n.status_word])].filter(Boolean),
    values: [...vals, ...w.players.flatMap((p) => [p.score, p.rank, p.of, p.spot]), ...w.noCall.flatMap((n) => [n.rank, n.of])].filter((x) => x != null),
    template: MLB_TEMPLATE,
  }
}
function mlbBlock(p) {
  return blocks([
    [nameLine(p), statusLine(p, p.bar ? `for ${p.bar}` : null),
      cap([p.score != null ? `${p.scoreName} ${p.score}` : null, p.rank != null && p.of ? `#${p.rank} of ${p.of} players on the board` : null, p.spot ? `bats ${p.spot}` : null].filter(Boolean).join(' · '))].filter(Boolean),
    whyBlock(p.why),
    watchBlock(p.watch),
  ])
}
const mlbHead = (w) => `⚾ THE CALL · ${w.away} vs ${w.home}${w.when ? ` · ${w.when}` : ''}`
function mlbFull(w) {
  return blocks([mlbHead(w), w.header.t, gameBlock(w), ...w.players.map(mlbBlock), bottomBlock(w)])
}
// the 280 version (the old CALL post's shape); the problem line goes first if it doesn't fit
function mlbShort(w) {
  const p = w.players[0]
  const build = (withProblem) => [mlbHead(w), '', `${p.name.toUpperCase()} — ${p.bar}`,
    p.why[0] ? `The case: ${p.why[0].t}.` : null, withProblem && p.watch[0] ? `The problem: ${p.watch[0].t}.` : null]
    .filter((x) => x !== null).join('\n')
  const room = shortRoom(w)
  return build(true).length <= room ? build(true) : build(false)
}

// HOCKEY (2026-10-05): LAMP's two calls a game -- lib/writeups/nhl.js's JSON.
const NHL_TEMPLATE = ['THE CALL', 'LAMP', 'Why', 'Watch out', 'Power play', 'Penalty kill', 'BOTTOM LINE', 'TOP', 'GOAL', 'C', 'LW', 'RW', 'D',
  'ET', 'AM', 'PM', 'NHL', 'Poisson', 'LAMP score', 'of', 'players', 'top']
function nhlFact(w) {
  const vals = []
  const take = (ln) => { if (ln) vals.push(...(ln.v || [])) }
  w.game.forEach(take)
  w.players.forEach((p) => { p.why.forEach(take); p.watch.forEach(take) })
  return {
    names: [w.away, w.home, w.when, ...w.game.map((g) => g.t), ...w.bottom.map((b) => b.t),
      ...w.players.flatMap((p) => [p.name, p.team, p.opp, p.position, p.role, p.status_word, ...p.why.flatMap((l) => l.names || [])]),   // a goalie named in a WHY line (the weak-spot sentence)
      ...playerLineWords(w.players),
      ...w.noCall.flatMap((n) => [n.name, n.team, n.status_word])].filter(Boolean),
    values: [...vals, ...w.players.flatMap((p) => [p.score, p.rank, p.of, p.band?.n])].filter((x) => x != null),
    template: NHL_TEMPLATE,
  }
}
function nhlBlock(p) {
  return blocks([
    [nameLine(p), statusLine(p),
      [p.score != null ? `LAMP score ${p.score}` : null, p.rank != null && p.of ? `#${p.rank} of ${p.of} players tonight${p.band ? ` (${p.band.word})` : ''}` : null].filter(Boolean).join(' · ')].filter(Boolean),
    whyBlock(p.why),
    watchBlock(p.watch),
  ])
}
const nhlHead = (w) => `🚨 THE CALL · ${w.away} @ ${w.home}${w.when ? ` · ${w.when}` : ''}`
function nhlFull(w) {
  return blocks([nhlHead(w), w.header.t, gameBlock(w), ...w.players.map(nhlBlock), bottomBlock(w)])
}
function nhlShort(w) {
  const rows = w.players.map((p) => `${p.name} (${p.team} ${p.position}) · ${p.status_word}${p.role === 'TOP' ? ' (TOP)' : ''}${p.score != null ? ` · LAMP score ${p.score}` : ''}`)
  const nc = w.noCall.map((n) => (n.name ? `${n.team}: ${n.name} is ${n.status_word}` : `${n.team}: no call`))
  return shortFrame(nhlHead(w), [...rows, ...nc], shortRoom(w), caseLine(w.players[0]))
}

// the sports with their own words (NFL is the default below, unchanged)
const SPORT_TEXT = { mlb: { fact: mlbFact, full: mlbFull, short: mlbShort, head: mlbHead, block: mlbBlock }, nhl: { fact: nhlFact, full: nhlFull, short: nhlShort, head: nhlHead, block: nhlBlock },
  // BASKETBALL (2026-10-09): BUCKETS' double-double / triple-double calls -- lib/writeups/nba.js's JSON
  nba: { fact: nbaFact, full: nbaFull, short: nbaShort, head: nbaHead, block: nbaBlock } }

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
      ...w.players.flatMap((p) => [`${p.position}s`, ...p.why.flatMap((l) => l.names || []), ...p.watch.flatMap((l) => l.names || [])]), ...playerLineWords(w.players)].filter(Boolean),
    values: [...vals, ...w.players.flatMap((p) => [p.tdScore, p.rank, p.of, p.posRank, p.posOf, p.price?.implied, p.price ? fmtOdds(p.price.odds) : null]),
      ...w.noCall.flatMap((n) => [n.rank, n.of])].filter((x) => x != null),
    template: TEMPLATE,
  }
}

function playerBlock(p, { x = false } = {}) {
  const pr = PRICE(p.price)
  // X (2026-10-20): the price joins the player's top block, without the implied % (his watch-out already says it), and the
  // score line is the short one (no position rank), so a phone shows each player as one tidy block
  if (x) {
    return blocks([
      [nameLine(p), statusLine(p), `TD score ${p.tdScore} (grade ${p.grade}) · #${p.rank} of ${p.of} on the TD board`,
        p.price ? `Price: ${fmtOdds(p.price.odds)}${p.price.book ? ` at ${bookName(p.price.book)}` : ''}` : null],
      whyBlock(p.why),
      watchBlock(p.watch),
    ])
  }
  return blocks([
    [nameLine(p), statusLine(p),
      `TD score ${p.tdScore} (grade ${p.grade}) · #${p.rank} of ${p.of} players on the TD board${p.posRank ? ` · #${p.posRank} of ${p.posOf} ${p.position}s` : ''}`],
    whyBlock(p.why),
    watchBlock(p.watch),
    pr ? `Price: ${pr}` : null,
  ])
}

const nflHead = (w) => `🏈 THE CALL · ${w.away} @ ${w.home} · ${w.when}`

/**
 * THE X POST (Donovan, 2026-10-20: "we pay for x and pay for the post, i want the tweet to look visually good"). The account has
 * the long-post allowance (X_TEXT_LIMIT, 900), but the Discord write-up (~1,100-1,400 characters) never fits it, and NFL had no
 * middle length: every Call went out as the cramped 280 version. This is the X layout, every sport, in the room the post has:
 *   headline / the hook / each called player (name, status, score; his top two reasons; his watch-out; his price) / the ask /
 *   the receipt line
 * No venue block, no header sentence (the hook does that job), no bottom line (it repeats the status lines).
 * `level`: 0 = every player with his watch-out, 1 = every player without it, 2 = the headliner alone (with it).
 */
export function xBody(w, level = 0) {
  const t = SPORT_TEXT[w.sport]
  const head = t?.head || nflHead
  const block = t?.block || playerBlock
  const trim = (p) => ({ ...p, why: (p.why || []).slice(0, 2), watch: level === 1 ? [] : (p.watch || []).slice(0, 1) })
  const players = level === 2 ? w.players.slice(0, 1) : w.players
  return players.length ? blocks([head(w), ...players.map((p) => block(trim(p), { x: true }))]) : null
}

/** The full write-up body (site + Discord + a long X post), without the footer. */
export function fullBody(w) {
  if (SPORT_TEXT[w.sport]) return SPORT_TEXT[w.sport].full(w)
  return blocks([nflHead(w), w.header.t, gameBlock(w), ...w.players.map(playerBlock), bottomBlock(w)])
}

/** The 280-character X version: who, the status, the score -- the images carry the rest. */
export function shortBody(w) {
  if (SPORT_TEXT[w.sport]) return SPORT_TEXT[w.sport].short(w)
  const rows = w.players.map((p) => `${p.name} (${p.team} ${p.position}) · ${p.status_word}${p.role === 'TOP' ? ' (TOP)' : ''} · ${p.tdScore} ${p.grade} · #${p.rank} of ${p.of}`)
  const nc = w.noCall.map((n) => (n.name ? `${n.team}: ${n.name} is ${n.status_word}` : `${n.team}: no call`))
  return shortFrame(nflHead(w), [...rows, ...nc], shortRoom(w), caseLine(w.players[0]))
}

/**
 * Render + check. Returns { ok, full, x, short, why[] }:
 *   full  -- body + footer (site, Discord)
 *   x     -- the X layout (xBody) at the most `xLimit` allows, else the 280 version; + the receipt line, not the whole footer
 * A body that fails the check is never returned as ok; `why` says what failed.
 */
export function renderWriteup(w, { xLimit = 280 } = {}) {
  const fact = voicedFact(w)
  const voice = callVoice(w)
  // the voice (lib/writeups/voice.js): a hook under the headline, a question to the network last; the 280 one sheds them to fit
  const full = withVoice(fullBody(w), voice)
  const short = voicedShort(w)
  // X (Donovan, 2026-10-20: "that line doesn't always have to be there .. keep spreading good and helpful information"; then
  // "dont all sports do that too" for the receipt): the X post ends on the receipt line ("Locked before kickoff. Graded against
  // exactly that.") without "Not betting advice"; the room that frees goes to the headliner's case. Discord keeps the footer.
  const receipt = w.receipt || ''
  const xShort = voicedShort({ ...w, footer: receipt })
  const tail = (body) => (receipt ? `${body}\n\n${receipt}` : body)
  const why = []
  const cFull = checkDraft(full, fact, { limit: 4000 })
  if (!cFull.ok) why.push(...cFull.why.map((x) => `full: ${x}`))
  const cShort = checkDraft(short, fact, { limit: shortRoom(w) })
  if (!cShort.ok) why.push(...cShort.why.map((x) => `short: ${x}`))
  const cX = checkDraft(xShort, fact, { limit: shortRoom({ footer: receipt }) })
  if (!cX.ok) why.push(...cX.why.map((x) => `x short: ${x}`))
  // X: the X layout at the most it can carry, then the headliner alone, then the 280 version. Not the Discord text: it
  // carries the venue, the header sentence and the bottom line, which read as filler in a feed.
  const xs = [0, 1, 2].map((lv) => withVoice(xBody(w, lv), voice)).filter(Boolean)
  const xLong = xs.find((v) => tail(v).length <= xLimit) ?? null
  if (xLong) { const c = checkDraft(xLong, fact, { limit: 4000 }); if (!c.ok) why.push(...c.why.map((x) => `x: ${x}`)) }
  return {
    ok: why.length === 0,
    full: `${full}\n\n${w.footer}`,
    x: tail(xLong ?? xShort),
    xIsLong: xLong != null,
    short: `${short}\n\n${w.footer}`,
    xShort,
    why,
  }
}

/** factOf plus the voice lines: they are fixed template words, so the checker may see them (they carry no number). */
const voicedFact = (w) => { const f = factOf(w); return { ...f, template: [...(f.template || []), ...VOICE_WORDS] } }
const voicedShort = (w) => withVoice(shortBody(w), callVoice(w), shortRoom(w))

/**
 * renderWriteup, with the MLB path's fallback: when the LONG text fails the checker but the short
 * text alone passes, post the short text (site, Discord and X) instead of nothing. Never an unchecked
 * long post. { ...renderWriteup, fellBack: true, longWhy } in that case (the short drops the headliner's case line if that is what
 * fails); a short that fails both ways stays not ok. Discord gets the short with its footer, X without.
 */
export function renderWriteupSafe(w, opts = {}) {
  const r = renderWriteup(w, opts)
  if (r.ok) return { ...r, fellBack: false }
  const fact = voicedFact(w)
  // the short as it is, then without the headliner's case line (a line the checker rejected in the long text may be that one)
  const bare = { ...w, players: w.players.map((p, i) => (i === 0 ? { ...p, why: [] } : p)) }
  for (const v of [w, bare]) {
    const short = voicedShort(v)
    const receipt = v.receipt || ''
    const xShort = voicedShort({ ...v, footer: receipt })
    if (checkDraft(short, fact, { limit: shortRoom(v) }).ok && checkDraft(xShort, fact, { limit: shortRoom({ footer: receipt }) }).ok) {
      return { ...r, ok: true, fellBack: true, longWhy: r.why, why: [], full: `${short}\n\n${w.footer}`, x: receipt ? `${xShort}\n\n${receipt}` : xShort, xIsLong: false }
    }
  }
  return { ...r, fellBack: false }
}
