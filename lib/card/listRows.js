// THE CALLED LIST'S ROWS (batch member-requests 2A, 2026-10-25: "members can't find where the called picks are"). Pure, no I/O.
// One entry per LEG of the day's locked Card rows (lib/card/store.js readCard): a straight and a Long Shot are one entry each, a Two-Man /
// N-man is one entry per leg tagged with its play. Everything shown is what the lock FROZE (the leg's market, line, price and angle); nothing is
// re-derived and nothing is computed from the clock except "waiting" vs "live" for a play with no result yet.
//   status   waiting  the game has not started
//            live     the game has started, no result yet
//            hit | miss | pushed | scratched   the stored result (a void is "scratched": he did not play)
// The WORDS live here, once, so the site's list and the #members post (batch 2B) read the same ones. Board order: the leg's own score, best
// first (ties: the play's slot, then the earlier start, then the name), the order the Card itself picked in.
import { marketWords, marketOf, legPriceOf } from './core'
import { whyPlain } from './plain'

export const LIST_STATUS_WORD = Object.freeze({ waiting: 'WAITING', live: 'LIVE', hit: 'HIT', miss: 'MISS', pushed: 'PUSHED', scratched: 'SCRATCHED' })
export const PLAY_WORD = Object.freeze({ straight: 'Straight', long_shot: 'Long shot', two_man: 'Two-Man', n_man: 'N-man', double: 'Double' })

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

/** "TD" / "rec yds o99.5": the market in a phone's width (the long words ride the cell's title). */
const marketShort = (sport, key, line) => { const m = marketOf(sport, key); return m ? `${m.short}${m.kind === 'ou' && line != null ? ` o${line}` : ''}` : '' }

/** The word a stored result gives ('hit' | 'miss' | 'push' | 'void'), or null when there is none. */
const resultWord = (r) => (r === 'hit' ? 'hit' : r === 'miss' ? 'miss' : r === 'push' ? 'pushed' : r === 'void' ? 'scratched' : null)

/**
 * One leg's status key. A row with leg_results gives each leg its own word; a row with only the whole-ticket result (a straight) gives it to its leg.
 * @param row  a card_calls row ({ result, leg_results, legs })
 * @param i    the leg's index
 */
export function legStatus(row, i, now = Date.now()) {
  const own = resultWord(Array.isArray(row?.leg_results) ? row.leg_results[i]?.result : null)
  if (own) return own
  const whole = (row?.legs?.length || 0) === 1 ? resultWord(row?.result) : null
  if (whole) return whole
  const start = Date.parse(row?.legs?.[i]?.start_at || row?.start_at || '')
  return Number.isFinite(start) && now >= start ? 'live' : 'waiting'
}

/**
 * The list: every leg of every row, board order. A Double (sport 'all') is its own cross-sport ticket and is not in a sport's list.
 * @returns [{ key, rowId, product, play, slot, playerId, name, team, opp, gameId, startAt, market, marketWords, line, price, status, word, angle, withName, lockedAt }]
 */
export function listEntries(rows, { now = Date.now() } = {}) {
  const out = []
  for (const row of rows || []) {
    if (!row || row.sport === 'all' || row.product === 'double' || !Array.isArray(row.legs)) continue
    const together = row.legs.length > 1
    row.legs.forEach((leg, i) => {
      const status = legStatus(row, i, now)
      const price = legPriceOf(leg)
      out.push({
        key: `${row.id ?? `${row.sport}:${row.card_date}:${row.product}:${row.slot}`}:${i}`, rowId: row.id ?? null,
        product: row.product, play: PLAY_WORD[row.product] || row.product, slot: num(row.slot) ?? 1,
        playerId: String(leg.player_id ?? ''), name: leg.name || '', team: leg.team || '', opp: leg.opp || '', gameId: String(leg.game_id ?? ''),
        startAt: leg.start_at || row.start_at || null, market: leg.market || row.market || 'anytime',
        marketWords: marketWords(row.sport, leg.market || row.market || null, num(leg.line)),
        marketShort: marketShort(row.sport, leg.market || row.market || null, num(leg.line)),
        line: num(leg.line), price: price ? price.median : null, status, word: LIST_STATUS_WORD[status],
        angle: typeof leg.why === 'string' && leg.why.trim() ? whyPlain(leg.why) : null,      // plain words, never a percentile (Donovan 10-23; scripts/check-discord-posts.mjs)
        withName: together ? row.legs.filter((_, j) => j !== i).map((x) => x.name).filter(Boolean).join(' + ') : null,
        lockedAt: row.locked_at || null, score: num(leg.score) ?? -Infinity,
      })
    })
  }
  return out.sort((a, b) => b.score - a.score || a.slot - b.slot || Date.parse(a.startAt || 0) - Date.parse(b.startAt || 0) || a.name.localeCompare(b.name))
}

/** "3 live · 2 waiting · 1 hit": the one-line state of the list, from the entries. */
export function listCounts(entries) {
  const c = {}
  for (const e of entries || []) c[e.status] = (c[e.status] || 0) + 1
  return c
}
