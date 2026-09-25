// NOT 'use client' -- this file is plain data-transformation logic (no
// hooks, no JSX, no browser APIs) imported from BOTH client tabs
// (Games.js, Storylines.js -- they carry their own 'use client' already)
// AND the server-side NFL tick route (runMilestoneTick in
// app/api/dash/nfl/tick/route.js, via lib/nfl/tweetFeed.js's
// milestonePicks()). A 'use client' directive here turns every export
// into an RSC client reference, which crashes the moment server code
// calls it: "Attempted to call milestoneStreaks() from the server but
// milestoneStreaks is on the client." (reproduced 2026-09-13, root
// cause of the NFL touchdown/milestone tick silently 500'ing every run
// -- runMilestoneTick has no try/catch, so this took the whole GET()
// down with it). Keep this file directive-free.
// 📰 SHARED STORYLINES LOGIC (2026-09-12) — the two real angles
// (Milestone/streak, Model narrative) computed once here so the tab
// (components/nfl/tabs/Storylines.js) and the inline "why this matters"
// blurb on Games cards (components/nfl/tabs/Games.js) read the exact same
// criteria for "is this worth a sentence" — the same discipline this repo
// already applies to nav (lib/routes.js's PRIMARY_KEY_LIST / MAIN_KEYS /
// GAMEDAY_KEYS: "ONE TABLE, AND THE TWO BARS AGREE"). Two surfaces computing
// this independently would drift the moment one threshold changed and the
// other didn't.
//
// See Storylines.js's own header for what each angle is, what it needs, and
// why game narrative isn't here yet.
import { streakMarkets, streakBoard } from './streaks'

// Plain-English verb per market, bar folded in at render time. Anytime TD is
// the one binary market (bar is always 0.5) — every other market gets a
// real threshold in the sentence, because "over 0.5" reads like a bug.
export const VERB = {
  TD: () => 'scored a touchdown',
  REC_YDS: (bar) => `gone for ${bar}+ receiving yards`,
  REC: (bar) => `caught ${bar}+ passes`,
  RUSH_YDS: (bar) => `gone for ${bar}+ rushing yards`,
  RUSH_ATT: (bar) => `carried it ${bar}+ times`,
  PASS_YDS: (bar) => `thrown for ${bar}+ yards`,
  KICK_PTS: (bar) => `scored ${bar}+ kicking points`,
}
export const NOUN = { TD: 'a touchdown', REC_YDS: 'receiving yards', REC: 'receptions', RUSH_YDS: 'rushing yards', RUSH_ATT: 'carries', PASS_YDS: 'passing yards', KICK_PTS: 'kicking points' }
export const fmtBar = (b) => (Number(b) % 1 ? Number(b).toFixed(1) : Math.round(Number(b)))
export const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]) }
export const weekLabel = (p) => p?.mode === 'preseason' ? `Preseason Week ${p.week}` : `Week ${p?.week}`

/** MILESTONE. Every active streak in `logs`, live, off nfl_logs.json — the
 * same data Streaks.js reads. Sorted longest-streak first; `minStreak`
 * filters out noise (default 3, matching the tab's own cutoff). */
export function milestoneStreaks(logs, data, { minStreak = 3 } = {}) {
  const markets = streakMarkets(logs)
  if (!markets.length) return []
  const all = []
  for (const m of markets) {
    const eligible = new Set((data?.markets || []).find((x) => x.key === m.key)?.positions || [])
    const players = (data?.players || []).filter((p) => !p.on_bye && (!eligible.size || eligible.has(p.position)))
    const board = streakBoard(logs, players, m.field, m.bar, 'over', 30, m.key).filter((r) => r.streak > 0)
    board.forEach((r, i) => {
      if (r.streak >= minStreak) all.push({ ...r, marketKey: m.key, marketBar: m.bar, rank: i + 1, boardSize: board.length })
    })
  }
  all.sort((a, b) => b.streak - a.streak)
  return all
}

/** MODEL NARRATIVE. Cross-references two things nfl_results.py already
 * publishes per graded week — `card` (what was priced) and `lines` (every
 * eligible market outcome for every player who recorded a line, per that
 * file's own module docstring) — via `bars` (the per-market threshold).
 * `archive`/`keys` come straight from resultsArchive.js's
 * useResultsArchive(), which already fetches and caches the whole payload;
 * this reads fields (`lines`, `bars`, `names`) that hook's own callers never
 * touched. No new bot data, no new fetch — a derived fact over what's
 * already published: a player the card priced somewhere and missed (a real
 * hit:false, not a void), who also cleared a DIFFERENT market's bar the
 * card never opened for him. Deduped to one story per player (best margin),
 * sorted by that margin descending. */
export function modelNarrativeStories(archive, keys, playersById, { recentWeeks = 2 } = {}) {
  const recentKeys = keys.slice(-recentWeeks)
  const out = []
  for (const wk of recentKeys) {
    const p = archive[wk]
    if (!p?.lines || !p?.card || !p?.bars) continue
    const bars = p.bars
    for (const [pid, lineVals] of Object.entries(p.lines)) {
      const priced = new Set(
        Object.entries(p.card).filter(([, blk]) => (blk.rungs || []).some((r) => String(r.player_id) === pid)).map(([k]) => k),
      )
      if (!priced.size) continue
      const missed = [...priced].filter((mk) => {
        const rung = (p.card[mk].rungs || []).find((r) => String(r.player_id) === pid)
        return rung?.hit === false
      })
      if (!missed.length) continue
      const elsewhere = Object.entries(lineVals)
        .filter(([mk, v]) => !priced.has(mk) && bars[mk] != null && Number(v) >= Number(bars[mk]))
        .sort((a, b) => (Number(b[1]) - Number(bars[b[0]])) - (Number(a[1]) - Number(bars[a[0]])))
      if (!elsewhere.length) continue
      const player = playersById[pid]
      if (!player) continue
      const missMarket = missed.sort((a, b) => Number(bars[b]) - Number(bars[a]))[0]
      const missRung = (p.card[missMarket].rungs || []).find((r) => String(r.player_id) === pid)
      const [hitMarket, hitValRaw] = elsewhere[0]
      out.push({
        player, pid, week: p, weekKey: wk,
        missMarket, missBar: Number(bars[missMarket]), missActual: Number(missRung?.actual ?? 0),
        hitMarket, hitVal: Number(hitValRaw), hitBar: Number(bars[hitMarket]),
      })
    }
  }
  out.sort((a, b) => (b.hitVal - b.hitBar) - (a.hitVal - a.hitBar))
  const seen = new Set()
  return out.filter((c) => (seen.has(c.pid) ? false : (seen.add(c.pid), true)))
}

/** One-line plain-English form of a milestone story, for surfaces that just
 * want the sentence (Games cards) rather than the tab's own fuller card
 * markup (which bolds the streak count inline — left as its own JSX). */
export function milestoneHeadline(r) {
  const label = NOUN[r.marketKey]?.replace(/^a /, '') || r.marketKey
  return `${r.player.name} has ${VERB[r.marketKey] ? VERB[r.marketKey](fmtBar(r.marketBar)) : `cleared ${fmtBar(r.marketBar)} ${label}`} in ${r.streak} straight games.`
}

/** One-line plain-English form of a model-narrative story, for Games
 * cards. */
export function modelHeadline(c) {
  return `${c.player.name} was priced for ${NOUN[c.missMarket] || c.missMarket} this week and missed — he delivered anyway, just ${VERB[c.hitMarket] ? VERB[c.hitMarket](fmtBar(c.hitBar)) : `over ${fmtBar(c.hitBar)} ${NOUN[c.hitMarket] || c.hitMarket}`} in a market the card never opened for him.`
}

// ── 🎂 BIRTHDAYS + 🔥 RIVALRY NIGHTS (2026-09-16, round 6) ──────────────────
//
// Donovan, off a screenshot of MOONSHOT's Storylines fold: TUDDY's version
// was "built kinda wrong or formatted not like the mlb." Traced both first
// (claude/tuddy-storylines-and-markets-audit-2026-09-16.md) before writing
// anything — most of MLB's nine categories need data this repo doesn't have
// (career stat totals, prior-team history, player-vs-defense history), but
// two are honestly buildable with what's already published: `birth_date`
// already sits on every player object (bots/nfl/nfl_numerology.py — the same
// field Numerology.js already reads) and this week's schedule already
// carries every game's `home`/`away`. Revenge games, BvP-style duels and
// giveaways stay out — the same "don't invent it" call this file's own
// header already makes about role-change stories.

/** Curated classics, same discipline as MLB's own RIVALS array in
 * components/Storylines.js — real, recognizable rivalries, not an
 * exhaustive division schedule. */
const NFL_RIVALS = [
  ['DAL', 'PHI'], ['DAL', 'WAS'], ['DAL', 'NYG'], ['PHI', 'WAS'],
  ['GB', 'CHI'], ['GB', 'MIN'], ['DET', 'GB'],
  ['PIT', 'BAL'], ['PIT', 'CLE'], ['CIN', 'PIT'],
  ['BUF', 'MIA'], ['NE', 'NYJ'], ['BUF', 'NE'],
  ['KC', 'LV'], ['KC', 'DEN'],
  ['SF', 'SEA'], ['SF', 'LAR'],
  ['NO', 'ATL'], ['TEN', 'IND'],
]
// The feed has carried the Rams as both LA and LAR at different points
// (lib/nfl/teamColors.js maps both to the same tones for the same reason) --
// normalize so a rivalry match doesn't depend on which one is live today.
const normTeam = (t) => (String(t || '').toUpperCase() === 'LA' ? 'LAR' : String(t || '').toUpperCase())

/** RIVALRY NIGHTS. This week's games checked against the curated list --
 * pure schedule matching, no model or log involved, so it works the moment
 * `data.games` is published, before any log or grading exists. */
export function rivalryNights(data) {
  const games = data?.games || []
  const pairKey = (a, b) => [normTeam(a), normTeam(b)].sort().join('|')
  const rivalPairs = new Set(NFL_RIVALS.map(([a, b]) => pairKey(a, b)))
  const seen = new Set()
  const out = []
  games.forEach((g) => {
    const key = pairKey(g.away, g.home)
    if (rivalPairs.has(key) && !seen.has(key)) {
      seen.add(key)
      out.push({ away: g.away, home: g.home, gameId: g.game_id })
    }
  })
  return out
}

/** BIRTHDAYS. Anyone on this week's slate (not on bye) blowing out candles
 * today. Age comes from the birth year against today's calendar year, not a
 * stored age field -- MLB's own Birthday Watch needed the identical fix
 * (2026-08-09 audit there, components/Storylines.js): a stored "current age"
 * reads stale the moment the calendar turns, this can't. */
export function birthdays(data, today = new Date()) {
  const mmdd = today.toISOString().slice(5, 10)
  const thisYear = today.getFullYear()
  return (data?.players || [])
    .filter((p) => !p.on_bye && String(p.birth_date || '').slice(5, 10) === mmdd)
    .map((p) => {
      const born = Number(String(p.birth_date || '').slice(0, 4))
      const age = Number.isFinite(born) ? thisYear - born : null
      return { player: p, age }
    })
    .filter((b) => Number.isFinite(b.age))
}

// ── THE SECOND WAVE (2026-09-25) ─────────────────────────────────────────────
//
// Donovan, with the MOONSHOT storyline feed beside this page: TUDDY had four
// kinds where MOONSHOT has eleven. Five more here, every one off data the
// bot already publishes (nfl_week.json + nfl_logs.json), every one carrying
// the man's TD score so a line ties back to the board, and the two kinds
// that can be graded from the log alone carry their season rate on the
// section head -- the number that says whether the story has meant anything.
//
//   scoredLastTimeOut   he scored in his last game and he's on the board
//                       (games_since_last_td === 0) -- MOONSHOT's b2b watch
//   dueByTheNumbers     expected TDs a game well above actual (TDoE > 0)
//                       -- a caveated LINE, never a board: chances, not a
//                       promise (Donovan 09-25: OK with the caveat text)
//   revengeGames        the game log carries `tm` per game, so a man whose
//                       prior-season rows wear a different jersey, facing
//                       that jersey this week, is playing his old team
//   milestoneCountdowns season totals from THIS season's log rows, within
//                       reach of a round number (5/10/15 TD, 500/1,000 yds)
//   redZoneMonsters     the slate's red-zone-touch leaders, with what they
//                       turn those touches into

const tdScore = (p) => (Number.isFinite(Number(p?.scores?.TD)) ? Math.round(Number(p.scores.TD)) : null)
const logOf = (logs, pid) => logs?.logs?.[String(pid)]?.log || null

/** SCORED LAST TIME OUT. On the TD board, scored in his most recent game.
 *  Sorted by TD score so the line reads top-of-board first. */
export function scoredLastTimeOut(data, { limit = 8 } = {}) {
  return (data?.players || [])
    .filter((p) => !p.on_bye && p.games_since_last_td === 0 && tdScore(p) != null)
    .map((p) => ({ player: p, td: tdScore(p), seasonTd: Number(p.season_td) || 0 }))
    .sort((a, b) => b.td - a.td)
    .slice(0, limit)
}

/** The season rate behind scoredLastTimeOut, from the log alone: of every
 *  man who scored in week w-1 and played week w this season, how many scored
 *  again. Weeks are this season's only; null until two are in. */
export function backToBackRate(logs, season) {
  let hit = 0, n = 0
  for (const rec of Object.values(logs?.logs || {})) {
    const rows = (rec?.log || []).filter((g) => Number(g.s) === Number(season))
    for (let i = 1; i < rows.length; i++) {
      if (Number(rows[i - 1].g_td) >= 1) { n += 1; if (Number(rows[i].g_td) >= 1) hit += 1 }
    }
  }
  return n ? { hit, n, rate: hit / n } : null
}

/** DUE BY THE NUMBERS. Expected TDs a game (xTD, from where his chances
 *  happen) comfortably above what he has scored (TD), on a real red-zone
 *  role. Sorted by the gap. This is a line with a caveat, never a board. */
export function dueByTheNumbers(data, { limit = 6, minXtd = 0.5, minGap = 0.25, minRz = 2 } = {}) {
  return (data?.players || [])
    .filter((p) => !p.on_bye && tdScore(p) != null)
    .map((p) => {
      const s = p.stats || {}
      const xtd = Number(s.xTD), td = Number(s.TD), rz = Number(s.RZ)
      const gap = Number.isFinite(xtd) && Number.isFinite(td) ? xtd - td : NaN
      return { player: p, td: tdScore(p), xtd, actual: td, rz, gap }
    })
    .filter((r) => Number.isFinite(r.gap) && r.gap >= minGap && r.xtd >= minXtd && (r.rz || 0) >= minRz)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, limit)
}

/** REVENGE GAMES. A prior-season log row with a different `tm` than the
 *  man wears now, and this week's opponent is that old jersey. `oldGames`
 *  is how many logged games he played for them. */
export function revengeGames(data, logs, { limit = 8, minGames = 3 } = {}) {
  const out = []
  for (const p of (data?.players || [])) {
    if (p.on_bye || !p.opp) continue
    const log = logOf(logs, p.player_id)
    if (!log || !log.length) continue
    const now = normTeam(p.team), opp = normTeam(p.opp)
    const old = log.filter((g) => normTeam(g.tm) !== now && normTeam(g.tm) === opp)
    if (old.length < minGames) continue   // one game in a jersey is a cup of coffee, not a grudge
    const seasons = [...new Set(old.map((g) => Number(g.s)))].sort()
    out.push({ player: p, td: tdScore(p), oldTeam: p.opp, oldGames: old.length, seasons,
               tdsThere: old.reduce((s, g) => s + (Number(g.g_td) || 0), 0) })
  }
  // Most history first, then the board order -- a man who played 30 games
  // for them is the story; his TD score is the tag.
  return out.sort((a, b) => b.oldGames - a.oldGames || (b.td ?? -1) - (a.td ?? -1)).slice(0, limit)
}

/** The season rate behind revengeGames: across the whole log, every game a
 *  man played AGAINST a team his other rows show him playing FOR -- how
 *  often did he score. Small by construction; shown with its n. */
export function revengeRate(logs) {
  let hit = 0, n = 0
  for (const rec of Object.values(logs?.logs || {})) {
    const rows = rec?.log || []
    const jerseys = new Set(rows.map((g) => normTeam(g.tm)))
    if (jerseys.size < 2) continue
    for (const g of rows) {
      if (jerseys.has(normTeam(g.opp)) && normTeam(g.opp) !== normTeam(g.tm)) { n += 1; if (Number(g.g_td) >= 1) hit += 1 }
    }
  }
  return n ? { hit, n, rate: hit / n } : null
}

/** MILESTONE COUNTDOWNS. This season's totals from the log, within reach of
 *  a round number. Yardage marks need the man's market: rushing for RB,
 *  receiving otherwise. Nothing shows until this season's rows exist. */
export function milestoneCountdowns(data, logs, { limit = 8 } = {}) {
  const season = Number(data?.season)
  const out = []
  for (const p of (data?.players || [])) {
    if (p.on_bye) continue
    const rows = (logOf(logs, p.player_id) || []).filter((g) => Number(g.s) === season)
    if (!rows.length) continue
    const sum = (k) => rows.reduce((s, g) => s + (Number(g[k]) || 0), 0)
    const td = sum('g_td')
    const yds = p.position === 'RB' ? sum('g_ruyd') : sum('g_recyd')
    const ydsLabel = p.position === 'RB' ? 'rushing yards' : 'receiving yards'
    const marks = [
      { stat: 'touchdowns', have: td, marks: [5, 10, 15, 20], reach: 1 },
      { stat: ydsLabel, have: yds, marks: [500, 1000, 1500], reach: 60 },
    ]
    for (const m of marks) {
      const next = m.marks.find((x) => x > m.have)
      if (!next) continue
      const gap = next - m.have
      if (gap <= m.reach) out.push({ player: p, td: tdScore(p), stat: m.stat, have: m.have, next, gap, games: rows.length })
    }
  }
  return out.sort((a, b) => (a.gap / (a.next / 10)) - (b.gap / (b.next / 10))).slice(0, limit)
}

/** RED-ZONE MONSTERS. The slate's red-zone-touch leaders, with what those
 *  touches have turned into. Rates are the published per-game trailing
 *  averages (nfl_week.json stats), not a model number. */
export function redZoneMonsters(data, { limit = 5, minRz = 3 } = {}) {
  return (data?.players || [])
    .filter((p) => !p.on_bye && Number(p?.stats?.RZ) >= minRz && tdScore(p) != null)
    .map((p) => ({ player: p, td: tdScore(p), rz: Number(p.stats.RZ), gl: Number(p.stats.GL), tdPerGame: Number(p.stats.TD) }))
    .sort((a, b) => b.rz - a.rz)
    .slice(0, limit)
}
