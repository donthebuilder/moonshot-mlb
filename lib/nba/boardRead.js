// BUCKETS' BOARD, READ (LAMP's lib/nhl/boardRead.js shape). Server only. A game
// that has locked reads its LOCKED rows (buckets_log, the last write before
// tip); a game still ahead reads a PREVIEW from the same builder the tick
// locks with (lib/nba/board.js), so what the page shows is what gets locked.
import { unstable_cache } from 'next/cache'
import { buildNbaNight } from './board'
import { NBA_MARKETS, whyNba } from './model'
import { adminClient } from '../supabase/admin'

// v2 (10-03): rows carry pct to the cards
const night = (date) => unstable_cache(() => buildNbaNight(date), ['buckets-night-v2', date], { revalidate: 300 })()
  .catch((e) => (/incrementalCache|static generation store|outside a request/i.test(String(e?.message)) ? buildNbaNight(date) : Promise.reject(e)))
const WRITE_AS = { first: 'first_fg' }   // the first-basket model reads as its field-goal answer

const shape = (m, r, locked) => ({
  playerId: String(r.playerId ?? r.player_id), name: r.name, team: r.team, opp: r.opp, home: r.home, gameId: String(r.gameId ?? r.game_id), pos: r.pos, starter: r.starter,
  score: r.score, status: r.status, role: r.role, rank: r.rank ?? r.rank_in_game, nightRank: r.nightRank ?? r.context?.nightRank ?? null, nightOf: r.nightOf ?? r.context?.nightOf ?? null,
  reason: r.reason || null, injury: r.injury ?? r.context?.injury ?? null,
  legs: (r.legs?.ok !== false && r.legs) ? Object.fromEntries(NBA_MARKETS[m].legs.map((l) => [l, r.legs[l] ?? null])) : null,
  // each leg's percentile among tonight's players (the card's StatStrip, 10-03), the market's legs only, whole numbers
  pct: r.pct ? Object.fromEntries(NBA_MARKETS[m].legs.map((l) => [l, Number.isFinite(Number(r.pct[l])) ? Math.round(Number(r.pct[l])) : null])) : null,
  why: r.score != null ? whyNba(m, r) : r.reason, locked, actual: r.actual ?? null, hit: r.hit ?? null, voidReason: r.void_reason ?? null,
})

/** { date, season, games: [...], market, rows: [...] } -- every market's board for one date. */
export async function readNbaBoard(date, market = 'pts') {
  const n = await night(date)
  const db = adminClient()
  const name = WRITE_AS[market] || market
  const lockedQ = db ? await db.from('buckets_log').select('*').eq('game_date', date).eq('market', name).eq('model_version', NBA_MARKETS[market].version) : { data: [] }
  const locked = lockedQ.error ? [] : lockedQ.data || []
  // LOCKED, HONESTLY (LAMP's rule, lib/nhl/boardRead.js, 2026-10-01): the tick rewrites a game's rows on
  // every run inside the lock window and only the last write before tip is the lock. Until the game has
  // started the written rows are SETTING (they can still change) and read as a preview; LOCKED only once
  // it has tipped.
  const written = new Set(locked.map((r) => String(r.game_id)))
  const dropped = new Set((n.games || []).filter((g) => g.state !== 'pre' || Date.now() >= Date.parse(g.start || '')).map((g) => String(g.id)))
  const lockedGames = new Set([...written].filter((id) => dropped.has(id)))
  const pct = (r) => r.pct || null
  const rows = [
    ...locked.map((r) => shape(market, { ...r, pct: pct(r), legs: r.legs }, lockedGames.has(String(r.game_id)))),
    ...(n.markets?.[market] || []).filter((r) => !written.has(String(r.gameId))).map((r) => shape(market, r, false)),
  ]
  return { date, season: n.season || null, games: n.games || [], market, lockedGames: [...lockedGames], lineupsKnown: n.lineupsKnown || [], rows }
}
