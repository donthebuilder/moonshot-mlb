// DOUBLE-DOUBLE / TRIPLE-DOUBLE, THE GAME-LOG READ (2026-10-09). Server only. For the night's candidates whose
// season line says they could be in the market at all (lib/nba/ddtd.js REACH_MIN), read their game logs -- the same
// ESPN read Hot hands and xPTS make, cached 15 minutes by lib/nba/api.js -- and sum them into rates.
// A log that could not be read is a FAILED read, said so (the tick then waits rather than lock a hole); a player
// ESPN has no log for (404) has an empty one, which is "under 10 games", not a failure.
import { gamelogFor, reduceGamelog } from './api'
import { ddtdFromLog, realGames, reachOf, REACH_MIN, WINDOW } from './ddtd'

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]) } }))
  return out
}

const logOf = async (id, season) => {
  try { return { log: realGames(reduceGamelog(await gamelogFor(id, season))) } } catch (e) { return e?.status === 404 ? { log: [] } : { failed: true } }
}

/** This season's real games, then last season's only while this one is short of the window. */
export async function playerLog(id, { cur, prev }) {
  const a = await logOf(id, cur)
  if (a.failed) return { failed: true }
  if (a.log.length >= WINDOW) return { log: a.log }
  const b = await logOf(id, prev)
  if (b.failed) return { failed: true }
  return { log: [...a.log, ...b.log] }
}

/** Map(playerId -> { summary } | { failed: true }) for every candidate who passes the reach gate. */
export async function ddtdSummaries(candidates, seasons, { concurrency = 6 } = {}) {
  const ids = [...new Set(candidates.filter((c) => c.legs?.ok && (reachOf(c.legs) ?? 0) >= REACH_MIN).map((c) => c.playerId))]
  const got = await pool(ids, concurrency, async (id) => {
    const r = await playerLog(id, seasons)
    return [id, r.failed ? { failed: true } : { summary: ddtdFromLog(r.log) }]
  })
  return new Map(got)
}
