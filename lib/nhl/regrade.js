// THE LATE SCORING CHANGE (2026-10-11, "we said he missed and he scored"). The league's boxscore flips to OFF at the horn, but the
// official scorer keeps correcting it for hours: 10-10 TBL@NYI, graded 02:10Z off a box that gave the 11:39 goal to Schaefer; at 03:39Z
// the league re-credited it to Pageau (the goal feed saw it, the grade never looked again: "a graded game is never retried"). Schaefer
// (ON THE BOARD) stayed a scorer and Pageau (NOT ON THE BOARD) stayed a 0 in lamp_goal_log, and the same drift hit assists, points
// and shots on goal in lamp_prop_log.
//
// THE RULE (the existing grader, re-run; nothing about how a row is graded changes): for a game graded in the last RECHECK_MAX_MS,
// when the goal feed shows a change AFTER the grade (a goal first seen, confirmed or overturned later), or once at the settle window
// (RECHECK_FROM_MS..RECHECK_TO_MS after the grade), read the box again and run the same grade functions. Only the RESULT columns of
// a row can change (dressed / goals or value / hit); the locked model columns (score, status, rank, legs) are never written. A row
// whose result is unchanged is not written. Pure: no fetch, no clock, no 'use client'.
export const RECHECK_FROM_MS = 90 * 60e3
export const RECHECK_TO_MS = 150 * 60e3
export const RECHECK_MAX_MS = 12 * 3600e3

const ms = (v) => { const t = Date.parse(v); return Number.isFinite(t) ? t : null }

/**
 * Why a graded game should be read again, or null. `feedRows` = the game's lamp_goal_feed rows (first_seen_at / confirmed_at /
 * overturned_at); `gradedAt` = the game's graded_at.
 */
export function recheckReason({ gradedAt, now, feedRows = [] }) {
  const g = ms(gradedAt)
  if (g == null || !Number.isFinite(now)) return null
  const age = now - g
  if (age < 0 || age > RECHECK_MAX_MS) return null
  for (const r of feedRows || []) {
    for (const k of ['first_seen_at', 'confirmed_at', 'overturned_at']) {
      const t = ms(r?.[k])
      if (t != null && t > g) return `goal feed changed after the grade (${k})`
    }
  }
  if (age >= RECHECK_FROM_MS && age < RECHECK_TO_MS) return 'settle window'
  return null
}

/**
 * The rows whose RESULT differs between what is stored and a fresh grade. `before` = the stored rows, `after` = the same rows
 * graded again (same order and length, or matched by `keyOf`). `valueKey` = 'goals' (lamp_goal_log) or 'value' (lamp_prop_log).
 * @returns [{ row: after-row, from: { dressed, value, hit }, to: { dressed, value, hit } }]
 */
export function changedResults(before, after, valueKey, keyOf = (r) => String(r.player_id ?? r.playerId)) {
  const was = new Map((before || []).map((r) => [keyOf(r), r]))
  const out = []
  for (const a of after || []) {
    const b = was.get(keyOf(a))
    if (!b) continue
    const from = { dressed: Boolean(b.dressed), value: b[valueKey] ?? null, hit: b.hit ?? null }
    const to = { dressed: Boolean(a.dressed), value: a[valueKey] ?? null, hit: a.hit ?? null }
    if (from.dressed !== to.dressed || from.value !== to.value || from.hit !== to.hit) out.push({ row: a, from, to })
  }
  return out
}

/** The columns a regrade may write. Nothing else is ever sent. */
export const resultPatch = (valueKey, to) => ({ dressed: to.dressed, [valueKey]: to.value, hit: to.hit })
