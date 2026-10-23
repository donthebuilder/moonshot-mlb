// ✂️ THE X CUT (2026-10-23, Donovan: "make sure all the games are short enough for X"). Pure. A whole replay runs 3-7
// minutes; X takes 2:20 for most accounts. Each stage lists its moments (a stretch of its own timeline with a priority:
// 1 = must show -- the first score, every TD / goal, our called men cashing, the finish; 2 = strong -- turnovers, our
// men's other big plays; 3 = colour -- long gains, threes, blocks); this keeps the best of them inside a budget and
// returns them in game order. scripts/record-replay.mjs --x films the open, each moment back to back, then the end card.
export const X_CAP_MS = 140000          // X's video cap for most accounts (2:20)
export const X_BUDGET_MS = 72000        // the moments themselves; the open and the end card take the rest (~85 s in all)

/** cands: [{ from, to, prio, label, videoMs? }] in the stage's own units; speed: units per video ms when videoMs is not
 *  given; maxCount caps the cuts (must-shows always count), minMs is the shortest a moment runs. Returns [{ from, to, label, ms }] in order (ms: about how long it runs on video), overlapping picks merged. */
export function pickMoments(cands, { budgetMs = X_BUDGET_MS, speed = 1, maxCount = 16, minMs = 2500 } = {}) {
  const cost = (c) => c.videoMs ?? (c.to - c.from) / speed
  // a moment shorter than minMs on video starts earlier (its lead-up), so nothing flashes past
  const grown = cands.filter((c) => c && c.to > c.from).map((c) => (c.videoMs == null && cost(c) < minMs ? { ...c, from: Math.max(0, c.from - (minMs - cost(c)) * speed) } : c))
  const ranked = grown.map((c, k) => ({ ...c, k })).sort((a, b) => (a.prio - b.prio) || (a.from - b.from))
  const kept = []
  let used = 0
  for (const c of ranked) {
    if (kept.length >= maxCount && c.prio > 1) continue
    const ms = cost(c)
    if (used + ms > budgetMs && c.prio > 1) continue
    if (used + ms > budgetMs * 1.25) continue          // even a must-show stops at a quarter over the budget
    kept.push(c); used += ms
  }
  kept.sort((a, b) => a.from - b.from)
  const out = []
  for (const c of kept) {
    const last = out[out.length - 1]
    if (last && c.from <= last.to) { last.to = Math.max(last.to, c.to); last.label = `${last.label} + ${c.label}`; last.ms += cost(c) }
    else out.push({ from: c.from, to: c.to, label: c.label, ms: cost(c) })
  }
  return out
}
