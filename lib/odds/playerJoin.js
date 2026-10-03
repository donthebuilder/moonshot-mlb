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
import { NHL_TEAMS } from '../nhl/teams'
import { NBA_TEAMS } from '../nba/teams'
import { rosterFor as nbaRosterFor } from '../nba/api'
import { rosterFor } from '../nhl/api'

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

// NHL (odds step 2, 2026-09-27): every club's current roster from the
// league (api-web roster/{team}/current), keyed by our NHL player id. Team:
// SGO's long name ("Florida Panthers", "Montreal Canadiens") matched to the
// league's place + nickname with accents stripped, or the nickname alone.
const fold = (s) => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
const NHL_BY_NAME = new Map(NHL_TEAMS.flatMap(([ab, , place, nick]) => [[fold(`${place} ${nick}`), ab], [fold(nick), ab]]))
//
// RATE LIMITED, NOT MISNAMED (2026-10-01). 32 rosters fired at once with
// cache:'no-store' hit the league's limit: a probe got 32/32, then 0/32 (HTTP
// 429 on every club) on the next burst. A failed club was skipped silently and
// the half-index cached for 6 hours, so whole teams matched 0 (09-29 lock:
// CHI 0/103, VGK 0/108; 09-30 lock: every team 0 -- the whole load threw).
// Now: LAMP's own cached roster read (lib/nhl/api.js rosterFor, Vercel Data
// Cache, one upstream call per club per hour), four clubs at a time, retried
// on failure; a club still missing borrows its last complete roster, and an
// index that needed to borrow is re-checked in 5 minutes, not 6 hours.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const lastNhlByTeam = new Map()
async function loadNhl() {
  const out = []
  const missing = []
  for (let i = 0; i < NHL_TEAMS.length; i += 4) {
    await Promise.all(NHL_TEAMS.slice(i, i + 4).map(async ([ab]) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const j = await rosterFor(ab)
          const team = [...(j.forwards || []), ...(j.defensemen || []), ...(j.goalies || [])]
            .map((p) => ({ id: String(p.id), name: `${p.firstName?.default || ''} ${p.lastName?.default || ''}`.trim(), team: ab }))
          if (team.length) { lastNhlByTeam.set(ab, team); out.push(...team); return }
        } catch { /* retried below */ }
        await sleep(500 * (attempt + 1))
      }
      missing.push(ab)
      if (lastNhlByTeam.has(ab)) out.push(...lastNhlByTeam.get(ab))
    }))
  }
  if (!out.length) throw new Error('nhl rosters: none')
  if (missing.length) console.warn(`[odds] nhl rosters missing after retries: ${missing.join(' ')} (${missing.filter((t) => lastNhlByTeam.has(t)).length} filled from the last complete roster)`)
  out.partial = missing.length > 0
  return out
}

// BUCKETS (2026-10-03): every club's ESPN roster (cached 1 h by lib/nba/api),
// keyed by our ESPN athlete id. Team: the club's own code (UTAH, NY, GS...).
const NBA_BY_NAME = new Map(NBA_TEAMS.flatMap(([ab, , place, nick]) => [[fold(`${place} ${nick}`), ab], [fold(nick), ab]]))
async function loadNba() {
  const out = []
  for (let i = 0; i < NBA_TEAMS.length; i += 6) {
    await Promise.all(NBA_TEAMS.slice(i, i + 6).map(async ([ab, id]) => {
      const j = await nbaRosterFor(id).catch(() => null)
      for (const a of j?.athletes || []) if (a?.id && a?.displayName) out.push({ id: String(a.id), name: a.displayName, team: ab })
    }))
  }
  return out
}

const LOADERS = { NFL: loadNfl, MLB: loadMlb, NHL: loadNhl, NBA: loadNba }
const TEAM_KEY = {
  NFL: (n) => NFL_BY_LONG[String(n.long || '').toLowerCase()],
  MLB: (n) => String(n.medium || '').toLowerCase(),
  NHL: (n) => NHL_BY_NAME.get(fold(n.long)) || NHL_BY_NAME.get(fold(n.medium)) || null,
  NBA: (n) => NBA_BY_NAME.get(fold(n.long)) || NBA_BY_NAME.get(fold(n.medium)) || null,
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
    // A partial load is used for this call but re-checked in 5 minutes, not
    // cached for the full 6 hours (TTL_MS).
    cache[league] = { at: players.partial ? Date.now() - TTL_MS + 5 * 60 * 1000 : Date.now(), index }
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
