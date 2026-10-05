// BUCKETS' SEASON NUMBERS (BATCH-BUCKETS B2, 2026-10-02). Server only. The
// legs come from ESPN's league-wide stats reads, parsed BY LABEL:
//   athletes  /statistics/byathlete  -- every player's per-game averages (582 a
//             season, 12 pages of 50), one line per player
//   teams     /statistics/byteam     -- each club's OWN and OPPONENT blocks (what
//             it allows: points, rebounds, assists, threes)
// A season that can't be read is an empty map; a player missing from it is
// "unscored" with the reason, never a zero.
import { unstable_cache } from 'next/cache'

const BASE = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics'
const UA = 'DASHNetwork/1.0'   // ESPN answers 403 to a User-Agent carrying a URL (lib/nba/api.js)
const get = (u) => fetch(u, { headers: { Accept: 'application/json', 'User-Agent': UA }, next: { revalidate: 21600 } }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`espn ${r.status}`))))
const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null }

// "name" -> value, for one category block, using the top-level `names` list
function byName(namesOf, cat) {
  const names = namesOf[cat.name] || []
  const vals = cat.totals || cat.values || []
  return Object.fromEntries(names.map((n, i) => [n, num(vals[i])]))
}

async function athletes(season, type) {
  const out = new Map()
  for (let page = 1; page <= 20; page += 1) {
    const j = await get(`${BASE}/byathlete?region=us&lang=en&contentorigin=espn&isqualified=false&season=${season}&seasontype=${type}&limit=50&page=${page}`)
    const namesOf = Object.fromEntries((j.categories || []).map((c) => [c.name, c.names || []]))
    for (const a of j.athletes || []) {
      const v = Object.assign({}, ...(a.categories || []).map((c) => byName(namesOf, c)))
      out.set(String(a.athlete?.id), {
        id: String(a.athlete?.id), name: a.athlete?.displayName, team: a.athlete?.teamShortName, pos: a.athlete?.position?.abbreviation || null,
        gp: v.gamesPlayed, min: v.avgMinutes, pts: v.avgPoints, reb: v.avgRebounds, ast: v.avgAssists,
        fga: v.avgFieldGoalsAttempted, fta: v.avgFreeThrowsAttempted, tpm: v.avgThreePointFieldGoalsMade,
        tpa: v.avgThreePointFieldGoalsAttempted, tpTot: v.threePointFieldGoalsMade, tpaTot: v.threePointFieldGoalsAttempted,
        ptsTot: v.points ?? null,   // the season's points, a total (the Ledger's who-needs-what, 10-05)
      })
    }
    if (page >= (j.pagination?.pages || 1)) break
  }
  return out
}

async function teams(season, type) {
  const j = await get(`${BASE}/byteam?region=us&lang=en&contentorigin=espn&season=${season}&seasontype=${type}&limit=30`)
  const namesOf = Object.fromEntries((j.categories || []).filter((c) => (c.names || []).length).map((c) => [c.name, c.names]))
  const out = new Map()
  for (const t of j.teams || []) {
    const opp = {}, own = {}
    for (const c of t.categories || []) Object.assign(/^Opponent/i.test(c.displayName || '') ? opp : own, byName(namesOf, c))
    out.set(String(t.team?.abbreviation), {
      abbrev: String(t.team?.abbreviation), id: String(t.team?.id || ''),
      // what this club ALLOWS a game (its opponents' per-game numbers)
      oppPts: opp.avgPoints ?? null, oppReb: opp.avgRebounds ?? null, oppAst: opp.avgAssists ?? null,
      oppTpm: opp.avgThreePointFieldGoalsMade ?? null, oppFga: opp.avgFieldGoalsAttempted ?? null, oppFgm: opp.avgFieldGoalsMade ?? null,
      // its own shots a game: the first-basket leg's denominator (his share of them)
      ownFga: own.avgFieldGoalsAttempted ?? null,
    })
  }
  return out
}

const cached = (key, fn) => unstable_cache(fn, key, { revalidate: 21600 })()
  .catch((e) => (/incrementalCache|static generation store|outside a request/i.test(String(e?.message)) ? fn() : Promise.reject(e)))

/** { athletes: Map(id -> line), teams: Map(abbrev -> allowed) } for one season (ESPN year: 2027 = 2026-27). */
// A FAILED PULL IS NOT A SEASON (2026-10-05 scan). A single failing ESPN page
// made athletes() return an empty Map, unstable_cache stored it for 6 hours,
// and every player read "fewer than 10 NBA games on file" -- unscored, NOT ON
// THE BOARD -- for every tick and preview in that window, and the tick locked
// those rows. An empty pull now throws inside the cache function (a throw is
// never stored) and the caller gets the empty answer for THIS call only.
class EmptyPull extends Error {}
export async function seasonStats(season, type = 2) {
  const pack = async () => {
    const [a, t] = await Promise.all([athletes(season, type).catch(() => new Map()), teams(season, type).catch(() => new Map())])
    if (!a.size || !t.size) throw new EmptyPull(`ESPN season stats ${season}/${type}: ${a.size} athletes, ${t.size} teams -- not cached`)
    return { athletes: [...a.values()], teams: [...t.values()] }
  }
  let p
  try {
    p = await cached(['buckets-season-v3', String(season), String(type)], pack)
  } catch (e) {
    if (!(e instanceof EmptyPull)) throw e
    console.warn(`[buckets] ${e.message}`)
    return { athletes: new Map(), teams: new Map() }
  }
  return { athletes: new Map(p.athletes.map((x) => [x.id, x])), teams: new Map(p.teams.map((x) => [x.abbrev, x])) }
}
