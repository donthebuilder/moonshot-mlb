// THE RECORD PAGE'S NUMBERS, PER SPORT (BATCH-RECORD-PAGE step 1, 2026-10-02).
// Pure functions: each takes the files its page ALREADY reads and returns the
// model components/record/RecordPage.js draws. No fetches here. The scorers'
// three states are the ones each product's ledger already gives them
// (lib/calledLedger nightToRows, lib/tuddyLedger, LAMP's /api/lamp/record),
// so the record and the ledger can't disagree.
import { PICK_JOBS } from '../pickJob'
import { wilson } from '../interval'
import { digestGradedNight } from '../ledgerArchive'
import { nightToRows } from '../calledLedger'
import { nhlMug } from '../nhl/format'
import { NBA_MARKETS } from '../nba/model'

const dayLabel = (ymd) => {
  const t = Date.parse(`${ymd}T12:00:00Z`)
  return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : String(ymd || '')
}
const n0 = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// ── MOONSHOT ────────────────────────────────────────────────────────────────
// ONE MLB RECORD (2026-10-10, ledger audit finding 1). This table used to read the bot's post-game archive
// (backtest_summary "Did its job") and print each lane's bar ("1+ HR") over it, while the front door read the
// lock-enforced reader: TOP 80/208 here against 27/177 there for the same nights. Both are the lock-enforced
// reader now (lib/record/lockedRecord.js, /api/calibration?sport=mlb): same calls, same bar per lane, same
// window, n beside every rate. The bot's relative test (a TOP pick "did its job" when he out-produced the other
// picks in his game) is a different measure, kept only where it is named so (the archive views, "beat the
// board average"); it is never printed under a bar. ATS has no tier and no graded picks.
const MLB_LANES = ['TOP', 'HR', 'HIT', 'HRR', 'CONTACT']
export const MLB_RECORD_MARKETS = MLB_LANES.map((k) => ({ key: k, label: PICK_JOBS[k].label, job: PICK_JOBS[k].job }))

export { ARCHIVE_MEASURE, ARCHIVE_MEASURE_NOTE } from './archiveMeasure'

/** The locked record's nights (lockedRecordFrom(cal).series), oldest -> newest, as the record page's series. */
export function mlbSeries(locked) {
  return (locked?.series || []).map((u) => {
    const markets = {}
    for (const k of MLB_LANES) if (u.markets?.[k] && n0(u.markets[k].n) > 0) markets[k] = { hit: n0(u.markets[k].hit), n: n0(u.markets[k].n) }
    return { date: u.date, label: dayLabel(u.date), markets }
  }).filter((u) => Object.keys(u.markets).length)
}

/** MOONSHOT's record: the night on screen + the archive. onOpen(player) opens a hitter. */
export function mlbRecordModel({ night, locked = null, live = null, onOpen = null, feed = null }) {
  const date = night?.date || null
  // `feed`: that night's statuses as /called prints them (lib/record/mlbStatus.js, /api/mlb/call-status)
  const digest = night ? digestGradedNight(night, feed) : null
  const rows = digest ? nightToRows({ ...digest, date }) : []
  const hrs = (st) => rows.filter((r) => r.status === st).reduce((a, r) => a + n0(r.value), 0)
  const series = mlbSeries(locked)
  const lockedNight = date ? series.find((u) => u.date === date) : null
  // final by the file's own word: slate_status, else every graded pick's is_final
  // (game_status_by_pk can carry 'Unknown' for games long over)
  const slots = night?.graded_slots || []
  const allFinal = night?.slate_status ? night.slate_status === 'final' : slots.every((x) => x.is_final === 1)
  // HOW MANY GAMES ARE IN (2026-10-06, ledger audit): a count of home runs is only a total
  // when every game is; while some are live the line says "n of m games final".
  const gs = Object.values(night?.game_status_by_pk || {}).map((g) => String(g?.abstract_state || '').toLowerCase())
  const games = gs.length ? { final: gs.filter((x) => x === 'final').length, live: gs.filter((x) => x === 'live').length, total: gs.length } : null
  const moment = (r) => ({
    key: r.id, name: r.name, status: r.status,
    sub: [r.team, r.statusLabel && r.status !== 'off' ? r.statusLabel : null].filter(Boolean).join(' · '),
    stat: `${r.value} HR${r.detail ? ` · ${r.detail.split(' · ')[0]}` : ''}`,
    face: { sport: 'mlb', id: r._raw?.player_id ?? null, team: r.team, name: r.name },
    onClick: onOpen && r._raw?.player_id ? () => onOpen(r._raw) : null,
  })
  return {
    unit: 'night', noteSport: 'mlb',
    markets: MLB_RECORD_MARKETS,
    last: date ? {
      label: dayLabel(date), live: live ?? !allFinal, liveGames: games?.live || 0, games,
      markets: lockedNight?.markets || {},
      note: lockedNight ? null : (locked ? 'not in the locked record yet: games still going, or the board was stamped after first pitch' : 'loading the locked record'),
      capture: rows.length ? { word: 'HRs', total: hrs('called') + hrs('board') + hrs('off'), called: hrs('called'), board: hrs('board'), off: hrs('off') } : null,
    } : null,
    series,
    since: series.length ? `${series[0].label} (through ${series.at(-1).label})` : null,
    // the same locked calls as the tier table above it and the front door: regular season, n beside every rate
    marketTitle: 'BY MARKET · LOCKED BEFORE FIRST PITCH',
    note: locked ? 'regular season, each lane on its own bar; a board stamped after first pitch is not counted' : 'loading the locked record',
    called: rows.filter((r) => r.status === 'called').concat(rows.filter((r) => r.status === 'board')).map(moment),
    gotAway: rows.filter((r) => r.status === 'off').map(moment),
    later: [],
  }
}

// ── TUDDY ───────────────────────────────────────────────────────────────────
/** TUDDY's record: the graded weeks (lib/nfl/resultsArchive) + that week's
 *  touchdowns (/api/nfl/tds). markets: [[key, label]]. QB touchdowns are out,
 *  as on /called. */
export function nflRecordModel({ weeks = [], latest = null, tds = null, playerOf = () => null, markets = [], bars = {}, labelOf = (p) => p?.week, onOpen = null }) {
  const mk = markets.map(([key, label]) => ({ key, label, job: bars[key] != null ? `${bars[key]}+` : '' }))
  const toUnit = (p) => {
    const m = {}
    for (const { key } of mk) {
      const t = p?.totals?.[key]
      if (t && n0(t.n) > 0) {
        m[key] = { hit: n0(t.hit), n: n0(t.n) }
        // AGAINST THE BOOK (BATCH-MODEL-V2 M3, 2026-10-03): the graded rungs
        // whose book line was on file at lock (rung.line / rung.line_hit, set
        // by the bot's grader) and how many beat it. A rung with no line is
        // left out, never counted as a miss.
        const rungs = (p?.card?.[key]?.rungs || []).filter((r) => r?.line != null && typeof r?.line_hit === 'boolean' && typeof r?.hit === 'boolean')
        if (rungs.length) m[key].line = { hit: rungs.filter((r) => r.line_hit).length, n: rungs.length }
      }
    }
    return { date: `${p?.season}-${p?.mode || 'week'}-${String(p?.week).padStart(2, '0')}`, label: String(labelOf(p) || ''), markets: m }
  }
  const series = weeks.filter((p) => p?.totals).map(toUnit)
  // a market the card has never graded (DEF_TD, listed as v1) has no row
  const live = mk.filter((m) => series.some((u) => u.markets[m.key]) || latest?.totals?.[m.key]?.n > 0)
  const nGraded = mk.reduce((a, m) => a + n0(latest?.totals?.[m.key]?.n), 0)
  const nVoid = mk.reduce((a, m) => a + n0(latest?.totals?.[m.key]?.void), 0)
  // the week's scorers in their three states (/api/nfl/tds: nfl_td_feed -> tdCallStatus)
  const rows = (tds?.scorers || []).map((x) => ({ ...x, id: `${x.player_id || x.name}`, value: x.tds }))
  // per touchdown, as /called counts: a scorer's byStatus (his best status stays the chip)
  const count = (st) => rows.reduce((a, r) => a + (r.byStatus ? n0(r.byStatus[st]) : r.status === st ? n0(r.value) : 0), 0)
  const moment = (r) => ({
    key: r.id, name: r.name, status: r.status,
    sub: [r.team, r.opp ? `v ${r.opp}` : null, r.position].filter(Boolean).join(' · '),
    stat: plural(n0(r.value), 'TD', 'TDs'),
    face: { sport: 'nfl', espnId: playerOf(r.player_id)?.espn_id ?? null, team: r.team, name: r.name },
    onClick: onOpen && r.player_id ? () => onOpen(r) : null,
  })
  return {
    unit: 'week', noteSport: 'nfl',
    markets: live,
    last: latest?.totals ? {
      label: String(labelOf(latest) || ''), live: nGraded === 0 && nVoid > 0,
      note: nGraded === 0 ? 'in progress · nothing graded yet' : null,
      markets: toUnit(latest).markets,
      capture: rows.length ? { word: 'TDs', total: count('called') + count('board') + count('off'), called: count('called'), board: count('board'), off: count('off') } : null,
    } : null,
    series,
    since: null,
    note: 'five rungs a market; a game not played is no result',
    called: rows.filter((r) => r.status === 'called').concat(rows.filter((r) => r.status === 'board')).map(moment),
    gotAway: rows.filter((r) => r.status === 'off').map(moment),
    later: [],
  }
}

// ── LAMP ────────────────────────────────────────────────────────────────────
export const NHL_RECORD_MARKETS = [{ key: 'GOAL', label: 'Goal', job: '1+ goal' }]

/**
 * THE THREE NUMBERS A LAMP VISITOR MEETS, EACH IN ITS OWN WORDS (2026-10-10, Donovan: coverage vs hit rate
 * shown together, labelled, so "19%", "44/130" and "48/145" stop contradicting). They answer different questions
 * over different populations, so each says which, and the window it is counted over (windows differ by a night or
 * two between the cached endpoint and the page, which is the whole of the 44/130 versus 48/145 gap):
 *   HIT RATE PER CALL  of the goal board's calls, how many scored (a skater who did not dress is out)
 *   CAPTURE            of the night's scorers, how many had been CALLED in ANY LAMP market (the 0c rule), so it
 *                      includes SHOTS 3+ calls the goal-call figure does not
 *   ON THE BOARD       scorers inside the top third of the board with no call
 * Every figure is a count handed in from /api/lamp/record (Postgres rows); nothing is typed.
 */
export function nhlMeasures(rec) {
  const T = rec?.total
  if (!T) return []
  const nights = (rec.nights || []).length
  const dates = (rec.nights || []).map((x) => x.date).sort()
  const md = (ymd) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const window = nights ? `${nights} graded ${nights === 1 ? 'night' : 'nights'}, ${md(dates[0])} to ${md(dates.at(-1))}` : ''
  const of = (a, b) => (n0(b) > 0 ? `${n0(a)} of ${n0(b)} (${Math.round((100 * n0(a)) / n0(b))}%)` : '—')
  const ci = wilson(n0(T.calledHits), n0(T.calledN))
  const out = []
  if (n0(T.calledN) > 0) {
    out.push({ key: 'rate', label: 'Hit rate per call', value: of(T.calledHits, T.calledN),
      sub: `the goal board's calls (one skater per team per game) that scored${ci ? `, 95% range ${ci[0].toFixed(0)}–${ci[1].toFixed(0)}%` : ''}; a skater who did not dress is not counted. ${window}` })
  }
  if (n0(T.scorers) > 0) {
    out.push({ key: 'capture', label: 'Capture', value: of(T.scorersCalled, T.scorers),
      sub: `of the scorers, how many had been CALLED in any LAMP market (the goal board or SHOTS 3+), so this counts calls the hit-rate line does not. It measures coverage, not how often a call scores. ${window}` })
    out.push({ key: 'board', label: 'On the board, no call', value: of(T.scorersOnBoard, T.scorers),
      sub: 'scorers in the top third of the night\'s board that were not called' })
  }
  if (n0(rec.sog?.calledN) > 0) {
    out.push({ key: 'sog', label: 'SHOTS 3+ calls', value: of(rec.sog.calledHits, rec.sog.calledN), sub: 'its own market and its own record; not part of the goal-call rate' })
  }
  return out
}

/** LAMP's record: /api/lamp/record's nights (counts from Postgres). `night` is
 *  the one on screen (default the newest). onOpen({ playerId, name, team }). */
export function nhlRecordModel({ rec, night = null, onOpen = null }) {
  const nights = (rec?.nights || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const on = night || nights[nights.length - 1] || null
  const series = nights.filter((x) => n0(x.calledN) > 0).map((x) => ({ date: x.date, label: dayLabel(x.date), markets: { GOAL: { hit: n0(x.calledHits), n: n0(x.calledN) } } }))
  // the night's NHL season, as the mug CDN spells it (20262027): Sep-Dec = y..y+1
  const y = Number(String(on?.date || '').slice(0, 4)), mo = Number(String(on?.date || '').slice(5, 7))
  const season = y ? (mo >= 9 ? `${y}${y + 1}` : `${y - 1}${y}`) : null
  const moment = (p, status) => ({
    key: `${p.playerId}-${status}`, name: p.name, status,
    sub: [p.team, p.opp ? `v ${p.opp}` : null, p.rank ? `#${p.rank} on the board` : null].filter(Boolean).join(' · '),
    stat: plural(n0(p.goals), 'goal', 'goals'),
    face: { sport: 'nhl', photo: nhlMug(season, p.team, p.playerId), team: p.team, name: p.name },
    onClick: onOpen && p.playerId ? () => onOpen(p) : null,
  })
  const calledHit = (on?.called || []).filter((p) => p.hit || n0(p.goals) > 0)
  const boardScored = (on?.offScorers || []).filter((p) => p.status === 'board')
  const offScored = (on?.offScorers || []).filter((p) => p.status !== 'board')
  return {
    unit: 'night', noteSport: 'nhl',
    markets: NHL_RECORD_MARKETS,
    last: on ? {
      label: dayLabel(on.date), live: false,
      markets: { GOAL: { hit: n0(on.calledHits), n: n0(on.calledN) } },
      capture: n0(on.scorers) ? { word: 'scorers', total: n0(on.scorers), called: n0(on.scorersCalled), board: n0(on.scorersOnBoard), off: n0(on.scorersOff) } : null,
    } : null,
    series,
    since: null,   // rec.since is the API's window start, not a clean start
    note: 'the top skater per team in each game is the call',
    measures: nhlMeasures(rec),
    called: calledHit.map((p) => moment(p, 'called')).concat(boardScored.map((p) => moment(p, 'board'))),
    gotAway: offScored.map((p) => moment(p, 'off')),
    later: [],
  }
}

// ── BUCKETS ─────────────────────────────────────────────────────────────────
// The six markets, in the definition's order. First basket is graded as
// first_fg (the market's own log key); first_pts rides the receipts only.
export const NBA_RECORD_MARKETS = Object.entries(NBA_MARKETS).map(([k, d]) => ({ key: k === 'first' ? 'first_fg' : k, label: d.label, job: d.barWord ? d.barWord : d.bar ? `${d.bar}+` : 'the first basket' }))
const NBA_LABEL = Object.fromEntries(NBA_RECORD_MARKETS.map((m) => [m.key, m.label]))

/** BUCKETS' record: /api/buckets/record's nights (buckets_log, graded rows).
 *  The capture line is the points market's: of the night's 25+ scorers, how
 *  many the board called / had on the board / missed. onOpen({ player_id, name, team }). */
export function nbaRecordModel({ rec, onOpen = null }) {
  const nights = (rec?.nights || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const on = nights[nights.length - 1] || null
  const series = nights.filter((x) => Object.values(x.markets || {}).some((m) => n0(m.n) > 0)).map((x) => ({ date: x.date, label: dayLabel(x.date), markets: x.markets || {} }))
  const moment = (r) => ({
    key: `${r.game_id}-${r.player_id}-${r.market}`, name: r.name, status: r.status,
    sub: [r.team, r.opp ? `v ${r.opp}` : null, NBA_LABEL[r.market] || r.market].filter(Boolean).join(' · '),
    stat: r.market === 'first_fg' ? 'first basket' : `${n0(r.actual)} ${(NBA_LABEL[r.market] || '').split(' ')[0]}`.trim(),
    face: { sport: 'nba', id: r.player_id, team: r.team, name: r.name },
    onClick: onOpen && r.player_id ? () => onOpen(r) : null,
  })
  const ptsCalled = (on?.called || []).filter((r) => r.market === 'pts').length
  const away = on?.away || []
  const board = away.filter((r) => r.status === 'board').length
  return {
    unit: 'night', noteSport: 'nba',
    markets: NBA_RECORD_MARKETS,
    last: on ? {
      label: dayLabel(on.date), live: false,
      markets: on.markets || {},
      capture: ptsCalled + away.length ? { word: '25-point scorers', total: ptsCalled + away.length, called: ptsCalled, board, off: away.length - board } : null,
    } : null,
    series,
    since: null,
    note: 'one call per team in each game, per market',
    called: (on?.called || []).map(moment).concat(away.filter((r) => r.status === 'board').map(moment)),
    gotAway: away.filter((r) => r.status !== 'board').map(moment),
    later: [],
  }
}
