// 🔢 GEMATRIA AND LETTERS (2026-09-27, BATCH-NUMEROLOGY steps 2-3).
//
// The standard ciphers, as gematrinator uses them, over LETTERS ONLY:
// spaces, hyphens, periods, apostrophes and accents stripped, generational
// suffixes dropped ("Jr.", "Sr.", "II", "III", "IV", "V") -- so
// "Pete Crow-Armstrong" is PETE + CROWARMSTRONG.
//   ordinal          A=1 ... Z=26
//   fullReduction    A=1 ... I=9, J=1 ... R=9, S=1 ... Z=8
//   reverseOrdinal   Z=1 ... A=26
//   reverseReduction Z=1 ... A=8
//   sumerian         ordinal x 6 (off by default; shown only when asked)
// Pure; nothing here feeds a score, a board or a rank.
import { digitRoot } from './core'

const SUFFIX = new Set(['JR', 'SR', 'II', 'III', 'IV', 'V'])
const fold = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase()

/** A name's words, letters only, suffixes dropped: "Vladimir Guerrero Jr." -> ['VLADIMIR', 'GUERRERO']. */
export function nameWords(name) {
  const words = fold(name).split(/\s+/).map((w) => w.replace(/[^A-Z]/g, '')).filter(Boolean)
  while (words.length > 1 && SUFFIX.has(words.at(-1))) words.pop()
  return words
}

/** { full, first, last } as letter strings; first = the first word, last = everything after it. */
export function nameParts(name) {
  const w = nameWords(name)
  if (!w.length) return null
  return { full: w.join(''), first: w[0], last: w.length > 1 ? w.slice(1).join('') : '' }
}

const ord = (ch) => ch.charCodeAt(0) - 64                       // A=1 .. Z=26
const red = (n) => digitRoot(n)                                 // 1..9 cycle
export const CIPHERS = {
  ordinal: { label: 'English Ordinal', of: (ch) => ord(ch) },
  fullReduction: { label: 'Full Reduction', of: (ch) => red(ord(ch)) },
  reverseOrdinal: { label: 'Reverse Ordinal', of: (ch) => 27 - ord(ch) },
  reverseReduction: { label: 'Reverse Full Reduction', of: (ch) => red(27 - ord(ch)) },
  sumerian: { label: 'Sumerian', of: (ch) => ord(ch) * 6, optional: true },
}
export const BASE_CIPHERS = ['ordinal', 'fullReduction', 'reverseOrdinal', 'reverseReduction']

/** One word's value in one cipher; 0 for an empty word. */
export function cipherValue(letters, cipher = 'ordinal') {
  const c = CIPHERS[cipher]
  return String(letters || '').replace(/[^A-Z]/g, '').split('').reduce((a, ch) => a + c.of(ch), 0)
}

/**
 * A name in every base cipher, for its full / first / last parts, each with
 * its digit root: { full: { ordinal: { value, root }, ... }, first: ..., last: ... }.
 * `withSumerian` adds the 5th cipher. null for an empty name.
 */
export function gematria(name, { withSumerian = false } = {}) {
  const p = nameParts(name)
  if (!p) return null
  const ciphers = withSumerian ? [...BASE_CIPHERS, 'sumerian'] : BASE_CIPHERS
  const one = (letters) => (letters ? Object.fromEntries(ciphers.map((c) => { const v = cipherValue(letters, c); return [c, { value: v, root: digitRoot(v) }] })) : null)
  return { full: one(p.full), first: one(p.first), last: one(p.last) }
}

/** Every base-cipher value of a name, flat: [{ part, cipher, value }] (for exact matching). */
export function gematriaValues(name) {
  const g = gematria(name)
  if (!g) return []
  const out = []
  for (const part of ['full', 'first', 'last']) {
    for (const c of BASE_CIPHERS) if (g[part]?.[c]) out.push({ part, cipher: c, value: g[part][c].value })
  }
  return out
}

// ── LETTERS (step 3) ─────────────────────────────────────────────────────
/** "Pete Crow-Armstrong" -> { initials: 'PC', sum: 16, firstLetter: 'P', letters: 17 }. */
export function letters(name) {
  const w = nameWords(name)
  if (!w.length) return null
  const initials = w.map((x) => x[0]).join('')
  return {
    initials,
    sum: initials.split('').reduce((a, ch) => a + ord(ch), 0),
    firstLetter: w[0][0],
    letters: w.join('').length,
  }
}

/** Do his initials spell a team code ("KC" in "Kansas City"-style: initials === abbrev, or its first letters)? */
export const initialsSpell = (initials, abbrev) => Boolean(initials && abbrev && String(abbrev).toUpperCase().startsWith(initials) && initials.length >= 2)
