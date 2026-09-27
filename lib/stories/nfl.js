// 🏈 TUDDY'S STORIES, ONE ENGINE (BATCH-STORYLINES-PAGE step 1, 2026-09-27).
// Server-safe. The kinds are lib/nfl/storylines.js's own builders -- nothing
// new is invented here -- turned into the shared story shape
// (lib/stories/shape.js), each tied to its game, with the sentence the TUDDY
// Storylines tab already prints. History Watch comes from lib/history/nfl.js.
//
// RARITY (0-1, "how unusual"), per type:
//   history   0.95  a query-backed "first since" claim is the rarest thing we say
//   streak    0.60 + 0.30 x min(1, -log10(chance) / 4) -- his own chance of
//             the run (milestoneStreaks' `chance`) on a log scale, so a 1-in-100
//             run is 0.75 and 1-in-10,000 is 0.90 (a straight 1 - chance put
//             every streak at 0.99, above the history claims)
//   model     0.80  priced for one market, missed, cashed another
//   b2b       1 - this season's back-to-back TD rate off the log
//   revenge   0.55 + up to 0.25 for a long stint with the old team
//   due       0.35 + the per-game gap (capped at 0.35)
//   redzone   0.50 for the slate's top red-zone role, 0.40 below it
//   birthday  0.20  (it happens to someone most weeks)
//   rivalry   0.30  game-level
import {
  VERB, NOUN, fmtBar, weekLabel,
  milestoneStreaks, modelNarrativeStories, rivalryNights, birthdays,
  scoredLastTimeOut, backToBackRate, dueByTheNumbers, revengeGames, redZoneMonsters,
} from '../nfl/storylines'
import { easternDate } from '../data'
import { NFL_DATA_BASE, nflSlatePaths, nflLogPaths, fetchNfl } from '../nfl/dataSource'
import { nflWatch } from '../history/nfl'
import { story, parts, name, num, byRarity } from './shape'
import { multiStories, readMultiSafe } from './multi'
import { tdEveryGameRows, hundredStreakRows } from '../lists/nfl'
import { createClient } from '@supabase/supabase-js'

const SRC_WEEK = 'nfl_week.json'
const SRC_LOGS = 'nfl_logs.json'

/** team -> its game this week ({ game_id, kickoff, day, away, home }). */
export function gamesByTeam(data) {
  const m = new Map()
  for (const g of data?.games || []) {
    const ms = Date.parse(g.kickoff || '')
    const row = { game_id: String(g.game_id), kickoff: g.kickoff || null, day: Number.isFinite(ms) ? easternDate(ms) : null, away: g.away, home: g.home, state: g.state || null }
    m.set(g.away, row); m.set(g.home, row)
  }
  return m
}

/**
 * Every story for the week's slate.
 * @param data     nfl_week.json
 * @param logs     nfl_logs.json
 * @param archive  { [weekKey]: nfl_results_<season>_<wk>.json } -- the last two weeks (model narratives)
 * @param keys     archive keys in order
 * @param history  lib/history/nfl.js nflWatch() items (optional)
 */
export function buildNflStories({ data, logs, archive = {}, keys = [], history = [] }) {
  const out = []
  if (!data?.players?.length) return out
  const byTeam = gamesByTeam(data)
  const byId = Object.fromEntries(data.players.map((p) => [String(p.player_id), p]))
  const base = (p, extra) => {
    const g = byTeam.get(p?.team) || null
    return { sport: 'nfl', day: g?.day ?? null, game_id: g?.game_id ?? null, player_id: p?.player_id, name: p?.name, team: p?.team ?? null, opp: p?.opp ?? null, pos: p?.position ?? null, ...extra }
  }

  for (const h of history || []) {
    const p = byId[String(h.player_id)] || { player_id: h.player_id, name: h.name, team: h.team }
    out.push(story(base(p, {
      type: 'history', icon: '📜', rarity: 0.95, source: 'hist_nfl (nflverse 1999-) + this season', proof: h.proof,
      parts: parts(name(h.name), ` has `, num(h.hr), ` ${h.unit} — one more: ${h.claim}`),
      numbers: { have: h.hr, rung: h.rung },
    })))
  }

  for (const r of milestoneStreaks(logs, data)) {
    const label = NOUN[r.marketKey]?.replace(/^a /, '') || r.marketKey
    const did = VERB[r.marketKey] ? VERB[r.marketKey](fmtBar(r.marketBar)) : `cleared ${fmtBar(r.marketBar)} ${label}`
    out.push(story(base(r.player, {
      type: 'streak', icon: '🔁', rarity: 0.6 + 0.3 * Math.min(1, -Math.log10(Math.max(1e-12, Number(r.chance) || 1)) / 4), source: SRC_LOGS,
      parts: parts(name(r.player.name), ` has ${did} in `, num(r.streak), ' straight games'),
      numbers: { streak: r.streak, market: r.marketKey, bar: r.marketBar, hits: r.hits, games: r.games, chance: r.chance },
    })))
  }

  for (const c of modelNarrativeStories(archive, keys, byId)) {
    const hit = VERB[c.hitMarket] ? VERB[c.hitMarket](fmtBar(c.hitBar)) : `over ${fmtBar(c.hitBar)} ${NOUN[c.hitMarket] || c.hitMarket}`
    out.push(story(base(c.player, {
      type: 'model', icon: '🎯', rarity: 0.8, source: `nfl_results (${weekLabel(c.week)})`,
      parts: parts(name(c.player.name), ` was priced for ${NOUN[c.missMarket] || c.missMarket} and missed (`, num(fmtBar(c.missActual)), ' of ', num(fmtBar(c.missBar)), `) — he delivered anyway, just ${hit} (`, num(fmtBar(c.hitVal)), '), a market the card never opened for him'),
      numbers: { missMarket: c.missMarket, missBar: c.missBar, missActual: c.missActual, hitMarket: c.hitMarket, hitBar: c.hitBar, hitVal: c.hitVal },
    })))
  }

  const b2bRate = backToBackRate(logs, data.season)
  for (const r of scoredLastTimeOut(data)) {
    out.push(story(base(r.player, {
      type: 'b2b', icon: '🔁', rarity: b2bRate ? 1 - b2bRate.rate : 0.6, source: `${SRC_WEEK} (games_since_last_td)`,
      parts: parts(name(r.player.name), ' scored last time out — back on the board this week · ', num(r.seasonTd), ' TD this season'),
      numbers: { seasonTd: r.seasonTd, b2bRate: b2bRate?.rate ?? null },
    })))
  }

  for (const r of revengeGames(data, logs)) {
    out.push(story(base(r.player, {
      type: 'revenge', icon: '👻', rarity: 0.55 + Math.min(0.25, r.oldGames / 80), source: `${SRC_LOGS} (team column)`,
      parts: parts(name(r.player.name), ' faces ', name(r.oldTeam), ', the jersey he wore for ', num(r.oldGames), ` logged game${r.oldGames === 1 ? '' : 's'}`, r.tdsThere > 0 ? [' — ', num(r.tdsThere), ' TD for them'] : null),
      numbers: { oldTeam: r.oldTeam, oldGames: r.oldGames, tdsThere: r.tdsThere, seasons: r.seasons },
    })))
  }

  for (const r of dueByTheNumbers(data)) {
    out.push(story(base(r.player, {
      type: 'due', icon: '📊', rarity: 0.35 + Math.min(0.35, r.gap), source: `${SRC_WEEK} (stats xTD / TD / RZ)`,
      parts: parts(name(r.player.name), ' gets ', num(r.xtd.toFixed(2)), ' expected TD a game and has scored ', num(r.actual.toFixed(2)), ' — ', num(r.gap.toFixed(2)), ' a game owed by the numbers, on ', num(r.rz.toFixed(1)), ' red-zone touches'),
      numbers: { xtd: r.xtd, actual: r.actual, gap: r.gap, rz: r.rz },
    })))
  }

  redZoneMonsters(data).forEach((r, i) => {
    out.push(story(base(r.player, {
      type: 'redzone', icon: '🚨', rarity: i === 0 ? 0.5 : 0.4, source: `${SRC_WEEK} (stats RZ / GL / TD)`,
      parts: parts(name(r.player.name), ' gets ', num(r.rz.toFixed(1)), ` red-zone touches a game${i === 0 ? ', most on the slate' : ''}`,
        Number.isFinite(r.gl) ? [' (', num(r.gl.toFixed(1)), ' at the goal line)'] : null,
        Number.isFinite(r.tdPerGame) ? [' — and turns them into ', num(r.tdPerGame.toFixed(2)), ' TD a game'] : null),
      numbers: { rz: r.rz, gl: r.gl, tdPerGame: r.tdPerGame },
    })))
  })

  // Birthdays on the game's own date, not the server's wall clock.
  for (const g of new Map([...byTeam.values()].map((x) => [x.game_id, x])).values()) {
    if (!g.day) continue
    const onDay = new Date(`${g.day}T12:00:00Z`)
    for (const { player, age } of birthdays({ ...data, players: data.players.filter((p) => p.team === g.away || p.team === g.home) }, onDay)) {
      out.push(story(base(player, {
        type: 'birthday', icon: '🎂', rarity: 0.2, source: `${SRC_WEEK} (birth_date)`,
        parts: parts(name(player.name), ' turns ', num(age), ' today'), numbers: { age },
      })))
    }
  }

  for (const g of rivalryNights(data)) {
    const gm = byTeam.get(g.home)
    out.push(story({
      sport: 'nfl', day: gm?.day ?? null, game_id: g.gameId, player_id: null, name: null, team: null, opp: null,
      type: 'rivalry', icon: '⚡', rarity: 0.3, source: `${SRC_WEEK} (games) + the rivalry list`,
      parts: parts('Rivalry night: ', name(`${g.away} at ${g.home}`), ' — the games that never need a storyline get one anyway'),
      numbers: { away: g.away, home: g.home },
    }))
  }

  return out.filter((s) => s.game_id).sort(byRarity)
}

/**
 * Pure: the TUDDY list rows (lib/lists/nfl.js) as stories. RARITY: a TD in
 * every game 0.70 (+0.03 a game past two, max 0.82); 100+ yards 3+ straight
 * 0.72 (+0.03 a game past three, max 0.84).
 */
export function listStories(data, logs) {
  const byTeam = gamesByTeam(data)
  const out = []
  const mk = (r, type, icon, rarity, ps, numbers) => {
    const g = byTeam.get(r.team)
    if (g) out.push(story({ sport: 'nfl', day: g.day, game_id: g.game_id, player_id: r.id, name: r.name, team: r.team, opp: g.away === r.team ? g.home : g.away, type, icon, rarity, source: 'nfl_logs.json (the list posts)', parts: ps, numbers }))
  }
  for (const r of tdEveryGameRows(data, logs)) mk(r, 'list_td', '📋', Math.min(0.82, 0.7 + 0.03 * (r.check.games - 2)), parts(name(r.name), ' has a touchdown in every game this season — ', num(r.check.td), ' in ', num(r.check.games)), r.check)
  for (const r of hundredStreakRows(data, logs)) mk(r, 'list_100', '📋', Math.min(0.84, 0.72 + 0.03 * (r.check.streak - 3)), parts(name(r.name), ' has 100+ yards in ', num(r.check.streak), ' straight games'), r.check)
  return out
}

// ── THE SERVER LOADER ─────────────────────────────────────────────────────
// The same files the TUDDY tab reads, fetched once: the week, the logs, the
// last weeks' graded results (model narratives read the last two), and
// History Watch. resultsArchive.js is a client module, so its URL scheme is
// repeated here: nfl_results_<season>_<p|w><NN>.json.
const resultsUrl = (season, mode, week) => `${NFL_DATA_BASE}/nfl_results_${season}_${mode === 'preseason' ? 'p' : 'w'}${String(week).padStart(2, '0')}.json`

export async function loadNflStories() {
  const http = (ps) => ps.filter((p) => /^https?:/.test(p))
  const [data, logs] = await Promise.all([fetchNfl(http(nflSlatePaths())), fetchNfl(http(nflLogPaths()))])
  if (!data?.players?.length) return { data: null, stories: [] }
  const weeks = [data.week - 2, data.week - 1, data.week].filter((w) => w >= 1)
  const archive = {}
  const keys = []
  await Promise.all(weeks.map(async (w) => {
    const j = await fetch(resultsUrl(data.season, data.mode, w), { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    if (j?.totals) { const k = `${data.season}_${String(w).padStart(2, '0')}`; archive[k] = j }
  }))
  keys.push(...Object.keys(archive).sort())
  const history = await nflWatch(Number(data.season)).catch(() => [])
  const stories = buildNflStories({ data, logs, archive, keys, history })
  // THE LISTS AS STORIES (BATCH-LIST-POSTS step 5): the same rows the list
  // posts use, for this week's players -- one source, two surfaces.
  stories.push(...listStories(data, logs))
  // The 2+ Club (lib/stories/multi.js), for this week's players.
  const byTeam = gamesByTeam(data)
  const slate = new Map(data.players.filter((p) => byTeam.has(p.team)).map((p) => [String(p.player_id), { game_id: byTeam.get(p.team).game_id, day: byTeam.get(p.team).day, name: p.name, team: p.team, opp: p.opp }]))
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  stories.push(...multiStories('nfl', slate, await readMultiSafe(url && key ? createClient(url, key, { auth: { persistSession: false } }) : null, 'nfl')))
  return { data, stories: stories.sort(byRarity) }
}
