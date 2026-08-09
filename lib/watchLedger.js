'use client'

// ⭐ WATCHLIST LEDGER — your own list, graded like the bot grades itself.
//
// 2026-08-09, Donovan: "add a tracker to the watchlist like results, something
// minimal but useful."
//
// The Watchlist already showed TONIGHT. What it couldn't answer is the only
// question that makes a watchlist worth keeping: does starring names actually
// work for you? That needs history, and there is no server here to keep it —
// the watchlist itself is device-local ("saved on this device only"), so its
// record is too. Stated plainly wherever it renders; a number whose scope you
// misunderstand is worse than no number.
//
// WHAT A NIGHT COSTS TO STORE: one row per date — the counts, not the names.
// Sixty nights is a few hundred bytes, so nothing here needs pruning logic
// beyond a hard cap.
//
// THE GRADING RULE IS THE SITE'S RULE, NOT A NEW ONE:
//   · a saved hitter counts only if he actually batted (actual_ab > 0)
//   · scratched and never-used names are VOID, not misses — same as the live
//     wire and the bot's own tracker
//   · one row per player before counting (the graded file publishes one row
//     per pick CATEGORY, so a two-category hitter appears twice)
// If those three rules ever disagree with the rest of the site, this file is
// the one that's wrong.

const KEY = 'watch_ledger_v1'
const CAP = 60

const read = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}')
    return raw && typeof raw === 'object' ? raw : {}
  } catch { return {} }
}

const write = (obj) => {
  try {
    // Keep the newest CAP dates. Sorted lexically, which is chronological for
    // YYYY-MM-DD.
    const keys = Object.keys(obj).sort()
    const trimmed = {}
    keys.slice(-CAP).forEach((k) => { trimmed[k] = obj[k] })
    localStorage.setItem(KEY, JSON.stringify(trimmed))
  } catch { /* private mode, quota — the ledger is a nicety, never a blocker */ }
}

/**
 * Record (or update) one night.
 *
 * Idempotent by date: called on every render of a live night, it just
 * overwrites that date's row with the current counts, so the ledger tracks
 * grading as it happens and settles on the final numbers. It does NOT append.
 *
 * @param dateKey  the slate date being graded, YYYY-MM-DD
 * @param lines    [{ ab, hr, hits }] — already deduped, one per saved hitter
 * @returns the row written, or null if there was nothing to record
 */
export function recordNight(dateKey, lines) {
  if (!dateKey || !Array.isArray(lines)) return null
  // Only hitters who actually batted. A night where none of them did is not a
  // night — recording a 0/0 row would dilute the rate with a day that never
  // asked a question.
  const played = lines.filter((l) => Number(l?.ab) > 0)
  if (!played.length) return null
  const row = {
    n: played.length,
    hr: played.filter((l) => Number(l.hr) > 0).length,
    hit: played.filter((l) => Number(l.hits) > 0).length,
    // How many were saved but never batted — shown so the void legs are
    // visible rather than silently dropped.
    void: lines.length - played.length,
  }
  const all = read()
  all[dateKey] = row
  write(all)
  return row
}

/** Every recorded night, oldest first. */
export function readLedger() {
  const all = read()
  return Object.keys(all).sort().map((date) => ({ date, ...all[date] }))
}

/** Totals across the last `days` recorded nights (all of them by default). */
export function ledgerTotals(days = null) {
  const rows = readLedger()
  const use = days ? rows.slice(-days) : rows
  const sum = (k) => use.reduce((a, r) => a + (Number(r[k]) || 0), 0)
  const n = sum('n')
  return {
    nights: use.length,
    n,
    hr: sum('hr'),
    hit: sum('hit'),
    void: sum('void'),
    hrPct: n ? (100 * sum('hr')) / n : null,
    hitPct: n ? (100 * sum('hit')) / n : null,
    rows: use,
  }
}

export function clearLedger() {
  try { localStorage.removeItem(KEY) } catch {}
}
