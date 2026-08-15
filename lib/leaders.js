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


// ── 🏁 THE CHASE ─────────────────────────────────────────────────────────────
//
// 2026-08-15, Donovan sent MLB's Historical Statistics page — career leaders,
// single-season leaders, the record book.
//
// A record book doesn't help you bet. What that page is actually good for is
// the thing underneath it: SOMEBODY ON TONIGHT'S CARD IS CLOSE TO A NUMBER.
// That's the version worth having, because a hitter two homers from 30 is a
// hitter whose team, park and lineup spot all stop being neutral — and it is
// the only reason a season total belongs on a betting board at all.
//
// ONE REQUEST for every qualified hitter's season line, joined to tonight's
// slate by id. The alternative — career totals — is one call per player and
// buys a milestone almost nobody reaches in a given week, so this is season
// only and says so rather than implying it covers 3,000 hits.
let _season = null

export async function seasonLines() {
  if (_season) return _season
  const url = `${API}/stats?stats=season&group=hitting&season=${season()}&sportId=1`
    + '&limit=800&fields=stats,splits,player,id,fullName,team,name,stat,'
    + 'homeRuns,hits,rbi,avg,stolenBases,runs,doubles,triples,ops,atBats,plateAppearances'
  _season = fetch(url)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const out = new Map()
      ;(j?.stats?.[0]?.splits || []).forEach((sp) => {
        const id = Number(sp?.player?.id)
        const st = sp?.stat || {}
        if (!id) return
        out.set(id, {
          id,
          name: sp?.player?.fullName || '',
          team: sp?.team?.name || '',
          hr: Number(st.homeRuns) || 0,
          h: Number(st.hits) || 0,
          rbi: Number(st.rbi) || 0,
          r: Number(st.runs) || 0,
          sb: Number(st.stolenBases) || 0,
          d2: Number(st.doubles) || 0,
          avg: st.avg ?? null,
          ops: st.ops ?? null,
          pa: Number(st.plateAppearances) || 0,
        })
      })
      return out.size ? out : null
    })
    .catch(() => null)
  return _season
}

// The marks worth chasing, and how close counts as chasing. Wider on the
// counting stats you rack up in threes than on homers, which arrive one at a
// time — "5 RBI from 100" is a real watch and "5 homers from 30" is a month.
export const MARKS = [
  { key: 'hr', label: 'HR', step: 10, near: 3, floor: 20 },
  { key: 'h', label: 'hits', step: 25, near: 6, floor: 100 },
  { key: 'rbi', label: 'RBI', step: 25, near: 6, floor: 75 },
  { key: 'r', label: 'runs', step: 25, near: 6, floor: 75 },
  { key: 'sb', label: 'SB', step: 10, near: 3, floor: 20 },
]

/** Everyone on tonight's card who is within reach of the next round number. */
export function chases(lines, players) {
  if (!lines || !players?.length) return []
  const out = []
  players.forEach((p) => {
    const id = Number(p?.player_id ?? p?.id)
    const s = id ? lines.get(id) : null
    if (!s) return
    MARKS.forEach((m) => {
      const v = s[m.key]
      if (!Number.isFinite(v) || v <= 0) return
      const next = Math.ceil((v + 1) / m.step) * m.step
      if (next < m.floor) return
      const away = next - v
      if (away > m.near) return
      out.push({ p, s, mark: m, next, away, value: v })
    })
  })
  // Closest first, then the bigger milestone — one homer from 40 outranks one
  // homer from 20, and both outrank three from anything.
  return out.sort((a, b) => a.away - b.away || b.next - a.next)
}
