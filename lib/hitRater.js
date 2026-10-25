// 🎯 THE HIT RATER, ONE CORE FOR EVERY SPORT (2026-10-24, Donovan: "I want the hit rater ... shared", and TRENDING "able to
// look at all the sports"; Doink's NBA Hit Rater + Trending Insights). One row = one player, one lane, one book line tonight:
// how often he went over it (L5 / L10 / L20 / season / home-or-away / against tonight's club), and how often players at his
// spot went over it against tonight's defense (DVP). Lanes and how to read a stat off a game row come from lib/propLanes.js;
// each sport hands its own game rows. Filters (minutes, shot attempts) narrow HIS games before anything is counted.
// A hit rate is a count of games that happened, shown as a percent with its count (Donovan: "I like the percentages") --
// never a model chance or the book's implied % (NHL / NBA: check-no-printed-probability). Pure: no fetch, no React.

export const HR_WINDOWS = [['L5', 5], ['L10', 10], ['L20', 20], ['Season', Infinity]]
/** Under this many games a cell is THIN (said, still shown). */
export const HR_THIN = 5

const fin = (v) => v != null && v !== '' && Number.isFinite(Number(v))

/** { ok, n, pct } for these values against the line. Over = strictly above it (books hang .5; a push is not an over). */
export function hitCount(values, line, side = 'over') {
  const vs = values.filter(fin).map(Number)
  const ok = vs.filter((v) => (side === 'under' ? v < line : v > line)).length
  return { ok, n: vs.length, pct: vs.length ? Math.round((100 * ok) / vs.length) : null }
}

/**
 * Games (NEWEST FIRST) -> the windows. game: { date, opp, home, min?, fga?, ...stat fields }. stat(g) reads the lane's value.
 * opts.keep(g) filters games first (minutes / attempts); opts.next = { opp, home } adds HM/AW (his games at tonight's venue
 * side) and H2H (his games against tonight's club).
 */
export function hitWindows(games, stat, line, { side = 'over', keep = null, next = null } = {}) {
  const gs = (games || []).filter((g) => (keep ? keep(g) : true))
  const out = {}
  for (const [w, n] of HR_WINDOWS) out[w] = hitCount(gs.slice(0, n).map(stat), line, side)
  if (next?.home != null) out.HA = hitCount(gs.filter((g) => g.home === next.home).map(stat), line, side)
  if (next?.opp) out.H2H = hitCount(gs.filter((g) => g.opp === next.opp).map(stat), line, side)
  return out
}

/** The filter predicate from the chips: { minMin, minFga } (null = off). A game missing the field fails an ON filter. */
export function gameKeep({ minMin = null, minFga = null } = {}) {
  if (minMin == null && minFga == null) return null
  return (g) => (minMin == null || (fin(g.min) && Number(g.min) >= minMin)) && (minFga == null || (fin(g.fga) && Number(g.fga) >= minFga))
}

/**
 * One Hit Rater row. p: { sport, id, name, team, pos }. lane: a lib/propLanes entry (key, word, stat). line / odds: tonight's
 * book. games: his rows, newest first. dvp: the lane's values posted by players at his spot against tonight's defense,
 * NEWEST FIRST (null when the sport has no such table yet).
 */
export function hitRaterRow({ p, lane, line, odds = null, side = 'over', games, next = null, dvp = null, keep = null }) {
  const own = hitWindows(games, lane.stat, line, { side, keep, next })
  const d = dvp ? { L5: hitCount(dvp.slice(0, 5), line, side), L10: hitCount(dvp.slice(0, 10), line, side), Season: hitCount(dvp, line, side) } : null
  const vals = (games || []).filter((g) => (keep ? keep(g) : true)).map(lane.stat).filter(fin).map(Number)
  return {
    key: `${p.sport}:${p.id}:${lane.key}:${line}:${side}`, sport: p.sport, id: p.id, name: p.name, team: p.team, pos: p.pos || null,
    lane: lane.key, word: lane.word, line, side, odds,
    avg: vals.length ? Math.round((10 * vals.reduce((a, b) => a + b, 0)) / vals.length) / 10 : null,
    own, dvp: d, opp: next?.opp || null, home: next?.home ?? null,
  }
}

/**
 * TRENDING: the rows hitting most, across every sport at once. A row needs HR_THIN+ games in L10; it sorts on its L10
 * percent, then season percent, then the DVP L10 percent when there is one, then sample size.
 */
export function trending(rows, { minN = HR_THIN, take = 25 } = {}) {
  const v = (c) => (c && c.n >= 1 && c.pct != null ? c.pct : -1)
  return (rows || []).filter((r) => r.own?.L10?.n >= minN)
    .sort((a, b) => v(b.own.L10) - v(a.own.L10) || v(b.own.Season) - v(a.own.Season) || v(b.dvp?.L10) - v(a.dvp?.L10) || b.own.Season.n - a.own.Season.n)
    .slice(0, take)
}
