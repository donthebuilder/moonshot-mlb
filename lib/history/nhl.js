// 📜 NHL HISTORY CLAIMS (milestones plan step 3, 2026-09-26). Server only.
// Reads hist_nhl (the NHL's own stats reports, 1917-18 on; one row per
// player per franchise plus TOT) and answers with lib/history/lastTime.js.
// Franchise = the league's franchiseId, which carries relocations itself.
// Positions are grouped the way hockey talks: forwards (C/L/R), defencemen,
// goalies.
import { lastTime, wordClaim } from './lastTime'
import { adminClient } from '../supabase/admin'

export const CREDIT = 'Data: NHL stats (api.nhle.com)'
export const NHL_RUNGS = { g: [20, 30, 40, 50, 60], pts: [50, 75, 100] }
const GROUP = { C: 'F', L: 'F', R: 'F', D: 'D', G: 'G' }
const GROUP_WORD = { F: 'forward', D: 'defenceman', G: 'goalie' }
const STAT_WORD = { g: 'goals', pts: 'points' }

const db = () => {
  return adminClient()
}
let names = null
/** franchiseId -> "Oilers" (the league's own teamCommonName). */
export async function franchiseNames() {
  if (names) return names
  const j = await (await fetch('https://api.nhle.com/stats/rest/en/franchise')).json()
  names = new Map((j.data || []).map((f) => [String(f.id), f.teamCommonName]))
  return names
}
const firstSeason = new Map()
async function franchiseFrom(c, franchise) {
  if (firstSeason.has(franchise)) return firstSeason.get(franchise)
  const { data } = await c.from('hist_nhl').select('season').eq('franchise', franchise).order('season', { ascending: true }).limit(1)
  const v = data?.[0]?.season ?? null
  firstSeason.set(franchise, v)
  return v
}
// The engine speaks years; an NHL season is 20242025. Rows and the question
// are converted to the season's first year, and the words back to "2024-25".
const yr = (s) => Math.floor(Number(s) / 10000)
const seasonWords = (text) => text.replace(/\b(1[89]\d\d|20\d\d)\b/g, (y) => `${y}-${String((Number(y) + 1) % 100).padStart(2, '0')}`)

/**
 * Claims for reaching `value` of `stat` ('g' | 'pts') this season.
 * @param p { franchise, position, rookie, age }
 */
export async function nhlClaims(p, { stat = 'g', value, season }) {
  const c = db()
  if (!c || !p?.franchise) return []
  const what = `${value} ${STAT_WORD[stat]}`
  const teamName = (await franchiseNames()).get(String(p.franchise)) || 'club'
  const group = GROUP[p.position] || null
  const { data, error } = await c.from('hist_nhl').select('season, player_id, name, team, franchise, position, age, rookie, g, pts')
    .eq('franchise', String(p.franchise)).lt('season', season).gte(stat, value).order('season', { ascending: false }).limit(500)
  if (error) throw new Error(`hist_nhl: ${error.message}`)
  const rows = (data || []).map((r) => ({ ...r, season: yr(r.season), source_id: r.player_id, position: GROUP[r.position] || r.position }))
  const first = yr(await franchiseFrom(c, String(p.franchise)))
  const now = yr(season)
  const tries = [
    group && { type: 'C1', who: `${teamName} ${GROUP_WORD[group]}`, q: { stat, value, franchise: String(p.franchise), position: group, before: now } },
    { type: 'C2', who: `${teamName} player`, q: { stat, value, franchise: String(p.franchise), before: now } },
    p.rookie && { type: 'C3', who: `${teamName} rookie`, q: { stat, value, franchise: String(p.franchise), rookie: true, before: now } },
  ].filter(Boolean)
  const out = []
  for (const t of tries) {
    const ans = lastTime(rows, t.q)
    ans.coverageFrom = first
    const text = wordClaim(ans, { who: t.who, what, season: now, firstSeason: first })
    if (text) out.push({ type: t.type, text: seasonWords(text), proof: { ...t.q, who: t.who, lastSeason: ans.lastSeason, lastPlayer: ans.lastPlayer, lastValue: ans.lastValue, hits: ans.hits, coverageFrom: first, allSince: ans.allSince, source: CREDIT } })
  }
  // C5, league-wide: the youngest to get there (age in the season's middle).
  if (p.age != null && p.age <= 21) {
    const { data: young } = await c.from('hist_nhl').select('season, player_id, name, team, age, g, pts').neq('team', 'TOT').lt('season', season).gte(stat, value).lte('age', p.age).order('season', { ascending: false }).limit(200)
    const ans = lastTime((young || []).map((r) => ({ ...r, season: yr(r.season), source_id: r.player_id })), { stat, value, ageMax: p.age, before: now })
    const text = wordClaim(ans, { who: `player aged ${p.age} or younger`, what, season: now })
    if (text && ans.lastSeason) out.push({ type: 'C5', text: seasonWords(text), proof: { stat, value, ageMax: p.age, who: `player aged ${p.age} or younger`, lastSeason: ans.lastSeason, lastPlayer: ans.lastPlayer, lastValue: ans.lastValue, hits: ans.hits, allSince: ans.allSince, source: CREDIT } })
  }
  return out.sort((a, b) => (a.proof.lastSeason ?? 0) - (b.proof.lastSeason ?? 0))
}
