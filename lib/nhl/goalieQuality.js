// 🥅 GOALIE QUALITY (2026-10-08). Pure: a club's window of club-game rows (lib/nhl/teamXg.js, the SAME rows the
// team model reads) -> one line per goalie: games, shots faced, goals against, the expected goals on those same
// shots (lamp-xg-v1), goals saved above expected (shrunk), and the factor (GA + k) / (xGA + k) the team model
// uses for the opposing goalie (lib/nhl/xg.js goalieFactor, k = the team model's own goalie shrink).
//
//   saved above expected  =  (xGA - GA) * xGA / (xGA + k)   -- the same k pulls it toward 0, as the factor toward 1
//   thin                  =  fewer shots faced than MIN_SA: the derived columns (xGA, saved, factor) are null, a dash
//
// A count of goals measured from shots; never a printed probability.
import MODEL from './teamProjV1'
import { goalieFactor } from './xg'
import { windowOf } from './teamProj'

/** shots faced behind a goalie-quality line (the same gate lib/writeups/nhl.js MIN.goalieSa holds the written lines to) */
export const MIN_SA = 300

const r = (v, dp) => (Number.isFinite(v) ? Number(v.toFixed(dp)) : null)

/** @param win club-game rows (oldest first, already windowed) @returns [{ id, gp, sa, ga, xga, recentSa }] most recent shots first */
export function goalieTable(win, model = MODEL) {
  const tab = {}
  for (const row of win) for (const [id, v] of Object.entries(row.goalies || {})) {
    const a = tab[id] || (tab[id] = { id, gp: 0, sa: 0, ga: 0, xga: 0, recentSa: 0 })
    a.gp += 1; a.sa += v[0]; a.ga += v[1]; a.xga += v[2]
  }
  for (const row of win.slice(-model.goalieGames)) for (const [id, v] of Object.entries(row.goalies || {})) tab[id].recentSa += v[0]
  return Object.values(tab).sort((a, b) => b.recentSa - a.recentSa || b.sa - a.sa)
}

/** one goalie's line from his table entry; thin samples carry null where a number would be a guess */
export function goalieLine(a, model = MODEL, minSa = MIN_SA) {
  const thin = !(a.sa >= minSa)
  return {
    id: a.id, gp: a.gp, sa: a.sa, ga: a.ga, thin,
    svPct: a.sa > 0 ? r(1 - a.ga / a.sa, 4) : null,
    xga: thin ? null : r(a.xga, 1),
    saved: thin ? null : r(((a.xga - a.ga) * a.xga) / (a.xga + model.k.goalie), 1),
    factor: thin ? null : r(goalieFactor(a.ga, a.xga, model.k.goalie), 3),
  }
}

/** the goalies a club has played lately (up to `n`, the busiest of its last `goalieGames` games first), as of the game's own date */
export function clubGoalies(rows, date, n = 3, model = MODEL) {
  const win = windowOf(rows, date, model)
  return goalieTable(win, model).filter((a) => a.recentSa > 0).slice(0, n).map((a) => goalieLine(a, model))
}
