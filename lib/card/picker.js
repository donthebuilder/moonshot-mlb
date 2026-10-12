// DONOVAN'S PICKER, THE ROW (pure; no I/O, safe on the server and in the browser). "See who I'm looking at" (Donovan, 2026-10-12): each candidate on the
// /admin/two-man board carries everything he needs to choose: who (face, name, club), when (opponent + the game's own start, Eastern, with the day),
// what (the Card's market for the sport and the STORED price, with its book count), whether the leg clears the Card's floors (INFORMATION ONLY: his lane
// is exempt, lib/card/rules.js laneExempt, nothing here ever blocks him), OUR BOARD WORD (the sport's own status through lib/callStatus STATUS_WORD, never
// re-derived) and the model score. A man with no stored price is still selectable and says "no price". Nothing here is guessed.
import { CARD_WORDS } from './core'
import { straightVerdict, twoManVerdict, FLOORS } from './rules'
import { STATUS_WORD } from '../callStatus'
import { nhlMug } from '../nhl/format'

/** The NHL feed's season id for a game date ("20252026"); a September start counts as the new season. */
export function nhlSeasonOf(date) {
  const m = /^(\d{4})-(\d{2})/.exec(String(date || ''))
  if (!m) return null
  const y = Number(m[1])
  return Number(m[2]) >= 8 ? `${y}${y + 1}` : `${y - 1}${y}`
}

/** "Fri 7:00 PM ET": the game's own start in Eastern, with the day. null when the time is not a date. */
export function etWhen(iso) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  const s = new Date(t).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
  return `${s.replace(',', '')} ET`
}

/** The face component's inputs per sport (components/PlayerFace.js takes sport + id | espnId | photo); looked up, never a sport ternary. */
const FACE_OF = {
  mlb: (c) => ({ sport: 'mlb', id: c.player_id }),
  nfl: (c) => ({ sport: 'nfl', espnId: c.espn_id || null }),
  nhl: (c, season) => ({ sport: 'nhl', photo: nhlMug(season, c.team, c.player_id) }),
}

/**
 * One picker row from a board candidate (lib/card/sources.js loadCandidates `all`). `price` = the stored { median, best, books, taken_at } of the
 * market the Two-Man is graded on (the sport's anytime market), or null. `floor` is information only.
 */
export function pickerRow(c, { sport, price = null, now, season = null }) {
  const p = price && Number.isInteger(price.median) ? { median: price.median, best: Number.isInteger(price.best) ? price.best : price.median, books: price.books ?? null } : null
  const v = straightVerdict(sport, 'anytime', { price: p })
  return {
    player_id: String(c.player_id), name: c.name, team: c.team, opp: c.opp, pos: c.pos || null,
    score: c.score, status: c.status || null, board_word: STATUS_WORD[c.status] || STATUS_WORD.off,
    start_at: new Date(c.start_ms).toISOString(), when: etWhen(new Date(c.start_ms).toISOString()), started: !(c.start_ms > now), game_id: c.game_id,
    market: CARD_WORDS[sport]?.market || null, price: p,
    floor: { code: v.ok ? 'ok' : v.code, reason: v.ok ? null : v.reason, floor: FLOORS.straight },
    face: FACE_OF[sport]?.(c, season) || null,
  }
}

/** The pair's floor status (information only): combined price vs the Two-Man floor. { code: 'ok'|'price'|'no_price', combined, reason, floor }. */
export function pairFloor(a, b) {
  const v = twoManVerdict([a?.price || null, b?.price || null])
  return { code: v.ok ? 'ok' : v.code, combined: v.combined ?? null, reason: v.ok ? null : v.reason, floor: FLOORS.twoMan }
}
