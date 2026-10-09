// 🥅 GOALIE QUALITY, READ (2026-10-08). Server only. Both clubs' last 82 regular-season club-game rows dated
// BEFORE the game's own date (lamp_team_game_xg, the team model's own rows) -> lib/nhl/goalieQuality.js, with
// names from the league's goalie report. A missing table, a failed read or a name the league does not list never
// invents a number: { available: false } / a null name.
import { unstable_cache } from 'next/cache'
import { adminClient } from '../supabase/admin'
import { readRows } from './teamProjRead'
import { clubGoalies } from './goalieQuality'
import { goaliesForSeason } from './seasonStats'

export const seasonOf = (date) => { const y = Number(date.slice(0, 4)); const s = Number(date.slice(5, 7)) >= 9 ? y : y - 1; return Number(`${s}${s + 1}`) }

export async function readGoalieQuality({ home, away, date }) {
  const db = adminClient()
  if (!db) return { available: false }
  const run = async () => {
    const rows = await readRows(db, [home, away], date)
    const clubs = { [home]: clubGoalies(rows[home], date), [away]: clubGoalies(rows[away], date) }
    if (!clubs[home].length && !clubs[away].length) return { available: false }
    const names = new Map((await goaliesForSeason(seasonOf(date)).catch(() => [])).map((g) => [g.id, g.name]))
    for (const c of Object.keys(clubs)) clubs[c] = clubs[c].map((g) => ({ ...g, team: c, name: names.get(g.id) || null }))
    return { available: true, clubs, asOf: date }
  }
  try {
    try {
      return await unstable_cache(run, ['lamp-goaliequality-v1', date, home, away], { revalidate: 1800 })()
    } catch (e) {
      if (!/incrementalCache|static generation store|outside a request/i.test(String(e?.message))) throw e
      return await run()
    }
  } catch (e) {
    console.error(`[lamp goaliequality] ${e?.message}`)   // a missing table lands here
    return { available: false }
  }
}
