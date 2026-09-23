// DISCORD-SIZED COPY (2026-09-23).
//
// Donovan: the watchlist "Copy List" text was too long to paste into one
// Discord message. Discord refuses anything over 2000 characters, and the
// old MOONSHOT line ran ~60 characters a player (role word, opponent, bot
// tag), so a list of ~35 was already over.
//
// Two things fix it: the lines themselves are shorter (callers decide what
// a line says), and a list that still will not fit is split into parts,
// each a complete message with its own "1/2" in the header. The limit is
// 1900, not 2000 -- headroom for the header and for anyone who adds a word
// before sending.
export const DISCORD_LIMIT = 1900

const len = (s) => [...s].length   // count what Discord counts: characters, not UTF-16 units

/**
 * Split lines into Discord-sized messages.
 * @param {string} title   first line of every part, e.g. "**MOONSHOT watchlist · 9/23**"
 * @param {string[]} lines one entry per player
 * @param {string} [footer] last line of the LAST part only (a legend, say)
 * @returns {string[]} one or more messages, each <= DISCORD_LIMIT characters
 */
export function discordParts(title, lines, footer = '', limit = DISCORD_LIMIT) {
  const room = limit - len(title) - 12          // " (10/10)" plus the blank line
  const chunks = [[]]
  let used = 0
  for (const line of lines) {
    const cost = len(line) + 1
    if (chunks[chunks.length - 1].length && used + cost > room) { chunks.push([]); used = 0 }
    chunks[chunks.length - 1].push(line)
    used += cost
  }
  // The footer rides on the last part only if it fits; otherwise it is dropped
  // rather than spilling into a part of its own.
  const lastUsed = chunks[chunks.length - 1].reduce((n, l) => n + len(l) + 1, 0)
  const withFooter = footer && lastUsed + len(footer) + 2 <= room
  return chunks.map((chunk, i) => {
    const head = chunks.length > 1 ? `${title} (${i + 1}/${chunks.length})` : title
    const tail = withFooter && i === chunks.length - 1 ? ['', footer] : []
    return [head, '', ...chunk, ...tail].join('\n')
  })
}
