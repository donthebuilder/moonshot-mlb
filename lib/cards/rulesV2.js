// THE COLLECTIBLE CARD RULES, v2 (pure: no I/O, no JSX; node:crypto only). Donovan's brief of 2026-10-14 (Desktop/AUDITS-TO-READ/CARD-SYSTEM/BRIEF.md, section 2 and 7).
// This does NOT replace lib/cards/moments.js (that is the live rule for today's special cards and stays untouched). It is the one table of the brief's thresholds, the
// deterministic card id, and the issuance decision (one card per ACHIEVEMENT, nothing issued twice). check-card-rules-v2.mjs proves the table and moments.js agree.
//
// RARITY IS HOW UNUSUAL THE DOCUMENTED EVENT IS. It is never a probability, a chance of winning or a value. The image generator never picks a tier.
import { createHash } from 'node:crypto'
import { MOMENTS, ALL_MOMENTS, TIERS, tierRank, evaluate } from './moments'
import { idOf } from './specialData'

/** Bump when a threshold below changes. It is part of every card id, so a rule change can never silently re-tier an issued card. */
export const RULES_VERSION = 'r2'

/** [minimum, tier] steps, ascending: the card's tier is the HIGHEST step whose minimum the value reaches (>=). Below the first step: no card. */
export const STEPS = Object.freeze({
  nhl_hat_trick: [[3, 'elite'], [4, 'legend']],                       // goals in one game
  nhl_three_points: [[3, 'star'], [5, 'elite'], [7, 'legend']],       // goals + assists (3-4 STAR, 5-6 ELITE, 7+ LEGEND)
  mlb_multi_hr: [[2, 'star'], [3, 'elite'], [4, 'legend']],           // home runs in one game
  nfl_multi_td: [[2, 'star'], [3, 'elite'], [4, 'legend']],           // touchdowns scored in one game
  nfl_100_yards: [[100, 'star'], [150, 'elite'], [200, 'legend']],    // rushing OR receiving yards in one game
  long_shot_cashed: [[750, 'star'], [1200, 'elite'], [2000, 'legend']], // American odds of the STORED pre-event price
})
/** A goal: an overtime goal is STAR, a standing goal in any other period is BASE. */
export const GOAL = Object.freeze({ ot: 'star', other: 'base' })
/** The season-goal totals that earn a card (exact totals; 35 or 45 earn none). */
export const SEASON_GOALS = Object.freeze({ 20: 'star', 25: 'star', 30: 'star', 40: 'elite', 50: 'legend', 60: 'legend' })

/** The tier a value reaches in a step table, or null below the first step. Non-finite values are null (never a card). */
export function tierFromSteps(steps, value) {
  const n = typeof value === 'number' ? value : value == null || value === '' ? NaN : Number(value)
  if (!Number.isFinite(n)) return null
  let tier = null
  for (const [min, t] of steps) if (n >= min) tier = t
  return tier
}

/**
 * LONG SHOT BETWEEN THRESHOLDS (decision, flagged for Donovan): the price must be a whole American price (+749 is, +749.5 is not a price any book posts, so it is
 * rejected, never rounded up into a card). +749 earns nothing, +750..+1199 STAR, +1200..+1999 ELITE, +2000 and up LEGEND. A price is never inferred after the
 * event: the row must say the price was the LOCK snapshot (price_source = 'lock', taken before the event), else no card.
 */
export function longShotTier(row) {
  if (!row || row.status !== 'called' || row.hit !== true) return null
  if (row.price_source !== 'lock') return null
  const p = row.best
  if (typeof p !== 'number' || !Number.isInteger(p)) return null
  if (!(Number(row.books) >= 1)) return null
  return tierFromSteps(STEPS.long_shot_cashed, p)
}

/** The tier of one data row for one achievement under THESE rules (independent of moments.js; the test compares the two). null = no card. */
export function tierOf(key, row) {
  if (!row) return null
  switch (key) {
    case 'nhl_goal': {
      if (!row.player_id || !row.name || row.overturned_at) return null
      const pt = String(row.period_type || '').toUpperCase()
      if (pt === 'SO') return null
      return pt === 'OT' ? GOAL.ot : GOAL.other
    }
    case 'nhl_season_goal_milestone': {
      if (tierOf('nhl_goal', row) == null) return null
      return Object.hasOwn(SEASON_GOALS, row.season_goals) ? SEASON_GOALS[row.season_goals] : null
    }
    case 'nhl_hat_trick': return tierFromSteps(STEPS.nhl_hat_trick, (row.goals || []).length)
    // a 3+ goal night is the hat trick's own achievement and is not counted a second time here (same as moments.js; FLAGGED for Donovan: say if a hat trick should ALSO earn a points card)
    case 'nhl_three_points': return (row.goals || []).length >= 3 ? null : tierFromSteps(STEPS.nhl_three_points, (row.goals || []).length + (row.assists || []).length)
    case 'mlb_multi_hr': return tierFromSteps(STEPS.mlb_multi_hr, (row.hrs || []).length)
    case 'nfl_multi_td': return tierFromSteps(STEPS.nfl_multi_td, (row.tds || []).length)
    case 'nfl_100_yards': return tierFromSteps(STEPS.nfl_100_yards, Math.max(Number(row.rush_yds) || 0, Number(row.rec_yds) || 0))
    case 'long_shot_cashed': return longShotTier(row)
    default: return null
  }
}

// ── the card id ─────────────────────────────────────────────────────────────
/** The season a game belongs to, from the game's OWN date (never the wall clock): NHL / NBA / NFL seasons start in the autumn, MLB's is the calendar year. */
export function seasonOf(sport, day, given = null) {
  if (given != null && given !== '') return String(given)
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(day || ''))
  if (!m) return null
  const y = Number(m[1]), mo = Number(m[2])
  const style = SEASON_STYLE[sport] || 'pair'
  if (style === 'calendar') return String(y)
  const start = mo >= 8 ? y : y - 1
  return style === 'start' ? String(start) : `${start}${start + 1}`
}
/** How each sport words its season (a table, not a branch): the calendar year, the starting year, or the two years (20262027). */
const SEASON_STYLE = { mlb: 'calendar', nfl: 'start', nhl: 'pair', nba: 'pair' }

const norm = (v) => String(v == null ? '' : v).trim()
/**
 * The deterministic card id: a hash of the EVENT, the PLAYER, the ACHIEVEMENT TYPE, the SEASON and the RULES VERSION. The same inputs always give the same id (so
 * re-ingesting a feed can never mint a second card), and a different achievement in the same game (a hat trick AND a season milestone) gives a different one.
 * `slot` (event_key) is the same hash WITHOUT the rules version: the issuance table is unique on both, so a rules change cannot re-issue an old achievement.
 */
export function cardIdOf({ sport, key, row, rulesVersion = RULES_VERSION }) {
  const f = idOf[key]
  if (!f || !row) return null
  const player = norm(row.player_id ?? row.gsis_id)
  const event = norm(f(row))
  const season = seasonOf(sport, row.day, row.season)
  if (!player || !event || !season) return null
  const parts = [norm(sport), event, player, key, season]
  const hex = (s) => createHash('sha256').update(s).digest('hex')
  const slot = hex(parts.join('|'))
  const full = hex(`${parts.join('|')}|${rulesVersion}`)
  return { cardId: `DN-${full.slice(0, 12).toUpperCase()}`, slotId: `DS-${slot.slice(0, 12).toUpperCase()}`, canonical: `${parts.join('|')}|${rulesVersion}`, rulesVersion, season, event, player }
}

// ── qualification and issuance ──────────────────────────────────────────────
/** One card per ACHIEVEMENT. Returns { key, tier, cardId, slotId, ... } or null. Tier comes from THIS table; an achievement moments.js does not know is null. */
export function qualify(key, row, { sport = ALL_MOMENTS[key]?.sport, rulesVersion = RULES_VERSION } = {}) {
  if (!ALL_MOMENTS[key]) return null
  const tier = tierOf(key, row)
  if (!tier) return null
  const sp = sport === 'any' ? row.sport : sport
  const id = cardIdOf({ sport: sp, key, row, rulesVersion })
  if (!id) return null
  return { key, sport: sp, tier, ...id }
}

/** Every card a set of data rows earns: ONE PER ACHIEVEMENT, never collapsed to a "best per player-game" (Donovan 10-14). `rows` = [{ key, row }]. */
export function qualifyAll(rows, opts = {}) {
  const out = new Map()
  for (const { key, row } of rows || []) {
    const q = qualify(key, row, opts)
    if (q && !out.has(q.cardId)) out.set(q.cardId, q)   // the same achievement ingested twice in one batch is one card
  }
  return [...out.values()]
}

/**
 * The issuance decision, pure (the database does the same with unique (card_id) and unique (slot_id)): given the candidates and the cards already issued
 * ({ card_id, slot_id }), return { issue: [...], skip: [{ card, why }] }. Idempotent: running it again over the same feed issues nothing.
 */
export function issuePlan(candidates, issued = []) {
  const haveId = new Set(issued.map((c) => c.card_id ?? c.cardId))
  const haveSlot = new Set(issued.map((c) => c.slot_id ?? c.slotId))
  const issue = [], skip = []
  for (const c of candidates) {
    if (haveId.has(c.cardId)) { skip.push({ card: c, why: 'already issued (same card id)' }); continue }
    if (haveSlot.has(c.slotId)) { skip.push({ card: c, why: 'already issued under an earlier rules version (same achievement)' }); continue }
    issue.push(c); haveId.add(c.cardId); haveSlot.add(c.slotId)
  }
  return { issue, skip }
}

export { TIERS, tierRank, evaluate, MOMENTS }
