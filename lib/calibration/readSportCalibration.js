// NHL / NFL / NBA CALIBRATION, READ (2026-10-06). Server only. The same tiers the
// product's own record already counts, in lib/calibration/generic.js's shape:
//   NHL  CALLED / ON THE BOARD / NOT ON THE BOARD on the goal board (lamp_goal_log, regular
//        season and playoffs; preseason out, the record's own rule; not dressed = void)
//   NFL  the card's markets, five calls a week (lib/nfl/cardRecord.js; no board, no dates)
//   NBA  each market's CALLED players on buckets_log (regular season / playoffs; not played = void)
// Words from lib/callStatus STATUS_WORD. Every tier has no chosen date yet, so every one
// is TESTING (lib/calibration/chosen.js). No lock stamp is compared with a start time
// here: those tables store locked_at but not the first puck drop / tip, so no lead shown.
import { STATUS } from '../record/shape'
import { STATUS_WORD } from '../callStatus'
import { readNhlRecords } from '../record/nhl'
import { readNbaRecords } from '../record/nba'
import { readNflCardRecord } from '../nfl/cardRecord'
import { NFL_DATA_BASE } from '../nfl/dataSource'
import { NBA_MARKETS } from '../nba/model'
import { blockFrom } from './generic'
import { MIN_N } from './proof'
import { ladderFromRecords } from '../record/ladder'
import { scoreBandsFromRecords } from '../record/scoreBands'
import { MODEL_VERSION } from '../nhl/goalModel'
import { NBA_MIN_NIGHTS } from '../record/nbaFloor'

const SEASON = (type) => (Number(type) === 3 ? 'post' : 'regular')
const pack = (sport, bySeason, extra = {}) => ({ minN: MIN_N, sport, regular: bySeason.regular, post: bySeason.post, since: null, through: null, noRecordNights: [], ...extra })

function tiersFromRows(rows, defs) {
  return defs.map((d) => {
    const mine = rows.filter(d.of)
    return {
      key: d.key, label: d.label, kind: 'status', status: d.status, bar: d.bar,
      graded: mine.filter((r) => r.result === 'hit' || r.result === 'miss').map((r) => ({ date: r.game_date, hit: r.result === 'hit' })),
      void: mine.filter((r) => r.result === 'void').length,
      board: d.boardOf ? rows.filter(d.boardOf).filter((r) => r.result === 'hit' || r.result === 'miss').map((r) => ({ date: r.game_date, hit: r.result === 'hit' })) : null,
    }
  })
}
const statusDefs = (bar) => STATUS.map((s) => ({ key: s, status: s, label: STATUS_WORD[s], bar, of: (r) => r.status === s, boardOf: () => true }))

export async function readNhlCalibration(db) {
  const { rows, error } = await readNhlRecords(db, { graded: true })
  if (error) throw new Error(error.message || 'nhl read')
  const by = {}
  for (const s of ['regular', 'post']) by[s] = blockFrom('nhl', tiersFromRows(rows.filter((r) => SEASON(r.game_type) === s), statusDefs('1+ goal')))
  // THE LADDER (2026-10-10): the same rows, counted once more as the ladder every surface prints -- CALLED against
  // ON THE BOARD against NOT ON THE BOARD against every dressed skater, split by model_version (lib/record/ladder.js).
  // Not a second reader: these are the rows the tiers above were counted from.
  const ladder = { regular: ladderFromRecords(rows, { season: 'regular' }), post: ladderFromRecords(rows, { season: 'post' }) }
  // THE SCORE BANDS (2026-10-13): the same rows again, by LAMP score band and 90+ x call (lib/record/scoreBands.js; regular season only)
  return pack('nhl', by, { ladder, scoreBands: scoreBandsFromRecords(rows), liveVersion: MODEL_VERSION })
}

export async function readNbaCalibration(db) {
  const by = { regular: [], post: [] }
  for (const [m, d] of Object.entries(NBA_MARKETS)) {
    const { rows, error } = await readNbaRecords(db, { graded: true, market: m })
    if (error) throw new Error(error.message || 'nba read')
    for (const s of ['regular', 'post']) {
      const mine = rows.filter((r) => SEASON(r.game_type) === s)
      by[s].push(...tiersFromRows(mine, [{ key: m, status: 'called', label: d.label, bar: d.barWord ? d.barWord : d.bar != null ? `${d.bar}+` : 'first basket', of: (r) => r.status === 'called', boardOf: () => true }]))
    }
  }
  // the public-number floor: a market under NBA_MIN_NIGHTS graded nights is tracking (lib/record/nbaFloor.js), even when BUCKETS is open
  const fl = { minNights: NBA_MIN_NIGHTS }
  return pack('nba', { regular: blockFrom('nba', by.regular, fl), post: blockFrom('nba', by.post, fl) }, { minNights: NBA_MIN_NIGHTS })
}

export async function readNflCalibration() {
  const card = await readNflCardRecord()
  if (!card) throw new Error('nfl card unavailable')
  const tiers = card.markets.map((m) => ({
    key: m.key, label: m.label, kind: 'status', status: 'called', bar: m.bar != null ? `${m.bar}+` : '',
    counts: { n: m.n || 0, hits: m.hit || 0 },   // the card keeps counts, not rows: no dates, so no hold-out
    void: m.void || 0, board: null,
  }))
  // the card is counted by week, not night: say so
  const regular = { ...blockFrom('nfl', tiers), nights: card.weeks.length, unit: 'week', weeks: card.weeks }
  return pack('nfl', { regular, post: blockFrom('nfl', []) }, { season: card.season, bases: card.bases || {}, scoreBands: await nflScoreBands() })
}

// THE TUDDY SCORE BANDS (2026-10-20, the parity row): every graded player-week by his TD score, each player frozen at the
// last update before HIS kickoff, the top band split by the call (a TD ladder rung or a TOP/TD game call). The bot grades
// these (bots/nfl/nfl_signal_audit.py td_rows: [player_id, score, scored, called]); nothing is re-derived here. A missing
// file or an older one with no rows prints no table.
async function nflScoreBands() {
  try {
    const res = await fetch(`${NFL_DATA_BASE}/nfl_signal_audit.json`, { next: { revalidate: 300 } })
    const doc = res.ok ? await res.json() : null
    const rows = []
    for (const w of doc?.weeks || []) {
      for (const [, score, scored, called] of w.td_rows || []) {
        rows.push({ score, status: called ? 'called' : 'board', result: scored ? 'hit' : 'miss', locked_at: true, game_type: 2, game_date: `w${String(w.week).padStart(2, '0')}` })
      }
    }
    return scoreBandsFromRecords(rows, 'nfl')
  } catch { return null }
}
