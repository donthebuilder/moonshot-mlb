// 🏅 AWARD RACES, ONE CONTRACT PER SPORT (2026-10-20). Donovan: "for all of the sports we need the futures bets ... who's gonna
// win rookie of the year, defensive player, most improved, MVP, finals MVP ... we need those models being ran".
// The championship panel's pattern (lib/championship.js): one file shape, one registry, one panel (components/AwardRaces.js)
// folded on each Home under Title odds. A sport with no entry draws nothing.
//
// THE FILE CONTRACT. Shares are 0-1 and every finished race's rows + rest add to 1:
//   { schema: 1, sport, season, seasonLabel, as_of, model_version,
//     method: '...',     // REQUIRED: what the model knows
//     note: '...',       // what it does not know yet (early season, trades)
//     races: [{
//       key, label, title,
//       status: 'ok' | 'waiting',     // waiting = nothing honest to show yet; `why` says so, rows are empty
//       why, measured,                // measured: the model's hold-out record, in words
//       pool,                         // players in the race
//       rows: [{ id, name, team, ...his line (the config's columns), rookie?, share }],   // the top 10
//       rest,                         // everyone else's shares, summed
//     }] }
// A file that is missing or fails the checks below is the EMPTY state: the fold is not drawn. Nothing here invents a number.
import { fetchJSON } from './data'
import { sportKey } from './routes'

export const AWARDS = {
  nba: {
    source: '/api/buckets/awards', sourceTimeoutMs: 45000,   // built on the site (lib/nba/awards.js); the first build of a day reads 30 rosters
    foldId: 'nba-awards',
    foldTitle: '🏅 Award races',
    foldMeta: 'MVP, DPOY, ROY, MIP and Finals MVP',
    teamMark: 'nba',
    // the season-line columns each race shows (MIP adds the points gained on last season)
    cols: [
      { key: 'gp', label: 'GP', title: 'Games played this season', dp: 0 },
      { key: 'pts', label: 'PTS', title: 'Points a game', dp: 1 },
      { key: 'reb', label: 'REB', title: 'Rebounds a game', dp: 1 },
      { key: 'ast', label: 'AST', title: 'Assists a game', dp: 1 },
      { key: 'stl', label: 'STL', title: 'Steals a game', dp: 1 },
      { key: 'blk', label: 'BLK', title: 'Blocks a game', dp: 1 },
    ],
    extraCols: { mip: [{ key: 'dPts', label: '+PTS', title: 'Points a game more than last season', dp: 1 }] },
    previewRows: 5,
  },
  mlb: {
    source: '/api/mlb/awards', sourceTimeoutMs: 30000,   // built on the site (lib/mlb/awards.js) from the MLB Stats API, 6 h a day
    foldId: 'mlb-awards',
    foldTitle: '🏅 Award races',
    foldMeta: 'MVP, Cy Young and ROY, AL and NL',
    teamMark: 'mlb',
    cols: [],
    // a race's columns by the award: hitters' line, pitchers' line, or both (MVP and ROY take either)
    colsFor: (key) => {
      const bat = [
        { key: 'pa', label: 'PA', title: 'Plate appearances', dp: 0 },
        { key: 'hr', label: 'HR', title: 'Home runs', dp: 0 },
        { key: 'sb', label: 'SB', title: 'Stolen bases', dp: 0 },
        { key: 'ops', label: 'OPS', title: 'On-base plus slugging', dp: 3 },
      ]
      const arm = [
        { key: 'ip', label: 'IP', title: 'Innings pitched (.1 and .2 are outs)', dp: 1 },
        { key: 'so', label: 'K', title: 'Strikeouts', dp: 0 },
        { key: 'w', label: 'W', title: 'Wins', dp: 0 },
        { key: 'era', label: 'ERA', title: 'Earned run average', dp: 2 },
      ]
      if (key.startsWith('cy')) return [...arm.slice(0, 3), { key: 'sv', label: 'SV', title: 'Saves', dp: 0 }, arm[3]]
      return [...bat, arm[0], arm[3]]
    },
    previewRows: 5,
  },
}

export const awardsConfig = (sport) => AWARDS[sportKey(sport)] || null

const isShare = (v) => Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 1.0001
export const EMPTY_AWARDS = Object.freeze({ ok: false, races: [], method: '', note: '' })

/** Validate one sport's file: a method line, races with shares in 0-1, and every finished race summing to about one. */
export function readAwards(j) {
  if (!j || typeof j !== 'object' || !Array.isArray(j.races) || !j.races.length) return EMPTY_AWARDS
  const method = typeof j.method === 'string' ? j.method.trim() : ''
  if (!method) return EMPTY_AWARDS
  const races = []
  for (const r of j.races) {
    if (!r || !r.key || !r.label) continue
    if (r.status === 'waiting') { races.push({ ...r, rows: [] }); continue }
    const rows = Array.isArray(r.rows) ? r.rows.filter((x) => x && x.id != null && isShare(x.share)) : []
    const total = rows.reduce((t, x) => t + Number(x.share), 0) + (Number(r.rest) || 0)
    if (!rows.length || !isShare(r.rest ?? 0) || total < 0.98 || total > 1.02) continue
    races.push({ ...r, rows })
  }
  if (!races.length) return EMPTY_AWARDS
  return { ok: true, races, method, note: typeof j.note === 'string' ? j.note.trim() : '', season: j.season, seasonLabel: j.seasonLabel || '', asOf: j.as_of || null, modelVersion: j.model_version || '' }
}

const CACHE = new Map()
export function loadAwards(sport) {
  const k = sportKey(sport)
  const cfg = AWARDS[k]
  if (!cfg) return Promise.resolve(EMPTY_AWARDS)
  if (!CACHE.has(k)) {
    CACHE.set(k, fetchJSON([cfg.source], null, { timeoutMs: cfg.sourceTimeoutMs || 8000 })
      .then(readAwards)
      .catch(() => EMPTY_AWARDS))
  }
  return CACHE.get(k)
}
