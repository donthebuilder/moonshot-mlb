// The season defense vs position reads (server): this season once every club has MIN_GAMES in it, else the one
// before, said so. Postgres does the sums (buckets_defpos / buckets_posvs); nothing raw leaves the database.
import { nbaSeason, seasonLabel } from './season'
import { rankDefPos, fewestGames, MIN_GAMES } from './defPos'

// one read per server instance per 15 minutes (posvs asks it only for the season)
let memo = null
export async function readDefPos(db) {
  if (memo && Date.now() - memo.at < 900e3) return memo.value
  const value = await readFresh(db)
  memo = { at: Date.now(), value }
  return value
}
async function readFresh(db) {
  const sn = await nbaSeason()
  for (const season of [sn.read, sn.read - 1]) {
    const r = await db.rpc('buckets_defpos', { p_season: season })
    if (r.error) throw new Error(`buckets_defpos: ${r.error.message}`)
    const ranked = rankDefPos(r.data)
    if (fewestGames(ranked) >= MIN_GAMES) return { season, seasonLabel: seasonLabel(season), stale: season !== sn.cur, ranked, ranked5: await five(db, season) }
  }
  return { season: null, seasonLabel: null, stale: true, ranked: {}, ranked5: null }
}

// PG..C (buckets_defpos5), only for the season the G / F / C table reads and only once all 30 clubs have MIN_GAMES
// tagged games in it; 2025-26 has none (ESPN keeps no old depth charts), so it is null there. A failed read is null, not an error:
// the G / F / C table still answers.
async function five(db, season) {
  const r = await db.rpc('buckets_defpos5', { p_season: season })
  if (r.error) { console.error(`[defpos] buckets_defpos5: ${r.error.message}`); return null }
  const ranked = rankDefPos(r.data)
  return Object.keys(ranked?.PG?.Season || {}).length === 30 && fewestGames(ranked, 'PG') >= MIN_GAMES ? ranked : null
}
