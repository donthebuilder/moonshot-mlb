// 🏒 SHOT MAP AGGREGATES (lamp research step 3, 2026-09-26). Server only.
// The browser never gets lamp_shots rows wholesale: it gets, for one player
// or one club, a zone grid, the slot share, the totals and the most recent
// ~200 attempts -- season and last 10 games -- normalised so every shot
// attacks the same net (the right-hand one, x > 0).
//
// Coordinates are the league's feet: x -100..100 (goal lines at ±89, blue
// lines at ±25), y -42.5..42.5. THE SLOT here is the rectangle between the
// faceoff dots and the goal line: 69 <= x <= 89, |y| <= 22 -- printed on the
// page with the number, so the share is never a black box.
import { adminClient } from './db'
import { whichSeason } from './whichSeason'
import { previousSeasonId } from './season'
import { seasonLabel } from './reduce'

export const SLOT = { x0: 69, x1: 89, y: 22 }
export const GRID = { x0: 25, x1: 100, cols: 5, y0: -42.5, y1: 42.5, rows: 5 }
const LAST_N_GAMES = 10
const RECENT_SHOTS = 200
const COLS = 'game_id, event_id, game_date, x, y, result, strength, shot_type'

async function readAll(db, key, value, season) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('lamp_shots').select(COLS).eq(key, value).eq('season', season).eq('game_type', 2)
      .order('game_date', { ascending: true }).order('event_id', { ascending: true }).range(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

const norm = (s) => (s.x == null || s.y == null ? null : s.x < 0 ? { ...s, x: -s.x, y: -s.y } : s)
const onNet = (s) => s.result === 'sog' || s.result === 'goal'
const inSlot = (s) => s.x >= SLOT.x0 && s.x <= SLOT.x1 && Math.abs(s.y) <= SLOT.y

function summarise(shots) {
  const pts = shots.map(norm).filter(Boolean)
  const grid = Array.from({ length: GRID.rows }, () => Array.from({ length: GRID.cols }, () => ({ att: 0, sog: 0, g: 0 })))
  const cw = (GRID.x1 - GRID.x0) / GRID.cols; const ch = (GRID.y1 - GRID.y0) / GRID.rows
  for (const s of pts) {
    if (s.x < GRID.x0) continue
    const c = Math.min(GRID.cols - 1, Math.floor((s.x - GRID.x0) / cw))
    const r = Math.min(GRID.rows - 1, Math.max(0, Math.floor((GRID.y1 - s.y) / ch)))
    const cell = grid[r][c]; cell.att += 1; if (onNet(s)) cell.sog += 1; if (s.result === 'goal') cell.g += 1
  }
  const net = pts.filter(onNet)
  const by = (k) => shots.reduce((m, s) => (m[s[k] || 'unknown'] = (m[s[k] || 'unknown'] || 0) + 1, m), {})
  return {
    games: new Set(shots.map((s) => s.game_id)).size,
    attempts: shots.length, sog: shots.filter(onNet).length, goals: shots.filter((s) => s.result === 'goal').length,
    misses: shots.filter((s) => s.result === 'miss').length, blocked: shots.filter((s) => s.result === 'block').length,
    slotSog: net.filter(inSlot).length, slotShare: net.length ? net.filter(inSlot).length / net.length : null,
    byStrength: by('strength'), byType: by('shot_type'),
    grid,
    recent: pts.slice(-RECENT_SHOTS).map((s) => [s.x, s.y, s.result]),
  }
}

// SHOTS AGAINST (2026-09-27, LAMP Matchups): lamp_shots keeps the SHOOTER's
// club, not the defence on the ice. A club's shots allowed are every shot in
// its games that the other club took: its game ids first (a narrow read),
// then those games' shots with team != it, 50 games a query.
async function readAgainst(db, team, season) {
  const ids = new Set()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('lamp_shots').select('game_id').eq('team', team).eq('season', season).eq('game_type', 2)
      .order('game_id', { ascending: true }).range(from, from + 999)
    if (error) throw new Error(error.message)
    for (const r of data) ids.add(r.game_id)
    if (data.length < 1000) break
  }
  const list = [...ids]
  const out = []
  for (let i = 0; i < list.length; i += 50) {
    const chunk = list.slice(i, i + 50)
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from('lamp_shots').select(COLS).in('game_id', chunk).neq('team', team).eq('season', season).eq('game_type', 2)
        .order('game_date', { ascending: true }).order('event_id', { ascending: true }).range(from, from + 999)
      if (error) throw new Error(error.message)
      out.push(...data)
      if (data.length < 1000) break
    }
  }
  return out.sort((a, b) => (a.game_date < b.game_date ? -1 : a.game_date > b.game_date ? 1 : a.event_id - b.event_id))
}

/** { key: 'player'|'team'|'against', id } -> the map for the latest season that has shots.
 *  'against' = the shots a club ALLOWED (readAgainst). */
export async function readShotMap(key, id) {
  const db = adminClient()
  if (!db) throw new Error('no supabase env')
  const season = await whichSeason()
  const cur = season.current || season.id
  const col = key === 'team' ? 'team' : 'player_id'
  const read = (season) => (key === 'against' ? readAgainst(db, id, season) : readAll(db, col, id, season))
  let used = cur
  let shots = await read(cur)
  if (!shots.length) { used = previousSeasonId(cur); shots = await read(used) }
  const dates = [...new Set(shots.map((s) => s.game_date))].sort()
  const lastDates = new Set(dates.slice(-LAST_N_GAMES))
  return {
    key, id, season: shots.length ? used : null, seasonLabel: shots.length ? seasonLabel(used) : null, stale: shots.length > 0 && used !== cur,
    slot: SLOT, gridSpec: GRID,
    all: summarise(shots),
    last10: summarise(shots.filter((s) => lastDates.has(s.game_date))),
  }
}
