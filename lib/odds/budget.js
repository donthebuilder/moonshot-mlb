// THE ODDS MONTH PLANNER (2026-10-02, BATCH-RECORD-PAGE "odds budget for four
// sports"; Donovan: "if it works, but be strategic"). Server only.
// The free plan is 2,500 objects a month. /api/odds/tick spends about one
// object a game per snapshot: LIST (the morning read) + LOCK (the priced pick,
// never dropped) + CLOSE (dropped first). NHL takes list + lock only.
// On the month's first tick this counts every listed league's REAL games for
// the month from its own free public schedule (no SGO objects), x its
// snapshots. If that passes the soft cap (2,200), CLOSE is off for the WHOLE
// month from day one -- not mid-month when the money runs out. Logged, and
// shown on /admin. A schedule that can't be read counts as unknown, and an
// unknown month keeps CLOSE off (the safe side).
import { unstable_cache } from 'next/cache'

export const SOFT_CAP = 2200
export const SNAPS = { MLB: { withClose: 3, noClose: 2 }, NFL: { withClose: 3, noClose: 2 }, NHL: { withClose: 2, noClose: 2 }, NBA: { withClose: 3, noClose: 2 } }

const lastDay = (ym) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate()
const j = (u) => fetch(u, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${u}`))))

// ESPN's scoreboard: one day per read (its date-RANGE form answers 400 as of
// 2026-10-02), regular season + postseason only (season.type 2 / 3)
async function espnMonth(path, ym) {
  const days = Array.from({ length: lastDay(ym) }, (_, i) => `${ym.replace('-', '')}${String(i + 1).padStart(2, '0')}`)
  const ids = new Set()
  for (let i = 0; i < days.length; i += 8) {
    const got = await Promise.all(days.slice(i, i + 8).map((d) => j(`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${d}`)))
    for (const g of got) for (const e of g.events || []) if (e?.season?.type === 2 || e?.season?.type === 3) ids.add(e.id)
  }
  return ids.size
}

// each league's games in the month, from its own schedule (regular + postseason)
const COUNT = {
  async MLB(ym) {
    const d = await j(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${ym}-01&endDate=${ym}-${lastDay(ym)}&gameType=R,F,D,L,W`)
    return Number(d.totalGames) || 0
  },
  NFL: (ym) => espnMonth('football/nfl', ym),
  NBA: (ym) => espnMonth('basketball/nba', ym),
  async NHL(ym) {
    const seen = new Set()
    for (let day = 1; day <= lastDay(ym); day += 7) {
      const d = await j(`https://api-web.nhle.com/v1/schedule/${ym}-${String(day).padStart(2, '0')}`)
      for (const w of d.gameWeek || []) if (String(w.date).startsWith(ym)) for (const g of w.games || []) if (g.gameType === 2 || g.gameType === 3) seen.add(g.id)
    }
    return seen.size
  },
}

async function buildPlan(ym, leagues) {
  const games = {}, errors = {}
  for (const L of leagues) {
    try { games[L] = await COUNT[L](ym) } catch (e) { games[L] = null; errors[L] = String(e?.message || e).slice(0, 120) }
  }
  const known = Object.values(games).every((n) => Number.isFinite(n))
  const withClose = leagues.reduce((a, L) => a + (games[L] || 0) * SNAPS[L].withClose, 0)
  const noClose = leagues.reduce((a, L) => a + (games[L] || 0) * SNAPS[L].noClose, 0)
  const closeOff = !known || withClose > SOFT_CAP
  const plan = { month: ym, leagues, games, errors, projected: { withClose, noClose }, softCap: SOFT_CAP, closeOff, why: !known ? 'a schedule could not be read: CLOSE off (the safe side)' : closeOff ? `${withClose} objects with CLOSE > ${SOFT_CAP}: CLOSE off all month` : `${withClose} objects with CLOSE fits under ${SOFT_CAP}`, builtAt: new Date().toISOString() }
  console.log(`[odds plan] ${ym} ${JSON.stringify(games)} -> with close ${withClose}, without ${noClose}; ${plan.why}`)
  return plan
}

/** The month's plan for the leagues the tick lists; read once a day per instance set (Data Cache). */
export function monthPlan(ym, leagues) {
  const key = [...leagues].sort().join(',')
  return unstable_cache(() => buildPlan(ym, leagues), ['odds-month-plan-v1', ym, key], { revalidate: 86400 })()
    .catch((e) => (/incrementalCache|static generation store|outside a request/i.test(String(e?.message)) ? buildPlan(ym, leagues) : Promise.reject(e)))
}
