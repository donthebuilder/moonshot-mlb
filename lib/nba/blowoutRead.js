// 💨 WHO GAINS IN A BLOWOUT, READ (server only, 2026-10-22, Donovan: "who gains minutes in a blowout (bench scorers)").
// For each blowout-watch game of a night (lib/blowout.js: the book has a club favoured by BLOWOUT_SPREAD+), both clubs' ESPN
// rosters, and each man's minutes and points in his club's lopsided finals (BLOWOUT_FINAL+, either side) against the rest, this
// season and last (buckets_blowout_minutes sums them in Postgres). Plain counts from finished games; nothing modelled, no %.
import { scoreboardFor, reduceScoreboard, rosterFor } from './api'
import { nbaTeam } from './teams'
import { nbaSeason, seasonLabel } from './season'
import { bookRowsFor, booksFor } from '../gameLinesStore'
import { blowoutFor, BLOWOUT_FINAL } from '../blowout'

/** Under this many games on either side a man's split is too thin to list. */
export const BLOWOUT_MIN_GP = 5

/** One night -> { date, seasons, margin, games: [{ id, away, home, fav, spread, at, players: [...] }] } (watch games only). */
export async function readBlowouts(db, date) {
  const games = reduceScoreboard(await scoreboardFor(date)).filter((g) => g.state === 'pre' || g.state === 'live')
  const sn = await nbaSeason()
  const seasons = [sn.cur, sn.prev]
  const out = { date, seasons: seasons.map(seasonLabel), margin: BLOWOUT_FINAL.nba, minGp: BLOWOUT_MIN_GP, games: [] }
  if (!games.length || !db) return out
  const books = booksFor('nba', games.map((g) => ({ id: g.id, away: g.away?.abbrev, home: g.home?.abbrev, start: g.start })), await bookRowsFor(db, 'nba', date), Date.now())
  for (const g of games) {
    const away = g.away?.abbrev, home = g.home?.abbrev
    const b = blowoutFor('nba', books.get(String(g.id))?.spread_home ?? null, { home, away, team: home })
    if (!b?.watch) continue
    const rosters = await Promise.all([away, home].map((t) => rosterFor(nbaTeam(t)?.id).then((j) => (j?.athletes || []).map((a) => ({ id: String(a.id), team: t }))).catch(() => [])))
    const who = new Map(rosters.flat().map((x) => [x.id, x.team]))
    if (!who.size) continue
    const r = await db.rpc('buckets_blowout_minutes', { p_players: [...who.keys()], p_seasons: seasons, p_margin: BLOWOUT_FINAL.nba })
    if (r.error) throw new Error(`buckets_blowout_minutes: ${r.error.message}`)
    const players = (r.data || [])
      .filter((x) => x.blow_gp >= BLOWOUT_MIN_GP && x.rest_gp >= BLOWOUT_MIN_GP)
      .map((x) => ({ id: String(x.player_id), name: x.name, team: who.get(String(x.player_id)), blowGp: x.blow_gp, restGp: x.rest_gp,
        blowMin: Number(x.blow_min), restMin: Number(x.rest_min), blowPts: Number(x.blow_pts), restPts: Number(x.rest_pts),
        minGain: Math.round((Number(x.blow_min) - Number(x.rest_min)) * 10) / 10, ptsGain: Math.round((Number(x.blow_pts) - Number(x.rest_pts)) * 10) / 10 }))
      .sort((p, q) => q.minGain - p.minGain)
    out.games.push({ id: String(g.id), away, home, fav: b.fav, spread: b.spread, at: b.at, players })
  }
  return out
}
