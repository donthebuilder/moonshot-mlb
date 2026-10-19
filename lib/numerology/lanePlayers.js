// TONIGHT'S PLAYERS ON THESE LANES (2026-10-07). The Lane scoreboard scores LANES, not players -- it says
// how a number lane has done over graded nights. This is the other half of the question, answered with the
// SAME lane list (lib/numerology/lanes.js matchLanes): which of tonight's players are on a lane right now.
// Pure. `items` = [{ id, name, team, a }] where `a` is the sport's adapter shape (lib/numerology/adapters.js:
// fromMlb / fromNfl / fromNhl); a player whose fields are missing sits out of the lanes that need them, exactly
// as everywhere else. Fibonacci lanes are left out -- they are about the man, not the date (the rule the NHL and
// NFL Ledgers already use). Ranked by how many lanes he is on, then by the sport's own score if one is handed
// in, then by name -- so the list is stable and nothing is invented.
import { matchLanes, displayLanes } from './lanes'

export const isDateLane = (m) => !/fibonacci/i.test(m.label)

/** The distinct long labels of the lanes ABOUT the day (Fibonacci left out) -- the chips every sport's ledger prints for a scorer. `lanes` = displayLanes(matchLanes(...)). */
export const dayLabels = (lanes) => [...new Set((lanes || []).map((x) => x.label))].filter((l) => !/fibonacci/i.test(l))

/**
 * THE NUMBERS, NOT THE LANE NAMES (Donovan 10-18: "I'd rather see the actual numbers that are happening instead of it being
 * named 'equal to today's date' ... make it more concise ... like two aligns, three aligns ... he got four alignments in the
 * eights"). One chip per player: the numbers his lanes landed on and how many lanes, "8 · 8 · 8 — 3 align"; more than four
 * numbers fold into counts ("8×3 · 4 — 4 align"). A birthday-week lane is 🎂 (its value is a day offset, not a number).
 * `explain` is every lane in words, for the tap. Same lanes as dayLabels (Fibonacci left out, one per long label).
 * @returns [] or [{ label, explain, title, n }]
 */
export function alignChip(lanes) {
  const seen = new Set()
  const ms = (lanes || []).filter((m) => isDateLane(m) && !seen.has(m.label) && seen.add(m.label))
  if (!ms.length) return []
  const tok = (m) => (m.lane === 'birthday_week' ? '🎂' : String(m.value))
  const vals = ms.map(tok)
  let shown = vals.join(' · ')
  if (vals.length > 4) {
    const counts = new Map()
    for (const v of vals) counts.set(v, (counts.get(v) || 0) + 1)
    shown = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v, n]) => (n > 1 ? `${v}×${n}` : v)).join(' · ')
  }
  const explain = ms.map((m) => `${m.label}: ${m.text}`).join('. ')
  return [{ label: `${shown} — ${ms.length} align`, explain, title: explain, n: ms.length }]
}

/**
 * @param items   [{ id, name, team, a, score? }]
 * @param date    the GAME's own date (YYYY-MM-DD)
 * @returns       [{ id, name, team, labels: string[], n, score }] best first, at most `limit`
 */
export function lanePlayers(items, date, { limit = 8 } = {}) {
  if (!date) return []
  const out = []
  for (const it of items || []) {
    if (!it?.a || it.id == null || it.id === '' || !it.name) continue
    const ms = displayLanes(matchLanes(it.a, { date }).filter(isDateLane))
    const labels = [...new Set(ms.map((m) => m.short || m.label))]
    const fullLabels = [...new Set(ms.map((m) => m.label))]
    if (labels.length) out.push({ id: String(it.id), name: it.name, team: it.team || null, labels, fullLabels, n: new Set(ms.map((m) => m.family || m.lane)).size, score: Number.isFinite(Number(it.score)) ? Number(it.score) : null })   // n = lanes by FAMILY: ordinal and reverse on one name test is still one name lane
  }
  return out
    .sort((a, b) => (b.n - a.n) || ((b.score ?? -1) - (a.score ?? -1)) || a.name.localeCompare(b.name))
    .slice(0, limit)
}
