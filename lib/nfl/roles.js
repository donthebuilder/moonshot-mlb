// lib/nfl/roles.js -- A PLAYER'S DEPTH ROLE, IN ONE PLACE (2026-10-10, Donovan: "nfl positions need to be
// labeled too like RB1 RB2 WR1 slot all that").
//
// WHERE THE ROLE COMES FROM. The bot publishes it; the site does not work it out. nfl_matchup.json carries
// `roles`: gsis_id -> "QB" | "RB1" | "RB2" | "Other RB" | "WR1" | "WR2" | "WR3" | "Other WR" | "TE1" | "TE2" |
// "Other TE". It is the bot's depth chart for the week, the same map the defense-versus-position tables read
// ("WR1 vs DAL", lib/nfl/dvpSignal.js matchupTag), so the table, the card and the alert cannot disagree.
// MEASURED on the week-5 file: one man per club per numbered role (no duplicates), and the numbered order
// follows snap share in 78 of 102 adjacent pairs -- so it is a depth chart, NOT a snap-share ranking, and it is
// worded as one ("depth chart", never "ranked by snaps").
//
// WHAT IT CANNOT SAY.
//   * SLOT. No published field says where a receiver lines up. `pass_game.corners[].slot` is the DEFENSE's
//     corner spot (LCB / RCB / NB). Nothing on the offense side carries alignment, so SLOT is never shown. It
//     switches on the day a snap row carries a slot share (`slot_pct`, percent of his snaps in the slot) of
//     SLOT_MIN_PCT or more; until then isSlot() is false for everyone and the label says so.
//   * "QB1", "FB": the file's quarterback role is the single word "QB" and there is no fullback role; they are
//     not invented. A depth man ("Other RB", "Other WR", "Other TE") has no number: he shows his plain position.
//   * Kickers, defenses, and players the chart has no row for: plain position.
//
// A role is information, not a forecast: it says where the bot's chart puts him, nothing about what he will do.
// It changes no score, no status word and no model row (labels only).
import { MIN_GAMES_THIS } from './seasonRule'

export const SLOT_MIN_PCT = 50
/** Numbered roles that count as a role label; anything else ("Other WR", "QB1") falls back to the position. */
const NUMBERED = /^(RB[1-3]|WR[1-4]|TE[1-3])$/
const POS = ['QB', 'RB', 'WR', 'TE']

const roleString = (v) => (typeof v === 'string' ? v : v && typeof v === 'object' ? v.role || null : null)

/**
 * The depth role to print for one player, or null. `position` guards a mismatched row (a TE the chart calls
 * "Other WR" prints his position, never a role from the wrong group).
 */
export function depthRole(matchup, playerId, position) {
  if (playerId == null || !matchup?.roles) return null
  return numberedRole(roleString(matchup.roles[playerId]), position)
}

/** A raw chart word ("WR1", "Other WR") for a position: the printable role, or null. The one rule every surface shares. */
export function numberedRole(raw, position) {
  const pos = String(position || '').toUpperCase()
  if (!raw || !POS.includes(pos)) return null
  if (raw === 'QB') return pos === 'QB' ? 'QB' : null
  return NUMBERED.test(raw) && raw.startsWith(pos) ? raw : null
}

/** Is he a slot receiver? Only from a published share; null (unknown) when the field is absent. */
export function isSlot(snapRow) {
  const v = Number(snapRow?.slot_pct)
  if (snapRow?.slot_pct == null || !Number.isFinite(v)) return null
  return v >= SLOT_MIN_PCT
}

/** Snap games behind the chart this season for a player, or null. */
export const roleGames = (matchup, playerId) => {
  const g = Number(matchup?.snaps?.[playerId]?.games)
  return Number.isFinite(g) ? g : null
}

/**
 * Put the role on every player row once, where the slate and the matchup file meet.
 * Adds `role` ("WR1" or null), `role_slot` (true/false/null), `role_games`. The input is returned as-is when
 * there is nothing to add (same reference), so a payload without roles costs nothing.
 */
export function withRoles(slate, matchup) {
  if (!slate?.players || !matchup?.roles) return slate
  let changed = false
  const players = slate.players.map((p) => {
    const role = depthRole(matchup, p.player_id, p.position)
    const slot = p.position === 'WR' ? isSlot(matchup?.snaps?.[p.player_id]) : null
    if (!role && slot == null) return p
    changed = true
    return { ...p, role, role_slot: slot, role_games: roleGames(matchup, p.player_id) }
  })
  return changed ? { ...slate, players } : slate
}

/** What a table / header / card prints: "WR1", else the plain position. `p` is a player row (withRoles'd or not). */
export function roleLabel(p) {
  return p?.role || p?.position || ''
}
/** The long form for a header: "WR1 · slot" only when a published share says slot. */
export function roleLong(p) {
  const base = roleLabel(p)
  return p?.role && p.role_slot === true ? `${base} · slot` : base
}

/** The sentence that says where the label is from, with the sample behind it. Null when there is no role. */
export function roleNote(p, season = null) {
  if (!p?.role) return null
  const g = Number.isFinite(Number(p.role_games)) ? Number(p.role_games) : null
  const yr = Number(season) > 0 ? ` ${season}` : ''
  const sample = g == null ? '' : g < MIN_GAMES_THIS ? `, early: ${g} ${g === 1 ? 'game' : 'games'} of snaps` : `, ${g} games of snaps`
  return `${p.role}: where the bot's depth chart puts him this week${yr}${sample}. A label, not a forecast.`
}

/** Does this player pass the Role filter key ("WR1", or "SLOT" when a published share says so)? */
export const roleMatches = (p, key) => (key === 'all' || !key ? true : key === 'SLOT' ? p?.role_slot === true : p?.role === key)

/** The Role filter's options, in depth order, counted over `players`; only roles that exist in the pool (Slot only if published). */
export const ROLE_ORDER = ['QB', 'RB1', 'RB2', 'WR1', 'WR2', 'WR3', 'TE1', 'TE2']
export function roleOptions(players = []) {
  const n = {}
  for (const p of players) { if (p?.role) n[p.role] = (n[p.role] || 0) + 1; if (p?.role_slot === true) n.SLOT = (n.SLOT || 0) + 1 }
  return [...ROLE_ORDER, 'SLOT'].filter((r) => n[r]).map((key) => ({ key, label: key === 'SLOT' ? 'Slot' : key, count: n[key] }))
}
