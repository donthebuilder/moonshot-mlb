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
