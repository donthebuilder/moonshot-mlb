// MOONSHOT FIRST HIT / FIRST HOMER: THE LOCK AND THE GRADE (2026-10-23, known issue 70; supabase/migrations/202610240200_mlb_first_log.sql).
// LOCK   once per game, in the last LOCK_WINDOW_MS before first pitch (never at or after it): every starter's rank in his game for the first
//        hit and the first homer (lib/mlb/firstModel.js slateFirstCalls, the same call Openings shows), written once (insert, duplicates ignored).
// GRADE  once opening_games (sport 'mlb', lib/mlb/openings.js) has the game: first_hit / first_hr per row. A game with no homer grades every
//        row's first_hr false. Graded once (only rows with no graded_at).
// RECORD the #1 call's hits over graded games, per market: what Openings prints next to tonight's calls.
// No table yet (the SQL not run): every step answers 'no-table' and nothing else happens.
import { slateFirstCalls, VERSION } from './firstModel.js'

export const TABLE = 'mlb_first_log'
export const LOCK_WINDOW_MS = 20 * 60e3
const missing = (e) => e && /relation .* does not exist|could not find the table|schema cache/i.test(String(e.message || e))
const code = (t) => String(t || '').toUpperCase()

/** The games whose first pitch is inside the lock window: Map game_pk -> start ms. */
export function gamesToLock(rows, now = Date.now()) {
  const out = new Map()
  for (const p of rows || []) {
    const gk = p?.game_pk
    const t = Date.parse(p?.game_time || '')
    if (gk == null || !Number.isFinite(t)) continue
    if (t > now && t - now <= LOCK_WINDOW_MS) out.set(String(gk), t)
  }
  return out
}

/** The rows to write for those games (pure): one per ranked starter. */
export function lockRows(rows, calls, { day, now = Date.now(), pks }) {
  const out = []
  for (const p of rows || []) {
    const gk = String(p?.game_pk ?? '')
    if (!pks.has(gk)) continue
    const id = String(p.player_id ?? p.id ?? '')
    const c = calls.get(id)
    if (!c) continue
    out.push({
      game_pk: gk, game_date: day, model_version: VERSION, player_id: id, name: p.name || p.player_name || null, team: code(p.team) || null,
      bat_order: Number(p.lineup_spot) || null, hit_rank: c.hitRank, hr_rank: c.hrRank, projected: Boolean(c.projected), locked_at: new Date(now).toISOString(),
    })
  }
  return out
}

let _home = { pks: '', map: null }
async function homeOfFor(pks) {
  const key = [...pks].sort().join(',')
  if (_home.pks === key && _home.map) return _home.map
  const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?gamePks=${key}&hydrate=team&fields=dates,games,gamePk,teams,home,team,abbreviation`, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`schedule ${res.status}`)
  const j = await res.json()
  const map = new Map((j.dates || []).flatMap((d) => d.games || []).map((g) => [String(g.gamePk), code(g.teams?.home?.team?.abbreviation)]))
  _home = { pks: key, map }
  return map
}

/** Lock the games inside the window. Never throws; says what it did. */
export async function lockFirstCalls(db, { day, rows, now = Date.now() }) {
  try {
    const due = gamesToLock(rows, now)
    if (!due.size) return 'no-game-due'
    const pks = new Set(due.keys())
    const { data: have, error } = await db.from(TABLE).select('game_pk').in('game_pk', [...pks]).eq('model_version', VERSION).limit(1000)
    if (missing(error)) return 'no-table'
    if (error) return `read-failed: ${error.message}`
    for (const r of have || []) pks.delete(String(r.game_pk))
    if (!pks.size) return 'already-locked'
    const homeOf = await homeOfFor(pks)
    const mine = rows.filter((p) => pks.has(String(p?.game_pk ?? '')))
    const calls = slateFirstCalls(mine, { homeOf, teamOf: (p) => code(p.team) })
    const out = lockRows(mine, calls, { day, now, pks })
    if (!out.length) return 'no-lineups'
    const { error: wErr } = await db.from(TABLE).upsert(out, { onConflict: 'game_pk,model_version,player_id', ignoreDuplicates: true })
    if (wErr) return `write-failed: ${wErr.message}`
    return `locked ${pks.size} game(s), ${out.length} rows`
  } catch (e) { return `error: ${e?.message || e}` }
}

/** The grade of locked rows from opening_games (pure): { first_hit, first_hr } for one row, or null while the game isn't in. */
export function gradeOf(row, game) {
  if (!game) return null
  return { first_hit: String(game.first_hit_player || '') === String(row.player_id), first_hr: String(game.first_hr_player || '') === String(row.player_id) }
}

/** Grade every locked, ungraded row whose game is in opening_games. Never throws. */
export async function gradeFirstCalls(db, { now = Date.now() } = {}) {
  try {
    const { data: open, error } = await db.from(TABLE).select('game_pk, player_id').is('graded_at', null).eq('model_version', VERSION).limit(2000)
    if (missing(error)) return 'no-table'
    if (error) return `read-failed: ${error.message}`
    if (!open?.length) return 'nothing-open'
    const pks = [...new Set(open.map((r) => String(r.game_pk)))]
    const { data: games, error: gErr } = await db.from('opening_games').select('game_id, first_hit_player, first_hr_player').eq('sport', 'mlb').in('game_id', pks)
    if (gErr) return `games-failed: ${gErr.message}`
    const byId = new Map((games || []).map((g) => [String(g.game_id), g]))
    let n = 0
    for (const r of open) {
      const g = gradeOf(r, byId.get(String(r.game_pk)))
      if (!g) continue
      const { error: uErr } = await db.from(TABLE).update({ ...g, graded_at: new Date(now).toISOString() })
        .match({ game_pk: r.game_pk, model_version: VERSION, player_id: r.player_id }).is('graded_at', null)
      if (!uErr) n += 1
    }
    return n ? `graded ${n}` : 'waiting-for-games'
  } catch (e) { return `error: ${e?.message || e}` }
}

/** The #1 call's record over graded games (pure, from graded rows): { hit: { won, of }, hr: { won, of } }. */
export function recordOf(rows) {
  const out = { hit: { won: 0, of: 0 }, hr: { won: 0, of: 0 } }
  const games = new Map()
  for (const r of rows || []) if (r.graded_at) { if (!games.has(r.game_pk)) games.set(r.game_pk, []); games.get(r.game_pk).push(r) }
  for (const list of games.values()) {
    const h = list.find((r) => r.hit_rank === 1)
    if (h) { out.hit.of += 1; if (h.first_hit) out.hit.won += 1 }
    const x = list.find((r) => r.hr_rank === 1)
    if (x) { out.hr.of += 1; if (x.first_hr) out.hr.won += 1 }
  }
  return out
}
