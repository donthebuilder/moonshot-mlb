// SGO PLAYER -> OUR PLAYER (odds plan step 1). SGO names players like
// DEVON_ACHANE_1_NFL; our records key NFL on gsis and MLB on MLBAM. The join
// is EXACT: the normalised name (SGO's display name, or its first + last --
// both are SGO's own words) must equal one of ours, on the same team, and
// resolve to exactly ONE player. Anything else is unmatched: our_player_id
// stays null and the miss is counted. Never a nearest name, never a guess.
//
// Rosters: NFL from the bot's nfl_roster.json (gsis_id, team); MLB from the
// league's free players list (id, currentTeam). Team: SGO's long name ->
// our NFL abbreviation (lib/nfl/teams.js); SGO's medium name ("Mets") ->
// MLB's own clubName.
import { normName } from '../nfl/oddsMatch'
import { NFL_TEAMS } from '../nfl/teams'
import { NFL_DATA_BASE } from '../nfl/dataSource'

const NFL_BY_LONG = Object.fromEntries(NFL_TEAMS.map(([abbr, name]) => [name.toLowerCase(), abbr]))
const TTL_MS = 6 * 3600 * 1000
const cache = {}

async function loadNfl() {
  const r = await fetch(`${NFL_DATA_BASE}/nfl_roster.json`, { cache: 'no-store' })
  if (!r.ok) throw new Error(`nfl_roster ${r.status}`)
  const j = await r.json()
  return (j.players || []).map((p) => ({ id: String(p.gsis_id || p.player_id || ''), name: p.name, team: String(p.team || '').toUpperCase() })).filter((p) => p.id && p.team)
}

async function loadMlb() {
  const season = new Date().getUTCFullYear()
  const [pr, tr] = await Promise.all([
    fetch(`https://statsapi.mlb.com/api/v1/sports/1/players?season=${season}`, { cache: 'no-store' }),
    fetch(`https://statsapi.mlb.com/api/v1/teams?sportId=1&season=${season}`, { cache: 'no-store' }),
  ])
  if (!pr.ok || !tr.ok) throw new Error(`mlb roster ${pr.status}/${tr.status}`)
  // clubName, not teamName: teamName is "D-backs" for Arizona while the odds
  // feed says "Diamondbacks" (measured on the first live lock, 09-26: ARI
  // 0/60 matched). clubName is "Diamondbacks" / "Athletics" / "Rays".
  const teamName = Object.fromEntries(((await tr.json()).teams || []).map((t) => [t.id, String(t.clubName || t.teamName || '').toLowerCase()]))
  return ((await pr.json()).people || []).map((p) => ({ id: String(p.id), name: p.fullName, team: teamName[p.currentTeam?.id] || '' })).filter((p) => p.team)
}

const LOADERS = { NFL: loadNfl, MLB: loadMlb }
const TEAM_KEY = {
  NFL: (n) => NFL_BY_LONG[String(n.long || '').toLowerCase()],
  MLB: (n) => String(n.medium || '').toLowerCase(),
}

/** A matcher for one league: (sgoPlayer, event) -> our id or null. */
export async function playerJoin(league) {
  const hit = cache[league]
  if (!hit || Date.now() - hit.at > TTL_MS) {
    const players = LOADERS[league] ? await LOADERS[league]() : []
    const index = new Map()
    for (const p of players) {
      const k = `${p.team}|${normName(p.name)}`
      index.set(k, index.has(k) ? null : p.id) // two of ours share the key: ambiguous, never picked
    }
    cache[league] = { at: Date.now(), index }
  }
  const { index } = cache[league]
  return (sp, ev) => {
    const side = ['home', 'away'].find((s) => ev.teams?.[s]?.teamID === sp.teamID)
    const names = side ? ev.teams[side].names || {} : {}
    const team = TEAM_KEY[league]?.(names)
    if (!team) return null
    const found = new Set()
    for (const n of [sp.name, `${sp.firstName || ''} ${sp.lastName || ''}`]) {
      const k = `${team}|${normName(n)}`
      if (index.has(k)) found.add(index.get(k))
    }
    return found.size === 1 ? [...found][0] : null // null covers "none", "ambiguous" and "two different people"
  }
}
