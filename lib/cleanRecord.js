// THE CLEAN MLB RECORD (2026-10-01, queue 0d PUBLIC NUMBERS). The one place a
// MOONSHOT score-band or pick-rate number printed on the site comes from.
//
// SOURCE: the locked pregame record (por_rows_<date>.jsonl -- the run standing
// at each first pitch, the full board, ~18 hitters a game), joined only to
// whether the hitter homered / hit / reached his bar that night. 21 nights,
// 2026-09-09 to 09-30, 4,096 hitter-games, 471 HR, an 11.5% HR base.
// Measured 2026-10-01; claude/HR-MODEL-FINDINGS-2026-10-01.md §2b.
//
// WHY NOT THE GRADED ARCHIVE. graded_results_<date>.json is written after the
// games: season / L5 / L10 counts include that night's homer, and the scores
// and picks are a later re-run (same doc, §1). Every rate measured on it is
// biased, so none of them prints. ADDENDUM §35: no number without a named
// source and a date. Re-measure here, with a new date, when more nights are in.
//
// Rates are printed exactly as measured, with the n that came with them. Where
// only a rate and an n were recorded (HIT, CONTACT), `ok` is inverted from the
// pair and is unique at that n (142/220 = 64.5%, 69/213 = 32.4%), so it is the
// count the measure had, not a new one. A band with no recorded n prints none.

export const CLEAN_SOURCE = 'clean pregame record, 21 nights (Sep 9–30)'
export const CLEAN_NIGHTS = 21
export const CLEAN_HITTER_GAMES = 4096
export const CLEAN_HR_BASE = 11.5

// HR score and HRW bands: share of hitter-games in the band that homered.
export const CLEAN_HR_BANDS = [
  { band: '70+', pct: 25.0, ok: 14, n: 56 },
  { band: '50–70', pct: 15.1 },
  { band: '30–50', pct: 14.0 },
  { band: '<30', pct: 8.6, ok: 184, n: 2130 },
]
export const CLEAN_HRW_BANDS = [
  { band: '80+', pct: 17.0, ok: 46, n: 271 },
  { band: '70–80', pct: 13.3 },
  { band: '55–70', pct: 12.6 },
  { band: '45–55', pct: 14.9 },
  { band: '<45', pct: 9.9, ok: 262, n: 2637 },
]

// Top 10 each night by one field, 210 hitter-games: share that homered.
export const CLEAN_TOP10 = [
  { key: 'season_power', label: 'season power', pct: 22.4, ok: 47, n: 210 },
  { key: 'hrw', label: 'HRW', pct: 20.0, ok: 42, n: 210 },
  { key: 'hr', label: 'HR score', pct: 19.0, ok: 40, n: 210 },
  { key: 'dc', label: 'DC', pct: 15.2, ok: 32, n: 210 },
]

// The bot's per-game picks, each on its own bar, against every hitter on the
// board on that same bar. TOP and HR are graded on 1+ HR.
export const CLEAN_PICKS = {
  TOP: { label: 'TOP calls', bar: '1+ HR', ok: 42, n: 227, pct: 18.5, base: CLEAN_HR_BASE },
  HR: { label: 'HR calls', bar: '1+ HR', ok: 31, n: 229, pct: 13.5, base: CLEAN_HR_BASE },
  HIT: { label: 'Hit calls', bar: '1+ hit', ok: 142, n: 220, pct: 64.5, base: 64.0 },
  CONTACT: { label: 'Contact calls', bar: '2+ bases', ok: 69, n: 213, pct: 32.4, base: 39.0 },
}
// The pick lock's own season-long record of the TOP call (n only was recorded).
export const CLEAN_TOP_SEASON = { pct: 20.0, n: 1593 }

/** "18.5% (42/227)" -- a rate always prints with its count. */
export const cleanRate = (r) => (r?.ok != null ? `${r.pct.toFixed(1)}% (${r.ok}/${r.n})` : r?.n ? `${r.pct.toFixed(1)}% (n=${r.n.toLocaleString('en-US')})` : `${r.pct.toFixed(1)}%`)

/** The one-line pick record, for any page that shows archive-wide pick rates. */
export const CLEAN_PICK_LINE = `${CLEAN_SOURCE}: TOP ${cleanRate(CLEAN_PICKS.TOP)} · HR ${cleanRate(CLEAN_PICKS.HR)} against an ${CLEAN_HR_BASE}% base · HIT ${CLEAN_PICKS.HIT.pct}% vs ${CLEAN_PICKS.HIT.base.toFixed(1)}% for every hitter (n=${CLEAN_PICKS.HIT.n}) · CONTACT ${CLEAN_PICKS.CONTACT.pct}% vs ${CLEAN_PICKS.CONTACT.base.toFixed(1)}% (n=${CLEAN_PICKS.CONTACT.n})`
