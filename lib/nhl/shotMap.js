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
import { adminClient } from '../supabase/admin'
import { whichSeason } from './whichSeason'
import { previousSeasonId } from './season'
import { seasonLabel } from './reduce'

// the slot and grid: lib/nhl/shotMapShape.js (browser-safe, shared with the page)
import { SLOT, GRID, LEAGUE_MIN_GAMES } from './shotMapShape'
import { xgShot, XG_MODEL_VERSION } from './xg'
import { normRow, drawable } from './shotNorm'
export { SLOT, GRID, LEAGUE_MIN_GAMES }
const LAST_N_GAMES = 10
// THIS SEASON FIRST (2026-10-10, Donovan: "make sure the shooter section on NHL
// is showing this season data"). The old rule held last season's map up until
// this season had 10 games. Now the default is THIS season from its first game;
// under SMALL_SAMPLE_GAMES the response says so (`sample.thin`, `minGames`) and
// the page prints "This season: n games" -- the real numbers, a plain label,
// never a confident read. Last season is the default only when this season has
// no shots at all for the player/club (`fallback`, `stale`). ?season=auto keeps
// the old 10-game floor for the pre-game write-ups, which gate on their own volume.
const MIN_GAMES = 10
const SMALL_SAMPLE_GAMES = MIN_GAMES
// the league comparison needs a league-wide sample: ~10 games a club (160 league games)
const RECENT_SHOTS = 200
const BASE_COLS = 'game_id, event_id, game_date, x, y, result, strength, shot_type, period, period_type, time_s, zone, situation_code, goalie_id'
// miss_reason exists once 202609282300_lamp_shots_miss_reason.sql has run;
// until then the read falls back to the columns that were always there.
let COLS = `${BASE_COLS}, miss_reason`
const missingReason = (error) => error && /miss_reason/.test(error.message) && COLS !== BASE_COLS

async function readAll(db, key, value, season) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('lamp_shots').select(COLS).eq(key, value).eq('season', season).eq('game_type', 2)
      .order('game_date', { ascending: true }).order('event_id', { ascending: true }).range(from, from + 999)
    if (missingReason(error)) { COLS = BASE_COLS; return readAll(db, key, value, season) }
    if (error) throw new Error(error.message)
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

// norm: lib/nhl/shotNorm.js (zone-aware; was a bare x < 0 flip that mirrored own-end shots onto the near net)
const norm = normRow
const onNet = (s) => s.result === 'sog' || s.result === 'goal'
const inSlot = (s) => s.x >= SLOT.x0 && s.x <= SLOT.x1 && Math.abs(s.y) <= SLOT.y
// SHOT DEPTH (2026-09-28). Distance in feet from the net the shot attacked
// (goal line x = 89, centre y = 0), after normalising. A miss's reason in four
// words a reader uses: wide / high / iron (post or bar) / other.
const NET_X = 89
const distOf = (s) => Math.hypot(NET_X - s.x, s.y)
const MISS_GROUP = (r) => (/^hit-/.test(r) ? 'iron' : /^high|above-crossbar/.test(r) ? 'high' : /^wide/.test(r) ? 'wide' : 'other')
const avg = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null)

// lamp-xg-v1 (2026-10-07): xG of the shots on goal, summed. Scored from each row's OWN zone-aware
// location (lib/nhl/xg.js normShot), not from the mirrored dots below: a shot on goal from the
// shooter's own end is far from the net it attacked, and mirroring it onto the near end would make
// it look like a slot shot. Empty-net shots are off the curve (null).
const xgOf = (s) => (s.result === 'sog' || s.result === 'goal' ? xgShot(s) : null)

function summarise(shots) {
  const pts = shots.map((s) => { const n = norm(s); return n ? { ...n, _xg: xgOf(s) } : null }).filter(Boolean)
  const grid = Array.from({ length: GRID.rows }, () => Array.from({ length: GRID.cols }, () => ({ att: 0, sog: 0, g: 0, xg: 0 })))
  const cw = (GRID.x1 - GRID.x0) / GRID.cols; const ch = (GRID.y1 - GRID.y0) / GRID.rows
  for (const s of pts) {
    if (s.x < GRID.x0) continue
    const c = Math.min(GRID.cols - 1, Math.floor((s.x - GRID.x0) / cw))
    const r = Math.min(GRID.rows - 1, Math.max(0, Math.floor((GRID.y1 - s.y) / ch)))
    const cell = grid[r][c]; cell.att += 1; if (onNet(s)) cell.sog += 1; if (s.result === 'goal') cell.g += 1
    if (s._xg != null) cell.xg += s._xg
  }
  const scored = pts.filter((s) => s._xg != null)
  const xgTotal = scored.reduce((a, s) => a + s._xg, 0)
  const net = pts.filter(onNet)
  const by = (k) => shots.reduce((m, s) => (m[s[k] || 'unknown'] = (m[s[k] || 'unknown'] || 0) + 1, m), {})
  return {
    games: new Set(shots.map((s) => s.game_id)).size,
    attempts: shots.length, sog: shots.filter(onNet).length, goals: shots.filter((s) => s.result === 'goal').length,
    misses: shots.filter((s) => s.result === 'miss').length, blocked: shots.filter((s) => s.result === 'block').length,
    slotSog: net.filter(inSlot).length, slotShare: net.length ? net.filter(inSlot).length / net.length : null,
    byStrength: by('strength'), byType: by('shot_type'),
    // Per shot type: unblocked attempts (a block has no type), on net, goals.
    types: shots.filter((s) => s.shot_type && s.result !== 'block').reduce((m, s) => {
      const t = m[s.shot_type] || (m[s.shot_type] = { att: 0, sog: 0, g: 0 })
      t.att += 1; if (onNet(s)) t.sog += 1; if (s.result === 'goal') t.g += 1
      return m
    }, {}),
    distSog: avg(net.map(distOf)), distGoal: avg(pts.filter((s) => s.result === 'goal').map(distOf)),
    // null until the archive holds reasons (the column, then a backfill).
    missWhy: (() => {
      const r = shots.filter((s) => s.result === 'miss' && s.miss_reason)
      return r.length ? r.reduce((m, s) => (m[MISS_GROUP(s.miss_reason)] += 1, m), { n: r.length, wide: 0, high: 0, iron: 0, other: 0 }) : null
    })(),
    grid,
    // xG, summed over the shots on goal the model could score (empty-net shots are left off); goals on the same shots
    xg: { version: XG_MODEL_VERSION, total: xgTotal, sog: scored.length, goals: scored.filter((s) => s.result === 'goal').length },
    // EVERY SHOT'S OWN DETAIL (2026-09-29, the spray-chart pass): the first
    // three slots stay [x, y, result] so every existing reader is unchanged;
    // the rest feed the filters and the tap-a-dot card. Positional to keep
    // 200 shots near 10 KB.
    //   [x, y, result, shot_type, strength, period, period_type, time_s, game_date, miss_reason]
    recent: pts.filter(drawable).slice(-RECENT_SHOTS).map((s) => [s.x, s.y, s.result, s.shot_type || null, s.strength || null, s.period ?? null, s.period_type || null, s.time_s ?? null, s.game_date || null, s.miss_reason || null]),
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
      if (missingReason(error)) { COLS = BASE_COLS; return readAgainst(db, team, season) }
      if (error) throw new Error(error.message)
      out.push(...data)
      if (data.length < 1000) break
    }
  }
  return out.sort((a, b) => (a.game_date < b.game_date ? -1 : a.game_date > b.game_date ? 1 : a.event_id - b.event_id))
}

// THE LEAGUE'S MAP (2026-10-01, 2D TOP TIER 2 "vs a typical player"). Every
// regular-season attempt of one season, aggregated in the database by
// public.lamp_league_shot_grid (supabase/migrations/202610010100_*): the
// same normalising, grid and slot rules as summarise() above, a few hundred
// bytes back. Read once per season per server instance (6 h), so a day of
// per-player cache misses costs one aggregate, not one each. Null until the
// function exists -- the page then simply has no VS LEAGUE.
const LEAGUE = new Map()
const LEAGUE_TTL = 6 * 3600 * 1000
async function readLeague(db, season) {
  const hit = LEAGUE.get(season)
  if (hit && Date.now() - hit.at < LEAGUE_TTL) return hit.v
  const { data, error } = await db.rpc('lamp_league_shot_grid', { p_season: season })
  if (error || !data) return null      // not run yet / not reachable: no comparison, never a guess
  const grid = Array.from({ length: GRID.rows }, () => Array.from({ length: GRID.cols }, () => ({ att: 0, sog: 0, g: 0 })))
  for (const c of data.cells || []) if (grid[c.r]?.[c.c]) grid[c.r][c.c] = { att: Number(c.att), sog: Number(c.sog), g: Number(c.g) }
  const v = { season, games: Number(data.games), attempts: Number(data.attempts), sog: Number(data.sog), slotShare: data.sog ? Number(data.slotSog) / Number(data.sog) : null, grid }
  LEAGUE.set(season, { at: Date.now(), v })
  return v
}

/** The league's grid to compare against, ONE season, labelled. This season's if the league has
 *  LEAGUE_MIN_GAMES of it, else last season's (fallback: true) -- never a tiny sample's shading. Pure. */
export function pickLeague(own, prev, usedId) {
  const lab = (v, fallback) => ({ ...v, seasonLabel: seasonLabel(v.season), fallback, ...(fallback ? { wantedLabel: seasonLabel(usedId), wantedGames: own?.games ?? 0 } : {}) })
  if (own && own.games >= LEAGUE_MIN_GAMES) return lab(own, false)
  if (prev && prev.games >= LEAGUE_MIN_GAMES) return lab(prev, true)
  return null
}
async function leagueFor(db, used) {
  const own = await readLeague(db, used)
  if (own && own.games >= LEAGUE_MIN_GAMES) return pickLeague(own, null, used)
  return pickLeague(own, await readLeague(db, previousSeasonId(used)), used)
}

/** { key: 'player'|'team'|'against', id } -> the map for THIS season (>= 1 game), else last season's, said so.
 *  'against' = the shots a club ALLOWED (readAgainst). */
export async function readShotMap(key, id, opts = {}) {
  const db = adminClient()
  if (!db) throw new Error('no supabase env')
  const season = await whichSeason()
  return readShotMapWith(db, season, key, id, opts)
}

/** readShotMap with the database and the season handed in (the test's seam). */
export async function readShotMapWith(db, season, key, id, opts = {}) {
  const cur = season.current || season.id
  const col = key === 'team' ? 'team' : 'player_id'
  const read = (season) => (key === 'against' ? readAgainst(db, id, season) : readAll(db, col, id, season))
  let used = cur
  let shots = await read(cur)
  const currentGames = new Set(shots.map((s) => s.game_id)).size
  // THE SEASON CHOICE (2026-10-06, the player card's toggle): 'this' / 'last' / 'both' ask for exactly
  // that and skip the opening-night fallback below; no choice keeps the fallback every other page relies on.
  const pick = opts.season
  let labelOverride = null
  let fallback = null
  if (pick === 'this') { /* the current season, as read */ }
  else if (pick === 'last') { used = previousSeasonId(cur); shots = await read(used) }
  else if (pick === 'both') {
    const prev = await read(previousSeasonId(cur))
    if (shots.length) { used = cur; labelOverride = prev.length ? `${seasonLabel(previousSeasonId(cur))} + ${seasonLabel(cur)}` : null }
    else if (prev.length) used = previousSeasonId(cur)
    shots = [...prev, ...shots]   // oldest first, so "last 10 games" is still the newest ten
  } else if (pick === 'auto') {
    if (currentGames < MIN_GAMES) {
      const prev = await read(previousSeasonId(cur))
      if (prev.length || !shots.length) { used = previousSeasonId(cur); shots = prev }
    }
  } else if (!shots.length) {
    // no shots yet this season for him/them: last season's, and the page says so
    const prev = await read(previousSeasonId(cur))
    used = previousSeasonId(cur); shots = prev
    fallback = prev.length ? 'no-shots-this-season' : null
  }
  const dates = [...new Set(shots.map((s) => s.game_date))].sort()
  const lastDates = new Set(dates.slice(-LAST_N_GAMES))
  const last5Dates = new Set(dates.slice(-5))   // LAST 5 (2026-10-03, Donovan: last 5 / last 10 / season)
  return {
    key, id, currentGames, minGames: MIN_GAMES, fallback,
    // THE SAMPLE (2026-10-10): the games behind THIS map, and whether it is under the small-sample line
    sample: { games: dates.length, thin: dates.length < SMALL_SAMPLE_GAMES, current: shots.length > 0 && used === cur && pick !== 'both', line: SMALL_SAMPLE_GAMES }, currentLabel: seasonLabel(cur), season: shots.length ? used : null, seasonLabel: shots.length ? (labelOverride || seasonLabel(used)) : null, stale: shots.length > 0 && used !== cur, pick: pick || null,
    slot: SLOT, gridSpec: GRID,
    // the league's same-season map (null until its SQL has run)
    league: shots.length ? await leagueFor(db, used) : null,
    all: summarise(shots),
    last10: summarise(shots.filter((s) => lastDates.has(s.game_date))),
    last5: summarise(shots.filter((s) => last5Dates.has(s.game_date))),
  }
}
