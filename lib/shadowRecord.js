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

// AGAINST THE BOOK (BATCH-MODEL-V2 M3, 2026-10-03): a call that clears a soft
// bar is not edge. For a graded call with the book's LOCK line on file
// (odds_lines, snap 'lock', the fair = no-vig line and price): did he clear
// OUR bar, did he beat THE BOOK'S line (actual > its line), and what the
// book's no-vig price said the chance of the over was. American -> p.
const pOf = (o) => (o == null ? null : o < 0 ? -o / (-o + 100) : 100 / (o + 100))
export async function readVsBook(db, { table, market, oddsMarket, sport, versions, bar }) {
  const { data: calls, error } = await readPaged(() => db.from(table).select('game_date, player_id, value, hit').eq('market', market).in('model_version', versions)
    .eq('status', 'called').not('graded_at', 'is', null).not('hit', 'is', null).order('game_date', { ascending: true }).order('player_id', { ascending: true }))
  if (error) throw new Error(error.message)
  if (!calls.length) return { n: 0 }
  const days = [...new Set(calls.map((c) => c.game_date))]
  const { data: lines, error: le } = await readPaged(() => db.from('odds_lines').select('game_date, our_player_id, fair_line, fair_odds, line, odds').eq('sport', sport).eq('market', oddsMarket)
    .eq('snap', 'lock').in('game_date', days).not('our_player_id', 'is', null).order('game_date', { ascending: true }).order('our_player_id', { ascending: true }))
  if (le) throw new Error(le.message)
  const by = new Map(lines.map((l) => [`${l.game_date}|${l.our_player_id}`, l]))
  let n = 0, cleared = 0, beat = 0, pSum = 0, pN = 0
  for (const c of calls) {
    const l = by.get(`${c.game_date}|${c.player_id}`)
    if (!l) continue
    const ln = l.fair_line ?? l.line
    if (ln == null) continue
    n++
    if (c.hit) cleared++
    if (Number(c.value) > Number(ln)) beat++
    const p = pOf(l.fair_odds ?? l.odds)
    if (p != null && Number(ln) === bar - 0.5) { pSum += p; pN++ }
  }
  return { calls: calls.length, n, cleared: line(cleared, n), beat: line(beat, n), bookP: pN ? Math.round((1000 * pSum) / pN) / 10 : null, bookPn: pN }
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
