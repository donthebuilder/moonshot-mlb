// WHO LINES UP WHERE, PURE (2026-10-10, Donovan: "add to the field who lines up where").
//
// THE RULE: a man is put on the field ONLY where a published number puts him. Nothing here is a snap-by-snap
// alignment, because no such feed exists (see .claude-notes/ALIGNMENT-SPEC.md for what the bot would have to publish).
// Three bases, each said on the page next to the man:
//   'targets'  his side comes from HIS OWN targets: nfl_matchup.json field.player_pass[id], zone keys "left|short" ...
//              He is placed on the side that holds at least half of his targets (and he has MIN_PLAYS of them).
//   'carries'  the same from field.player_rush[id] (a back's carries by lane), used in the Running view.
//   'role'     only his depth-chart role is known (QB, RB1, TE1): the position's usual spot, labelled "by role",
//              never a fact about a play.
//   'chart'    a defender's own depth-chart spot (pass_game.corners[def][].slot: LCB / RCB / NB).
// A man with no basis (a receiver whose targets go everywhere, an "Other WR") is NOT placed: he goes to the
// "also in the game" chips. A man the injury layer lists as OUT / IL / doubtful is NEVER placed as if playing: he is
// a dimmed chip wearing the status word. Slot is never claimed (lib/nfl/roles.js: no published field).
//
// Left / right are the offence's, as the offence faces downfield (the same as the field's own LEFT / MIDDLE / RIGHT
// labels and the play-by-play's pass_location). A defender's own left is the offence's right: corners are drawn by their chart label, see CORNER_SIDE.
import { depthRole } from './roles'

export const MIN_PLAYS = 10           // targets / carries behind a side before it counts as his side
export const MAJORITY = 0.5           // the share of those plays one side must hold
export const MAX_FACES = 6            // faces per side on a phone; the rest ride the chips
const SIDE_OF = (zoneKey) => String(zoneKey).split('|')[0]
const SIDES = ['left', 'middle', 'right']
// who gets a face first when there are more than MAX_FACES
const PRIORITY = ['WR1', 'WR2', 'WR3', 'TE1', 'RB1', 'QB', 'RB2', 'TE2']
const RUN_PRIORITY = ['RB1', 'RB2', 'QB']
const ROLE_SIDE = { QB: 'middle', RB1: 'middle', RB2: 'middle', TE1: 'right' }   // 'by role' spots, nothing else
export const BACKFIELD = new Set(['QB', 'RB1', 'RB2'])

const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i
export function lastName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean)
  while (parts.length > 1 && SUFFIX.test(parts[parts.length - 1])) parts.pop()
  return parts[parts.length - 1] || ''
}

/** A man's plays by side from one grid ({ "left|short": { att } }), or null when he has none. */
export function sidesOf(grid) {
  if (!grid) return null
  const by = { left: 0, middle: 0, right: 0 }
  let n = 0
  for (const [z, c] of Object.entries(grid)) {
    const s = SIDE_OF(z)
    const a = Number(c?.att) || 0
    if (s in by && a > 0) { by[s] += a; n += a }
  }
  if (!(n > 0)) return null
  const top = SIDES.reduce((a, s) => (by[s] > by[a] ? s : a), 'left')
  return { by, n, top, topShare: by[top] / n }
}

/** His most-used zone key in a grid ("right|short"), or null. */
export function topZoneOf(grid) {
  let best = null
  for (const [z, c] of Object.entries(grid || {})) if ((Number(c?.att) || 0) > (best?.att || 0)) best = { z, att: Number(c.att) }
  return best ? best.z : null
}

/**
 * The offence's men: { placed, chips }.
 *   statusOf(player) -> null | { chip, word, blocked }   (the injury layer; blocked = out / IL / doubtful)
 * `players` are the week file's rows. Only the game's own club is read.
 */
export function placeOffense({ matchup, players = [], off, pass, statusOf = () => null, maxFaces = MAX_FACES }) {
  const gridsAll = pass ? matchup?.field?.player_pass : matchup?.field?.player_rush
  const prio = pass ? PRIORITY : RUN_PRIORITY
  const pool = []
  for (const p of players) {
    if (p.team !== off || !['QB', 'RB', 'WR', 'TE'].includes(p.position)) continue
    const id = String(p.player_id)
    const role = depthRole(matchup, id, p.position)
    const st = statusOf(p)
    pool.push({ id, p, role, st, grid: gridsAll?.[id] || null, snap: Number(matchup?.snaps?.[id]?.snap_pct) || 0 })
  }
  const chips = []
  const cand = []
  const blockedOf = (x) => Boolean(x.st?.blocked)
  const chip = (x, reason) => chips.push({ id: x.id, name: x.p.name, last: lastName(x.p.name), role: x.role || x.p.position, position: x.p.position, espn_id: x.p.espn_id, team: off, row: x.p, status: x.st, out: blockedOf(x), reason })

  // the one QB: the depth chart's "QB" with the most snaps
  const qbs = pool.filter((x) => x.role === 'QB').sort((a, b) => b.snap - a.snap)
  for (const x of pool) {
    if (blockedOf(x)) { if (x.role || x.grid) chip(x, 'out'); continue }
    if (x.role === 'QB') { if (x === qbs[0]) cand.push(x); else chip(x, 'depth'); continue }
    if (!x.role) { if (x.grid && sidesOf(x.grid)?.n >= MIN_PLAYS) chip(x, 'depth'); continue }
    cand.push(x)
  }
  const rank = (x) => { const i = prio.indexOf(x.role); return i < 0 ? 99 : i }
  cand.sort((a, b) => rank(a) - rank(b) || (sidesOf(b.grid)?.n || 0) - (sidesOf(a.grid)?.n || 0))

  const placed = []
  for (const x of cand) {
    if (rank(x) === 99 || placed.length >= maxFaces || (BACKFIELD.has(x.role) && placed.filter((q) => q.back).length >= 2)) { chip(x, rank(x) === 99 ? 'depth' : 'more'); continue }
    const s = sidesOf(x.grid)
    const own = s && s.n >= MIN_PLAYS && s.topShare >= MAJORITY
    const isBack = BACKFIELD.has(x.role)
    let side = null, basis = null
    // a back in the passing view is a backfield man by role: his targets are not where he stands
    if (own && (!isBack || !pass) && !(x.role === 'QB')) { side = s.top; basis = pass ? 'targets' : 'carries' }
    else if (ROLE_SIDE[x.role]) { side = ROLE_SIDE[x.role]; basis = 'role' }
    else { chip(x, 'spread'); continue }
    placed.push({ id: x.id, name: x.p.name, last: lastName(x.p.name), role: x.role, position: x.p.position, espn_id: x.p.espn_id, team: off, row: x.p, status: x.st,
      side, basis, back: isBack, n: s?.n || 0, sideShare: s ? s.by[side] / s.n : null, sideN: s ? s.by[side] : 0, zone: topZoneOf(x.grid) })
  }
  // slot index within a lane (outermost first): a stable stack, never a position claim
  placed.filter((m) => m.back).sort((a, b) => Number(b.role === 'QB') - Number(a.role === 'QB')).forEach((m, i) => { m.row_i = i })
  const seen = { left: 0, middle: 0, right: 0, 'b-middle': 0, 'b-left': 0, 'b-right': 0 }
  for (const m of placed) { const k = m.back ? `b-${m.side}` : m.side; m.slot = seen[k]; seen[k] += 1 }
  chips.sort((a, b) => Number(a.out) - Number(b.out) || String(a.role).localeCompare(String(b.role)))
  return { placed, chips }
}

const CORNER_SIDE = { LCB: 'left', RCB: 'right', NB: 'middle' }   // drawn by the chart's own label (a defender's left really faces the offence's right: said in the caption)
export const CORNER_WORD = { LCB: 'Left CB', RCB: 'Right CB', NB: 'Slot CB' }

/** The defence's three starting corners at their DEPTH-CHART spots (pass_game.corners): { placed, chips }. */
export function placeDefense({ matchup, def, statusOf = () => null }) {
  const list = matchup?.pass_game?.corners?.[def] || []
  const placed = []
  const chips = []
  for (const c of list) {
    const side = CORNER_SIDE[c.slot]
    if (!side) continue
    const st = statusOf({ player_id: c.gsis_id, name: c.name, team: def })
    const m = { id: String(c.gsis_id || c.espn_id || c.name), name: c.name, last: lastName(c.name), role: c.slot, word: CORNER_WORD[c.slot], position: 'CB', espn_id: c.espn_id, team: def, status: st, basis: 'chart', side, games: c.games, pd: c.pd, int: c.int, back: false, slot: 0 }
    if (st?.blocked) chips.push({ ...m, out: true, reason: 'out' }); else placed.push(m)
  }
  return { placed, chips }
}

/** Who gets the ball in one zone: the club's men ranked by their own plays there. [{ id, name, att, share }] */
export function whoInZone({ matchup, players = [], off, pass, zone, limit = 3, statusOf = () => null }) {
  const grids = pass ? matchup?.field?.player_pass : matchup?.field?.player_rush
  if (!grids || !zone) return []
  let total = 0
  const rows = []
  for (const p of players) {
    if (p.team !== off) continue
    const c = grids[String(p.player_id)]?.[zone]
    const a = Number(c?.att) || 0
    if (!(a > 0)) continue
    total += a
    rows.push({ id: String(p.player_id), name: p.name, last: lastName(p.name), role: depthRole(matchup, String(p.player_id), p.position) || p.position, espn_id: p.espn_id, team: off, row: p, att: a, td: Number(c?.td) || 0, status: statusOf(p) })
  }
  return rows.filter((r) => !r.status?.blocked).sort((a, b) => b.att - a.att).slice(0, limit).map((r) => ({ ...r, share: total > 0 ? (100 * r.att) / total : null }))
}

/** The one quiet line that says where the placements come from. */
export function basisNote({ placed = [], pass, hasDef }) {
  const kinds = new Set(placed.map((m) => m.basis))
  const bits = []
  if (kinds.has('targets')) bits.push('Solid ring: placed by where he is targeted (the side with at least half his targets).')
  if (kinds.has('carries')) bits.push('Solid ring: placed by where he runs (the side with at least half his carries).')
  if (kinds.has('role')) bits.push('Dashed ring: by role, the position’s usual spot, not a fact about a play.')
  if (pass && hasDef) bits.push('Corners drawn by chart label (LCB left, RCB right); nobody says who covers whom.')
  if (!pass) bits.push('How the defense lines up against the run is not published.')
  return bits.join(' ')
}

/**
 * The SIDE word for a key-players row: { word, basis } -- the same rule as placeOffense, said for one man.
 * 'Left' / 'Middle' / 'Right' only from his own targets (basis 'targets'); a standard spot only by role ('role');
 * otherwise 'Spread' (his targets go everywhere) or '—' (nothing to say). Never 'Slot'.
 */
export function sideFor({ matchup, id, position }) {
  const role = depthRole(matchup, String(id), position)
  const s = sidesOf(matchup?.field?.player_pass?.[String(id)])
  const cap = (x) => x[0].toUpperCase() + x.slice(1)
  if (BACKFIELD.has(role)) return { word: 'Backfield', basis: 'role' }
  if (s && s.n >= MIN_PLAYS && s.topShare >= MAJORITY) return { word: cap(s.top), basis: 'targets' }
  if (ROLE_SIDE[role]) return { word: cap(ROLE_SIDE[role]), basis: 'role' }
  return s && s.n >= MIN_PLAYS ? { word: 'Spread', basis: 'targets' } : { word: '—', basis: null }
}
