// 📜 MLB HISTORY CLAIMS (milestones plan steps 1-2). Server only. Reads
// hist_mlb (SABR Lahman 1871-2025 + StatsAPI) through the service key and
// answers with lib/history/lastTime.js, so a claim is always a query result
// with its proof attached.
//
// Only seasons BEFORE the current one are read here: the current season's
// numbers come live from StatsAPI at the moment a claim is made, so the
// history table needs its backfill and nothing nightly.
import { lastTime, wordClaim, posWord } from './lastTime'
import { adminClient } from '../supabase/admin'

export const CREDIT = 'Data: SABR Lahman Baseball Database; MLB StatsAPI'
// History rungs every five homers: the round numbers the old milestone list
// used (20/30/40/50/60) plus the fives between -- Donovan's own example is 25.
export const HR_RUNGS = [20, 25, 30, 35, 40, 45, 50, 55, 60]

const db = () => {
  return adminClient()
}
const firstSeasonCache = new Map()

/** The franchise's first season in the data (for "ever" wording). */
async function franchiseFrom(c, franchise) {
  if (firstSeasonCache.has(franchise)) return firstSeasonCache.get(franchise)
  const { data } = await c.from('hist_mlb').select('season').eq('franchise', franchise).order('season', { ascending: true }).limit(1)
  const v = data?.[0]?.season ?? null
  firstSeasonCache.set(franchise, v)
  return v
}

/**
 * The claims a player would make by reaching `value` of `stat` this season.
 * @param p { name, franchise, teamName, position }  teamName = "Braves"
 * @returns [{ type, text, proof }] -- only claims that pass the suppress rules
 */
export async function mlbClaims(p, { stat = 'hr', value, season, what }) {
  const c = db()
  if (!c || !p?.franchise) return []
  const { data, error } = await c.from('hist_mlb')
    .select('season, source_id, name, team, franchise, position, age, rookie, hr, h, rbi, sb, d2b, tb')
    .eq('franchise', p.franchise).neq('team', 'TOT').lt('season', season).gte(stat, value)
    .order('season', { ascending: false }).limit(500)
  if (error) throw new Error(`hist_mlb: ${error.message}`)
  const first = await franchiseFrom(c, p.franchise)
  const rows = data || []
  const out = []
  const tries = [
    { type: 'C1', who: `${p.teamName} ${posWord(p.position)}`, q: { stat, value, franchise: p.franchise, position: p.position, before: season } },
    { type: 'C2', who: `${p.teamName} player`, q: { stat, value, franchise: p.franchise, before: season } },
  ]
  for (const t of tries) {
    if (t.type === 'C1' && (!p.position || p.position === 'DH')) continue   // a DH season has no fielding position to compare
    const ans = lastTime(rows, t.q)
    // coverageFrom from these rows is the first season anyone reached it; the
    // franchise's own first season is the real floor.
    ans.coverageFrom = first
    const text = wordClaim(ans, { who: t.who, what, season, firstSeason: first })
    if (text) out.push({ type: t.type, text, proof: { ...t.q, who: t.who, lastSeason: ans.lastSeason, lastPlayer: ans.lastPlayer, lastValue: ans.lastValue, hits: ans.hits, coverageFrom: first, allSince: ans.allSince, source: CREDIT } })
  }
  // Rarest first: the longest gap since the last time (never done = rarest).
  return out.sort((a, b) => (a.proof.lastSeason ?? 0) - (b.proof.lastSeason ?? 0))
}
