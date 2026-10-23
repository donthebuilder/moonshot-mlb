// 🏒 THE GAME'S EVENT TRAIL (2026-10-22, PREPLAY on LAMP). Donovan: "every NHL event comes with an exact spot on the rink
// and a time ... chained in order, that's a real puck trail." One play-by-play -> every located event of the game, in
// the order it happened: faceoffs, hits, giveaways, takeaways, blocks, misses, shots on goal, goals, penalties.
// Pure: no fetch (the route /api/lamp/gameplay reads the league and calls this).
//
// WHAT IS REAL: each event's spot (the feed's x, y on the 200 x 85 ft sheet, centre ice = 0, 0), its period and
// clock, its players and its result. WHAT IS NOT: where the puck went BETWEEN two events -- the replay draws a line,
// and says so. Shootout attempts are left out (not part of the game's play; they decide it, and the score says how).
import { surname } from '../format'

const KIND = {
  faceoff: 'faceoff', hit: 'hit', giveaway: 'giveaway', takeaway: 'takeaway', 'blocked-shot': 'block',
  'missed-shot': 'miss', 'shot-on-goal': 'sog', goal: 'goal', penalty: 'penalty',
}
// the moments that stop play: the next event starts fresh (the puck does not travel to it)
const STOPS = new Set(['stoppage', 'goal', 'period-end', 'penalty', 'game-end'])
const int = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.round(Number(v)) : null)
const secs = (mmss) => { const m = /^(\d+):(\d{2})$/.exec(String(mmss || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null }
const nameOf = (r) => [r?.firstName?.default, r?.lastName?.default].filter(Boolean).join(' ')

/** Who did it and to whom, from the feed's own fields, by kind. */
function actors(kind, d) {
  switch (kind) {
    case 'faceoff': return [d.winningPlayerId, d.losingPlayerId]
    case 'hit': return [d.hittingPlayerId, d.hitteePlayerId]
    case 'giveaway': case 'takeaway': return [d.playerId, null]
    case 'block': return [d.shootingPlayerId, d.blockingPlayerId]
    case 'miss': case 'sog': return [d.shootingPlayerId, d.goalieInNetId]
    case 'goal': return [d.scoringPlayerId, d.goalieInNetId]
    case 'penalty': return [d.committedByPlayerId, d.drawnByPlayerId]
    default: return [null, null]
  }
}

/**
 * play-by-play JSON -> { id, date, away, home, players, events } or null.
 *   players: { [id]: { name, num, team, pos, face (the league's headshot url) } }
 *   events:  [{ n, period, pt (period type), t (seconds into the period), kind, x, y, team, who, vs, a1, a2,
 *               shotType, reason, score: [away, home] after it, fresh (play restarted before it), total (a goal's season
 *               number), sit (situation code), dur / ptype (a penalty's minutes and type) }]
 */
export function eventsFromPlayByPlay(pbp) {
  if (!pbp || !Array.isArray(pbp.plays)) return null
  const away = { id: Number(pbp.awayTeam?.id), abbrev: pbp.awayTeam?.abbrev || null }
  const home = { id: Number(pbp.homeTeam?.id), abbrev: pbp.homeTeam?.abbrev || null }
  const abbrevOf = (teamId) => (Number(teamId) === home.id ? home.abbrev : Number(teamId) === away.id ? away.abbrev : null)
  const players = {}
  for (const r of pbp.rosterSpots || []) {
    const id = int(r.playerId)
    if (id) players[id] = { name: nameOf(r), num: int(r.sweaterNumber), team: abbrevOf(r.teamId), pos: r.positionCode || null, face: r.headshot || null }
  }
  const plays = [...pbp.plays].sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))
  const events = []
  let score = [0, 0], fresh = true
  for (const p of plays) {
    const key = p?.typeDescKey
    const pt = p.periodDescriptor?.periodType || null
    if (pt === 'SO') continue
    const kind = KIND[key]
    if (!kind) { if (STOPS.has(key) || key === 'period-start') fresh = true; continue }
    const d = p.details || {}
    const x = int(d.xCoord), y = int(d.yCoord)
    if (x == null || y == null) { fresh = true; continue }
    const [who, vs] = actors(kind, d).map(int)
    if (kind === 'goal' && d.awayScore != null && d.homeScore != null) score = [int(d.awayScore), int(d.homeScore)]
    events.push({
      n: events.length, period: int(p.periodDescriptor?.number), pt, t: secs(p.timeInPeriod), kind, x, y,
      // the team that did it: the shooter's club on a block (the feed's owner there is the blocking side)
      team: kind === 'block' ? (players[who]?.team || null) : abbrevOf(d.eventOwnerTeamId) || players[who]?.team || null,
      who: who || null, vs: vs || null,
      a1: kind === 'goal' ? int(d.assist1PlayerId) : null, a2: kind === 'goal' ? int(d.assist2PlayerId) : null,
      shotType: d.shotType || null, reason: d.reason || d.descKey || null, score: [...score], fresh,
      // a goal: the scorer's goal number this season, as the feed counts it after this one
      total: kind === 'goal' ? int(d.scoringPlayerTotal) : null,
      // the strength on the ice as the feed codes it ("1541" = away goalie, away skaters, home skaters, home goalie)
      sit: /^\d{4}$/.test(String(p.situationCode || '')) ? String(p.situationCode) : null,
      // a penalty: its minutes and type (MIN, MAJ, ...); the penalized club is `team`
      dur: kind === 'penalty' ? int(d.duration) : null, ptype: kind === 'penalty' ? (d.typeCode || null) : null,
    })
    fresh = STOPS.has(key)
  }
  return { id: int(pbp.id), date: pbp.gameDate || null, gameType: int(pbp.gameType), away, home, players, events: events.filter((e) => e.period != null && e.t != null) }
}

/** One event in a few words (the replay's ticker): "HIT · Reaves on Lee", "GOAL · Celebrini (Toffoli)". */
export function eventWords(e, players = {}) {
  const nm = (id) => { const n = players[id]?.name; return n ? surname(n) : null }
  const who = nm(e.who), vs = nm(e.vs)
  switch (e.kind) {
    case 'faceoff': return `FACEOFF · ${who || e.team || ''}${vs ? ` wins vs ${vs}` : ' wins'}`
    case 'hit': return `HIT · ${who || ''}${vs ? ` on ${vs}` : ''}`
    case 'giveaway': return `GIVEAWAY · ${who || e.team || ''}`
    case 'takeaway': return `TAKEAWAY · ${who || e.team || ''}`
    case 'block': return `BLOCKED · ${who || ''}${vs ? `, by ${vs}` : ''}`
    case 'miss': return `MISSED · ${who || ''}${e.reason ? ` (${String(e.reason).replace(/-/g, ' ')})` : ''}`
    // no goalie named (a simulated game before the starters are announced): just the shooter, never a placeholder name
    case 'sog': return vs ? `SAVE · ${vs} on ${who || ''}` : `SAVE on ${who || ''}`
    case 'goal': return `GOAL · ${who || ''}${[nm(e.a1), nm(e.a2)].filter(Boolean).length ? ` (${[nm(e.a1), nm(e.a2)].filter(Boolean).join(', ')})` : ''}`
    case 'penalty': return `PENALTY · ${who || e.team || ''}${e.reason ? `, ${String(e.reason).replace(/-/g, ' ')}` : ''}`
    default: return ''
  }
}

/** The man advantage at one event, from its situation code: 'away' / 'home' (that club has more skaters), or null.
 *  A pulled goalie's extra attacker is not a power play (the same rule lib/nhl/shots.js strengthFor uses). */
export function powerPlayAt(e) {
  const s = String(e?.sit || '')
  if (!/^\d{4}$/.test(s)) return null
  const [ag, as, hs, hg] = s.split('').map(Number)
  const a = as - (ag === 0 ? 1 : 0), h = hs - (hg === 0 ? 1 : 0)
  return a > h ? 'away' : h > a ? 'home' : null
}

/** Every penalty as a stretch of game time: { who, team, start, end } in game seconds (period 1 starts at 0, 20 min a
 *  period). A two-minute minor ends early on the other club's next goal while it runs (the rulebook); anything else runs
 *  its full time. Offsetting minors run their time too (the replay shows them in the box; the strength code says
 *  whether anyone is a man up). */
export function penaltyStretches(events = [], periodS = 1200) {
  const g = (e) => (e.period - 1) * periodS + e.t
  const out = []
  for (const e of events) {
    if (e.kind !== 'penalty' || !e.dur) continue
    const start = g(e)
    let end = start + e.dur * 60
    if (e.dur === 2) {
      const pp = events.find((x) => x.kind === 'goal' && x.team && x.team !== e.team && g(x) > start && g(x) < end)
      if (pp) end = g(pp)
    }
    out.push({ who: e.who, team: e.team, start, end, ptype: e.ptype, reason: e.reason })
  }
  return out
}
