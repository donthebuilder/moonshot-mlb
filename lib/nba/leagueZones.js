// THE LEAGUE BY ZONE, 2025-26 (measured 2026-10-19 from buckets_shots through /api/buckets/shots, all 30 clubs:
// 219,372 field-goal attempts). BUCKETS' shot chart greens a zone where a shooter beats these. The zones are
// components/buckets/ShotChart.js zoneOf. RE-MEASURE when the 2026-27 season has enough shots (NOW.md).
export const LEAGUE_ZONES_SEASON = '2025-26'
export const LEAGUE_ZONES = {
  rim: { m: 43202, a: 65304 },        // 66.2%
  paint: { m: 18670, a: 42101 },      // 44.3%
  mid: { m: 8700, a: 20918 },         // 41.6%
  corner3: { m: 9258, a: 23957 },     // 38.6%
  above3: { m: 23484, a: 67092 },     // 35.0%
}
export const leaguePct = (k) => (LEAGUE_ZONES[k] ? (100 * LEAGUE_ZONES[k].m) / LEAGUE_ZONES[k].a : null)
