// THE ONE LAYOUT of every per-game write-up (Donovan, 2026-10-17: "hard to read and understand"). Hockey, baseball,
// football and basketball render through these helpers, so the site's game page, Discord (#members / the featured
// room) and the X post read the same way:
//
//   headline (emoji, matchup, time)
//   ONE plain sentence: what this is, and who
//   the game: venue, then ONE line per stat ("Power play: PIT 16.7% · COL 20.0%")
//   each player: NAME · TEAM · POSITION / the status word and whose call / the score line
//   Why: bullets, number first, the unit spelled out ("4.4 shots a game (top 1% tonight)")
//   Watch out: a sentence
//   BOTTOM LINE: one or two short sentences
//
// Plain text only (X renders it raw): caps and emoji, no markdown. Blocks are separated by one blank line and no block
// is longer than 4 lines (scripts/check-post-layout.mjs). Pure: nothing here adds a claim or a number.

/** Blocks joined by one blank line; an empty block is dropped. */
export const blocks = (parts) => parts.map((b) => (Array.isArray(b) ? b.filter(Boolean).join('\n') : b)).filter(Boolean).join('\n\n')

export const cap = (s) => { const t = String(s ?? '').trim(); return t.charAt(0).toUpperCase() + t.slice(1) }

/** A percentile p (higher = better) as "top N%", N = 100 - p, held to 1..99 (a "top 0%" reads as a typo). Returns the number N. */
export { topPercentile as topPct } from '../format'

/** "one", "two" ... for a count of players. */
export const countWord = (n) => ['no', 'one', 'two', 'three', 'four'][n] ?? String(n)

/** "A", "A and B", "A, B and C". */
export const nameList = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)

/** The words of a builder line with its digits taken out: what the checker may see as the line's words. The numbers stay guarded by `v`. */
export const lineWords = (l) => String(l?.t ?? '').replace(/\d+(?:\.\d+)?/g, ' ')

/** Every why/watch line's words of every player, for the checker's name list. */
export const playerLineWords = (players) => players.flatMap((p) => [...(p.why || []), ...(p.watch || [])].map(lineWords))

/** "NAME · TEAM · POSITION" (the position is left out when there is none). */
export const nameLine = (p) => [String(p.name).toUpperCase(), p.team, p.position].filter(Boolean).join(' · ')

/** "the game's top call" or "PIT's call". */
export const whoseCall = (p) => (p.role === 'TOP' ? 'the game\'s top call' : `${p.team}'s call`)

/** The status word on its own line: "CALLED · the game's top call". */
export const statusLine = (p, what = null) => `${p.status_word}${what ? ` ${what}` : ''} · ${whoseCall(p)}`

/** "Why:" and its bullets (the number first in each line). */
export const whyBlock = (lines) => (lines?.length ? ['Why:', ...lines.map((l) => `• ${cap(l.t)}`)] : null)

/** "Watch out: a sentence." for one line; the label and bullets for two. */
export function watchBlock(lines) {
  if (!lines?.length) return null
  if (lines.length === 1) return [`Watch out: ${cap(lines[0].t)}.`]
  return ['Watch out:', ...lines.map((l) => `• ${cap(l.t)}`)]
}

/** The game block: the venue gets a pin, every other line stands as written. */
export const gameBlock = (w) => (w.game?.length ? w.game.map((l, i) => (i === 0 && /venue/.test(l.src || '') ? `📍 ${l.t}` : l.t)) : null)

export const bottomBlock = (w) => ['BOTTOM LINE', ...w.bottom.map((l) => l.t)]
