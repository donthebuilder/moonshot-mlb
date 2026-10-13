// THE BINDER (pure: no I/O, no JSX, no clock: callers hand in `today`). 2026-10-12, Donovan: "they can see the cards that happen, collectors get them when they
// have them on their watchlist". The binder is a VIEW over the cards the site already stores (lib/cards/specialData.js earnedFor / recent):
//   MY CARDS   = the cards earned by players on MY watchlist (dash_follow_v1)
//   ALL CARDS  = every recent card in the league
// Both are grouped by RARITY: LEGEND, then ELITE, then STAR, newest first inside a section; BASE cards are collapsed under "Base cards (N)".
// A card (summary) is what earnedFor / recent return: { moment, id, sport, tier, tierWord, kicker, line, day, dayWord, playerId, name, team, opp, game, status }.
// Nothing here makes a card up: an empty list stays empty, and the empty state names real players handed in from the real board.
import { TIERS, TIER_WORD, tierRank } from './moments'

/** The tiers in display order, rarest first. */
export const RARITY_ORDER = [...TIERS].reverse()
/** The tiers that get a section of their own (BASE is collapsed). */
export const OPEN_TIERS = ['legend', 'elite', 'star']
export const RARITY_COPY = 'Rarest first, then newest.'
export const SEEN_CAP = 600
export const WEEK_DAYS = 7
export const SEEN_KEY = 'dash_binder_seen_v1'

export const cardKey = (c) => `${c.moment}:${c.id}`
const txt = (v) => String(v == null ? '' : v).trim()
const dayNum = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || '')); return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5) : null }

/** Rarest first, then newest (day desc), then id so the order is stable. The ONE sort every list of cards uses. */
export function rarestFirst(a, b) {
  return (tierRank(b.tier) - tierRank(a.tier)) || String(b.day || '').localeCompare(String(a.day || '')) || cardKey(a).localeCompare(cardKey(b))
}
/** Newest first (day desc), then rarest: used INSIDE a rarity section. */
export function newestFirst(a, b) {
  return String(b.day || '').localeCompare(String(a.day || '')) || (tierRank(b.tier) - tierRank(a.tier)) || cardKey(a).localeCompare(cardKey(b))
}

/** Merge lists of cards: the same card (moment + id) once. */
export function mergeCards(...lists) {
  const seen = new Map()
  for (const l of lists) for (const c of l || []) if (c && c.moment && c.id != null && !seen.has(cardKey(c))) seen.set(cardKey(c), c)
  return [...seen.values()]
}

/** The follow keys ('nhl:8478402') of a follow store's live rows. */
export const followKeysOf = (rows) => new Set((rows || []).filter((r) => r && !r.removed && r.sport && r.id != null).map((r) => `${r.sport}:${r.id}`))
export const playerKeyOf = (c) => `${c.sport}:${c.playerId}`

/** MY CARDS: only the cards of players on the watchlist. An empty watchlist is an empty list (never "everyone"). */
export function onlyWatched(cards, followKeys) {
  const keys = followKeys instanceof Set ? followKeys : new Set(followKeys || [])
  return (cards || []).filter((c) => keys.has(playerKeyOf(c)))
}

/**
 * The filters: { sport: 'mlb'|'nfl'|'nhl'|null, rarity: 'legend'|'elite'|'star'|'base'|null, playerId: string|null, week: boolean, today: 'YYYY-MM-DD' }.
 * `week` = the last 7 days counted from `today` (given by the caller; a missing today makes the week filter keep everything rather than guess).
 */
export function filterCards(cards, { sport = null, rarity = null, playerId = null, week = false, today = null } = {}) {
  const t = dayNum(today)
  return (cards || []).filter((c) => {
    if (sport && c.sport !== sport) return false
    if (rarity && c.tier !== rarity) return false
    if (playerId && String(c.playerId) !== String(playerId)) return false
    if (week && t != null) { const d = dayNum(c.day); if (d == null || t - d > WEEK_DAYS - 1 || d > t) return false }
    return true
  })
}

/** The rarity sections: LEGEND, ELITE, STAR (open) then BASE (collapsed). Empty sections are left out. */
export function groupByRarity(cards) {
  const out = []
  for (const tier of RARITY_ORDER) {
    const list = (cards || []).filter((c) => c.tier === tier).sort(newestFirst)
    if (!list.length) continue
    out.push({ tier, word: TIER_WORD[tier], cards: list, collapsed: tier === 'base', title: tier === 'base' ? `Base cards (${list.length})` : `${TIER_WORD[tier]} (${list.length})` })
  }
  return out
}

/** The progress strip: '12 cards · 2 LEGEND · 3 ELITE · 5 STAR' (+ ' · 2 BASE' when there are any). A tier with none is left out. */
export function progress(cards) {
  const counts = Object.fromEntries(TIERS.map((t) => [t, 0]))
  for (const c of cards || []) if (counts[c.tier] != null) counts[c.tier] += 1
  const total = TIERS.reduce((n, t) => n + counts[t], 0)
  const parts = [`${total} ${total === 1 ? 'card' : 'cards'}`]
  for (const t of RARITY_ORDER) if (counts[t]) parts.push(`${counts[t]} ${TIER_WORD[t]}`)
  return { total, counts, text: parts.join(' · ') }
}

/** The players in a list of cards (for the player filter): [{ playerId, sport, name, n }] most cards first. */
export function playersOf(cards) {
  const m = new Map()
  for (const c of cards || []) {
    const k = playerKeyOf(c)
    if (!m.has(k)) m.set(k, { key: k, playerId: String(c.playerId), sport: c.sport, name: txt(c.name), n: 0 })
    m.get(k).n += 1
  }
  return [...m.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
}

// ── NEW since the last visit (localStorage SEEN_KEY; works signed out) ─────────────────────────────────────────────
// seen = { v:1, at:<ms>, ids:[cardKey, ...] } or null. The FIRST visit has nothing to compare with, so nothing is NEW (every card is simply marked seen).
export function emptySeen() { return null }
export function parseSeen(raw) {
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw
    return o && o.v === 1 && Array.isArray(o.ids) ? { v: 1, at: Number(o.at) || 0, ids: o.ids.map(String) } : null
  } catch { return null }
}
export const isNew = (c, seen) => Boolean(seen) && !seen.ids.includes(cardKey(c))
export const newCount = (cards, seen, { minTier = 'star' } = {}) => (cards || []).filter((c) => tierRank(c.tier) >= tierRank(minTier) && isNew(c, seen)).length
/** The seen record after the cards have been looked at (old ids kept, newest first, capped). */
export function markSeen(seen, cards, now = 0) {
  const ids = [...new Set([...(cards || []).map(cardKey), ...(seen?.ids || [])])].slice(0, SEEN_CAP)
  return { v: 1, at: now, ids }
}

// ── the empty state: how to collect, with 3 REAL suggestions ──────────────────────────────────────────────────────
/** board = real rows [{ sport, id, name, team }] in the order the board ranks them (today's board); follows = Set of 'sport:id'. Nothing is invented: no board, no suggestions. */
export function emptyState({ board = [], followKeys = new Set(), sport = null, hasFollows = false } = {}) {
  const have = followKeys instanceof Set ? followKeys : new Set(followKeys || [])
  const seen = new Set()
  const suggestions = []
  for (const p of board || []) {
    const id = txt(p?.id), name = txt(p?.name)
    if (!id || !name) continue
    const key = `${p.sport || sport}:${id}`
    if (have.has(key) || seen.has(key)) continue
    seen.add(key)
    suggestions.push({ sport: p.sport || sport, id, name, team: txt(p.team) })
    if (suggestions.length === 3) break
  }
  return {
    title: hasFollows ? 'NO CARDS YET FOR YOUR PLAYERS' : 'YOUR BINDER IS EMPTY',
    note: hasFollows
      ? 'A card is earned in a real game: a hat trick, a multi-homer game, 2+ touchdowns, a 100-yard game, an overtime goal, a called pick that cashed at a long price. When a player you follow earns one, it lands here.'
      : 'Follow players with the star on a board or a player page. When one earns a card in a real game (a hat trick, two homers in a game, 2+ touchdowns, a 100-yard game), it is kept here.',
    suggestions,
  }
}
