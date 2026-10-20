// 📜 NFL HISTORY CLAIMS + WATCH (milestones plan step 4, 2026-09-26).
// Server only. hist_nfl (nflverse weekly player stats, 1999 on) answered by
// lib/history/lastTime.js. Coverage starts in 1999, so a claim that finds
// nobody says "since at least 1999" -- never "ever".
import { lastTime, wordClaim, posWord } from './lastTime'
import { NFL_TEAMS } from '../nfl/teams'
import { fetchNfl, nflLogPaths } from '../nfl/dataSource'
import { adminClient } from '../supabase/admin'

export const CREDIT = 'Data: nflverse player stats (1999 on)'
// stat -> rungs, how close counts as "in reach", and the words.
export const NFL_RUNGS = {
  total_td: { rungs: [10, 12, 15], within: 1, what: (v) => `${v} touchdowns` },
  rec_yds: { rungs: [1000, 1500], within: 60, what: (v) => `${v.toLocaleString('en-US')} receiving yards` },
  rush_yds: { rungs: [1000, 1500], within: 60, what: (v) => `${v.toLocaleString('en-US')} rushing yards` },
}
const TWO_WORD = { NE: 'Patriots', TB: 'Buccaneers', WAS: 'Commanders', SF: '49ers' }
const nickname = (ab) => TWO_WORD[ab] || (NFL_TEAMS.find(([a]) => a === ab)?.[1] || ab).split(' ').pop()
const FRANCHISE = { STL: 'LA', SD: 'LAC', OAK: 'LV' }
const COVERAGE = 1999

const db = () => {
  return adminClient()
}

/** Claims for reaching `value` of `stat` this season. p = { team, position, rookie } */
export async function nflClaims(p, { stat, value, season }) {
  const c = db()
  const franchise = FRANCHISE[p?.team] || p?.team
  if (!c || !franchise) return []
  const { data, error } = await c.from('hist_nfl').select('season, player_id, name, team, franchise, position, rookie, total_td, rec_yds, rush_yds')
    .eq('franchise', franchise).neq('team', 'TOT').lt('season', season).gte(stat, value).order('season', { ascending: false }).limit(500)
  if (error) throw new Error(`hist_nfl: ${error.message}`)
  const rows = (data || []).map((r) => ({ ...r, source_id: r.player_id }))
  const team = nickname(franchise)
  const what = NFL_RUNGS[stat].what(value)
  const tries = [
    p.position && { type: 'C1', who: `${team} ${posWord(p.position)}`, q: { stat, value, franchise, position: p.position, before: season } },
    { type: 'C2', who: `${team} player`, q: { stat, value, franchise, before: season } },
    p.rookie && { type: 'C3', who: `${team} rookie`, q: { stat, value, franchise, rookie: true, before: season } },
  ].filter(Boolean)
  const out = []
  for (const t of tries) {
    const ans = lastTime(rows, t.q)
    ans.coverageFrom = COVERAGE
    const text = wordClaim(ans, { who: t.who, what, season })   // no firstSeason: never "ever" inside a 1999 floor
    if (text) out.push({ type: t.type, text, proof: { ...t.q, who: t.who, lastSeason: ans.lastSeason, lastPlayer: ans.lastPlayer, lastValue: ans.lastValue, hits: ans.hits, coverageFrom: COVERAGE, allSince: ans.allSince, source: CREDIT } })
  }
  return out.sort((a, b) => (a.proof.lastSeason ?? 0) - (b.proof.lastSeason ?? 0))
}

let cur = { at: 0, season: 0, rows: null }
/** This season's totals per player (nflverse weekly, REG), cached an hour. */
async function currentTotals(season) {
  if (cur.rows && cur.season === season && Date.now() - cur.at < 3600e3) return cur.rows
  const res = await fetch(`https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`)
  if (!res.ok) return new Map()
  const [head, ...lines] = (await res.text()).split('\n')
  const cols = head.split(',')
  const at = (k) => cols.indexOf(k)
  const I = { id: at('player_id'), name: at('player_display_name'), pos: at('position'), team: at('team'), type: at('season_type'), week: at('week'), rtd: at('rushing_tds'), ctd: at('receiving_tds'), ryd: at('rushing_yards'), cyd: at('receiving_yards'), rec: at('receptions'), pyd: at('passing_yards'), ptd: at('passing_tds') }
  const m = new Map()
  for (const line of lines) {
    // headshot URLs carry commas inside quotes: split on commas outside quotes.
    const f = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((x) => x.replace(/,$/, '').replace(/^"|"$/g, '')) || []
    if (f[I.type] !== 'REG') continue
    const r = m.get(f[I.id]) || { name: f[I.name], position: f[I.pos], team: f[I.team], total_td: 0, rec_yds: 0, rush_yds: 0, rec: 0, pass_yds: 0, pass_td: 0 }
    r.team = f[I.team]; r.total_td += Number(f[I.rtd] || 0) + Number(f[I.ctd] || 0); r.rec_yds += Number(f[I.cyd] || 0); r.rush_yds += Number(f[I.ryd] || 0)
    // receptions / passing (milestone stories, 2026-10-20); a column the file stops carrying stays NaN, never 0
    r.rec += I.rec < 0 ? NaN : Number(f[I.rec] || 0); r.pass_yds += I.pyd < 0 ? NaN : Number(f[I.pyd] || 0); r.pass_td += I.ptd < 0 ? NaN : Number(f[I.ptd] || 0)
    // the week (2026-10-20): which weeks this file has for him, so a source that is behind is caught, not trusted
    const wk = Number(f[I.week])
    if (Number.isFinite(wk)) { r.lastWeek = Math.max(r.lastWeek || 0, wk); (r.weeks ||= {})[wk] = { pass_td: I.ptd < 0 ? NaN : Number(f[I.ptd] || 0) } }
    m.set(f[I.id], r)
  }
  m.lastWeek = Math.max(0, ...[...m.values()].map((r) => r.lastWeek || 0))
  cur = { at: Date.now(), season, rows: m }
  return m
}

const CAREER_KEYS = ['total_td', 'rec', 'rec_yds', 'rush_yds', 'pass_yds', 'pass_td']
// nfl_logs.json (the bot's own game logs, the file every TUDDY page reads) field per stat; passing TDs aren't in it
const LOG_FIELD = { total_td: 'g_td', rec: 'g_rec', rec_yds: 'g_recyd', rush_yds: 'g_ruyd', pass_yds: 'g_payd' }

/**
 * THIS SEASON, FROM THE FRESHEST SOURCE (2026-10-20, Donovan: "any more data point I can reach so that doesn't
 * happen" -- a milestone a game behind because nflverse's weekly file was a day late). Our own nfl_logs.json leads:
 * the bot publishes it after every game and TUDDY already counts from it. nflverse fills two gaps: passing TDs (the
 * logs don't carry them) and players the logs don't list. Neither is trusted when it is behind the other:
 *   - passing TDs count only if nflverse has his latest logged week; else NaN (no passing-TD story, never a stale one)
 *   - a player only nflverse lists counts only if nflverse is as new as the logs overall
 * Returns Map(id -> { name, position, team, total_td, rec, rec_yds, rush_yds, pass_yds, pass_td, lastWeek, games })
 * with `games` his game-by-game line this season, newest first ({ d, w, opp, ...the six stats }).
 */
export async function seasonTotals(season, logs) {
  const nv = await currentTotals(season)
  const out = new Map()
  const logLast = { v: 0 }
  for (const [id, entry] of Object.entries(logs?.logs || {})) {
    const games = (entry?.log || []).filter((g) => Number(g.s) === Number(season) && Number.isFinite(Number(g.w)))
    if (!games.length) continue
    const last = Math.max(...games.map((g) => Number(g.w)))
    logLast.v = Math.max(logLast.v, last)
    const v = nv.get(id)
    const ptdOk = v && (v.lastWeek || 0) >= last
    const lines = games.slice().sort((a, b) => Number(b.w) - Number(a.w)).map((g) => ({
      d: g.d || null, w: Number(g.w), opp: g.opp || null,
      ...Object.fromEntries(Object.entries(LOG_FIELD).map(([k, f]) => [k, Number(g[f]) || 0])),
      pass_td: ptdOk ? (v.weeks?.[Number(g.w)]?.pass_td ?? 0) : NaN,
    }))
    const sum = (k) => lines.reduce((a, g) => a + g[k], 0)
    // his last ten logged games across seasons (a September "last 5" reaches into last year), newest first;
    // passing TDs only where this season's nflverse week has them
    const recent = (entry.log || []).filter((g) => g.d).slice().sort((a, b) => String(b.d).localeCompare(String(a.d))).slice(0, 10).map((g) => ({
      d: g.d, w: Number(g.w), s: Number(g.s), opp: g.opp || null,
      ...Object.fromEntries(Object.entries(LOG_FIELD).map(([k, f]) => [k, Number(g[f]) || 0])),
      pass_td: Number(g.s) === Number(season) && ptdOk ? (v.weeks?.[Number(g.w)]?.pass_td ?? 0) : NaN,
    }))
    out.set(id, {
      name: v?.name || null, position: v?.position || null, team: games.slice().sort((a, b) => Number(b.w) - Number(a.w))[0].tm || v?.team || null,
      ...Object.fromEntries(Object.keys(LOG_FIELD).map((k) => [k, sum(k)])),
      pass_td: ptdOk ? v.pass_td : NaN, lastWeek: last, games: lines, recent, source: 'nfl_logs',
    })
  }
  const nvFresh = (nv.lastWeek || 0) >= logLast.v
  for (const [id, v] of nv) {
    if (out.has(id) || !nvFresh) continue
    out.set(id, { ...v, games: null, source: 'nflverse' })
  }
  return out
}
/**
 * Milestone totals entering this week (lib/stories/milestones.js MILES.nfl), for these
 * nflverse ids: Map(id -> { season, career }). Career = every hist_nfl season before this
 * one (team rows; TOT is their sum, so it's skipped) + this season. hist_nfl starts in
 * 1999 and every active career starts after it, so the sum is the whole career.
 * A player this season's file doesn't list is skipped, never guessed.
 */
export async function nflMilestoneTotals(season, ids, logs = null) {
  const totals = await seasonTotals(season, logs)
  const c = db()
  if (!c) return new Map()
  const mine = [...new Set(ids)].filter((id) => totals.has(id))
  const past = new Map()
  const chunks = []
  for (let i = 0; i < mine.length; i += 40) chunks.push(mine.slice(i, i + 40))
  await Promise.all(chunks.map(async (chunk) => {
    const { data, error } = await c.from('hist_nfl').select(`player_id, season, team, ${CAREER_KEYS.join(', ')}`).in('player_id', chunk).lt('season', season).neq('team', 'TOT').limit(1000)
    if (error) throw new Error(`hist_nfl: ${error.message}`)
    if ((data || []).length >= 1000) throw new Error('hist_nfl: a 40-player chunk hit 1,000 rows')
    for (const r of data || []) { const t = past.get(r.player_id) || Object.fromEntries(CAREER_KEYS.map((k) => [k, 0])); for (const k of CAREER_KEYS) t[k] += Number(r[k]) || 0; past.set(r.player_id, t) }
  }))
  const out = new Map()
  for (const id of mine) {
    const s = totals.get(id); const p = past.get(id) || Object.fromEntries(CAREER_KEYS.map((k) => [k, 0]))
    out.set(id, { season: s, career: Object.fromEntries(CAREER_KEYS.map((k) => [k, p[k] + s[k]])), games: s.games || null, recent: s.recent || null })
  }
  return out
}

/** This week's watch: players whose current total is within reach of a rung. */
export async function nflWatch(season, logs = null) {
  if (!logs) logs = await fetchNfl(nflLogPaths().filter((p) => /^https?:/.test(p))).catch(() => null)
  const totals = await seasonTotals(season, logs)
  const c = db()
  // Rookie = no earlier season in the data (a pre-1999 veteran is never a 2026 rookie).
  const ids = [...totals.keys()]
  const veterans = new Set()
  if (c) for (let i = 0; i < ids.length; i += 300) {
    const { data } = await c.from('hist_nfl').select('player_id').in('player_id', ids.slice(i, i + 300)).lt('season', season).limit(5000)
    for (const r of data || []) veterans.add(r.player_id)
  }
  const out = []
  for (const [id, p] of totals) {
    if (!p.name) continue   // only our logs list him (no nflverse row yet): no name or position to claim with
    for (const [stat, spec] of Object.entries(NFL_RUNGS)) {
      const rung = spec.rungs.find((t) => t - p[stat] > 0 && t - p[stat] <= spec.within)
      if (!rung) continue
      const claims = await nflClaims({ team: p.team, position: p.position, rookie: !veterans.has(id) }, { stat, value: rung, season }).catch(() => [])
      if (!claims.length) continue
      out.push({ player_id: id, name: p.name, team: p.team, hr: p[stat], unit: stat === 'total_td' ? 'TD' : stat === 'rec_yds' ? 'rec yds' : 'rush yds', rung, claim: claims[0].text, proof: claims[0].proof })
    }
  }
  return out.sort((a, b) => (a.proof.lastSeason ?? 0) - (b.proof.lastSeason ?? 0) || b.rung - a.rung)
}

/**
 * REACHED on a touchdown alert (milestones plan section 5): the one line a
 * rushing or receiving touchdown gains when it lands on a scrimmage-TD rung,
 * re-asked at the moment of the alert. The count is his touchdowns entering
 * today (nfl_td_feed.season_to_date, the alert's own field) plus his rush/rec
 * touchdowns logged today up to and including this one. Null when it is not
 * a rung, a field is missing, or the claim is suppressed.
 */
export async function nflReachedLine(row, season) {
  if (!['pass', 'rush'].includes(String(row?.kind || ''))) return null   // 'pass' = he caught it
  const before = Number(row?.season_to_date?.td)
  if (!Number.isFinite(before) || !row.gsis_id) return null
  const c = db()
  if (!c) return null
  try {
    const { count } = await c.from('nfl_td_feed').select('*', { count: 'exact', head: true })
      .eq('day', row.day).eq('gsis_id', row.gsis_id).in('kind', ['pass', 'rush']).lte('seen_at', row.seen_at)
    const nth = before + (count || 1)
    if (!NFL_RUNGS.total_td.rungs.includes(nth)) return null
    const { data: prior } = await c.from('hist_nfl').select('season').eq('player_id', row.gsis_id).lt('season', season).limit(1)
    const claims = await nflClaims({ team: row.team, position: row.position, rookie: !(prior || []).length }, { stat: 'total_td', value: nth, season })
    return claims.length ? `📜 ${claims[0].text.charAt(0).toUpperCase()}${claims[0].text.slice(1)}.` : null
  } catch (e) {
    console.error(`[history] nfl reached ${row?.scorer_name}: ${e?.message}`)
    return null
  }
}
