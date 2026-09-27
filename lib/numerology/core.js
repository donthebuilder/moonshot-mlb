// 🔢 THE NUMEROLOGY ENGINE, CORE (2026-09-27, BATCH-NUMEROLOGY step 1/4/4c).
//
// One place for the arithmetic every numerology surface uses. digitRoot /
// dayRootOf / lifePathOf were written out five times (lib/alignments.js,
// lib/ledgerArchive.js, lib/nfl/alignments.js, lib/dash/homerFeed.js,
// components/HomerLedger.js) and LAMP kept its own rootOfDigits, all "kept
// in step by hand". They now import from here; the functions are the old
// ones verbatim, and scripts/check-numerology.mjs diffs old vs new over
// every value and every date 1900-2030 (zero diffs).
//
// Plain JS, no React, no 'use client': server routes, the tweet builder and
// client pages all import it. Numerology never feeds a score, a board or a
// rank -- this file only does sums.

/** 17 -> 8, 29 -> 2 (29 -> 11 -> 2), 0 or less -> 0. */
export const digitRoot = (v) => (v > 0 ? 1 + ((v - 1) % 9) : 0)

/** Every digit in a string added up, then reduced; null when there are none
 *  (LAMP's rootOfDigits: no length rule -- used on "YYYY-MM-DD" dates). */
export const rootOfDigits = (s) => { const d = String(s || '').replace(/[^0-9]/g, ''); const sum = d.split('').reduce((a, c) => a + Number(c), 0); return sum > 0 ? digitRoot(sum) : null }

/** His birth day of the month, reduced ("1998-04-26" -> 26 -> 8). */
export const dayRootOf = (birthDate) => {
  const d = Number(String(birthDate || '').slice(8, 10))
  return d > 0 ? digitRoot(d) : null
}

/** Life path: every digit of the full birthdate, reduced; null unless all 8 digits exist. */
export const lifePathOf = (birthDate) => {
  const digits = String(birthDate || '').replace(/[^0-9]/g, '')
  if (digits.length < 8) return null
  const sum = digits.split('').reduce((a, c) => a + Number(c), 0)
  return sum > 0 ? digitRoot(sum) : null
}

// ── MASTER NUMBERS (step 4) ──────────────────────────────────────────────
// 11 / 22 / 33 are shown as themselves, never reduced to 2 / 4 / 6; the
// reduced digit is what matching uses.
export const MASTER = new Set([11, 22, 33])
const digitSum = (n) => String(Math.abs(Math.trunc(n))).split('').reduce((a, c) => a + Number(c), 0)
/** Reduce, stopping at a master number: { value (for display), root (for matching) }. */
export function reduceKeepMaster(n) {
  let v = Math.trunc(Number(n))
  if (!(v > 0)) return null
  while (v > 9 && !MASTER.has(v)) v = digitSum(v)
  return { value: v, root: digitRoot(v) }
}

// ── TONIGHT'S NUMBERS (step 4) ───────────────────────────────────────────
// From the GAME's own date ("YYYY-MM-DD"), never the wall clock.
const ymd = (date) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''))
  return m ? { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]), ys: m[1] } : null
}
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

/**
 * 9/29/2026 -> { full 48 (9+29+2+0+2+6), short 64 (9+29+26), md 38,
 * root 3 (every digit), dayOfYear 272, daysLeft 93 }.
 */
export function dateNumbers(date) {
  const p = ymd(date)
  if (!p) return null
  const yDigits = p.ys.split('').reduce((a, c) => a + Number(c), 0)
  const dayOfYear = Math.round((Date.UTC(p.y, p.mo - 1, p.d) - Date.UTC(p.y, 0, 1)) / 864e5) + 1
  return {
    full: p.mo + p.d + yDigits,
    short: p.mo + p.d + (p.y % 100),
    md: p.mo + p.d,
    root: rootOfDigits(date),
    dayOfYear,
    daysLeft: (isLeap(p.y) ? 366 : 365) - dayOfYear,
  }
}

/**
 * UNIVERSAL YEAR / MONTH / DAY (the standard definitions):
 *   year  every digit of the year, reduced          (2026 -> 10 -> 1)
 *   month month + universal year, reduced           (Sep: 9 + 1 -> 1)
 *   day   every digit of the full date, reduced     (9/29/2026 -> 30 -> 3)
 * Each as { value, root } with 11/22/33 kept as value.
 */
export function universal(date) {
  const p = ymd(date)
  if (!p) return null
  const year = reduceKeepMaster(digitSum(p.y))
  const month = reduceKeepMaster(p.mo + year.root)
  const day = reduceKeepMaster(digitSum(p.mo) + digitSum(p.d) + digitSum(p.y))
  return { year, month, day }
}

/**
 * PERSONAL YEAR / MONTH / DAY for a birthdate on `date`:
 *   year  birth month + birth day + current year's digits, reduced
 *   month personal year + current month, reduced
 *   day   personal month + current day, reduced
 * null when the birthdate has no month/day.
 */
export function personal(birthDate, date) {
  const b = ymd(birthDate); const p = ymd(date)
  if (!b || !p) return null
  const year = reduceKeepMaster(digitSum(b.mo) + digitSum(b.d) + digitSum(p.y))
  const month = reduceKeepMaster(year.root + p.mo)
  const day = reduceKeepMaster(month.root + p.d)
  return { year, month, day }
}

// ── FIBONACCI (step 4c) ──────────────────────────────────────────────────
const isSquare = (x) => { if (x < 0) return false; const r = Math.round(Math.sqrt(x)); return r * r === x }
/** n is Fibonacci when 5n^2 + 4 or 5n^2 - 4 is a perfect square (exact values, never reduced). */
export const isFib = (n) => Number.isInteger(n) && n >= 0 && (isSquare(5 * n * n + 4) || isSquare(5 * n * n - 4))
const FIBS = (() => { const out = [1, 2]; while (out.at(-1) < 1e6) out.push(out.at(-1) + out.at(-2)); return out })()
/** Two numbers that sit next to each other in the sequence (21 & 34, 34 & 55). */
export function fibNeighbours(a, b) {
  if (!isFib(a) || !isFib(b) || a === b) return false
  const i = FIBS.indexOf(Math.min(a, b)); const j = FIBS.indexOf(Math.max(a, b))
  return i >= 0 && j === i + 1
}
