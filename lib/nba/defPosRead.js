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
    if (fewestGames(ranked) >= MIN_GAMES) return { season, seasonLabel: seasonLabel(season), stale: season !== sn.cur, ranked }
  }
  return { season: null, seasonLabel: null, stale: true, ranked: {} }
}
