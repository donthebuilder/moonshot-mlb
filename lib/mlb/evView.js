// EV Log: what the toggles do to the numbers (2026-10-07). Pure.
// BUG THIS FIXES (reproduced on the card): the log opens on tonight's arm and tonight's pitch mix.
// "Last 10 games, hard hit" then read the hard-hit rate of only the balls off that arm in that mix --
// 2 of 14 (14%) -- while the window he asked for held 10 of 32 (31%). The headline never said so.
// The window's own hard-hit line is now stated beside the filtered strip.
const bbe = (rows) => (rows || []).filter((r) => !r.k && !r.is_k)
const hardOf = (r) => (r.hard != null ? !!r.hard : !!r.is_hard_hit)

export function hardHitLine(rows) {
  const b = bbe(rows)
  const hard = b.filter(hardOf).length
  return { bbe: b.length, hard, pct: b.length ? (100 * hard) / b.length : null }
}

// The tonight defaults, as one decision: arm side to open on, and whether the starter's mix applies.
export function evDefaults(player) {
  const a = String(player?.pitcher_throws || '').toUpperCase().slice(0, 1)
  return { arm: a === 'L' || a === 'R' ? a : 'ALL' }
}
