// ── ONE STAT SET PER PICK CATEGORY, USED EVERYWHERE (2026-09-06) ────────────
//
// Donovan: "the bot page still needs more stats on the columns. same with the
// boards page — the charts need more stats and specific stat columns to the
// certain pick category ... same with the live chart, we need like L5 BA and
// L10 BA, I like those stats, we need those across the board."
//
// So the columns a category earns are declared ONCE, here, and every table
// that shows that category — Boards (RankedBoard), the bot's Shortlist, Live
// (Scoreboard), the game lineup table — appends the same set in the same
// order. A HIT row reads the same on the Live page as it does on the Hits
// board, which is the whole point.
//
// Every value is read straight off the published slate row; nothing here is
// computed beyond a unit change (rates → %). Fields verified present on
// 266/266 rows of today_slim.json on 2026-09-06 unless marked ⚡ (Power-3
// family — published from the next bot ship, dashes until then).
//
// Sets, by category:
//   HR      power first: Power-3 ⚡, HRW, HR L5, HR L10, Szn HR/BBE ⚡, Max EV ⚡,
//           then the bats: L5 AVG, L10 AVG, Szn AVG, then the arm: Opp HR/9, Park×
//   TOP     the HR set + the other three category scores + OBP, ISO, L5 XBH, K%
//   HIT     L5 AVG, L10 AVG, Szn AVG, vs Arm, L5 H, L10 H, OBP, K%, Opp WHIP, Opp K%
//   HRR     OBP, Spot, L5 RBI, L5 R, L5 AVG, L10 AVG, Szn AVG, Opp WHIP, HR L5
//   TB/CONTACT  L5 XBH, L10 XBH, ISO, SLG, Hard%, L5 AVG, Szn AVG, Max EV ⚡, Barrel%
// Every set ends with Since HR (the drought, plain — it moves no score).
import { SCORE } from './scales'

const n = (v, d = null) => { const x = Number(v); return Number.isFinite(x) ? x : d }
const pct = (v) => { const x = n(v); return x == null ? null : x * (x <= 1 ? 100 : 1) }
const avg3 = (v) => (v == null ? '—' : Number(v).toFixed(3).replace(/^0/, ''))
const pct0 = (v) => (v == null ? '—' : `${Number(v).toFixed(0)}%`)
const pct1 = (v) => (v == null ? '—' : `${Number(v).toFixed(1)}%`)
const int = (v) => (v == null ? '—' : String(Math.round(Number(v))))
const dash = (v, dp = 1) => (v == null ? '—' : Number(v).toFixed(dp))

// The registry: key → column definition (DenseTable shape) + how to read it.
export const STAT = {
  p3:     { label: 'Pwr-3',   w: 50, dp: 0, domain: [0, 100], title: '⚡ Power-3: his season HR/BBE, avg EV and max EV ranked on tonight’s slate and averaged. Top ten homer 21% of the time.', get: (p) => n(p?.power3_score) || null },
  p3rank: { label: 'P3 #',    w: 42, invert: true, heat: false, mono: true, title: '⚡ Power-3 rank on tonight’s slate (1 = strongest season power)', get: (p) => n(p?.power3_rank) || null, fmt: int },
  hrw:    { label: 'HRW',     w: 46, dp: 0, ...SCORE, title: 'HR window score — the bot’s strongest single term (80+ homered 25% in the tracked pool)', get: (p) => n(p?.hrw_score) },
  hrL5:   { label: 'HR L5',   w: 46, title: 'Home runs in his last five games (3+ homered 17.5%)', get: (p) => n(p?.last5_hr, 0), fmt: int },
  hrL10:  { label: 'HR L10',  w: 50, title: 'Home runs in his last ten games (4+ homered 16.5%)', get: (p) => n(p?.last10_hr, 0), fmt: int },
  hrBBE:  { label: 'HR/BBE',  w: 54, dp: 1, title: '⚡ Season home runs per 100 balls in play', get: (p) => { const v = n(p?.season_hr_per_bbe); return v == null ? null : v * 100 }, fmt: (v) => dash(v, 1) },
  hrPA:   { label: 'HR/PA',   w: 50, dp: 1, title: 'Season home runs per 100 plate appearances', get: (p) => { const v = n(p?.hr_per_pa); return v == null ? null : v * 100 }, fmt: (v) => dash(v, 1) },
  maxEV:  { label: 'Max EV',  w: 52, dp: 1, title: '⚡ Hardest ball he has hit this season (115+ homered 18%)', get: (p) => n(p?.season_max_ev) || null, fmt: (v) => dash(v, 1) },
  a5:     { label: 'L5 AVG',  w: 52, heat: false, mono: true, title: 'Batting average over his last five games', get: (p) => n(p?.last5_avg), fmt: avg3 },
  a10:    { label: 'L10 AVG', w: 56, heat: false, mono: true, title: 'Batting average over his last ten games', get: (p) => n(p?.last10_avg), fmt: avg3 },
  aSzn:   { label: 'Szn AVG', w: 56, heat: false, mono: true, title: 'Season batting average', get: (p) => n(p?.season_avg), fmt: avg3 },
  aArm:   { label: 'vs Arm',  w: 52, heat: false, mono: true, title: 'His season average against the hand tonight’s starter throws with', get: (p) => (String(p?.pitcher_throws || '').toUpperCase() === 'L' ? n(p?.avg_vs_lhp) : String(p?.pitcher_throws || '').toUpperCase() === 'R' ? n(p?.avg_vs_rhp) : null), fmt: avg3 },
  h5:     { label: 'L5 H',    w: 44, title: 'Hits in his last five games', get: (p) => n(p?.last5_hits, 0), fmt: int },
  h10:    { label: 'L10 H',   w: 48, title: 'Hits in his last ten games', get: (p) => n(p?.last10_hits, 0), fmt: int },
  obp:    { label: 'OBP',     w: 48, heat: false, mono: true, title: 'Season on-base percentage', get: (p) => n(p?.season_obp), fmt: avg3 },
  slg:    { label: 'SLG',     w: 48, heat: false, mono: true, title: 'Season slugging', get: (p) => n(p?.season_slg), fmt: avg3 },
  iso:    { label: 'ISO',     w: 46, heat: false, mono: true, title: 'Season isolated power (SLG − AVG)', get: (p) => n(p?.season_iso), fmt: avg3 },
  k:      { label: 'K%',      w: 44, invert: true, title: 'Season strikeout rate — lower is better', get: (p) => pct(p?.season_k_rate), fmt: pct0 },
  xbh5:   { label: 'L5 XBH',  w: 52, title: 'Extra-base hits in his last five games', get: (p) => n(p?.last5_xbh, 0), fmt: int },
  xbh10:  { label: 'L10 XBH', w: 56, title: 'Extra-base hits in his last ten games', get: (p) => n(p?.last10_xbh, 0), fmt: int },
  rbi5:   { label: 'L5 RBI',  w: 50, title: 'RBI in his last five games', get: (p) => n(p?.last5_rbi, 0), fmt: int },
  r5:     { label: 'L5 R',    w: 44, title: 'Runs scored in his last five games', get: (p) => n(p?.last5_runs, 0), fmt: int },
  spot:   { label: 'Spot',    w: 40, invert: true, heat: false, mono: true, title: 'Lineup spot tonight', get: (p) => n(p?.lineup_spot) || null, fmt: int },
  hard:   { label: 'Hard%',   w: 50, title: 'Recent hard-hit rate (95+ mph)', get: (p) => pct(p?.recent_hard_hit_rate), fmt: pct0 },
  brl:    { label: 'Brl%',    w: 46, title: 'Recent barrel rate', get: (p) => pct(p?.recent_barrel_rate), fmt: pct1 },
  ev:     { label: 'EV',      w: 46, dp: 1, title: 'Recent average exit velocity', get: (p) => n(p?.recent_ev), fmt: (v) => dash(v, 1) },
  hit:    { label: 'Hit',     w: 44, dp: 0, ...SCORE, title: 'The 1+ hit score', get: (p) => n(p?.hit_score) },
  hrr:    { label: 'HRR',     w: 44, dp: 0, ...SCORE, title: 'The H+R+RBI score', get: (p) => n(p?.hrr_score) },
  tb:     { label: 'TB',      w: 44, dp: 0, ...SCORE, title: 'The total-bases score', get: (p) => n(p?.contact_score) },
  hrsc:   { label: 'HR sc',   w: 46, dp: 0, ...SCORE, title: 'The HR score', get: (p) => n(p?.hr_score) },
  pHR9:   { label: 'Opp HR/9', w: 58, dp: 2, title: 'Home runs per nine tonight’s starter allows (1.3+ was worth about +3.5 points of HR rate in the audit)', get: (p) => n(p?.pitcher_hr9) || null, fmt: (v) => dash(v, 2) },
  pWHIP:  { label: 'Opp WHIP', w: 58, dp: 2, title: 'Tonight’s starter — walks plus hits per inning; traffic for hits and runs', get: (p) => n(p?.pitcher_whip) || null, fmt: (v) => dash(v, 2) },
  pK:     { label: 'Opp K%',  w: 52, invert: true, title: 'Tonight’s starter’s strikeout rate — lower is friendlier to a hits bet', get: (p) => pct(p?.pitcher_k_rate), fmt: pct0 },
  park:   { label: 'Park×',   w: 46, dp: 2, title: 'Park home-run factor (measured near coin-flip in the audit; context only)', get: (p) => n(p?.park_hr_factor) || null, fmt: (v) => dash(v, 2) },
  since:  { label: 'Since HR', w: 58, invert: true, heat: false, mono: true, title: 'Games since his last home run. Kept for information — measured over 155 nights it moves nothing.', get: (p) => n(p?.games_since_last_hr), fmt: (v) => (v == null ? '—' : v === 0 ? 'last gm' : `${v}g`) },
}

const SETS = {
  hr:      ['p3', 'hrw', 'hrL5', 'hrL10', 'hrBBE', 'maxEV', 'a5', 'a10', 'aSzn', 'pHR9', 'park', 'since'],
  top:     ['p3', 'hrw', 'hit', 'hrr', 'tb', 'hrL5', 'hrL10', 'hrBBE', 'maxEV', 'a5', 'a10', 'aSzn', 'obp', 'iso', 'xbh5', 'k', 'pHR9', 'since'],
  hit:     ['a5', 'a10', 'aSzn', 'aArm', 'h5', 'h10', 'obp', 'k', 'pWHIP', 'pK', 'hrsc', 'since'],
  hrr:     ['obp', 'spot', 'rbi5', 'r5', 'a5', 'a10', 'aSzn', 'pWHIP', 'hrL5', 'hrsc', 'since'],
  tb:      ['xbh5', 'xbh10', 'iso', 'slg', 'hard', 'brl', 'a5', 'aSzn', 'maxEV', 'hrsc', 'since'],
}
SETS.contact = SETS.tb
// Live / all-hitters tables: the shared core every category reads.
SETS.live = ['p3', 'hrw', 'hrL5', 'hrL10', 'a5', 'a10', 'aSzn', 'aArm', 'obp', 'iso', 'k', 'pHR9', 'pWHIP', 'since']

const keyFor = (k) => `cat_${k}`

/** Column definitions (DenseTable shape) for a category, minus any keys the host already shows. */
export function categoryColumns(type, { omit = [] } = {}) {
  const set = SETS[String(type || 'hr').toLowerCase()] || SETS.hr
  const skip = new Set(omit)
  return set.filter((k) => !skip.has(k)).map((k) => {
    const { get, ...def } = STAT[k]
    return { key: keyFor(k), ...def }
  })
}

/** Row values for the same category — spread into the row object the table renders. */
export function categoryValues(p, type, { omit = [] } = {}) {
  const set = SETS[String(type || 'hr').toLowerCase()] || SETS.hr
  const skip = new Set(omit)
  const out = {}
  for (const k of set) if (!skip.has(k)) out[keyFor(k)] = STAT[k].get(p)
  return out
}

/** The full stat keys a category carries, for anyone building a card or a tooltip rather than a table. */
export function categoryStatKeys(type) {
  return [...(SETS[String(type || 'hr').toLowerCase()] || SETS.hr)]
}
