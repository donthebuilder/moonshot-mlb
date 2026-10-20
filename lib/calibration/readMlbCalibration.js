// THE CALIBRATION TABLE, READ (2026-10-06). Server only. One build serves every
// viewer: por_rows + outcome_log for each night since the clean record began
// (lib/record/mlbLocked.js LOCKED_SINCE) and ONE schedule read for the game's
// first pitch, type and own date. Cached 30 minutes. Nothing is stored.
import { unstable_cache } from 'next/cache'
import { dataUrl } from '../dataSource'
import { LOCKED_SINCE, parseJsonl, finalOutcomes } from '../record/mlbLocked'
import { gradeNight, summarize, callsOf } from './mlbCalibration'
import { lockedRecordFrom } from '../record/lockedRecord'
import { scoreBandsFromRecords } from '../record/scoreBands'
import { HR_CALL_ROLES } from '../callStatus'

const get = (u) => fetch(u, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : null)).catch(() => null)
const days = (from, to) => { const out = []; for (let t = Date.parse(`${from}T12:00:00Z`); t <= Date.parse(`${to}T12:00:00Z`); t += 864e5) out.push(new Date(t).toISOString().slice(0, 10)); return out }
const FIELDS = 'dates,games,gamePk,gameDate,officialDate,gameType,status,detailedState'

async function schedule(from, to) {
  const j = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${from}&endDate=${to}&gameType=S,R,F,D,L,W&fields=${FIELDS}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  if (!j) return null
  const m = new Map()
  for (const d of j.dates || []) for (const g of d.games || []) m.set(String(g.gamePk), { start: Date.parse(g.gameDate), type: g.gameType, state: g.status?.detailedState || '', date: g.officialDate || d.date })
  return m
}
// nights the league played (regular season or postseason) -- to say which have no locked file
const playedNights = (games, through) => [...new Set([...games.values()].filter((g) => g.type !== 'S' && g.date && g.date < through && !/postponed|cancel/i.test(g.state)).map((g) => g.date))].sort()

async function build(through) {
  const games = await schedule(LOCKED_SINCE, through)
  if (!games) throw new Error('schedule unreadable')
  const entries = []
  const other = { noGame: 0, spring: 0 }
  const ds = days(LOCKED_SINCE, through)
  let nightsRead = 0
  const read = new Set()
  for (let k = 0; k < ds.length; k += 6) {
    const batch = await Promise.all(ds.slice(k, k + 6).map(async (d) => {
      const [p, o] = await Promise.all([get(dataUrl(`current/por_rows_${d}.jsonl`)), get(dataUrl(`current/outcome_log_${d}.jsonl`))])
      if (!p) return null
      read.add(d)
      return gradeNight({ date: d, por: parseJsonl(p), outcomes: finalOutcomes(parseJsonl(o)), games })
    }))
    for (const b of batch) { if (!b) continue; nightsRead += 1; entries.push(...b.entries); other.noGame += b.other.noGame; other.spring += b.other.spring }
  }
  return { entries, other, since: LOCKED_SINCE, through, nightsRead, noRecordNights: playedNights(games, through).filter((d) => !read.has(d)) }
}

const cachedBuild = (through) => unstable_cache(() => build(through), ['mlb-calibration-v1', through], { revalidate: 1800 })()
  // outside a request (a script) there is no incremental cache: build directly
  .catch((e) => (/incrementalCache|static generation store|outside a request/i.test(String(e?.message)) ? build(through) : Promise.reject(e)))

/** The table: { minN, regular, post, since, through, nightsRead, other }. */
export async function readCalibration(through) {
  const b = await cachedBuild(through)
  return { ...summarize(b.entries), since: b.since, through: b.through, nightsRead: b.nightsRead, noRecordNights: b.noRecordNights, other: b.other, scoreBands: mlbScoreBands(b.entries) }
}

// THE SCORE BANDS (2026-10-20, MOONSHOT parity: LAMP's table, lib/record/scoreBands.js): every locked, graded regular-season
// hitter by his HOME-RUN score, and the top band split by the call. CALLED here = a home-run call (TOP or HR, lib/callStatus
// HR_CALL_ROLES), the market the score is for. Counts of the locked pregame record; nothing re-derived.
function mlbScoreBands(entries) {
  const rows = (entries || []).filter((e) => e.season === 'regular' && e.status === 'graded' && e.line).map((e) => ({
    score: e.hrScore, status: e.roles.some((r) => HR_CALL_ROLES.includes(r)) ? 'called' : 'board',
    result: e.line.gotHr ? 'hit' : 'miss', locked_at: e.lockAt, game_type: 2, game_date: e.date,
  }))
  return scoreBandsFromRecords(rows, 'mlb')
}

/** Every call of one tier in one season. */
export async function readCalibrationCalls(through, tierKey, season) {
  const b = await cachedBuild(through)
  return callsOf(b.entries, tierKey, season)
}

/** THE ONE MLB RECORD (lib/record/lockedRecord.js): the regular season's locked calls, window and n, from the table above. */
export async function readLockedRecord(through) {
  return lockedRecordFrom(await readCalibration(through))
}
