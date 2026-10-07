// THE SEASON LINE AND THE FORM, BESIDE THE SCORE (2026-10-06, Donovan: "treat
// goal scoring as if it's a home run: how we track and stat them"). The twin of
// MOONSHOT's Szn HR / L5 HR / L10 HR / Drought. Context for display only: never
// in the score, never written to lamp_goal_log (model records are never
// rewritten).
//
//   SEASON LINE  lib/nhl/api.js leagueSkaterLines -- one line per skater per season
//                across every club he played for (a traded man keeps his total).
//                It is as-of-NOW, so it is only attached to a game that has not
//                started: a started game's goals are already in it. A finished or
//                live game gets null, never a post-game number labelled pre-game.
//   FORM         the league's per-game skater report for the 35 days BEFORE the
//                board's date. Rows dated on or after the board's date are
//                dropped here, so the game on the board is never counted.
//                Drought = his games since a goal; "plus" when no goal sits in
//                the window and the window may not hold his whole season.
//
// `sznG` is NOT `G/GP` on the boards: that is the model's pooled / rookie-pulled
// rate (legs.goalsPg). This is the plain season total.
import { unstable_cache } from 'next/cache'
import { easternToday } from '../data'

export const FORM_WINDOW_DAYS = 35
// the league's stats host answers 429 to a request with no User-Agent (lib/nhl/api.js sends the same one)
const HEADERS = { Accept: 'application/json', 'User-Agent': 'DASHNetwork/1.0 (+https://dashnetwork.vercel.app)' }
const STATS = 'https://api.nhle.com/stats/rest/en'
const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : 0)
const minusDays = (ymd, d) => new Date(Date.parse(`${ymd}T12:00:00Z`) - d * 864e5).toISOString().slice(0, 10)

/** Pure: a skater's season line (a leagueSkaterLines entry; shPct a 0-1 fraction there) -> the board row's `szn` (shPct in percent), or null. */
export function sznOf(line) {
  if (!line || !(line.gp > 0)) return null
  const per60 = line.toi > 0 ? (line.g * 3600) / (line.gp * line.toi) : null
  return { gp: line.gp, g: line.g, a: line.a, pts: line.pts, s: line.shots, shPct: line.shPct == null ? null : Math.round(line.shPct * 1000) / 10, g60: per60 == null ? null : Math.round(per60 * 100) / 100 }
}

/**
 * Pure: per-game rows (api.nhle.com isGame report) -> Map(playerId -> form) as of `date`.
 * Only rows dated strictly before `date` count. Newest game first; same tiebreak as hot sticks.
 * `drought_n` is how many of his games the window holds (joinLines uses it to make a goalless drought exact).
 */
export function formFrom(gameRows, date) {
  const by = new Map()
  for (const r of gameRows || []) {
    if (!(String(r.gameDate) < String(date))) continue
    const id = Number(r.playerId)
    if (!by.has(id)) by.set(id, [])
    by.get(id).push(r)
  }
  const out = new Map()
  for (const [id, games] of by) {
    games.sort((a, b) => (a.gameDate < b.gameDate ? 1 : a.gameDate > b.gameDate ? -1 : num(b.gameId) - num(a.gameId)))
    const sum = (list) => list.reduce((t, g) => t + num(g.goals), 0)
    const l5 = games.slice(0, 5), l10 = games.slice(0, 10)
    const at = games.findIndex((g) => num(g.goals) > 0)
    out.set(id, {
      l5: sum(l5), gp5: l5.length, l10: sum(l10), gp10: l10.length,
      drought: at >= 0 ? at : games.length,
      drought_n: games.length, droughtPlus: at < 0,
    })
  }
  return out
}

async function windowRows(seasonId, date) {
  const since = minusDays(date, FORM_WINDOW_DAYS)
  const cay = `seasonId=${seasonId} and gameTypeId=2 and gameDate>="${since}" and gameDate<"${date}"`
  const url = `${STATS}/skater/summary?isAggregate=false&isGame=true&start=0&limit=-1&cayenneExp=${encodeURIComponent(cay)}`
  let res = await fetch(url, { cache: 'no-store', headers: HEADERS })
  if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 1500)); res = await fetch(url, { cache: 'no-store', headers: HEADERS }) }   // one retry
  if (!res.ok) throw new Error(`nhl stats ${res.status} skater/summary (form)`)
  return (await res.json())?.data || []
}

// The reduced result (~900 small entries) is what is cached: the raw report is ~2 MB, above Next's
// fetch cache. Shared across instances in Next's Data Cache; per-warm-instance Map outside a request.
const mem = new Map()
const failed = new Map()   // key -> when the league last refused: not retried for a minute (a 429 storm helps nobody)
export async function readForm(seasonId, date) {
  if (!seasonId || !date) return new Map()
  if (Date.now() - (failed.get(`${seasonId}|${date}`) || 0) < 60e3) return new Map()
  try { return await readFormOnce(seasonId, date) } catch (e) { failed.set(`${seasonId}|${date}`, Date.now()); throw e }
}
async function readFormOnce(seasonId, date) {
  const read = async () => [...formFrom(await windowRows(seasonId, date), date).entries()]
  const key = `${seasonId}|${date}`
  const ttl = date >= easternToday() ? 1800 : 86400
  let entries
  try {
    entries = await unstable_cache(read, ['lamp-form-v1', key], { revalidate: ttl })()
  } catch (e) {
    if (!/incrementalCache|static generation store|outside a request/i.test(String(e?.message))) throw e
    const hit = mem.get(key)
    if (hit && Date.now() - hit.at < ttl * 1000) return new Map(hit.entries)
    entries = await read()
    mem.set(key, { at: Date.now(), entries })
    while (mem.size > 6) mem.delete(mem.keys().next().value)
  }
  return new Map(entries)
}

/**
 * Pure join for one skater. `started` = his game is not 'pre' (its goals may already be in the
 * season line). Returns { szn, form }; either may be null.
 */
export function joinLines(playerId, { lines, form, started }) {
  const id = Number(playerId)
  const szn = started ? null : sznOf(lines?.get(id))
  let f = form?.get(id) || null
  // no goal in the window, but the window holds every game he has played this season: exact
  if (f && f.droughtPlus && szn && f.drought_n >= szn.gp) f = { ...f, droughtPlus: false }
  return { szn, form: f }
}
