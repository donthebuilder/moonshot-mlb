// WHERE THE PREGAME NEWS COMES FROM (2026-10-09). Server only; read only; never writes.
// The push tick (app/api/dash/push/tick) calls these, then hands the snapshot to the pure producers in
// lib/dash/pushRules.js (nhlPregameEventsFrom / nflPregameEventsFrom / nbaPregameEventsFrom).
//
// Every function returns a SNAPSHOT { ok: true, asOf, ... } or null. null means "the source did not answer":
// a failed fetch is NEVER an empty slate and never a guessed one, so a blip costs a sweep's news, not a
// false alert. `asOf` is when the data was read; the producers refuse a snapshot older than 10 minutes.
//
//   NHL  api-web.nhle.com score/{day} (state, gameScheduleState, start time) + lib/nhl/goalieSource.js
//        (ESPN probables: only CONFIRMED goalies, with the league's player id).
//   NFL  ESPN scoreboard (lib/nfl/liveSlate.js: status name, kickoff) against the published slate's
//        kickoff (a moved game), and ESPN's per-game injury report (status "Out" only) for games within
//        30 hours that have a followed club in them.
//   NBA  ESPN scoreboard + league injury report + the posted starting five (lib/nba/api.js). Asked ONLY
//        while BUCKETS is public (lib/nba/gate.js bucketsPublic).

import { scoreFor } from '../nhl/api'
import { reduceScoreDay } from '../nhl/reduce'
import { goalieSourceFor } from '../nhl/goalieSource'
import { fetchNflLive } from '../nfl/liveSlate'
import { fetchNfl, nflSlatePaths, nflSlateLooksReal } from '../nfl/dataSource'
import { scoreboardFor, reduceScoreboard, nbaGet, startersFor } from '../nba/api'
import { nbaAbbrevOf } from '../nba/teams'
import { bucketsPublic } from '../nba/gate'

const txt = (v) => String(v == null ? '' : v).trim()
const ABBR = { WSH: 'WAS', LAR: 'LA', JAX: 'JAX' }
const nflAbbr = (x) => ABBR[txt(x).toUpperCase()] || txt(x).toUpperCase()
const NFL_SUMMARY = 'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/summary'

// ── NHL ─────────────────────────────────────────────────────────────────────
/**
 * @param day       the games' own date (YYYY-MM-DD)
 * @param audience  audienceFrom(): only clubs a followed man plays for are asked about
 * @returns { ok, asOf, games: reduceGame[], starters: { [gameId]: { home, away, asOf } } } | null
 */
export async function nhlPregameSnap(day, audience, { now = Date.now(), scoreImpl = scoreFor, starterImpl = goalieSourceFor } = {}) {
  try {
    const d = reduceScoreDay(await scoreImpl(day))
    const clubs = new Set([...(audience?.teamOfId || [])].filter(([k]) => k.startsWith('nhl:')).map(([, v]) => v))
    const ask = (d.games || []).filter((g) => g.state === 'pre' && Number(g.gameType) !== 1 && (clubs.has(g.away?.abbrev) || clubs.has(g.home?.abbrev)))
    let starters = {}
    if (ask.length) {
      starters = await starterImpl(day, ask.map((g) => ({ id: g.id, away: { abbrev: g.away?.abbrev }, home: { abbrev: g.home?.abbrev }, startUtc: g.startUtc, state: 'pre' })), { now })
        .catch((e) => { console.error(`[push] NHL starters: ${e?.message || e}`); return {} })
    }
    return { ok: true, asOf: now, games: d.games || [], starters }
  } catch (e) {
    console.error(`[push] NHL pregame snapshot failed: ${e?.message || e}`)
    return null
  }
}

/** The goalies already pushed as CONFIRMED for these games: { 'gameId:side': [{ id, name }] }, read back from the claim keys. */
export function priorStartersFrom(keys, nameOf = new Map()) {
  const out = {}
  for (const k of keys || []) {
    const m = String(k).match(/^nhl:[\d-]+:(\d+):starter:(away|home):(\d+)$/)       // the confirmed key, not the `:out:` one
    if (!m) continue
    const slot = `${m[1]}:${m[2]}`
    ;(out[slot] ||= []).push({ id: m[3], name: txt(nameOf.get(m[3])) })
  }
  return out
}

// ── NFL ─────────────────────────────────────────────────────────────────────
const HOURS_AHEAD = 30
const OUT_TTL_MS = 10 * 60 * 1000
const _outCache = new Map()       // game_id -> { at, outs }
let _plan = { at: 0, map: null }  // published kickoffs: 'AWAY@HOME' -> iso

/** ESPN's per-game injury report -> the men listed OUT: [{ name, team, gameId, reportedAt }]. Pure. */
export function reduceNflOuts(summary, gameId) {
  const out = []
  for (const t of Array.isArray(summary?.injuries) ? summary.injuries : []) {
    const team = nflAbbr(t?.team?.abbreviation)
    for (const i of Array.isArray(t?.injuries) ? t.injuries : []) {
      if (txt(i?.status).toLowerCase() !== 'out') continue                         // Questionable / Doubtful are not "out"
      const name = txt(i?.athlete?.displayName || i?.athlete?.fullName)
      if (name) out.push({ name, team, gameId: String(gameId), reportedAt: txt(i?.date) || null })
    }
  }
  return out
}

async function plannedKickoffs() {
  if (_plan.map && Date.now() - _plan.at < 15 * 60 * 1000) return _plan.map
  try {
    const data = await fetchNfl(nflSlatePaths(), nflSlateLooksReal)
    const map = new Map()
    for (const g of data?.games || []) if (g?.away && g?.home && g?.kickoff) map.set(`${nflAbbr(g.away)}@${nflAbbr(g.home)}`, g.kickoff)
    _plan = { at: Date.now(), map }
    return map
  } catch (e) {
    console.error(`[push] NFL published kickoffs unavailable: ${e?.message || e}`)
    return _plan.map || new Map()
  }
}

/** @returns { ok, asOf, games, outs } | null */
export async function nflPregameSnap(audience, { now = Date.now(), liveImpl = fetchNflLive, getJSON = null, planImpl = plannedKickoffs } = {}) {
  try {
    const snap = await liveImpl()
    if (!snap || !Array.isArray(snap.games) || !Number.isFinite(snap.at)) return null
    const plan = await planImpl()
    const games = snap.games.map((g) => ({ ...g, plannedKickoff: plan.get(`${g.away}@${g.home}`) || null }))
    const clubs = new Set([...(audience?.teamOf?.values?.() || [])])
    const outs = []
    const get = getJSON || (async (url) => { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error(`${r.status}`); return r.json() })
    await Promise.all(games
      .filter((g) => g.state === 'pre' && (clubs.has(g.away) || clubs.has(g.home)))
      .filter((g) => { const k = Date.parse(g.kickoff || ''); return Number.isFinite(k) && k > now && k - now <= HOURS_AHEAD * 3600 * 1000 })
      .map(async (g) => {
        const hit = _outCache.get(g.game_id)
        if (hit && now - hit.at < OUT_TTL_MS) { outs.push(...hit.outs); return }
        try {
          const rows = reduceNflOuts(await get(`${NFL_SUMMARY}?event=${encodeURIComponent(g.game_id)}`), g.game_id)
          _outCache.set(g.game_id, { at: now, outs: rows })
          outs.push(...rows)
        } catch (e) { console.error(`[push] NFL injuries ${g.game_id}: ${e?.message || e}`) }   // one game missing costs that game's news only
      }))
    return { ok: true, asOf: snap.at, games, outs }
  } catch (e) {
    console.error(`[push] NFL pregame snapshot failed: ${e?.message || e}`)
    return null
  }
}

// ── NBA (BUCKETS) ───────────────────────────────────────────────────────────
/** ESPN's league injury report -> the men listed OUT: [{ id, name, team }]. Pure. */
export function reduceNbaOuts(j) {
  const out = []
  for (const t of Array.isArray(j?.injuries) ? j.injuries : []) {
    const team = nbaAbbrevOf(t?.id) || ''
    for (const i of Array.isArray(t?.injuries) ? t.injuries : []) {
      if (txt(i?.status).toLowerCase() !== 'out') continue
      const id = txt(i?.athlete?.id)
      if (id) out.push({ id, name: txt(i?.athlete?.displayName), team })
    }
  }
  return out
}

/** @returns { ok, asOf, games, outs, starters: { [gameId]: string[] } } | null  (null while BUCKETS is not public) */
export async function nbaPregameSnap(day, audience, { now = Date.now(), isPublic = bucketsPublic, boardImpl = scoreboardFor, injuriesImpl = () => nbaGet('/injuries', 120), startersImpl = startersFor } = {}) {
  if (!isPublic()) return null
  try {
    const games = reduceScoreboard(await boardImpl(day))
    const clubs = new Set([...(audience?.teamOfId || [])].filter(([k]) => k.startsWith('nba:')).map(([, v]) => v))
    const inGames = games.filter((g) => clubs.has(g.away.abbrev) || clubs.has(g.home.abbrev))
    const outs = inGames.length ? reduceNbaOuts(await injuriesImpl()) : []
    const starters = {}
    await Promise.all(inGames.filter((g) => {
      const t = Date.parse(g.start || '')
      return g.state === 'pre' && Number.isFinite(t) && t > now && t - now <= 90 * 60 * 1000   // the five posts about an hour out
    }).map(async (g) => {
      try {
        const sides = await Promise.all([g.away, g.home].map((s) => startersImpl(g.id, s.id)))
        const ids = sides.flatMap((set) => [...set])
        if (ids.length) starters[g.id] = ids
      } catch (e) { console.error(`[push] NBA starters ${g.id}: ${e?.message || e}`) }
    }))
    return { ok: true, asOf: now, games, outs, starters }
  } catch (e) {
    console.error(`[push] NBA pregame snapshot failed: ${e?.message || e}`)
    return null
  }
}
