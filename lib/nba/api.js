// BUCKETS' FEED READER (BATCH-BUCKETS B2, 2026-10-02). Server only.
// ESPN's public site API -- public but unlicensed (BUCKETS-DEFINITION SOURCE):
// identify ourselves, cache, never bypass anything, and expect the shape to
// change. Everything is parsed BY LABEL (the box score's `labels` row), never
// by column position, and a failed fetch is an error -- the caller marks the
// game ungraded; nothing here ever turns a failure into zeros.
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba'
// ESPN answers 403 to a User-Agent carrying a URL (probed 10-02); the bare name is accepted
const UA = 'DASHNetwork/1.0'

export { GAME_ID_RE } from './ids'
export const TTL = { scoreboard: 30, summary: 30, final: 3600, roster: 3600, injuries: 900 }

let _lastError = null
export const lastNbaError = () => _lastError

export async function nbaGet(path, revalidate) {
  const url = `${BASE}${path}`
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA }, ...(revalidate === 0 ? { cache: 'no-store' } : { next: { revalidate } }) }) // 0 = never the Data Cache (grading)
  if (!res.ok) {
    _lastError = { at: new Date().toISOString(), status: res.status, url }
    const err = new Error(`nba ${res.status} ${path}`); err.status = res.status; throw err
  }
  return res.json()
}

const ymd = (d) => String(d).replace(/-/g, '')
export const scoreboardFor = (date) => nbaGet(`/scoreboard?dates=${ymd(date)}`, TTL.scoreboard)
export const summaryFor = (id, final = false) => nbaGet(`/summary?event=${id}`, final ? TTL.final : TTL.summary)
export const rosterFor = (teamId) => nbaGet(`/teams/${teamId}/roster`, TTL.roster)
export const injuriesNow = () => nbaGet('/injuries', TTL.injuries)

// ── reducers ────────────────────────────────────────────────────────────────
const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null }
const STATE = { STATUS_SCHEDULED: 'pre', STATUS_IN_PROGRESS: 'live', STATUS_HALFTIME: 'live', STATUS_END_PERIOD: 'live', STATUS_FINAL: 'final', STATUS_POSTPONED: 'postponed', STATUS_CANCELED: 'canceled' }

/** One scoreboard day -> games. season.type 2 = regular season, 3 = playoffs, 1 = preseason. */
export function reduceScoreboard(j) {
  return (j?.events || []).map((e) => {
    const c = e.competitions?.[0] || {}
    const side = (h) => {
      const t = (c.competitors || []).find((x) => x.homeAway === h) || {}
      return { id: String(t.team?.id || ''), abbrev: String(t.team?.abbreviation || ''), name: String(t.team?.shortDisplayName || t.team?.name || ''), score: num(t.score) }
    }
    return {
      id: String(e.id), start: e.date, seasonYear: num(e.season?.year), seasonType: num(e.season?.type),
      state: STATE[e.status?.type?.name] || 'pre', detail: String(e.status?.type?.shortDetail || ''),
      away: side('away'), home: side('home'), venue: String(c.venue?.fullName || '') || null,
    }
  })
}

// "4-6" -> [4, 6]
const pair = (s) => { const m = String(s || '').match(/^(\d+)-(\d+)$/); return m ? [Number(m[1]), Number(m[2])] : [null, null] }

/** The box score, by label: every player who appears, his line and whether he started. */
export function reduceBox(summary) {
  const out = []
  for (const team of summary?.boxscore?.players || []) {
    const abbrev = String(team.team?.abbreviation || '')
    for (const block of team.statistics || []) {
      const labels = block.labels || block.names || []
      const at = (k) => labels.indexOf(k)
      for (const a of block.athletes || []) {
        const st = a.stats || []
        const get = (k) => (at(k) >= 0 ? st[at(k)] : null)
        const [fgm, fga] = pair(get('FG')), [tpm, tpa] = pair(get('3PT')), [ftm, fta] = pair(get('FT'))
        out.push({
          id: String(a.athlete?.id || ''), name: String(a.athlete?.displayName || ''), team: abbrev, pos: a.athlete?.position?.abbreviation || null,
          starter: a.starter === true, dnp: Boolean(a.didNotPlay) || st.length === 0, reason: a.reason || null,
          min: num(get('MIN')), pts: num(get('PTS')), reb: num(get('REB')), ast: num(get('AST')),
          fgm, fga, tpm, tpa, ftm, fta, stl: num(get('STL')), blk: num(get('BLK')), to: num(get('TO')),
        })
      }
    }
  }
  return out
}

// A three: the play's own pointsAttempted (exact). Fallback if it's ever
// missing: made for 3, worded as one, or (a miss is often worded "26-foot
// running jump shot") from beyond the arc. The rim sits at x 25, y 1 in the
// feed (fitted on 764 shots, 10-02); the arc is 23.75 ft, 22 ft in the corners
// (within ~9.75 ft of the rim's y, the baseline being 4.25 ft behind it).
function isThree(p, x, y, dist) {
  // the feed says what the shot was worth trying for: exact when present
  if (num(p.pointsAttempted) != null) return num(p.pointsAttempted) === 3
  if (num(p.scoreValue) === 3 || /three point/i.test(String(p.text || ''))) return true
  if (p.scoringPlay) return false
  const d = Math.hypot(x - 25, y - 1)
  if (y <= 9.75 && Math.abs(x - 25) >= 22) return true
  return (dist != null && dist >= 24) || d >= 23.75
}

/** Every field-goal attempt with its spot on the floor (free throws dropped: their
 *  coordinate is a junk value, -214748340, BUCKETS-PLAN-v2 §1). x 0-49, y in feet. */
export function reduceShots(summary, gameId) {
  const out = []
  for (const p of summary?.plays || []) {
    if (!p.shootingPlay) continue
    const x = num(p.coordinate?.x), y = num(p.coordinate?.y)
    if (x == null || y == null || x < -5 || x > 55 || y < -5 || y > 100) continue   // free throws and junk
    if (/free throw/i.test(String(p.type?.text || p.text || ''))) continue
    // a heave isn't a field-goal attempt in ESPN's box score -- kept out so the
    // chart's counts equal the box (MEM@PHI 03-10: 2 heaves, 183 FGA)
    if (/heave/i.test(String(p.type?.text || p.text || ''))) continue
    const dist = num((String(p.text || '').match(/(\d+)-foot/) || [])[1])
    out.push({
      game_id: String(gameId), event_id: String(p.id || p.sequenceNumber || ''),
      player_id: String(p.participants?.[0]?.athlete?.id || ''), team_id: String(p.team?.id || ''),
      x, y, shot_type: String(p.type?.text || ''), made: p.scoringPlay === true, points: num(p.scoreValue) || 0,
      distance: dist, period: num(p.period?.number), clock: String(p.clock?.displayValue || ''),
      three: isThree(p, x, y, dist),
    })
  }
  return out
}

/** The first made field goal of the game, and the first points of any kind (both shown, BUCKETS-PLAN-v2). */
export function firstBaskets(summary) {
  let fg = null, pts = null
  for (const p of summary?.plays || []) {
    if (!p.scoringPlay) continue
    const who = String(p.participants?.[0]?.athlete?.id || '')
    if (!pts) pts = { player_id: who, text: String(p.text || ''), free_throw: /free throw/i.test(String(p.type?.text || p.text || '')) }
    if (!fg && !/free throw/i.test(String(p.type?.text || p.text || ''))) fg = { player_id: who, text: String(p.text || '') }
    if (fg && pts) break
  }
  return { firstFieldGoal: fg, firstPoints: pts }
}

// ── standings, schedules, people (BUCKETS shell, 2026-10-02) ────────────────
const WEB = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba'
const V2 = 'https://site.api.espn.com/apis/v2/sports/basketball/nba'
const getAbs = async (url, revalidate) => {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA }, ...(revalidate === 0 ? { cache: 'no-store' } : { next: { revalidate } }) }) // 0 = never the Data Cache (grading)
  if (!res.ok) { _lastError = { at: new Date().toISOString(), status: res.status, url }; const e = new Error(`nba ${res.status}`); e.status = res.status; throw e }
  return res.json()
}
// THE STARTERS, BEFORE TIP (2026-10-04, bot audit L7). The pre-tip summary
// box has no starters, so FIRST BASKET (starters only) scored nobody at the
// lock 9.5 min before tip. ESPN's core competitor roster carries `starter`
// once the lineups are in; before that it has none and this returns an empty
// Set -- the market then calls no one in that game rather than guess.
const CORE = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba'
export async function startersFor(eventId, teamId) {
  const j = await getAbs(`${CORE}/events/${eventId}/competitions/${eventId}/competitors/${teamId}/roster`, 60)
  return new Set((j?.entries || []).filter((e) => e?.starter === true).map((e) => String(e.playerId)))
}
export const standingsFor = (season) => getAbs(`${V2}/standings${season ? `?season=${season}` : ''}`, 600)
export const teamScheduleFor = (teamId, season) => getAbs(`${BASE}/teams/${teamId}/schedule${season ? `?season=${season}` : ''}`, 900)
/** His birth date (YYYY-MM-DD) from the league's core athlete file -- the card's displayDOB is d/m or m/d by locale, so it isn't read. null when absent. */
export const birthDateFor = (id) => getAbs(`${CORE}/athletes/${id}`, 86400).then((j) => (/^\d{4}-\d{2}-\d{2}/.test(String(j?.dateOfBirth || '')) ? String(j.dateOfBirth).slice(0, 10) : null)).catch(() => null)
export const athleteFor = (id) => getAbs(`${WEB}/athletes/${id}`, 3600)
export const gamelogFor = (id, season) => getAbs(`${WEB}/athletes/${id}/gamelog${season ? `?season=${season}` : ''}`, 900)

/** Standings by label: [{ conf, rows: [{ abbrev, w, l, pct, gb, streak, seed, home, road, last10, ppg, oppg, diff }] }] */
export function reduceStandings(j) {
  return (j?.children || []).map((c) => ({
    conf: /east/i.test(c.name) ? 'E' : 'W', name: c.name,
    rows: (c.standings?.entries || []).map((e) => {
      const v = Object.fromEntries((e.stats || []).map((s) => [s.name, s.displayValue ?? s.value]))
      return { abbrev: e.team?.abbreviation, name: e.team?.shortDisplayName || e.team?.name, id: String(e.team?.id || ''),
        w: num(v.wins), l: num(v.losses), pct: num(v.winPercent), /* ESPN sends '.732' (a string) */ gb: v.gamesBehind ?? null, streak: v.streak ?? null, seed: num(v.playoffSeed),
        home: v.Home ?? null, road: v.Road ?? null, last10: v['Last Ten Games'] ?? null, ppg: num(v.avgPointsFor), oppg: num(v.avgPointsAgainst), diff: v.differential ?? null, clinch: v.clincher || null }
    }).sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99)),
  }))
}

/** A club's season: [{ id, date, home, opp, state, us, them, result }] */
export function reduceTeamSchedule(j, abbrev) {
  return (j?.events || []).map((e) => {
    const c = e.competitions?.[0] || {}
    const me = (c.competitors || []).find((x) => x.team?.abbreviation === abbrev) || {}
    const op = (c.competitors || []).find((x) => x !== me) || {}
    const st = STATE[c.status?.type?.name] || 'pre'
    return { id: String(e.id), start: e.date, seasonType: num(e.seasonType?.type), home: me.homeAway === 'home', opp: op.team?.abbreviation || null, state: st,
      us: num(me.score?.value ?? me.score?.displayValue), them: num(op.score?.value ?? op.score?.displayValue), result: st === 'final' ? (me.winner ? 'W' : 'L') : null }
  })
}

/** One player's game log, flattened out of ESPN's months: [{ id, date, atVs, opp, result, score, min, pts, reb, ast, tpm, fgm, fga, ... }] */
export function reduceGamelog(j) {
  const names = j?.names || []
  const at = (k) => names.indexOf(k)
  const out = []
  for (const st of j?.seasonTypes || []) {
    const kind = /regular/i.test(st.displayName || '') ? 2 : /post/i.test(st.displayName || '') ? 3 : /pre/i.test(st.displayName || '') ? 1 : null
    for (const cat of st.categories || []) for (const ev of cat.events || []) {
      const meta = j.events?.[ev.eventId] || {}
      const s = ev.stats || []
      const g = (k) => (at(k) >= 0 ? s[at(k)] : null)
      const [fgm, fga] = pair(g('fieldGoalsMade-fieldGoalsAttempted')), [tpm, tpa] = pair(g('threePointFieldGoalsMade-threePointFieldGoalsAttempted')), [ftm, fta] = pair(g('freeThrowsMade-freeThrowsAttempted'))
      out.push({ id: String(ev.eventId), seasonType: kind, date: meta.gameDate || null, note: meta.eventNote || null, atVs: meta.atVs || '', opp: meta.opponent?.abbreviation || null, result: meta.gameResult || null, score: meta.score || null,
        min: num(g('minutes')), pts: num(g('points')), reb: num(g('totalRebounds')), ast: num(g('assists')), stl: num(g('steals')), blk: num(g('blocks')), to: num(g('turnovers')), fgm, fga, tpm, tpa, ftm, fta })
    }
  }
  return out.sort((a, b) => String(b.date).localeCompare(String(a.date)))
}

/** The athlete card: name, position, jersey, team, age, height, headshot. */
export function reduceAthlete(j) {
  const a = j?.athlete || {}
  return { id: String(a.id || ''), name: a.displayName || '', pos: a.position?.abbreviation || null, jersey: a.jersey || null, team: a.team?.abbreviation || null,
    age: num(a.age), height: a.displayHeight || null, weight: a.displayWeight || null, headshot: a.headshot?.href || null, status: a.status?.name || null }
}
