// THE #MEMBERS ROUNDUP'S GAMES, FROM THE CALLS THEMSELVES (2026-10-31, Donovan: "it should show all the players ... it only had 4 games on here. And I swear it
// was like 10 games today ... football tomorrow ... good to go and easy to read").
// The roundup used to list only games with a finished WRITE-UP, and a write-up is skipped when the starting goalie is not confirmed 30 minutes out: on 10-31
// six of LAMP's ten games had two CALLED skaters each and no write-up, so the list showed four games. A game is in the roundup when it has a CALLED (locked)
// player, write-up or not. Each sport reads its own record of the calls; nothing here decides who is CALLED.
//   -> [{ game_id, teams: [away, home], names: [...], kickoff: ISO }]   (games with no called player are left out)
import { nhlCalledFromLog } from '../phone/todayCalls'

const NAMES_PER_GAME = 3
const txt = (v) => (v == null ? '' : String(v).trim())
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const iso = (v) => { const t = typeof v === 'number' ? v : Date.parse(v); return Number.isFinite(t) ? new Date(t).toISOString() : null }

/** The best `n` distinct names of one game's called rows (best score first). Pure. */
export function topNames(rows, n = NAMES_PER_GAME) {
  const seen = new Set()
  return [...(rows || [])].sort((a, b) => num(b.score) - num(a.score) || txt(a.name).localeCompare(txt(b.name)))
    .filter((r) => { const k = txt(r.player_id ?? r.playerId ?? r.name); if (!txt(r.name) || seen.has(k)) return false; seen.add(k); return true })
    .slice(0, n).map((r) => txt(r.name))
}

/** LAMP: the locked goal-board rows of the night -> called skaters per game. `games` = [{ id, start, away, home }]. `rows`/`meta` = readLocked's. Pure. */
export function nhlCalledGames({ rows, meta, games }) {
  const called = nhlCalledFromLog(rows, meta, 400)?.items || []
  const byGame = new Map()
  for (const it of called) (byGame.get(String(it.gameId)) || byGame.set(String(it.gameId), []).get(String(it.gameId))).push({ ...it, player_id: it.id, score: (rows || []).find((r) => String(r.player_id) === it.id && String(r.game_id) === it.gameId)?.score })
  return (games || []).map((g) => ({ game_id: String(g.id), teams: [g.away, g.home].filter(Boolean), names: topNames(byGame.get(String(g.id))), kickoff: iso(g.start) })).filter((x) => x.names.length)
}

/** BUCKETS: the points board's locked CALLED rows per game (the points calls are the ones members wait for). `board` = readNbaBoard(date, 'pts'). Pure. */
export function nbaCalledGames({ board }) {
  const byGame = new Map()
  for (const r of board?.rows || []) if (r.status === 'called' && r.locked) (byGame.get(String(r.gameId)) || byGame.set(String(r.gameId), []).get(String(r.gameId))).push(r)
  return (board?.games || []).map((g) => ({ game_id: String(g.id), teams: [g.away?.abbrev, g.home?.abbrev].filter(Boolean), names: topNames(byGame.get(String(g.id))), kickoff: iso(g.start) })).filter((x) => x.names.length)
}

/** TUDDY: the game calls file's LOCKED games -> the game's top call first, then the rest. `calls` = nfl_game_calls.json's games. Pure. */
export function nflCalledGames({ games }) {
  return (games || []).filter((g) => g?.locked && (g.calls || []).length).map((g) => {
    const ordered = [...g.calls].sort((a, b) => (a.role === 'TOP' ? 0 : 1) - (b.role === 'TOP' ? 0 : 1) || num(a.slate_rank ?? 99) - num(b.slate_rank ?? 99))
    return { game_id: String(g.game_id), teams: [g.away, g.home].filter(Boolean), names: [...new Set(ordered.map((c) => txt(c.name)).filter(Boolean))].slice(0, NAMES_PER_GAME), kickoff: iso(g.kickoff) }
  }).filter((x) => x.names.length)
}

/** LAMP's reader (server): the night's locked rows from the record. Never throws; [] on any failure (the write-up rows still go out). */
export async function readNhlCalledGames(date, games) {
  try {
    const { readLocked } = await import('../nhl/boardRead')
    const { locked, games: meta } = await readLocked(date, 'GOAL', { cols: 'pulse' })
    return nhlCalledGames({ rows: locked, meta, games })
  } catch { return [] }
}
/** BUCKETS' reader (server): the points board of the night. Never throws. */
export async function readNbaCalledGames(readBoard, date) {
  try { return nbaCalledGames({ board: await readBoard(date, 'pts') }) } catch { return [] }
}
