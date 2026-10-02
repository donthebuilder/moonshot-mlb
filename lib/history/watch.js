// 📜 HISTORY WATCH (milestones plan step 2, 2026-09-26). Server only.
// "Things to look out for": tonight's hitters one homer short of a history
// rung, each with the claim reaching it would make and the proof behind it.
// And REACHED: the one line a homer alert gains when it lands on a rung,
// re-asked at that moment, never read back from the morning's text.
//
// Current-season numbers come live from MLB StatsAPI; history from hist_mlb
// (lib/history/mlb.js). A player whose team, position or HR can't be read
// is skipped, never guessed.
import { mlbClaims, HR_RUNGS, CREDIT } from './mlb'
import { nhlClaims, NHL_RUNGS, CREDIT as NHL_CREDIT } from './nhl'
import { mlbPostWatch, isPostseasonDay } from './mlbPost'
import { adminClient } from '../supabase/admin'

const POS = { LF: 'OF', CF: 'OF', RF: 'OF', OF: 'OF', TWP: 'DH' }
const posOf = (abbr) => POS[abbr] || abbr || null
const db = () => {
  return adminClient()
}

let teamCache = { at: 0, map: null }
/** abbrev -> { franchise, teamName }: franchise from hist_mlb's current-season rows, name from StatsAPI. */
async function teams(season) {
  if (teamCache.map && Date.now() - teamCache.at < 6 * 3600e3) return teamCache.map
  const c = db()
  const map = new Map()
  const api = await (await fetch(`https://statsapi.mlb.com/api/v1/teams?sportId=1&season=${season}`)).json()
  const fr = new Map()
  if (c) {
    const { data } = await c.from('hist_mlb').select('team, franchise').eq('season', season).neq('team', 'TOT').not('franchise', 'is', null).limit(5000)
    for (const r of data || []) fr.set(r.team, r.franchise)
  }
  for (const t of api.teams || []) map.set(t.abbreviation, { franchise: fr.get(t.abbreviation) || null, teamName: t.teamName, id: t.id })
  teamCache = { at: Date.now(), map }
  return map
}

/** Live season HR + position + team for a set of MLBAM ids. */
async function people(ids, season) {
  const out = new Map()
  for (let i = 0; i < ids.length; i += 100) {
    const url = `https://statsapi.mlb.com/api/v1/people?personIds=${ids.slice(i, i + 100).join(',')}&hydrate=currentTeam,stats(group=[hitting],type=[season],season=${season})`
    const j = await fetch(url, { cache: 'no-store' }).then((r) => r.json()).catch(() => null)
    for (const p of j?.people || []) {
      // A traded hitter has one split per team; the season total is the
      // team-less split when present, else the sum of his team splits.
      const splits = (p.stats || []).find((s) => s.type?.displayName === 'season')?.splits || []
      const whole = splits.find((x) => !x.team)
      const hr = whole ? Number(whole.stat?.homeRuns) : splits.length ? splits.reduce((a, x) => a + Number(x.stat?.homeRuns || 0), 0) : NaN
      out.set(p.id, { name: p.fullName, position: posOf(p.primaryPosition?.abbreviation), teamId: p.currentTeam?.id, hr })
    }
  }
  return out
}

/**
 * Tonight's watch list for MLB.
 * @param rows  the day's board rows (player_id = MLBAM id) -- already gated as today's
 * @returns [{ player_id, name, team, hr, rung, claim, proof }] rarest first
 */
export async function mlbWatch(rows, season, { day = null } = {}) {
  const ids = [...new Set((rows || []).map((r) => Number(r.player_id)).filter(Boolean))]
  if (!ids.length) return []
  // OCTOBER (HISTORY WATCH 2 step 4): on a postseason day no regular-season
  // rung can be reached, so the postseason claims answer instead
  // (lib/history/mlbPost.js). An unreadable schedule falls back to the
  // season rungs, which simply find nothing once the season is over.
  if (day && (await isPostseasonDay(day))) return mlbPostWatch(rows, season, await teams(season))
  const [tm, ppl] = await Promise.all([teams(season), people(ids, season)])
  const byId = new Map([...tm.values()].map((t) => [t.id, t]))
  const abbrOf = new Map([...tm.entries()].map(([ab, t]) => [t.id, ab]))
  const out = []
  for (const [id, p] of ppl) {
    if (!Number.isFinite(p.hr) || !p.teamId) continue
    const rung = HR_RUNGS.find((t) => t - p.hr === 1)
    if (!rung) continue
    const t = byId.get(p.teamId)
    if (!t?.franchise) continue
    const claims = await mlbClaims({ name: p.name, franchise: t.franchise, teamName: t.teamName, position: p.position }, { stat: 'hr', value: rung, season, what: `${rung} HR` }).catch(() => [])
    if (!claims.length) continue
    out.push({ player_id: String(id), name: p.name, team: abbrOf.get(p.teamId), hr: p.hr, rung, claim: claims[0].text, proof: claims[0].proof, more: claims.slice(1).map((c) => c.text) })
  }
  return out.sort((a, b) => (a.proof.lastSeason ?? 0) - (b.proof.lastSeason ?? 0) || b.rung - a.rung)
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

/** The daily post. Null when nothing passes: then nothing is posted. No link, max 3 names. */
export function historyWatchText(items) {
  if (!items?.length) return null
  const [top, ...rest] = items
  // A postseason item carries its own lead and prefix (lib/history/mlbPost.js):
  // a club drought is about the club, not the hitter it rides on.
  const lead = top.lead || `${top.name} (${top.team}) sits on ${top.hr} HR.`
  const lines = ['📜 HISTORY WATCH', '', lead, `${top.prefix || 'One more'}: ${top.claim}.`]
  const also = rest.slice(0, 2)
  const alsoLine = (i) => (i.kind === 'DROUGHT' ? `· ${i.team} — a homer tonight: ${i.claim}` : `· ${i.name} (${i.team}) — one more: ${i.claim}`)
  if (also.length) lines.push('', 'Also in reach tonight:', ...also.map(alsoLine))
  return lines.join('\n')
}

/**
 * REACHED: the one extra line for a homer alert that lands on a rung.
 * `ev` = the homer_feed row / live event (player_id, team, stats.season_hr, hr_n).
 * Re-asked at event time; null when it is not a rung, can't be verified, or is suppressed.
 */
export async function reachedLine(ev, season) {
  const before = Number(ev?.stats?.season_hr)
  const nth = Number.isFinite(before) ? before + Number(ev?.hr_n || 1) : null
  if (!nth || !HR_RUNGS.includes(nth)) return null
  try {
    // A postseason homer is not a season homer: season_hr + 1 landing on a
    // rung would claim "first to 30 HR" for a ball hit in October.
    if (ev.day && (await isPostseasonDay(ev.day)) !== false) return null
    const tm = await teams(season)
    const t = tm.get(String(ev.team || '').toUpperCase())
    if (!t?.franchise) return null
    const p = (await people([Number(ev.player_id)], season)).get(Number(ev.player_id))
    const claims = await mlbClaims({ name: ev.name, franchise: t.franchise, teamName: t.teamName, position: p?.position }, { stat: 'hr', value: nth, season, what: `${nth} HR` })
    return claims.length ? `📜 ${cap(claims[0].text)}.` : null
  } catch (e) {
    console.error(`[history] reached ${ev?.name}: ${e?.message}`)
    return null
  }
}

export { CREDIT }

// ── NHL (milestones plan step 3) ──────────────────────────────────────────
// Tonight's skaters (the day's games, current rosters) one goal short of a
// rung (NHL_RUNGS.g), their season line read live from the league's own
// report. Empty until the regular season has games -- a preseason goal is
// not a season goal.
// Age on Feb 1 of the season's second year -- the rule build-nhl.mjs stores.
function ageOnFeb1(birth, season) {
  if (!birth) return null
  const [y, m, d] = String(birth).split('-').map(Number)
  return (season % 10000) - y - ((m > 2 || (m === 2 && d > 1)) ? 1 : 0)
}

export async function nhlWatch(date) {
  const base = 'https://api-web.nhle.com/v1'
  const score = await (await fetch(`${base}/score/${date}`, { redirect: 'follow' })).json()
  const games = (score.games || []).filter((g) => g.gameType === 2)
  if (!games.length) return []
  const season = games[0].season
  const clubs = new Map()
  for (const g of games) for (const t of [g.awayTeam, g.homeTeam]) clubs.set(t.abbrev, t.id)
  const teamFr = new Map(((await (await fetch('https://api.nhle.com/stats/rest/en/team')).json()).data || []).map((t) => [t.triCode, t.franchiseId]))
  const line = new Map()
  const rep = await (await fetch(`https://api.nhle.com/stats/rest/en/skater/summary?limit=-1&cayenneExp=${encodeURIComponent(`seasonId=${season} and gameTypeId=2`)}`)).json()
  for (const r of rep.data || []) line.set(r.playerId, r)
  const bios = new Map((((await (await fetch(`https://api.nhle.com/stats/rest/en/skater/bios?limit=-1&cayenneExp=${encodeURIComponent(`seasonId=${season} and gameTypeId=2`)}`)).json()).data) || []).map((b) => [b.playerId, b]))
  // Rookie by the league's rule, from his own earlier seasons in hist_nhl
  // (scripts/history/rookies-nhl.mjs): never 25+ GP in one season, never
  // 6+ GP in two, and not 27+ by Feb 1 -- not "first season in the league".
  const c = db()
  const priorGp = new Map()
  if (c) {
    const ids = [...line.keys()]
    for (let i = 0; i < ids.length; i += 300) {
      const { data } = await c.from('hist_nhl').select('player_id, season, team, gp').in('player_id', ids.slice(i, i + 300)).lt('season', season).limit(20000)
      const per = new Map()
      for (const r of data || []) { const k = `${r.player_id}:${r.season}`; const cur = per.get(k); if (!cur || r.team === 'TOT') per.set(k, r) }
      for (const r of per.values()) (priorGp.get(r.player_id) || priorGp.set(r.player_id, []).get(r.player_id)).push(r.gp || 0)
    }
  }
  const isRookie = (id, age) => { const g = priorGp.get(id) || []; return !g.some((x) => x >= 25) && g.filter((x) => x >= 6).length < 2 && (age == null || age <= 26) }
  const out = []
  for (const [abbrev] of clubs) {
    const roster = await (await fetch(`${base}/roster/${abbrev}/current`, { redirect: 'follow' })).json().catch(() => ({}))
    for (const p of [...(roster.forwards || []), ...(roster.defensemen || [])]) {
      const r = line.get(p.id); if (!r) continue
      const rung = NHL_RUNGS.g.find((t) => t - r.goals === 1); if (!rung) continue
      const b = bios.get(p.id) || {}
      const claims = await nhlClaims({ franchise: teamFr.get(abbrev), position: r.positionCode, rookie: isRookie(p.id, ageOnFeb1(b.birthDate, season)), age: ageOnFeb1(b.birthDate, season) }, { stat: 'g', value: rung, season }).catch(() => [])
      if (!claims.length) continue
      out.push({ player_id: String(p.id), name: `${p.firstName?.default || ''} ${p.lastName?.default || ''}`.trim(), team: abbrev, hr: r.goals, rung, claim: claims[0].text, proof: claims[0].proof, more: claims.slice(1).map((c) => c.text) })
    }
  }
  return out.sort((a, b) => (a.proof.lastSeason ?? 0) - (b.proof.lastSeason ?? 0) || b.rung - a.rung)
}
export { NHL_CREDIT }
