// 🥅 WHERE A GOALIE IS WEAK -- the server's half (lib/nhl/goalieWeak.js has the rules). Read only.
// One goalie (or many, for the board column): his zone answer and the league's from lib/nhl/goalieZones.js, cut into
// his top weak zones; and, for a game's block, the shots-on-goal zone counts of the skaters facing him this season.
// Nothing is written and nothing is stored: the same two SQL functions the goalie view uses, plus one narrow read of
// lamp_shots for a handful of named skaters.
import { adminClient } from '../supabase/admin'
import { readGoalieZones } from './goalieZones'
import { normRow, drawable } from './shotNorm'
import { weakSpots, zoneCounts, shooterMatch, sampleLabel } from './goalieWeak'
import { whichSeason } from './whichSeason'
import { seasonLabel } from './reduce'

export const MAX_GOALIES = 40
export const MAX_SHOOTERS = 12

/** One goalie's weak spots (a plain, cacheable object). `available: false` until the zone SQL has run. */
export async function readWeak(goalie, season) {
  const a = await readGoalieZones(goalie, season)
  const w = weakSpots(a)
  // "this season" only when the season asked for IS the active one; any other season is named
  const cur = await whichSeason().then((s) => s.current ?? s.id, () => null)
  const word = Number(season) === Number(cur) ? 'this season' : `in ${seasonLabel(season)}`
  return {
    goalie: Number(goalie), season: Number(season), state: w.state, sample: w.sample,
    sampleLabel: w.sample ? sampleLabel(w.sample, word) : null,
    leagueFallback: w.leagueFallback, leagueSeason: a.available ? a.leagueSeason : null,
    spots: w.spots.map(({ key, label, phrase, short, def, sa, ga, rate, lg, expected, excess }) => ({ key, label, phrase, short, def, sa, ga, rate, lg, expected: Math.round(expected * 10) / 10, excess: Math.round(excess * 10) / 10 })),
  }
}

/** Shots on goal per named skater this season (regular season, a goalie in the net), turned to attack one net, as zone counts. */
export async function readShooterCounts(ids, season) {
  const db = adminClient()
  if (!db) throw new Error('no supabase env')
  const want = [...new Set(ids.map(Number).filter(Number.isFinite))].slice(0, MAX_SHOOTERS)
  const pts = new Map(want.map((id) => [id, []]))
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('lamp_shots').select('player_id, x, y, zone, result').in('player_id', want).eq('season', Number(season)).eq('game_type', 2)
      .in('result', ['sog', 'goal']).not('goalie_id', 'is', null).order('game_id', { ascending: true }).order('event_id', { ascending: true }).range(from, from + 999)
    if (error) throw new Error(error.message)
    for (const s of data) { const n = normRow(s); if (n && drawable(n)) pts.get(Number(s.player_id))?.push([n.x, n.y]) }
    if (data.length < 1000) break
  }
  return new Map(want.map((id) => [id, zoneCounts(pts.get(id))]))
}

/** The block for one goalie and the skaters facing him: { ...readWeak, shooters: [{ id, n, m, byZone }] } (shooters with no shots on file are left out). */
export async function readWeakWithShooters(goalie, season, shooterIds = []) {
  const weak = await readWeak(goalie, season)
  if (weak.state !== 'ok' || !shooterIds.length) return { ...weak, shooters: [] }
  const counts = await readShooterCounts(shooterIds, season)
  const shooters = []
  for (const [id, c] of counts) { const m = shooterMatch(weak.spots, c); if (m) shooters.push({ id, ...m }) }
  shooters.sort((a, b) => b.n - a.n || b.m - a.m)
  return { ...weak, shooters }
}

/** Many goalies at once (the board column): { [goalieId]: readWeak } -- a failed one is left out, never a guess. */
export async function readWeakMany(goalies, season) {
  const ids = [...new Set(goalies.map(Number).filter(Number.isFinite))].slice(0, MAX_GOALIES)
  const out = {}
  await Promise.all(ids.map(async (id) => { try { out[id] = await readWeak(id, season) } catch (e) { if (/no supabase env/.test(e?.message)) throw e } }))
  return out
}
