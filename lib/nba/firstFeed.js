// BUCKETS' FIRST BASKET, ON FILE (parity, 2026-10-05). Server only. The first made field
// goal of each game (lib/nba/api firstBaskets over ESPN's plays -- the same answer the
// first-basket market grades on), written ONCE to buckets_feed (kind first_fg) with the
// status his first_fg row LOCKED with before tip: called / board / off, null when the game
// never locked. Read back by /api/ledger/first (lib/ledger/firstScorers READ.nba).
// Not a moment: push_sent is true on write (the push sweep is for 30 pieces) and it never posts.
import { reduceBox, firstBaskets } from './api'
import { NBA_MARKETS } from './model'

export const FIRST_KIND = 'first_fg'

/** The row to write for one finished game's summary, or null when the plays name nobody. */
export async function firstFeedRow(db, { gameId, gameDate, seasonType, summary }) {
  const fg = firstBaskets(summary).firstFieldGoal
  if (!fg?.player_id) return null
  const box = reduceBox(summary)
  const b = box.find((x) => x.id === fg.player_id)
  if (!b) return null
  const teams = [...new Set(box.map((x) => x.team))]
  const [lk, st] = await Promise.all([
    db.from('buckets_games').select('game_id').eq('game_id', gameId).limit(1),
    db.from('buckets_log').select('status').eq('game_id', gameId).eq('player_id', fg.player_id).eq('market', FIRST_KIND).eq('model_version', NBA_MARKETS.first.version).maybeSingle(),
  ])
  const locked = (lk.data || []).length > 0
  return {
    game_id: String(gameId), player_id: String(fg.player_id), kind: FIRST_KIND, game_date: gameDate,
    name: b.name, team: b.team, opp: teams.find((t) => t !== b.team) || null, points: /three point/i.test(fg.text) ? 3 : 2,
    status: locked ? (st.data?.status || 'off') : null, season_type: seasonType ?? null, push_sent: true,
  }
}

/** Write it once (the primary key keeps the first write). Returns an error message or null. */
export async function writeFirstFeed(db, args) {
  const row = await firstFeedRow(db, args)
  if (!row) return 'no first field goal in the plays'
  const w = await db.from('buckets_feed').upsert([row], { onConflict: 'game_id,player_id,kind', ignoreDuplicates: true })
  return w.error ? w.error.message : null
}
