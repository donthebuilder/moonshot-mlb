// League-wide leader boards, pulled live from the MLB StatsAPI — the same
// public, CORS-open API lib/situational.js already uses from the browser.
//
// WHY THIS EXISTS: the slate payload carries each hitter's season HR/RBI/runs
// but NO stolen bases — there is no season_sb field anywhere in the bot JSON —
// so speed had no surface on the site at all. This pulls the actual league
// top-10 boards instead of pretending the slate is the league.
//
// VERIFIED LIVE 2026-08-08 against a real response (Nasim Nuñez 40 SB,
// James Wood 100 R, CJ Abrams 89 RBI). Two things the verification caught:
//   - statGroup=hitting is REQUIRED. Without it the API returns every stat
//     group and the FIRST leagueLeaders block is pitchers' stolen bases
//     *allowed* (Eury Pérez "25 SB" — against him, not by him).
//   - ties overflow the limit: limit=10 can return 12+ rows, so we slice.
//
// One fetch for all categories, cached for the session. If the call fails the
// caller gets null and shows an honest empty state — no stale numbers.

const API = 'https://statsapi.mlb.com/api/v1'
let cached = null

const season = () => {
  const d = new Date()
  // January–February belong to last season's data (same rule as situational).
  return d.getMonth() < 2 ? d.getFullYear() - 1 : d.getFullYear()
}

export const LEADER_CATS = [
  { cat: 'stolenBases',  icon: '🏃', label: 'Stolen bases', unit: 'SB' },
  { cat: 'runs',         icon: '🔁', label: 'Runs scored',  unit: 'R' },
  { cat: 'runsBattedIn', icon: '🚛', label: 'RBI',          unit: 'RBI' },
]

// → { stolenBases: [{id, name, team, value}], runs: [...], runsBattedIn: [...] }
//   or null if the API call failed / came back empty.
export async function leagueLeaders() {
  if (cached) return cached
  const cats = LEADER_CATS.map((c) => c.cat).join(',')
  const url = `${API}/stats/leaders?leaderCategories=${cats}&statGroup=hitting`
    + `&season=${season()}&sportId=1&limit=10`
    + '&fields=leagueLeaders,leaderCategory,leaders,person,id,fullName,value,team,name'
  cached = fetch(url)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const out = {}
      ;(j?.leagueLeaders || []).forEach((b) => {
        const rows = (b?.leaders || [])
          .map((l) => ({
            id: l?.person?.id ?? null,
            name: l?.person?.fullName || '?',
            team: l?.team?.name || '',
            value: Number(l?.value),
          }))
          .filter((r) => r.id != null && Number.isFinite(r.value))
        if (b?.leaderCategory && rows.length) out[b.leaderCategory] = rows.slice(0, 10)
      })
      return Object.keys(out).length ? out : null
    })
    .catch(() => null)
  return cached
}


// ── 🏁 WHY THERE IS NO MILESTONE CODE HERE ───────────────────────────────────
//
// 2026-08-15: a "chasing a number tonight" strip was built here off a
// league-wide season-lines call, and then deleted the same day — because
// components/Storylines.js has done this since it shipped, and does it better:
// season AND career, nine stat families each, with per-target proximity
// windows (S_MILES / C_MILES) and it already reads as prose rather than as a
// row of tiles.
//
// Two surfaces computing "who is close to a number" is the exact failure mode
// this project keeps finding in other forms — two answers to one question,
// diverging quietly. The milestone lives in Storylines. If it needs more
// targets, they go in S_MILES.
