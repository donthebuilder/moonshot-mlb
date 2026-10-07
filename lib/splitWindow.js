// THE SEASON WINDOW BEHIND MOONSHOT'S SPLITS TAB (2026-10-07, Donovan: "add a
// last-season option to MLB splits").
//
// THIS SEASON | LAST SEASON | LAST 2 SEASONS, the same three words the LAMP and
// TUDDY cards use. Pure functions, no fetching, so the aggregation can be run
// on TEST data (scripts/test-split-window.mjs) and so the component stays about
// drawing.
//
// THE ONE RULE: counting stats are SUMMED across seasons and every rate is
// RECOMPUTED from the sums. A rate is never averaged with another rate (an
// average of two seasons' AVGs is wrong whenever the at-bats differ).
//
//   AVG = H / AB                      OBP = (H + BB + HBP) / (AB + BB + HBP + SF)
//   SLG = TB / AB                     OPS = OBP + SLG        ISO = SLG - AVG
//   HR/PA% = 100 * HR / PA            K% = 100 * K / PA      BB% = 100 * BB / PA
//
// Where each window's numbers come from (never faked, and a window the source
// cannot answer is reported as unavailable by the caller):
//   - the live situational groups (platoon, RISP, outs, count, runners, day/
//     night): MLB StatsAPI statSplits for that season. The API's own rate
//     strings are used for ONE season; two seasons are summed and recomputed.
//   - home/away, win/loss, day of week and the combine filter: this season is
//     the bot's per-game file; last season is rebuilt from the same StatsAPI
//     game log (isHome / isWin / date), one row a game. Day/night is NOT
//     rebuilt: the log's dayNight field is the one the bot already stopped
//     trusting (every game of a full season comes back "day"), so the
//     day/night combine filter is offered for THIS SEASON only.

export const THIN_SEASON_PA = 100

export const WINDOWS = [
  { key: 'this', label: 'THIS SEASON' },
  { key: 'last', label: 'LAST SEASON' },
  { key: 'both', label: 'LAST 2 SEASONS' },
]

const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }

/**
 * Which window opens first. THIS SEASON, unless he has fewer than 100 PA this
 * season (THIN_SEASON_PA) AND last season is on offer: then LAST 2 SEASONS, so
 * a rookie's or a returning bat's April sample isn't read alone. An unknown
 * PA count is not "thin" (the default stays THIS SEASON).
 */
export function defaultWindow({ thisPa, lastAvailable }) {
  if (thisPa == null || thisPa === '') return 'this'
  const pa = Number(thisPa)
  if (lastAvailable && Number.isFinite(pa) && pa < THIN_SEASON_PA) return 'both'
  return 'this'
}

/** The windows to offer: only what the data supports. */
export function offeredWindows({ lastAvailable }) {
  return lastAvailable ? WINDOWS : []
}

const ZERO = () => ({ g: 0, pa: 0, ab: 0, h: 0, hr: 0, d2: 0, d3: 0, bb: 0, hbp: 0, sf: 0, k: 0, rbi: 0, tb: 0, r: 0 })

/** Add counting stats. Missing fields are zero; nothing is averaged. */
export function sumCounts(list) {
  const out = ZERO()
  for (const c of list) {
    if (!c) continue
    for (const k of Object.keys(out)) out[k] += num(c[k])
  }
  return out
}

/** Rates recomputed from counts. */
export function ratesFromCounts(c) {
  const avg = c.ab ? c.h / c.ab : 0
  const obpDen = c.ab + c.bb + c.hbp + c.sf
  const obp = obpDen ? (c.h + c.bb + c.hbp) / obpDen : 0
  const slg = c.ab ? c.tb / c.ab : 0
  return {
    avg, obp, slg, ops: obp + slg, iso: slg - avg,
    hrPa: c.pa ? (100 * c.hr) / c.pa : 0,
    kPct: c.pa ? (100 * c.k) / c.pa : 0,
    bbPct: c.pa ? (100 * c.bb) / c.pa : 0,
  }
}

/** A table row (the shape DenseTable's Splits columns read) from counts. */
export function rowFromCounts(key, label, c) {
  return {
    _key: key, split: label, g: c.g, pa: c.pa, h: c.h, hr: c.hr,
    xbh: c.d2 + c.d3 + c.hr, rbi: c.rbi, bb: c.bb,
    ...ratesFromCounts(c),
  }
}

/** StatsAPI statSplits `stat` object -> counts (one season, one split). */
export function countsFromStat(st = {}) {
  return {
    g: num(st.gamesPlayed), pa: num(st.plateAppearances), ab: num(st.atBats), h: num(st.hits),
    hr: num(st.homeRuns), d2: num(st.doubles), d3: num(st.triples), bb: num(st.baseOnBalls),
    hbp: num(st.hitByPitch), sf: num(st.sacFlies), k: num(st.strikeOuts), rbi: num(st.rbi),
    tb: num(st.totalBases), r: num(st.runs),
  }
}

/**
 * Two seasons of live situational rows -> one row per split code. Rows are
 * { code, split, counts }. A code present in only one season is that season's
 * numbers alone (the other season genuinely had none of that situation).
 */
export function combineLive(seasons) {
  const byCode = new Map()
  for (const rows of seasons) {
    for (const r of rows || []) {
      if (!r?.code) continue
      const cur = byCode.get(r.code) || { code: r.code, split: r.split, list: [] }
      cur.list.push(r.counts)
      byCode.set(r.code, cur)
    }
  }
  return [...byCode.values()].map((e) => ({ code: e.code, ...rowFromCounts(e.code, e.split, sumCounts(e.list)), counts: sumCounts(e.list) }))
}

/**
 * One game of the flat last-season log (lib/gamelogs.js lastSeasonRates()._games,
 * which is the StatsAPI gameLog, one row a game) -> a raw game row in the bot's
 * `games` shape plus hbp/sf. Day/night stays null on purpose (see the header).
 */
export function gameFromFlat(g) {
  const date = String(g?.date || '')
  let dow = null
  const t = Date.parse(`${date}T12:00:00Z`)
  if (Number.isFinite(t)) dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(t).getUTCDay()]
  return {
    date, dow,
    home: typeof g?.home === 'boolean' ? g.home : null,
    win: typeof g?.win === 'boolean' ? g.win : null,
    dn: null,
    pa: num(g?.pa), ab: num(g?.ab), h: num(g?.h), hr: num(g?.hr),
    '2b': num(g?.d2), '3b': num(g?.d3), bb: num(g?.bb), k: num(g?.k),
    rbi: num(g?.rbi), r: num(g?.r), tb: num(g?.tb), hbp: num(g?.hbp), sf: num(g?.sf),
  }
}

/** Raw game rows -> counts (g = number of games). */
export function countsFromGames(games) {
  const c = ZERO()
  for (const r of games) {
    c.g += 1; c.pa += num(r.pa); c.ab += num(r.ab); c.h += num(r.h); c.hr += num(r.hr)
    c.d2 += num(r['2b']); c.d3 += num(r['3b']); c.bb += num(r.bb); c.hbp += num(r.hbp); c.sf += num(r.sf)
    c.k += num(r.k); c.rbi += num(r.rbi); c.tb += num(r.tb); c.r += num(r.r)
  }
  return c
}

export const FILE_GROUP_ORDER = {
  home_away: ['Home', 'Away'],
  win_loss: ['Win', 'Loss'],
  day_of_week: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
}

const bucketOf = {
  home_away: (g) => (g.home === true ? 'Home' : g.home === false ? 'Away' : null),
  win_loss: (g) => (g.win === true ? 'Win' : g.win === false ? 'Loss' : null),
  day_of_week: (g) => g.dow || null,
}

/**
 * Raw game rows -> the three bot-file tables (home/away, win/loss, day of
 * week) as DenseTable rows, in the bot's own order. A group with no rows is
 * left out (never an empty table).
 */
export function tablesFromGames(games) {
  const out = {}
  for (const key of Object.keys(FILE_GROUP_ORDER)) {
    const buckets = new Map()
    for (const g of games) {
      const b = bucketOf[key](g)
      if (!b) continue
      if (!buckets.has(b)) buckets.set(b, [])
      buckets.get(b).push(g)
    }
    const rows = FILE_GROUP_ORDER[key].filter((b) => buckets.has(b))
      .map((b) => rowFromCounts(b, b, countsFromGames(buckets.get(b))))
    if (rows.length) out[key] = rows
  }
  return out
}
