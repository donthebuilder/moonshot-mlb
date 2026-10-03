// THE RECORD PAGE'S NUMBERS, PER SPORT (BATCH-RECORD-PAGE step 1, 2026-10-02).
// Pure functions: each takes the files its page ALREADY reads and returns the
// model components/record/RecordPage.js draws. No fetches here. The scorers'
// three states are the ones each product's ledger already gives them
// (lib/calledLedger nightToRows, lib/tuddyLedger, LAMP's /api/lamp/record),
// so the record and the ledger can't disagree.
import { dedupeGraded } from '../graded'
import { pickJobOf, PICK_JOBS } from '../pickJob'
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
// The lanes the archive carries (backtest_summary per_day tiers), in the
// scorecard's order. ATS has no tier in the archive and no graded picks.
const MLB_TIER = { TOP: 'TOP_PICKS', HR: 'HR_PICKS', HIT: 'HIT_PICKS', HRR: 'HRR_PICKS', CONTACT: 'CONTACT_PICKS' }
export const MLB_RECORD_MARKETS = Object.keys(MLB_TIER).map((k) => ({ key: k, label: PICK_JOBS[k].label, job: PICK_JOBS[k].job }))

/** One night's lanes exactly as the record page always counted them: every
 *  unique graded pick with an at-bat, judged on its own lane's job. */
export function mlbNightLanes(night) {
  const out = {}
  const judge = dedupeGraded(night?.graded_slots || []).filter((r) => (r.actual_ab || 0) > 0)
  for (const r of judge) {
    const j = pickJobOf(r)
    if (!j || !MLB_TIER[j.role]) continue
    out[j.role] ||= { hit: 0, n: 0 }
    out[j.role].n += 1
    if (j.did) out[j.role].hit += 1
  }
  return out
}

/** The archive's nights, oldest -> newest: per lane the bot's own "did its job" [hit, n]. */
export function mlbSeries(backtest) {
  const pd = backtest?.per_day || {}
  return Object.keys(pd).sort().map((date) => {
    const markets = {}
    for (const [k, tier] of Object.entries(MLB_TIER)) {
      const c = pd[date]?.tiers?.[tier]?.metric_counts?.['Did its job']
      if (Array.isArray(c) && n0(c[1]) > 0) markets[k] = { hit: n0(c[0]), n: n0(c[1]) }
    }
    return { date, label: dayLabel(date), markets }
  })
}

/** MOONSHOT's record: the night on screen + the archive. onOpen(player) opens a hitter. */
export function mlbRecordModel({ night, backtest, live = null, onOpen = null }) {
  const date = night?.date || null
  const digest = night ? digestGradedNight(night) : null
  const rows = digest ? nightToRows({ ...digest, date }) : []
  const hrs = (st) => rows.filter((r) => r.status === st).reduce((a, r) => a + n0(r.value), 0)
  // final by the file's own word: slate_status, else every graded pick's is_final
  // (game_status_by_pk can carry 'Unknown' for games long over)
  const slots = night?.graded_slots || []
  const allFinal = night?.slate_status ? night.slate_status === 'final' : slots.every((x) => x.is_final === 1)
  const moment = (r) => ({
    key: r.id, name: r.name, status: r.status,
    sub: [r.team, r.statusLabel && r.status !== 'off' ? r.statusLabel : null].filter(Boolean).join(' · '),
    stat: `${r.value} HR${r.detail ? ` · ${r.detail.split(' · ')[0]}` : ''}`,
    face: { sport: 'mlb', id: r._raw?.player_id ?? null, team: r.team, name: r.name },
    onClick: onOpen && r._raw?.player_id ? () => onOpen(r._raw) : null,
  })
  return {
    unit: 'night',
    markets: MLB_RECORD_MARKETS,
    last: date ? {
      label: dayLabel(date), live: live ?? !allFinal,
      markets: mlbNightLanes(night),
      capture: rows.length ? { word: 'HRs', total: hrs('called') + hrs('board') + hrs('off'), called: hrs('called'), board: hrs('board'), off: hrs('off') } : null,
    } : null,
    series: mlbSeries(backtest),
    since: null,
    note: 'each lane judged on its own job',
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
      if (t && n0(t.n) > 0) m[key] = { hit: n0(t.hit), n: n0(t.n) }
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
  const count = (st) => rows.filter((r) => r.status === st).reduce((a, r) => a + n0(r.value), 0)
  const moment = (r) => ({
    key: r.id, name: r.name, status: r.status,
    sub: [r.team, r.opp ? `v ${r.opp}` : null, r.position].filter(Boolean).join(' · '),
    stat: plural(n0(r.value), 'TD', 'TDs'),
    face: { sport: 'nfl', espnId: playerOf(r.player_id)?.espn_id ?? null, team: r.team, name: r.name },
    onClick: onOpen && r.player_id ? () => onOpen(r) : null,
  })
  return {
    unit: 'week',
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
    unit: 'night',
    markets: NHL_RECORD_MARKETS,
    last: on ? {
      label: dayLabel(on.date), live: false,
      markets: { GOAL: { hit: n0(on.calledHits), n: n0(on.calledN) } },
      capture: n0(on.scorers) ? { word: 'scorers', total: n0(on.scorers), called: n0(on.scorersCalled), board: n0(on.scorersOnBoard), off: n0(on.scorersOff) } : null,
    } : null,
    series,
    since: null,   // rec.since is the API's window start, not a clean start
    note: 'the top skater per team in each game is the call',
    called: calledHit.map((p) => moment(p, 'called')).concat(boardScored.map((p) => moment(p, 'board'))),
    gotAway: offScored.map((p) => moment(p, 'off')),
    later: [],
  }
}

// ── BUCKETS ─────────────────────────────────────────────────────────────────
// The six markets, in the definition's order. First basket is graded as
// first_fg (the market's own log key); first_pts rides the receipts only.
export const NBA_RECORD_MARKETS = Object.entries(NBA_MARKETS).map(([k, d]) => ({ key: k === 'first' ? 'first_fg' : k, label: d.label, job: d.bar ? `${d.bar}+` : 'the first basket' }))
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
    unit: 'night',
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
