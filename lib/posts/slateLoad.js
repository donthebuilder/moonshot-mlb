// THE SLATE'S READS (X overhaul piece 3). The one impure half of lib/posts/slate.js: it reads the
// boards that are ALREADY computed for the site -- MOONSHOT's rows come from the homers tick (passed in),
// TUDDY's week file and pick card (the files the NFL tick reads), LAMP's board (lib/nhl/boardRead.js),
// BUCKETS' points board (lib/nba/boardRead.js). No new endpoint, no new job. Each read is remembered on
// this instance for a few minutes (the tick asks every minute until the post is out), and a read that
// fails is a HOLD for that sport (never a guess): lib/posts/slate.js holds the post, then leaves the
// sport out 30 minutes before the first game.
import { fetchNfl, nflPicksLooksReal, nflPicksPaths, nflSlateLooksReal, nflSlatePaths } from '../nfl/dataSource'
import { readBoard } from '../nhl/boardRead'
import { readNbaBoard } from '../nba/boardRead'
import { scoreboardFor, reduceScoreboard } from '../nba/api'
import { isPublicSport } from './slate'
import { mlbSlate } from './mlb'
import { nflSlate } from './nfl'
import { nhlSlate } from './nhl'
import { nbaSlate } from './nba'

const TTL = { nfl: 5 * 60e3, nhl: 10 * 60e3, nba: 10 * 60e3 }
const _memo = new Map()   // `${sport}|${day}` -> { at, value }
export const _resetSlateLoadForTests = () => _memo.clear()
async function remembered(sport, day, ttl, read) {
  const k = `${sport}|${day}`
  const hit = _memo.get(k)
  if (hit && Date.now() - hit.at < ttl) return hit.value
  const value = await read()
  if (_memo.size > 40) _memo.clear()
  _memo.set(k, { at: Date.now(), value })
  return value
}
const failed = (sport, why) => ({ sport, hasGames: false, firstStartMs: NaN, hold: `${why}`, cands: [] })

/**
 * The four sports' adapter outputs for one day.
 * @param mlb  { rows, live, hold } from the homers tick (the board rows it already loaded)
 */
export function slateLoader({ day, mlb = { rows: [], live: null, hold: null }, bucketsOn = isPublicSport('nba') } = {}) {
  return async () => {
    const [nfl, nhl, nba] = await Promise.all([
      remembered('nfl', day, TTL.nfl, async () => {
        try {
          const [data, picks] = await Promise.all([fetchNfl(nflSlatePaths(), nflSlateLooksReal), fetchNfl(nflPicksPaths(), nflPicksLooksReal)])
          if (!data) return failed('nfl', 'the TUDDY week file could not be read')
          return nflSlate({ data, picks, day })
        } catch (e) { return failed('nfl', `the TUDDY week file failed: ${e?.message || e}`) }
      }),
      remembered('nhl', day, TTL.nhl, async () => {
        try { return nhlSlate({ games: (await readBoard(day, { market: 'GOAL', net: true })).games }) } catch (e) { return failed('nhl', `the LAMP board failed: ${e?.message || e}`) }
      }),
      // BUCKETS reads ESPN, so it is asked only when the scoreboard shows a regular-season game that day
      bucketsOn ? remembered('nba', day, TTL.nba, async () => {
        try {
          const games = reduceScoreboard(await scoreboardFor(day))
          if (!games.some((g) => g.seasonType === 2)) return { sport: 'nba', hasGames: false, firstStartMs: NaN, hold: null, cands: [] }
          return nbaSlate({ board: await readNbaBoard(day, 'pts') })
        } catch (e) {
          // BUCKETS is mostly off-season or hidden: an unreadable scoreboard is "no BUCKETS line", never a reason to hold the others
          console.error(`[slate] BUCKETS board unreadable: ${e?.message || e}`)
          return { sport: 'nba', hasGames: false, firstStartMs: NaN, hold: null, cands: [] }
        }
      }) : Promise.resolve({ sport: 'nba', hasGames: false, firstStartMs: NaN, hold: null, cands: [] }),
    ])
    return [mlbSlate(mlb), nfl, nhl, nba]
  }
}
