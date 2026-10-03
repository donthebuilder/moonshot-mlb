// BUCKETS' SEASONS (server). ESPN names a season by the year it ends (2027 =
// 2026-27). Which season and which phase come from ESPN's own scoreboard
// (leagues[0].season: year + type 1 pre / 2 regular / 3 post / 4 off) -- the
// schedule, never a typed date (rule 44). In the preseason and the offseason
// the pages read last completed numbers and say so ("stale").
import { scoreboardFor } from './api'
import { easternToday } from '../data'

export const seasonLabel = (s) => `${s - 1}-${String(s).slice(2)}`

/** { cur, prev, read, label, stale, phase } */
export async function nbaSeason(today = easternToday()) {
  let year = null, type = null
  try {
    const s = (await scoreboardFor(today))?.leagues?.[0]?.season
    year = Number(s?.year) || null; type = Number(s?.type?.type) || null
  } catch { /* the calendar fallback below */ }
  if (!year) { const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)); year = m >= 9 ? y + 1 : y }
  // regular season and playoffs read this season; preseason / offseason read the last one played
  const stale = !(type === 2 || type === 3 || type === 5)
  const read = stale && type !== 4 ? year - 1 : year
  return { cur: year, prev: year - 1, read, label: seasonLabel(read), stale, phase: type }
}
