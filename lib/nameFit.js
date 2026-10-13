// THE NAME THAT FITS (2026-10-13, PLAYER-ROWS). Pure functions, no DOM, so plain node can test them
// (scripts/check-player-cell.mjs) with a fake measure; components/table/PlayerNameCell.js hands in the real one.
//
// A player's name in a table cell is never cut off. It steps down until it fits:
//   1. the whole name on one line at the first size, then at each smaller size (never below `floor`)
//   2. the whole name on TWO lines at the smallest size (each word must fit its line)
//   3. initial + surname ("K. Walker III") on one line, then on two
//   4. the surname alone, allowed to break anywhere on two lines (a last resort: "Gilgeous-Alexander" in a narrow cell)
// The result says which step won, so a test can assert it and the cell can set `title` when the shown text is shorter.
//
// A cell's second line of chips is planned the same way (planChips): chips are dropped lowest-priority first, never
// wrapped, until the line fits; the first chip (priority 0) is never dropped.

const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i

/** "Kenneth Walker III" -> "Walker III"; "Connor McDavid" -> "McDavid"; one word stays. */
export function surnameOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length < 2) return parts[0] || ''
  return SUFFIX.test(parts[parts.length - 1]) && parts.length > 2 ? parts.slice(-2).join(' ') : parts[parts.length - 1]
}

/** "Kenneth Walker III" -> "K. Walker III". */
export function initialSurname(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length < 2) return parts[0] || ''
  return `${parts[0][0].toUpperCase()}. ${surnameOf(name)}`
}

/** An estimate for a server render or a test with no measure: a proportional sans averages ~0.56em a character. */
export const estimateWidth = (text, px) => String(text).length * px * 0.56

/** Greedy word wrap with a measure; null when a single word is wider than the line. */
export function wrapWords(text, room, px, measure, weight = 600) {
  const words = String(text).split(/\s+/).filter(Boolean)
  const lines = []
  let cur = ''
  for (const w of words) {
    if (measure(w, px, weight) > room) return null
    const next = cur ? `${cur} ${w}` : w
    if (!cur || measure(next, px, weight) <= room) cur = next
    else { lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  return lines
}

/**
 * @param {string} name
 * @param {{ room: number, measure?: (text:string, px:number, weight?:number)=>number, sizes?: number[], maxLines?: number, weight?: number }} o
 * @returns {{ text: string, size: number, lines: number, mode: 'full'|'small'|'two'|'initial'|'initial-two'|'surname', shortened: boolean }}
 */
export function fitName(name, { room, measure = (t, px) => estimateWidth(t, px), sizes = [12.5, 11.5], maxLines = 2, weight = 600 } = {}) {
  const full = String(name || '').trim()
  const small = sizes[sizes.length - 1]
  if (!full) return { text: '', size: sizes[0], lines: 1, mode: 'full', shortened: false }
  for (let i = 0; i < sizes.length; i += 1) {
    if (measure(full, sizes[i], weight) <= room) return { text: full, size: sizes[i], lines: 1, mode: i === 0 ? 'full' : 'small', shortened: false }
  }
  if (maxLines >= 2) {
    const two = wrapWords(full, room, small, measure, weight)
    if (two && two.length <= 2) return { text: full, size: small, lines: two.length, mode: 'two', shortened: false }
  }
  const ini = initialSurname(full)
  if (measure(ini, small, weight) <= room) return { text: ini, size: small, lines: 1, mode: 'initial', shortened: true }
  if (maxLines >= 2) {
    const two = wrapWords(ini, room, small, measure, weight)
    if (two && two.length <= 2) return { text: ini, size: small, lines: two.length, mode: 'initial-two', shortened: true }
  }
  return { text: surnameOf(full), size: small, lines: maxLines >= 2 ? 2 : 1, mode: 'surname', shortened: true }
}

/**
 * Which chips of a one-line chip row survive `room` px.
 * @param {{ key: string, w: number, prio: number }[]} chips in display order; a LOWER prio is kept longer; w is the chip's width
 * @returns {Set<string>} the keys to draw
 */
export function planChips(chips, room, gap = 5) {
  const live = chips.slice()
  const width = (list) => list.reduce((s, c) => s + c.w, 0) + Math.max(0, list.length - 1) * gap
  while (live.length > 1 && width(live) > room) {
    let worst = 0
    live.forEach((c, i) => { if (c.prio >= live[worst].prio) worst = i })
    if (live[worst].prio === 0) break
    live.splice(worst, 1)
  }
  return new Set(live.map((c) => c.key))
}

/** "EDM@LAK" seen from LAK's side: "EDM" is the opponent, away. Returns { opp, away } or null when the string is not a game or the club is neither side. */
export function oppFromGame(game, team) {
  const m = /^([A-Z]{2,4})\s*@\s*([A-Z]{2,4})$/.exec(String(game || '').trim())
  if (!m || !team) return null
  if (m[1] === team) return { opp: m[2], away: true }
  if (m[2] === team) return { opp: m[1], away: false }
  return null
}

/**
 * The opponent as a chip reads it: "@ UTA" (he is away) or "vs BOS" (he is home). `home` is what the row knows
 * (true / false / undefined): an "@BUF" is away whatever the row says, and a bare "BUF" is told apart only when
 * the row knows its side; with no side it stays a bare code (never a guessed "vs").
 */
export function oppWords(value, home) {
  const v = String(value ?? '').trim()
  if (!v || v === '—') return ''
  const at = /^@\s*([A-Z]{2,4})$/.exec(v)
  if (at) return `@ ${at[1]}`
  if (/^[A-Z]{2,4}$/.test(v)) return home === true ? `vs ${v}` : home === false ? `@ ${v}` : v
  return v
}
