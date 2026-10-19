// THE TREEMAP LAYOUT, SHARED (2026-10-19, Donovan picked T1 off the TUDDY Chart Lab: "one team, by position", on the
// team page). Squarified (Bruls, Huizing, van Wijk 2000): items laid out in rows along the shorter side, a row grown
// while it keeps its rectangles closer to square. Pure; area is proportional to `v`. Units are the caller's.

/** items [{ v, ... }] (v > 0) into a w x h box at (x, y) -> the same items with { x, y, w, h } */
export function squarify(items, x, y, w, h) {
  const out = []
  const live = items.filter((i) => i.v > 0)
  const tot = live.reduce((a, i) => a + i.v, 0)
  if (!tot || w <= 0 || h <= 0) return out
  const sc = (w * h) / tot
  let rest = live.map((i) => ({ i, a: i.v * sc }))
  while (rest.length) {
    const side = Math.min(w, h)
    let row = [rest[0]], best = worst(row, side), k = 1
    while (k < rest.length) { const nr = [...row, rest[k]], wv = worst(nr, side); if (wv > best) break; row = nr; best = wv; k++ }
    const ra = row.reduce((a, r) => a + r.a, 0)
    if (w >= h) { const cw = ra / h; let cy = y; row.forEach((r) => { const ch = r.a / cw; out.push({ ...r.i, x, y: cy, w: cw, h: ch }); cy += ch }); x += cw; w -= cw }
    else { const ch = ra / w; let cx = x; row.forEach((r) => { const cw = r.a / ch; out.push({ ...r.i, x: cx, y, w: cw, h: ch }); cx += cw }); y += ch; h -= ch }
    rest = rest.slice(k)
  }
  return out
}

function worst(row, side) {
  const s = row.reduce((a, r) => a + r.a, 0)
  let mx = 0, mn = Infinity
  for (const r of row) { if (r.a > mx) mx = r.a; if (r.a < mn) mn = r.a }
  return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn))
}

/**
 * One club's usage as shares: players [{ id, weeks: { [week]: { [metric]: n } }, ... }], a metric key and the weeks
 * that count as "lately" -> each player with v (season count), sh (share), sh3 (share over those weeks) and tr
 * (+1 more of it lately, -1 less, 0 the same; `gap` share points apart, 4 by default). Players with none are dropped.
 */
export function usageShares(players, metric, lateWeeks = [], gap = 0.04) {
  const late = new Set(lateWeeks.map(Number))
  const rows = players.map((p) => {
    let v = 0, v3 = 0
    for (const [w, m] of Object.entries(p.weeks || {})) { const x = Number(m?.[metric]) || 0; v += x; if (late.has(Number(w))) v3 += x }
    return { ...p, v, v3 }
  }).filter((p) => p.v > 0)
  const tot = rows.reduce((a, p) => a + p.v, 0) || 1, tot3 = rows.reduce((a, p) => a + p.v3, 0)
  for (const p of rows) {
    p.sh = p.v / tot
    p.sh3 = tot3 ? p.v3 / tot3 : null
    p.tr = p.sh3 == null ? 0 : p.sh3 - p.sh >= gap ? 1 : p.sh - p.sh3 >= gap ? -1 : 0
  }
  return rows.sort((a, b) => b.v - a.v)
}
