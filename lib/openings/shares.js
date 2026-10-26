// SHARES OF WHAT HAPPENED (2026-10-26): the two tiny tallies every openings aggregator uses (lib/nba/openingsAgg.js, lib/openings/teamAgg.js).
// bump(counts, word) adds one; shares(counts) turns { word: n } into [[word, share %, n]], biggest first, top 4. Counts, never a chance.
const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null)
export const bump = (o, k) => { if (k) o[k] = (o[k] || 0) + 1 }
export const shares = (o) => { const n = Object.values(o).reduce((a, b) => a + b, 0); return Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, c]) => [k, pct(c, n), c]) }
