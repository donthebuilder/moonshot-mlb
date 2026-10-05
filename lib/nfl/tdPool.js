// THE TD BOARD'S POOL, PURE (Members M3, 2026-10-02). Was in two client files
// (components/nfl/ScoreAnatomy.js baselineFor, tabs/Touchdowns.js tdPool); the
// members post builds the same board on the server, so the board's own order,
// weights and baseline live here and both client files re-export them.
const MARKET = 'TD'

/** Each component's median across these rows: the baseline a part is read against. */
export function baselineFor(rows, market) {
  const acc = {}
  for (const p of rows) {
    for (const [k, v] of Object.entries(p?.components?.[market] || {})) {
      if (Number.isFinite(Number(v))) (acc[k] ||= []).push(Number(v))
    }
  }
  const out = {}
  for (const [k, vals] of Object.entries(acc)) {
    vals.sort((a, b) => a - b)
    out[k] = vals[Math.floor(vals.length / 2)]
  }
  return out
}

/** The week's TD board: eligible, scored players in score order, with the market's weights and baseline. */
export function tdPool(data) {
  const m = (data?.markets || []).find((x) => x.key === MARKET)
  const elig = new Set(m?.positions || ['RB', 'WR', 'TE'])
  const list = (data?.players || [])
    .filter((p) => !p.on_bye && elig.has(p.position) && p.scores?.[MARKET] != null && Number.isFinite(Number(p.scores?.[MARKET])))
    .sort((a, b) => (b.scores[MARKET] ?? 0) - (a.scores[MARKET] ?? 0))
  return {
    rows: list,
    weights: m?.weights || null,
    base: baselineFor(list, MARKET),
    games: new Set(list.map((p) => [p.team, p.opp].sort().join('@'))).size,
  }
}
