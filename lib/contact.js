// THE CONTACT SECTION'S ARITHMETIC (2026-09-27, BATCH-BLAST-COLUMNS-PLAN,
// "the player card first"). Everything here counts the batted balls the
// per-hitter detail file already carries (detail.spray_chart: date, ev, la,
// distance, bb_type, pitch_type, arm, is_hr / is_xbh / is_hard_hit /
// is_350_plus / is_pull_air) -- no bot work, no estimate. Pure functions.

const num = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

/** A batted-ball event: a tracked exit velocity and a batted-ball type. Strikeouts and walks ride the same array with ev null. */
export const isBBE = (r) => num(r?.ev) != null && String(r?.bb_type || '').length > 0

// BARRELS, FROM EXIT VELOCITY AND LAUNCH ANGLE (Statcast's zone). The detail
// file's own is_barrel is a fixed box (ev >= 98 and 24-32 degrees, bot
// mlb_dashboard.py / spray_archive.py), which misses the hardest-hit balls:
// Statcast's zone widens with speed -- 26-30 degrees at 98 mph, 25-31 at 99,
// 24-33 at 100, then about one degree lower and one higher per mph until
// 8-50 at 116 and beyond. Elly De La Cruz 08-14..09-26: the box says 10, this
// zone 21, Blast Report 24 through 09-27. Until the bot's flag is fixed
// (plan D1) the card counts barrels here and says so.
export function statcastBarrel(ev, la) {
  const e = num(ev); const a = num(la)
  if (e == null || a == null || e < 98) return false
  const s = Math.min(e, 116)
  const lo = 26 - (s - 98)
  const hi = s < 100 ? 30 + (s - 98) : 33 + (s - 100) * (17 / 16)
  return a >= lo && a <= hi
}

const AIR = new Set(['fly_ball', 'line_drive', 'popup'])
export const isAir = (r) => AIR.has(String(r?.bb_type || ''))

/** YYYY-MM-DD n days before `iso`. */
export function daysBefore(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

export const WINDOWS = [
  { key: 'bbe50', label: 'Last 50 BBE' },
  { key: 'd15', label: 'Last 15 days', days: 15 },
  { key: 'd45', label: 'Last 45 days', days: 45 },
  { key: 'all', label: 'In the file' },
]

/**
 * The batted balls in a window, before `anchor` (the game's own date, never
 * the wall clock): day windows are the N calendar days before tonight's game.
 * Returns { rows, from, to } with the calendar range the window covers.
 */
export function windowRows(spray, key, anchor) {
  const bbe = (spray || []).filter(isBBE).filter((r) => !anchor || String(r.date) < anchor)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  if (!bbe.length) return { rows: [], from: null, to: null, fileFrom: null, cut: false }
  // The detail file holds his most recent ~120 batted balls (bot
  // mlb_dashboard.py spray_points), so a long day window can start before the
  // file does: `cut` says so, and the card prints where the file starts.
  const fileFrom = bbe[bbe.length - 1].date
  const w = WINDOWS.find((x) => x.key === key) || WINDOWS[1]
  let rows = bbe
  let from = bbe[bbe.length - 1].date
  let to = anchor ? daysBefore(anchor, 1) : bbe[0].date
  if (w.key === 'bbe50') { rows = bbe.slice(0, 50); from = rows[rows.length - 1].date; to = rows[0].date }
  else if (w.days) { from = daysBefore(anchor || bbe[0].date, w.days); rows = bbe.filter((r) => r.date >= from) }
  const cut = Boolean(w.days) && fileFrom > from
  return { rows, from: cut ? fileFrom : from, to, fileFrom, cut }
}

/** Counts and rates over a set of batted balls. Rates are null with no BBE. */
export function contactStats(rows) {
  const n = rows.length
  const count = (f) => rows.filter(f).length
  const evs = rows.map((r) => num(r.ev)).filter((v) => v != null)
  const las = rows.map((r) => num(r.la ?? r.launch_angle)).filter((v) => v != null)
  const c = {
    bbe: n,
    barrels: count((r) => statcastBarrel(r.ev, r.la ?? r.launch_angle)),
    hardHit: count((r) => r.is_hard_hit === true || num(r.ev) >= 95),
    ev100: count((r) => num(r.ev) >= 100),
    d350: count((r) => r.is_350_plus === true),
    hr: count((r) => r.is_hr === true),
    xbh: count((r) => r.is_xbh === true),
    air: count(isAir),
    pullAir: count((r) => r.is_pull_air === true),
    avgEv: evs.length ? evs.reduce((a, b) => a + b, 0) / evs.length : null,
    maxEv: evs.length ? Math.max(...evs) : null,
    avgLa: las.length ? las.reduce((a, b) => a + b, 0) / las.length : null,
  }
  c.rate = (k) => (n ? c[k] / n : null)
  return c
}

/**
 * Plate discipline from the detail file's pitch_type_summary, each pitch
 * type weighted by the pitches he saw of it. zone_pct / chase_rate arrive as
 * fractions, whiff_pct / swstr_pct as percents; all returned as fractions.
 */
export function discipline(pts) {
  const rows = (pts || []).filter((r) => num(r?.seen ?? r?.count) > 0)
  if (!rows.length) return null
  const w = (k, scale = 1) => {
    let s = 0; let n = 0
    for (const r of rows) { const v = num(r[k]); const seen = num(r.seen ?? r.count); if (v == null) continue; s += (v / scale) * seen; n += seen }
    return n ? s / n : null
  }
  return { pitches: rows.reduce((a, r) => a + num(r.seen ?? r.count), 0), zone: w('zone_pct'), chase: w('chase_rate'), whiff: w('whiff_pct', 100), swstr: w('swstr_pct', 100) }
}
