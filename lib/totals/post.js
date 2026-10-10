// TOP TOTALS: THE POST (X overhaul rules, 2026-10-09). One a day per sport (NFL: one a week), text only, after
// the calls are locked and before the first call's game starts. It goes through the one posting path every
// scheduled kind uses (lib/dash/longshotsPost postOnce): the pause, the daily cap by tier, the repeat guard,
// the posting log. It names no player, so the repeat guard and the naming checks have nobody to hold; it has
// no link and no hashtag; BUCKETS' post carries no site pointer (it has none to carry).
// The four kinds are tagged INFO in lib/dash/xSchedule.js KIND_TAGS and allowed by the homer_feed_posts kind
// check in supabase/migrations/202610091600_top_totals.sql.
import { postOnce } from '../dash/longshotsPost'
import { bucketsOpen } from '../dash/discordChannels'
import { totalsPostText, totalsCallStatus } from './core'

/** The homer_feed_posts kind for each sport (the registry's key -> the kind; the sport prefix is what lib/dash/xPolicy sportOfKind reads). */
export const TOTALS_KIND = { mlb: 'top_totals', nfl: 'nfl_top_totals', nhl: 'nhl_top_totals', nba: 'nba_top_totals' }

/** TOTALS_POSTS_PAUSE=on stops the posts (the calls themselves and the page are untouched). */
export const totalsPaused = () => /^(on|1|true)$/i.test(String(process.env.TOTALS_POSTS_PAUSE || '').trim())

/** What happened, as a string for the tick's log. `rows` = the slate's locked rows. */
export async function postTotalsOnce(db, { sport, day, rows, now = Date.now() }) {
  if (totalsPaused()) return 'paused'
  if (sport === 'nba' && !bucketsOpen()) return 'hidden'   // BUCKETS posts nothing (X or Discord) until BUCKETS_PUBLIC=on
  const calls = (rows || []).filter((r) => totalsCallStatus(r) === 'called')
  if (!calls.length) return 'no-calls'
  // the calls were made before the game; a post after the first one has started would be a recap in a pregame voice
  if (!calls.some((r) => Date.parse(r.start_at) > now)) return 'too-late'
  const text = totalsPostText({ sport, day, rows })
  if (!text) return 'no-text'
  return postOnce(db, {
    day, kind: TOTALS_KIND[sport], sport, envGate: false,
    build: async () => ({ text, payload: { slate_key: rows[0].slate_key, model_version: rows[0].model_version, games: calls.map((r) => ({ game_id: r.game_id, rank: r.rank, projected_total: r.projected_total })) } }),
  })
}
