// 🧤 TEAM DEFENSE (2026-08-08, Donovan: "add defensive stats for the teams").
// BABIP-against = (H−HR)/(BF−K−BB−HBP−HR) from the league's season pitching
// totals — the cleanest public proxy for team defense quality: how often a
// ball IN PLAY against them becomes a hit. Verified live: all 30 teams carry
// every input field. Percentile computed from the same payload.
//
// TWO-LANE RULE: context only. This touches no score until the graded
// archive proves it should (the bot publishes the same numbers in the
// context pack so that validation can happen).
import { teamAbbrs } from './gamelogs'

let _cache = null
export async function teamDefense() {
  if (_cache) return _cache
  try {
    const yr = new Date().getFullYear()
    const [j, abbrs] = await Promise.all([
      fetch(`https://statsapi.mlb.com/api/v1/teams/stats?season=${yr}&group=pitching&stats=season&sportIds=1&fields=stats,splits,team,id,stat,hits,homeRuns,strikeOuts,baseOnBalls,battersFaced,hitByPitch`)
        .then((r) => (r.ok ? r.json() : null)),
      teamAbbrs().catch(() => null),
    ])
    const rows = []
    ;(j?.stats?.[0]?.splits || []).forEach((sp) => {
      const s = sp.stat || {}
      const bip = (s.battersFaced || 0) - (s.strikeOuts || 0) - (s.baseOnBalls || 0) - (s.hitByPitch || 0) - (s.homeRuns || 0)
      if (bip < 200) return
      rows.push({ id: sp.team?.id, ab: abbrs?.[sp.team?.id] || '', babip: ((s.hits || 0) - (s.homeRuns || 0)) / bip })
    })
    const sorted = [...rows].sort((a, b) => a.babip - b.babip)
    const m = new Map()
    rows.forEach((r) => {
      const pct = Math.round((100 * sorted.findIndex((x) => x.id === r.id)) / (sorted.length - 1))
      // low BABIP-against = GOOD defense (low pct); high = leaky
      const word = pct <= 20 ? 'elite glove' : pct >= 80 ? 'leaky defense' : 'league-normal'
      m.set(String(r.ab).toUpperCase(), { babip: r.babip, pct, word })
    })
    _cache = m
    return m
  } catch { return null }
}
