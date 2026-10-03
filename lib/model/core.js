// ONE MODEL CORE, EVERY SPORT (2026-10-02, Donovan: "is it possible to flesh
// out the model like the components"). The calling rule every product uses,
// written once: each leg ranked as a percentile within the night's scored
// population, the score = the mean of those ranks (no fitted weights), one
// call per team per game (the higher of a game's two calls = role[0], the
// other = role[1]), ON THE BOARD = the top third of the night, everyone else
// NOT ON THE BOARD with the reason kept. A sport brings only its legs and its
// words. BUCKETS (lib/nba/model.js) is built on it; LAMP's lib/nhl/goalModel.js
// implements the same rule and can move onto this once a parity check proves
// its rows don't change. Pure: no fetch, no clock.

const fin = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Percentile rank (0-100, ties share the mean rank) of each value; null stays null. */
export function percentiles(values) {
  const idx = values.map((v, i) => [fin(v), i]).filter(([v]) => v != null).sort((a, b) => a[0] - b[0])
  const out = new Array(values.length).fill(null)
  const n = idx.length
  if (!n) return out
  for (let i = 0; i < n;) {
    let j = i
    while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j += 1
    const p = n === 1 ? 50 : (((i + j) / 2) / (n - 1)) * 100
    for (let k = i; k <= j; k += 1) out[idx[k][1]] = p
    i = j + 1
  }
  return out
}

/**
 * candidates: [{ playerId, name, team, gameId, legs: { ok, reason, [leg]: number } }]
 * legs: the leg keys to rank. opts: { roles: ['TOP', 'BUCKET'], secondNeedsBoard, boardShare, tie }
 * Returns every candidate with { pct, score, nightRank, nightOf, rank, status, role, reason }.
 */
export function scoreSlate(candidates, legs, { roles = ['TOP', 'SECOND'], secondNeedsBoard = false, boardShare = 1 / 3, tie = null } = {}) {
  const scored = candidates.filter((c) => c.legs?.ok)
  const pct = new Map()
  for (const leg of legs) {
    const p = percentiles(scored.map((c) => c.legs[leg]))
    scored.forEach((c, i) => { const m = pct.get(c) || {}; m[leg] = p[i]; pct.set(c, m) })
  }
  const rows = candidates.map((c) => {
    if (!c.legs?.ok) return { ...c, pct: null, score: null, rank: null, nightRank: null, status: 'off', role: null, reason: c.legs?.reason || 'no line' }
    const ps = pct.get(c)
    const present = legs.filter((l) => ps[l] != null)
    const score = present.length ? Math.round(present.reduce((s, l) => s + ps[l], 0) / present.length) : null
    return { ...c, pct: ps, score, rank: null, nightRank: null, status: score == null ? 'off' : 'board', role: null, reason: score == null ? 'no leg could be ranked' : null }
  })
  const by = (a, b) => (b.score - a.score) || (tie ? (fin(b.legs?.[tie]) || 0) - (fin(a.legs?.[tie]) || 0) : 0) || String(a.name).localeCompare(String(b.name))
  const night = rows.filter((r) => r.score != null).sort(by)
  const cut = night.length ? Math.ceil(night.length * boardShare) : 0
  night.forEach((r, i) => { r.nightRank = i + 1; r.nightOf = night.length })
  const games = new Map()
  for (const r of night) { if (!games.has(r.gameId)) games.set(r.gameId, []); games.get(r.gameId).push(r) }
  for (const list of games.values()) {
    list.sort(by)
    const seen = new Set()
    const tops = []
    list.forEach((r, i) => {
      r.rank = i + 1
      const onBoard = r.nightRank <= cut
      if (!seen.has(r.team)) { seen.add(r.team); tops.push(r) }
      r.status = onBoard ? 'board' : 'off'
      if (!onBoard) r.reason = `below the top third of tonight's board (#${r.nightRank} of ${r.nightOf}, cut ${cut})`
    })
    // the top man on each team: the game's higher one is roles[0]; the other is
    // roles[1] -- only while he's ON THE BOARD when secondNeedsBoard (BUCKETS)
    tops.forEach((r, i) => {
      if (i === 0 || !secondNeedsBoard || r.nightRank <= cut) { r.status = 'called'; r.role = roles[i] || roles[roles.length - 1]; r.reason = null }
      else r.reason = `no call this side: the top ${r.team} man is #${r.nightRank} of ${r.nightOf}, outside the top third (cut ${cut})`
    })
  }
  return rows
}

/** GP-weighted blend of this season and last over a window (LAMP's rule): { gp, w, rate(field) }. */
export function pooled(cur, prev, window = 82) {
  const gpC = fin(cur?.gp) || 0
  const gpP = fin(prev?.gp) || 0
  const w = gpP > 0 ? Math.min(1, Math.max(0, window - gpC) / gpP) : 0
  const gp = gpC + gpP * w
  // per-game averages in: total = avg x gp, pooled back to a per-game rate
  const rate = (k) => {
    const a = fin(cur?.[k]), b = fin(prev?.[k])
    if (a == null && b == null) return null
    return gp > 0 ? ((a || 0) * gpC + (b || 0) * gpP * w) / gp : null
  }
  return { gp, gpCur: gpC, gpPrev: gpP, w, rate }
}
