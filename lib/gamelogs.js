// Per-player game logs from the MLB StatsAPI → PropFinder-style threshold
// rates. Same live-context lane as situational.js: fetched on demand when a
// modal opens, cached for the session, display-only (nothing here scores).
//
// Each market is a bar a bettor actually plays: 1+ hit, 2+ TB, 1+ HR,
// 1+ run, 1+ RBI. For each we compute cleared/games over L5 / L10 / L20 and
// the full season, plus the CURRENT STREAK — consecutive most-recent games
// clearing the bar, negative meaning consecutive misses.

const cache = new Map()
const season = () => { const d = new Date(); return d.getMonth() < 2 ? d.getFullYear() - 1 : d.getFullYear() }

export const MARKETS = [
  { key: 'hit', label: '1+ Hit',  test: (g) => g.h >= 1 },
  { key: 'tb2', label: '2+ TB',   test: (g) => g.tb >= 2 },
  { key: 'hr',  label: '1+ HR',   test: (g) => g.hr >= 1 },
  { key: 'run', label: '1+ Run',  test: (g) => g.r >= 1 },
  { key: 'rbi', label: '1+ RBI',  test: (g) => g.rbi >= 1 },
]

export async function thresholdRates(pid) {
  if (!pid) return null
  if (cache.has(pid)) return cache.get(pid)
  const p = fetch(`https://statsapi.mlb.com/api/v1/people/${pid}/stats?stats=gameLog&group=hitting&season=${season()}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const splits = j?.stats?.[0]?.splits || []
      // Most recent LAST in the API; normalise to most-recent-first, and
      // drop games with 0 AB and 0 BB (pinch-run cameos aren't chances).
      const games = splits.map((s) => {
        const st = s?.stat || {}
        return {
          h: Number(st.hits) || 0, tb: Number(st.totalBases) || 0,
          hr: Number(st.homeRuns) || 0, r: Number(st.runs) || 0,
          rbi: Number(st.rbi) || 0, ab: Number(st.atBats) || 0,
        }
      }).filter((g) => g.ab > 0).reverse()
      if (!games.length) return null
      const windows = { L5: 5, L10: 10, L20: 20, Szn: games.length }
      const out = {}
      MARKETS.forEach((m) => {
        const row = { streak: 0 }
        Object.entries(windows).forEach(([w, size]) => {
          const win = games.slice(0, size)
          row[w] = { ok: win.filter(m.test).length, n: win.length }
        })
        // streak: + consecutive clears from most recent, − consecutive misses
        const first = m.test(games[0])
        let k = 0
        for (const g of games) { if (m.test(g) === first) k++; else break }
        row.streak = first ? k : -k
        out[m.key] = row
      })
      return { markets: out, games: games.length }
    })
    .catch(() => null)
  cache.set(pid, p)
  return p
}

// American odds → break-even probability, for the paste-a-line verdict.
export function impliedPct(odds) {
  const o = Number(odds)
  if (!Number.isFinite(o) || o === 0) return null
  return o >= 100 ? 100 / (o + 100) * 100 : o <= -100 ? (-o) / (-o + 100) * 100 : null
}
export function fairOdds(rate) {
  if (!(rate > 0) || rate >= 1) return '—'
  return rate >= 0.5 ? `-${Math.round((100 * rate) / (1 - rate))}` : `+${Math.round((100 * (1 - rate)) / rate)}`
}
