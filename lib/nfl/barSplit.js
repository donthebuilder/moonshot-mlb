// ONE RECORD PER BAR (2026-10-18). A market's grade is "cleared the bar", so a week graded at 40+ receiving yards and a week graded at 100+ are
// different records and are never added together (the model_version rule: nothing is rewritten, a new bar is a new row set). The bot saves the bar
// on every graded card (card[k].bar, and payload.bars[k]); the CURRENT bar is the one on the latest week, and every week at another bar is
// reported apart as `earlier`.
//   splitByBar(payloads, tally) -> { [market]: { ...tally(current-bar weeks), bar, earlier: [{ bar, n, hit, void, weeks, pct }] } }
export function barOf(p, mk) {
  const b = Number(p?.card?.[mk]?.bar ?? p?.bars?.[mk])
  return Number.isFinite(b) ? b : null
}

export function splitByBar(payloads, tally) {
  const list = (payloads || []).filter((p) => p?.totals)
  const order = [...list].sort((a, b) => (Number(a.week) || 0) - (Number(b.week) || 0))
  const current = {}
  for (const p of order) for (const mk of Object.keys(p.totals)) { const b = barOf(p, mk); if (b != null) current[mk] = b }
  const markets = new Set(list.flatMap((p) => Object.keys(p.totals)))
  const out = {}
  for (const mk of markets) {
    const now = current[mk] ?? null
    const groups = new Map()
    for (const p of list) {
      const b = barOf(p, mk)
      const g = groups.get(b) || []
      g.push({ totals: { [mk]: p.totals[mk] } }); groups.set(b, g)
    }
    const row = (g) => tally(g)[mk] || { n: 0, hit: 0, void: 0, weeks: 0, pct: null }
    const cur = groups.get(now) || []
    out[mk] = { ...row(cur), bar: now, earlier: [...groups.entries()].filter(([b]) => b !== now).map(([b, g]) => ({ bar: b, ...row(g) })) }
  }
  return out
}
