// 📜 NFL HISTORY CLAIMS + WATCH (milestones plan step 4, 2026-09-26).
// Server only. hist_nfl (nflverse weekly player stats, 1999 on) answered by
// lib/history/lastTime.js. Coverage starts in 1999, so a claim that finds
// nobody says "since at least 1999" -- never "ever".
import { lastTime, wordClaim, posWord } from './lastTime'
import { NFL_TEAMS } from '../nfl/teams'
import { fetchNfl, nflLogPaths } from '../nfl/dataSource'
import { adminClient } from '../supabase/admin'
import { readPaged } from '../record/paged'

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
  const I = { id: at('player_id'), name: at('player_display_name'), pos: at('position'), team: at('team'), type: at('season_type'), week: at('week'), opp: at('opponent_team'), rtd: at('rushing_tds'), ctd: at('receiving_tds'), ryd: at('rushing_yards'), cyd: at('receiving_yards'), rec: at('receptions'), pyd: at('passing_yards'), ptd: at('passing_tds') }
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
    // and his line that week (all six stats), so when this file is newer than the bot's logs his games come from here
    if (Number.isFinite(wk)) {
      r.lastWeek = Math.max(r.lastWeek || 0, wk)
      ;(r.weeks ||= {})[wk] = {
        w: wk, opp: I.opp < 0 ? null : f[I.opp] || null, d: null,
        total_td: Number(f[I.rtd] || 0) + Number(f[I.ctd] || 0), rec: I.rec < 0 ? NaN : Number(f[I.rec] || 0), rec_yds: Number(f[I.cyd] || 0),
        rush_yds: Number(f[I.ryd] || 0), pass_yds: I.pyd < 0 ? NaN : Number(f[I.pyd] || 0), pass_td: I.ptd < 0 ? NaN : Number(f[I.ptd] || 0),
      }
    }
    m.set(f[I.id], r)
  }
  m.lastWeek = Math.max(0, ...[...m.values()].map((r) => r.lastWeek || 0))
  cur = { at: Date.now(), season, rows: m }
  return m
}

const CAREER_KEYS = ['total_td', 'rec', 'rec_yds', 'rush_yds', 'pass_yds', 'pass_td']
// nfl_logs.json (the bot's game logs, the file every TUDDY page reads) field per stat; g_patd since bot PR #25
const LOG_FIELD = { total_td: 'g_td', rec: 'g_rec', rec_yds: 'g_recyd', rush_yds: 'g_ruyd', pass_yds: 'g_payd', pass_td: 'g_patd' }

// THE THIRD COPY, OUR OWN (2026-10-20, Donovan: "look for other avenues and ways we can source our own data").
// The bot already reads ESPN's box score for every game every 15 minutes in game windows (bots/nfl/
// nfl_fantasy_stats.py -> nfl_fantasy_stats.json) and FRANCHISE's sync stores each player's week in our own table,
// nfl_player_week_stats (lib/fantasy/nflFeed.js). That is independent of nflverse. Read only for FINAL regular-season
// weeks newer than both nflverse copies (normally none, so normally zero rows), cached 15 minutes.
let captured = { at: 0, key: '', map: null }
async function capturedWeeks(season, afterWeek) {
  const key = `${season}:${afterWeek}`
  if (captured.map && captured.key === key && Date.now() - captured.at < 15 * 60e3) return captured.map
  const c = db()
  const map = new Map()   // gsis -> Map(week -> line)
  if (c) {
    const { data, error } = await c.from('nfl_player_week_stats')
      .select('week, stats, status, player:nfl_players(source_player_id), game:nfl_week_games(home_team, away_team, season_type, status)')
      .eq('season', season).eq('status', 'final').gt('week', afterWeek).limit(5000)
    if (error) throw new Error(`nfl_player_week_stats: ${error.message}`)
    for (const r of data || []) {
      const id = r.player?.source_player_id; const st = r.stats || {}
      if (!id || r.game?.status !== 'final' || Number(r.game?.season_type) !== 2) continue
      const n = (k) => Number(st[k]) || 0
      ;(map.get(id) || map.set(id, new Map()).get(id)).set(Number(r.week), {
        w: Number(r.week), s: Number(season), d: null, teams: [r.game?.home_team, r.game?.away_team],
        total_td: n('rushing_touchdowns') + n('receiving_touchdowns'), rec: n('receptions'), rec_yds: n('receiving_yards'),
        rush_yds: n('rushing_yards'), pass_yds: n('passing_yards'), pass_td: n('passing_touchdowns'),
      })
    }
  }
  captured = { at: Date.now(), key, map }
  return map
}

/**
 * THIS SEASON, FROM WHICHEVER COPY IS NEWER (2026-10-20, Donovan: "any more data point I can reach so that doesn't
 * happen" -- a milestone a game behind). Two copies of the same numbers: the bot's nfl_logs.json (built from nflverse
 * by bots/nfl/nfl_gamelog.py, refreshed when the bot runs) and nflverse's weekly file read here directly (refreshed
 * when nflverse publishes). Neither can be newer than nflverse itself, but either can be behind the other, so per
 * player the one with his later week wins:
 *   - logs as new or newer: the logs' games (dates, opponents); passing TDs from g_patd, else nflverse's week if it
 *     has caught up, else NaN (no passing-TD story, never a stale one)
 *   - nflverse newer (the bot hasn't run since): nflverse's weeks
 *   - only nflverse lists him: nflverse, if it is as new as the logs overall
 * Returns Map(id -> { name, position, team, total_td, rec, rec_yds, rush_yds, pass_yds, pass_td, lastWeek, games,
 * recent, source }) -- `games` this season newest first, `recent` his last ten across seasons (the hit rate's).
 */
export async function seasonTotals(season, logs) {
  const nv = await currentTotals(season)
  const out = new Map()
  const logLast = { v: 0 }
  const S = Number(season)
  const fromNv = (v) => Object.values(v.weeks || {}).sort((a, b) => b.w - a.w)
  const sum = (list, k) => list.reduce((a, g) => a + g[k], 0)
  for (const [id, entry] of Object.entries(logs?.logs || {})) {
    const all = (entry?.log || []).filter((g) => Number.isFinite(Number(g.w)))
    const mine = all.filter((g) => Number(g.s) === S)
    const last = mine.length ? Math.max(...mine.map((g) => Number(g.w))) : 0
    logLast.v = Math.max(logLast.v, last)
    const v = nv.get(id)
    const nvLast = v?.lastWeek || 0
    const prior = all.filter((g) => Number(g.s) < S).sort((a, b) => String(b.d || '').localeCompare(String(a.d || '')) || Number(b.s) - Number(a.s) || Number(b.w) - Number(a.w))
    const row = (g, seasonRow) => ({
      d: g.d || null, w: Number(g.w), s: Number(g.s), opp: g.opp || null,
      ...Object.fromEntries(Object.entries(LOG_FIELD).map(([k, f]) => [k, k === 'pass_td' && !(f in g)
        ? (seasonRow && v && nvLast >= last ? (v.weeks?.[Number(g.w)]?.pass_td ?? 0) : NaN)
        : Number(g[f]) || 0])),
    })
    if (!mine.length && !v) continue
    let games; let source
    if (v && nvLast > last) { games = fromNv(v).map((g) => ({ ...g, s: S })); source = 'nflverse (newer than the logs)' }
    else if (mine.length) { games = mine.slice().sort((a, b) => Number(b.w) - Number(a.w)).map((g) => row(g, true)); source = 'nfl_logs' }
    else continue
    const recent = [...games, ...prior.map((g) => row(g, false))].slice(0, 10)
    out.set(id, {
      name: v?.name || null, position: v?.position || null,
      team: (mine.length ? mine.slice().sort((a, b) => Number(b.w) - Number(a.w))[0].tm : null) || v?.team || null,
      ...Object.fromEntries(CAREER_KEYS.map((k) => [k, sum(games, k)])),
      lastWeek: Math.max(last, nvLast), games, recent, source,
    })
  }
  const nvFresh = (nv.lastWeek || 0) >= logLast.v
  for (const [id, v] of nv) {
    if (out.has(id) || !nvFresh) continue
    const games = fromNv(v).map((g) => ({ ...g, s: S }))
    out.set(id, { name: v.name, position: v.position, team: v.team, ...Object.fromEntries(CAREER_KEYS.map((k) => [k, sum(games, k)])), lastWeek: v.lastWeek || 0, games, recent: games.slice(0, 10), source: 'nflverse' })
  }
  // a final week both nflverse copies are still missing: our own captured ESPN box (capturedWeeks)
  // the older of the copies we HAVE (a copy that failed to load doesn't drag this to week 0 and a whole season's read)
  const have = [Object.keys(logs?.logs || {}).length ? logLast.v : null, nv.size ? (nv.lastWeek || 0) : null].filter((x) => x != null)
  const behind = have.length ? Math.min(...have) : 0
  const ours = await capturedWeeks(S, behind).catch((e) => { console.error(`[history] nfl captured weeks: ${e?.message}`); return new Map() })
  mergeCaptured(out, ours, S)
  return out
}

/**
 * Pure: lay our captured final weeks (capturedWeeks) over each player's season, only the weeks newer than his
 * chosen copy's last one. Mutates and returns `out`.
 */
export function mergeCaptured(out, ours, S) {
  const sum = (list, k) => list.reduce((a, g) => a + g[k], 0)
  for (const [id, weeks] of ours) {
    const t = out.get(id)
    if (!t) continue
    const add = [...weeks.values()].filter((g) => g.w > (t.lastWeek || 0)).sort((a, b) => b.w - a.w)
    if (!add.length) continue
    const games = [...add.map(({ teams, ...g }) => ({ ...g, opp: teams.find((x) => x && x !== t.team) || null })), ...(t.games || [])]
    out.set(id, { ...t, ...Object.fromEntries(CAREER_KEYS.map((k) => [k, sum(games, k)])), lastWeek: add[0].w, games,
      recent: [...games, ...(t.recent || []).filter((g) => g.s < S)].slice(0, 10), source: `${t.source} + our ESPN box (week ${add.map((g) => g.w).join(', ')})` })
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
let pastCache = { season: 0, at: 0, map: new Map(), asked: new Set() }
export async function nflMilestoneTotals(season, ids, logs = null) {
  const totals = await seasonTotals(season, logs)
  const c = db()
  if (!c) return new Map()
  const mine = [...new Set(ids)].filter((id) => totals.has(id))
  // past seasons never change: summed once per instance per season, kept 12 hours (keeps Supabase egress down)
  if (pastCache.season !== season || Date.now() - pastCache.at > 12 * 3600e3) pastCache = { season, at: Date.now(), map: new Map(), asked: new Set() }
  const past = pastCache.map
  const ask = mine.filter((id) => !pastCache.asked.has(id))
  const chunks = []
  for (let i = 0; i < ask.length; i += 40) chunks.push(ask.slice(i, i + 40))
  await Promise.all(chunks.map(async (chunk) => {
    // PAGED (2026-10-26, known-issues #103): the API cuts one request at 1,000 rows without saying so, and 40 long careers can pass that
    // (it used to throw and drop the whole milestone story). Primary key order (season, player_id, team) is total, so pages never overlap.
    const { data, error } = await readPaged(() => c.from('hist_nfl').select(`player_id, season, team, ${CAREER_KEYS.join(', ')}`).in('player_id', chunk).lt('season', season).neq('team', 'TOT')
      .order('player_id', { ascending: true }).order('season', { ascending: true }).order('team', { ascending: true }))
    if (error) throw new Error(`hist_nfl: ${error.message}`)
    for (const r of data || []) { const t = past.get(r.player_id) || Object.fromEntries(CAREER_KEYS.map((k) => [k, 0])); for (const k of CAREER_KEYS) t[k] += Number(r[k]) || 0; past.set(r.player_id, t) }
    for (const id of chunk) pastCache.asked.add(id)
  }))
  const out = new Map()
  for (const id of mine) {
    const s = totals.get(id); const p = past.get(id) || Object.fromEntries(CAREER_KEYS.map((k) => [k, 0]))
    out.set(id, { season: s, career: Object.fromEntries(CAREER_KEYS.map((k) => [k, p[k] + s[k]])), games: s.games || null, recent: s.recent || null })
  }
  return out
}

/**
 * WHO HAS AN EARLIER SEASON ON FILE (the rookie test of the watch). Exported for tests.
 * Found 2026-10-26 (known-issues #103): this was one request per 300 players with .limit(5000), but the API cuts a request at 1,000
 * rows without saying so and 300 players carry ~3,500 earlier-season rows, so most veterans were missing and the claim code was
 * told they were rookies (a "first rookie since ..." line about a veteran). A failed read also left the set empty, i.e. everyone a
 * rookie. Now: chunks of 80 players, every chunk PAGED (primary key order is total), a failed read THROWS (the watch answers
 * "LIVE DATA DELAYED", never a guess), and the answer is kept 12 hours per instance (past seasons never change).
 */
let vetCache = { season: 0, at: 0, yes: new Set(), asked: new Set() }
export async function veteranIds(c, ids, season) {
  if (vetCache.season !== season || Date.now() - vetCache.at > 12 * 3600e3) vetCache = { season, at: Date.now(), yes: new Set(), asked: new Set() }
  const cache = vetCache
  const ask = [...new Set(ids)].filter((id) => !cache.asked.has(id))
  for (let i = 0; i < ask.length; i += 80) {
    const chunk = ask.slice(i, i + 80)
    const { data, error } = await readPaged(() => c.from('hist_nfl').select('player_id').in('player_id', chunk).lt('season', season)
      .order('player_id', { ascending: true }).order('season', { ascending: true }).order('team', { ascending: true }))
    if (error) throw new Error(`hist_nfl: ${error.message}`)
    for (const r of data) cache.yes.add(r.player_id)
    for (const id of chunk) cache.asked.add(id)
  }
  return cache.yes
}

/** Test hook: forget who was asked. */
export function forgetVeterans() { vetCache = { season: 0, at: 0, yes: new Set(), asked: new Set() } }

/** This week's watch: players whose current total is within reach of a rung. */
export async function nflWatch(season, logs = null) {
  if (!logs) logs = await fetchNfl(nflLogPaths().filter((p) => /^https?:/.test(p))).catch(() => null)
  const totals = await seasonTotals(season, logs)
  const c = db()
  // Rookie = no earlier season in the data (a pre-1999 veteran is never a 2026 rookie).
  const ids = [...totals.keys()]
  const veterans = c ? await veteranIds(c, ids, season) : new Set()
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
