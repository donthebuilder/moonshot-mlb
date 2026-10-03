// SHADOW MODELS, MEASURED (BATCH-MODEL-V2 "PROVE IT", 2026-10-03). For /admin:
// each logged-only model's called picks, graded -- n, hits, rate with a 95%
// range -- beside the live model on the same nights and the base rate of
// every graded row in that market. Nothing here is public, and nothing
// switches on from it automatically: a shadow goes live only as a new
// model_version when its range clears the live one (Donovan's rule).
// Reads only called rows' `hit` (paged) plus head counts, so it stays small.
import { readPaged } from './record/paged'
import { VERSIONS } from './nhl/versions'

const ci = (h, n) => (n ? 196 * Math.sqrt((h / n) * (1 - h / n) / n) : null)   // ±, in points
const line = (h, n) => ({ n, hit: h, pct: n ? Math.round((1000 * h) / n) / 10 : null, pm: n ? Math.round(10 * ci(h, n)) / 10 : null })

async function calledHits(db, table, { market = null, versions, since = null }) {
  const { data, error } = await readPaged(() => {
    let q = db.from(table).select('game_id, player_id, hit').in('model_version', versions).eq('status', 'called').not('graded_at', 'is', null).not('hit', 'is', null)
    if (market) q = q.eq('market', market)
    if (since) q = q.gte('game_date', since)
    return q.order('game_id', { ascending: true }).order('player_id', { ascending: true })
  })
  if (error) throw new Error(error.message)
  return data
}
async function baseRate(db, table, { market = null, versions, since = null }) {
  const head = (hit) => {
    let q = db.from(table).select('player_id', { head: true, count: 'exact' }).in('model_version', versions).not('graded_at', 'is', null)
    q = hit ? q.eq('hit', true) : q.not('hit', 'is', null)
    if (market) q = q.eq('market', market)
    if (since) q = q.gte('game_date', since)
    return q
  }
  const [all, hits] = await Promise.all([head(false), head(true)])
  if (all.error || hits.error) throw new Error((all.error || hits.error).message)
  return line(hits.count || 0, all.count || 0)
}

/** [{ key, label, what, shadow, live?, base, since, note }] -- one entry per shadow. */
export async function readShadows(db) {
  const out = []
  // LAMP lamp-goalpos-v1 vs the live goal board, on the nights the shadow ran
  try {
    const sh = await calledHits(db, 'lamp_prop_log', { market: 'GOAL', versions: VERSIONS.goalpos })
    const games = new Set(sh.map((r) => r.game_id))
    const live = games.size ? (await calledHits(db, 'lamp_goal_log', { versions: VERSIONS.goal })).filter((r) => games.has(r.game_id)) : []
    out.push({ key: 'lamp-goalpos', label: 'LAMP goal · ice time within position', what: 'lamp-goalpos-v1 vs the live goal board (lamp-goal), same games',
      shadow: line(sh.filter((r) => r.hit).length, sh.length), live: line(live.filter((r) => r.hit).length, live.length), base: await baseRate(db, 'lamp_prop_log', { market: 'GOAL', versions: VERSIONS.goalpos }), note: 'called = 1+ goal' })
  } catch (e) { out.push({ key: 'lamp-goalpos', label: 'LAMP goal · ice time within position', error: e.message }) }
  for (const [m, key, bar] of [['PTS', 'pts', '1+ point'], ['AST', 'ast', '1+ assist']]) {
    try {
      const sh = await calledHits(db, 'lamp_prop_log', { market: m, versions: VERSIONS[key] })
      out.push({ key: `lamp-${key}`, label: `LAMP ${m === 'PTS' ? 'points' : 'assists'} (shadow market)`, what: `${VERSIONS[key].join(' + ')} called picks vs every graded skater`,
        shadow: line(sh.filter((r) => r.hit).length, sh.length), base: await baseRate(db, 'lamp_prop_log', { market: m, versions: VERSIONS[key] }), note: `called = ${bar}` })
    } catch (e) { out.push({ key: `lamp-${key}`, label: `LAMP ${m}`, error: e.message }) }
  }
  return out
}
