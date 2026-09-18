// TWEET FEED — three automated post types built from data the site already
// publishes, on top of the existing homer feed.
//
// Donovan, 2026-09-07: "types of tweets I'd like to see automated with the
// sites data that we have." Three formatters, all posted to X and Discord
// through the same infra the homer feed already uses (postToX/postToDiscord,
// statCard, the homer_feed_posts claim table) — wired into
// app/api/dash/homers/tick/route.js as more (day, kind) slots alongside
// pairswatch/longshot/pregame. See that file for the posting/claim logic;
// this file is pure data selection and text formatting, nothing here talks
// to a network or a database.
//
//   1. HOTTEST CONTACT — tonight's batters with the hottest recent bat-
//      tracking blast rate, paired with who they actually face tonight.
//      Pure board data (recent_blast_rate), no extra pull.
//   2. DANGER COMBOS — the same hot batters paired against a pitcher who's
//      been getting hit hard lately (pitcher_hr_per_bbe — added to the bot
//      2026-09-07 specifically for this, computed over the SAME recent
//      window as the BBE count it divides by, so it doesn't mismatch a
//      season total against a recent sample; see mlb_dashboard.py).
//   3. MLB HR LEADERS BY DAY OF WEEK — not board data at all (the board only
//      knows tonight). Walks the published graded_results archive backward
//      for the last 5 dates on the SAME weekday as today (so a Monday post
//      is "MLB HR LEADERS — LAST 5 MONDAYS") and tallies real outcomes: HR
//      count + Hard Hit rate, off the FULL-LEAGUE outcome ledger (every
//      player who went deep, not just the ~90 the bot tracks — see
//      lib/ledgerArchive.js's own note on that distinction).

import { gradedResultsUrl } from '../dataSource'
import { TEAM_ABBR } from './homerFeed'
import { pickSplit, HITTING_FIELDS } from '../seasonSplit'
// 2026-09-08 (Donovan: "wire those up for automated tweets"). The ONE
// back-to-back implementation lives in lib/b2b.js -- see its own header for
// why it's been wrong three times and is never being re-implemented here.
// That file carries a 'use client' directive for its two exported REACT
// HOOKS (useSetupHomers/useBackToBack); backToBack() itself is a plain,
// non-hook function and safe to call from a Route Handler -- confirmed with
// a production `next build` before this shipped.
import { backToBack } from '../b2bCore'
import { funFacts } from '../funFacts'
import { matchupStories } from '../matchupStory'
import { impliedPct, teamAbbrs } from '../gamelogs'
import { fmtOdds, hrQuoteFor } from './homerFeed'

const txt = (v) => String(v == null ? '' : v).trim()
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null }
// Board rates are decimals (0.183, not 18.3) — see lib/hrOverlay.js's own
// `rate()`/`pct()` helpers, which do the same *100 before display.
const pct1 = (v) => { const n = num(v); return n == null ? null : Math.round(n * 1000) / 10 }

// l != null (NOT Boolean) — see the 2026-09-15 note on shrinkToFit below for
// why the difference matters here: an intentional blank-line spacer is an
// empty string, and Boolean('') is false.
const fits270 = (arr) => arr.filter((l) => l != null).join('\n').length <= 270

// 2026-09-08 (Donovan: "add recent stats to help ... anything that doesn't
// really have any stats with it"). One shared line for any post that would
// otherwise just be a bare name: last5_avg/hr/rbi are already on every board
// row, no extra pull. last5_status !== 'ok' (early season, a call-up with
// no games yet) returns '' rather than a fabricated .000.
function l5Line(row) {
  if (!row || row.last5_status !== 'ok') return ''
  const avg = num(row.last5_avg)
  if (avg == null) return ''
  const avgStr = avg.toFixed(3).replace(/^0\./, '.').replace(/^-0\./, '-.')
  const hr = num(row.last5_hr) || 0
  const rbi = num(row.last5_rbi) || 0
  // 2026-09-18 (Donovan: "short all the text on the tweets to fit more words").
  // "last 5" -> "L5" on every caller of this helper at once.
  const bits = [`${avgStr} L5`]
  if (hr > 0) bits.push(`${hr} HR`)
  if (rbi > 0) bits.push(`${rbi} RBI`)
  return bits.join(', ')
}

// Same shrink-from-the-end-not-the-top shape as pregameText/pairsToWatchText
// in homerFeed.js: drop names off the bottom of the ranking, never off #1,
// until the post fits X's 280 (we hold to 270 for the tail's margin).
//
// NO "+N more on the card" (2026-09-07, Donovan: "drop this +5 more on the
// card"). It cost 19 characters -- a whole extra name -- to announce that the
// list was incomplete, which is the one thing a leaderboard should never do.
// The lines themselves were shortened at the same time (see the formatters
// below), so the post now carries five or six names where it carried three.
// Whatever doesn't fit simply isn't in the post; the card still shows the
// full ranking for anyone who opens it.
// 2026-09-15 (Donovan: "the spacing on the tweets needs to look like the
// home runs" — comparing a cramped MLB HR LEADERS post against postText()'s
// headline/blank/event/blank/data/blank/closer shape). Every post built
// through this function was head+lines+tail jammed onto consecutive lines
// with no room to breathe, and it was never a deliberate look: both this
// function and fits270 above filtered the array with Boolean, which drops
// an empty string same as it drops null/undefined -- so even a `''` spacer
// added here would have been silently deleted before it ever reached a
// tweet. postText() in homerFeed.js never had this bug (it filters on
// `l != null`, keeping blank lines on purpose), which is exactly why that
// post already reads like "sports media" and everything through here read
// like a database dump. Now bookends the list with one blank line after
// the headline and one before the tail -- not one between every row, which
// would blow the character budget on a ten-name board -- matching the
// "header / blank / dense list / blank / tail" shape already written down
// as the house style for recap posts (claude/moonshot-tweet-format.md,
// Format 2 "Board recap").
//
// `spaced` (2026-09-15, Donovan: "there needs be space between each name") —
// opt-in, not the default, and only wired up for hrLeadersByDowText below:
// a blank line between every row is the right call on a leaderboard with a
// handful of names, but doing that unconditionally to every shrinkToFit
// caller (Hottest Contact, Danger Combos, Birthdays, ...) would fight the
// documented Format 2 shape above for posts that were never the complaint.
// The shrink loop already drops names off the bottom to hold 270 chars, so
// spacing every row just means fewer names fit before that kicks in --
// same mechanism, no separate length handling needed.
function shrinkToFit(head, lines, tail, { spaced = false } = {}) {
  const t = tail || null   // '' from an empty site/handle join means "no tail," not a blank line
  for (let n = lines.length; n >= 0; n -= 1) {
    const rows = lines.slice(0, n)
    const mid = spaced ? rows.flatMap((l) => ['', l]).slice(1) : rows
    const body = [head, mid.length ? '' : null, ...mid, t ? '' : null, t]
    if (fits270(body)) return body.filter((l) => l != null).join('\n')
  }
  return [head, t].filter((l) => l != null).join('\n')
}

// ── 1. HOTTEST CONTACT ──────────────────────────────────────────────────────

// recent_squared_up_sample is the contact-event count behind recent_blast_rate
// (see mlb_dashboard.py build_recent_bat_tracking_lookup). Below this floor a
// hot rate is one or two loud swings, not a real trend.
const BLAST_SAMPLE_FLOOR = 15

export function hottestContactPicks(rows, limit = 8) {
  const list = Array.isArray(rows) ? rows : []
  const seen = new Set()
  const out = []
  for (const r of list) {
    const pid = txt(r?.player_id)
    if (!pid || seen.has(pid)) continue
    const blast = num(r?.recent_blast_rate)
    const sample = num(r?.recent_squared_up_sample) || 0
    if (blast == null || sample < BLAST_SAMPLE_FLOOR) continue
    if (!txt(r?.pitcher_name)) continue   // no game tonight, nothing to face
    seen.add(pid)
    out.push({
      player_id: pid, name: txt(r.name), team: txt(r.team) || null,
      pitcher: txt(r.pitcher_name), pitcherTeam: txt(r.pitcher_team) || null,
      blastPct: pct1(blast),
    })
  }
  out.sort((a, b) => b.blastPct - a.blastPct)
  return out.slice(0, limit)
}

// `variant: 'mid'` reframes the SAME leaderboard for a second, later-in-the-
// day post (Donovan: "3-5 posts... mostly pregame, then a couple mid-slate")
// -- the underlying blast rates don't change once the game starts, but
// re-surfacing the list once games are actually on gets it in front of
// people who weren't looking at 1pm.
export function hottestContactText(picks, { day = '', site = '', handle = '', variant = 'pregame' } = {}) {
  if (!Array.isArray(picks) || !picks.length) return ''
  const tail = [site, handle].filter(Boolean).join(' · ')
  const head = variant === 'mid'
    ? `🔥 HOT ZONE: STILL LIT`
    : `🔥 THE HOT ZONE`
  // 63 characters a line fit three names in a 270-character post. Dropping
  // the rank number, the pitcher's team and the words "blast rate" takes the
  // line to 41 and fits five, with the ranking still implied by the order.
  const lines = picks.map((p) =>
    `${p.name}${p.team ? ` (${p.team})` : ''} ${p.blastPct}% vs ${p.pitcher}`)
  // 2026-09-15 (Donovan: "clean up like the matchup-history tweets" -- this
  // is the account's highest-frequency post, twice a day, every day, so it's
  // the most-seen tweet for a small, growing audience). `spaced: true` --
  // same blank-line-between-entries treatment as the matchup-history posts
  // -- for a phone-scannable list instead of five names run together. Costs
  // nothing here: verified against a real slate, all 5 names still fit
  // (260 chars unspaced -> 264 spaced, both under the 270 limit).
  return shrinkToFit(head, lines, tail, { spaced: true })
}

// ── 2. DANGER COMBOS ─────────────────────────────────────────────────────────

// pitcher_hr_per_bbe already comes back null below its own 5-BBE floor
// (mlb_dashboard.py), so no second floor is needed for that half.
export function dangerComboPicks(rows, limit = 5) {
  const list = Array.isArray(rows) ? rows : []
  const seen = new Set()
  const out = []
  for (const r of list) {
    const pid = txt(r?.player_id)
    if (!pid || seen.has(pid)) continue
    const blast = num(r?.recent_blast_rate)
    const sample = num(r?.recent_squared_up_sample) || 0
    const hrBbe = num(r?.pitcher_hr_per_bbe)
    if (blast == null || sample < BLAST_SAMPLE_FLOOR || hrBbe == null) continue
    if (!txt(r?.pitcher_name)) continue
    seen.add(pid)
    out.push({
      player_id: pid, name: txt(r.name), team: txt(r.team) || null,
      pitcher: txt(r.pitcher_name), pitcherTeam: txt(r.pitcher_team) || null,
      blastPct: pct1(blast), pitcherHrBbePct: pct1(hrBbe),
      // A plain sum, not a modeled score — both rates sit in roughly the same
      // 0-35% range so neither term swamps the other. This ranks a watch
      // list; it is not a probability and the tweet text does not claim to be.
      score: blast + hrBbe,
    })
  }
  out.sort((a, b) => b.score - a.score)
  return out.slice(0, limit)
}

export function dangerComboText(picks, { day = '', site = '', handle = '', variant = 'pregame' } = {}) {
  if (!Array.isArray(picks) || !picks.length) return ''
  const tail = [site, handle].filter(Boolean).join(' · ')
  const head = variant === 'mid'
    ? `☠️ KILL LIST: STILL LIVE`
    : `☠️ THE KILL LIST`
  // Both rates still ride the line -- they are the whole point of the pairing
  // -- but the rank number and the pitcher's team come off, same as above.
  const lines = picks.map((p) =>
    `${p.name}${p.team ? ` (${p.team})` : ''} ${p.blastPct}% vs ${p.pitcher} ${p.pitcherHrBbePct}% HR/BBE`)
  // 2026-09-15, same reasoning and same spacing as hottestContactText just
  // above -- this account's other 2x-daily post. Honest tradeoff, checked
  // against a real slate before shipping: the extra blank lines can cost the
  // 5th name at the 270-char limit (5 names fit unspaced at 260 chars; 4 fit
  // spaced at 263) -- accepted deliberately (Donovan, 2026-09-15) because a
  // legible 4-name list beats a cramped 5-name one for a small, growing
  // audience seeing this post twice a day.
  return shrinkToFit(head, lines, tail, { spaced: true })
}

// ── 3. MLB HR LEADERS BY DAY OF WEEK ─────────────────────────────────────────
//
// 2026-09-15, Donovan, across the day: "revert the tweet to original
// original and add L5 games stats next to their names" then "add hard hit
// alike hr/bbe and things like that ... make sure it[']s different stats
// for the players." Net design, folding both in:
//
//   - WHO the leaders are, and their headline HR count, is the weekday
//     cohort ("the mlb leaders should be the days of the week it is") --
//     the last 5 Mondays, e.g. Head stays plain "MLB HR LEADERS — MONDAYS".
//   - Each leader's line carries TWO more things: L5 (that same player's
//     own HR count over the last 5 calendar dates, any weekday -- a second,
//     separate fetch, see fetchWeekdayHrLeaders) and a SECOND stat chosen
//     PER PLAYER rather than one column repeated down the list -- Hard Hit
//     rate when it's the more notable of the two things this data actually
//     supports for him, L5 called out as the headline when it's hotter than
//     his Hard Hit rate is notable. See pickFlavorStat below for the rule.
//
// HR/BBE specifically -- a real rate stat, but it needs the player's total
// batted-ball-event count, which lives only on the bot's own ~150 tracked
// board players (mlb_dashboard.py's pitcher_hr_per_bbe is the pitcher-side
// version of the same idea). This is the FULL-LEAGUE leaderboard -- anyone
// who went deep, not just board names -- so BBE totals for most of these
// players don't exist anywhere in this pipeline yet. Flagged to Donovan
// rather than faked: this section only ever shows a number it can trace to
// a real field on hr_capture_report.all_homer_entries.

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Statcast's own published Hard Hit cutoff — not a number this file invented.
// A homer clears it the same way any other batted ball does: exit velo at or
// above 95 mph.
const HARD_HIT_EV_MPH = 95

/** Walk backward from the day before `endIso`, collecting up to `occurrences`
 * past dates that fall on `weekdayIndex` (0=Sunday, matching Date#getUTCDay). */
function pastDatesForWeekday(endIso, weekdayIndex, occurrences) {
  const out = []
  const d = new Date(`${endIso}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return out
  d.setUTCDate(d.getUTCDate() - 1)   // start from yesterday — today's slate isn't final yet
  let guard = 0
  const maxSteps = occurrences * 7 + 14   // generous bound, still nowhere near a runaway loop
  while (out.length < occurrences && guard < maxSteps) {
    guard += 1
    if (d.getUTCDay() === weekdayIndex) out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() - 1)
  }
  return out
}

/** Walk backward from the day before `endIso`, collecting up to `count`
 * calendar dates in order (most recent first) — no weekday filtering. */
function recentDates(endIso, count) {
  const out = []
  const d = new Date(`${endIso}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return out
  d.setUTCDate(d.getUTCDate() - 1)
  for (let i = 0; i < count; i += 1) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() - 1)
  }
  return out
}

async function fetchGradedHomerEntries(dates) {
  const files = await Promise.all(dates.map(async (date) => {
    try {
      const res = await fetch(gradedResultsUrl(date), { cache: 'no-store' })
      if (!res.ok) return null
      return await res.json()
    } catch { return null }
  }))
  return files.map((j) => (Array.isArray(j?.hr_capture_report?.all_homer_entries) ? j.hr_capture_report.all_homer_entries : []))
}

/**
 * Fetches up to `occurrences` graded_results_<date>.json files (same
 * weekday as `day`, most recent first) to find who leads, then a second,
 * separate `l5Games` calendar dates (any weekday) to get each of those
 * leaders' L5 total. See the section header above for why there are two
 * windows.
 *
 * `occurrences`/`l5Games` default to 5. publish_data.sh keeps the last ~150
 * graded_results files, so a bigger tally is still possible without
 * touching the 60s serverless timeout; 5 is a copy decision, not a
 * capacity one. Both windows fetch in parallel with each other and
 * internally: this posts once a day, not once a minute the way
 * homerBackfill's one-file-a-tick pacing needs to, so a small burst here
 * costs nothing extra.
 *
 * Reads hr_capture_report.all_homer_entries — the FULL-LEAGUE outcome
 * ledger (every player who went deep that game), not graded_slots (the
 * bot's own ~90 tracked candidates). See lib/ledgerArchive.js's rule #1 for
 * why that distinction matters: a leaderboard branded "MLB HR Leaders" has
 * to mean the whole league, not just the names the bot was watching.
 */
export async function fetchWeekdayHrLeaders(day, { occurrences = 5, l5Games = 5, limit = 10 } = {}) {
  const d = new Date(`${day}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return { leaders: [], dow: '', datesUsed: [] }
  const dow = WEEKDAY_NAMES[d.getUTCDay()]
  const dowDates = pastDatesForWeekday(day, d.getUTCDay(), occurrences)
  const l5Dates = recentDates(day, l5Games)
  const [dowEntryLists, l5EntryLists] = await Promise.all([
    fetchGradedHomerEntries(dowDates),
    fetchGradedHomerEntries(l5Dates),
  ])

  const byPlayer = new Map()
  const datesUsed = []
  dowEntryLists.forEach((entries, i) => {
    if (!entries.length) return
    datesUsed.push(dowDates[i])
    for (const e of entries) {
      const pid = txt(e?.player_id)
      const hr = num(e?.hr) || 0
      if (!pid || hr < 1) continue
      const cur = byPlayer.get(pid) || { name: txt(e?.name) || `#${pid}`, team: txt(e?.team) || null, hr: 0, hh: 0 }
      cur.hr += hr
      // Hard Hit — see HARD_HIT_EV_MPH above. Counted over the SAME weekday
      // window as the HR total it sits next to, so "X/Y Hard Hit" always
      // reads against the Y that's already on the line.
      const ev = num(e?.max_ev_mph)
      if (ev != null && ev >= HARD_HIT_EV_MPH) cur.hh += 1
      if (txt(e?.team)) cur.team = txt(e.team)   // a trade mid-window — last one wins
      byPlayer.set(pid, cur)
    }
  })

  // L5 (2026-09-15, Donovan: "add L5 games stats next to their names") — a
  // player's own HR count over the last `l5Games` calendar dates, computed
  // independently of the weekday cohort above, then joined onto whichever
  // players made the weekday leaderboard.
  const l5ByPid = new Map()
  l5EntryLists.forEach((entries) => {
    for (const e of entries) {
      const pid = txt(e?.player_id)
      const hr = num(e?.hr) || 0
      if (!pid || hr < 1) continue
      l5ByPid.set(pid, (l5ByPid.get(pid) || 0) + hr)
    }
  })

  const leaders = Array.from(byPlayer.entries())
    .map(([pid, p]) => ({ name: p.name, team: p.team, hr: p.hr, hh: p.hh, l5: l5ByPid.get(pid) || 0 }))
    .sort((a, b) => b.hr - a.hr || b.l5 - a.l5)
    .slice(0, limit)
  return { leaders, dow, datesUsed }
}

// 2026-09-15, Donovan: "show some stat percents and l5 hrs" — final shape.
// Both real per-player facts print on every line, not one alternating with
// the other: Hard Hit as a PERCENT of the player's own weekday-window HRs
// (not the earlier X/Y ratio), plus L5. Nothing here is a new fetch or a
// new field — hh, hr, and l5 were already computed above; this just prints
// both instead of picking one.
export function hrLeadersByDowText(leaders, dow, { day = '', site = '', handle = '' } = {}) {
  if (!Array.isArray(leaders) || !leaders.length || !dow) return ''
  const tail = [site, handle].filter(Boolean).join(' · ')
  // 2026-09-18, two changes, both from Donovan reading the live post and
  // asking what it meant ("idk if if its showing who hit the most hrs in the
  // last 5 gaems first then the 10 people on fridaty just help me under
  // stadn"). He was right to be confused -- the line carried TWO different
  // windows, neither labeled: the HR total is the last five <weekday>s, the
  // L5 is the last five calendar dates.
  //   - the head now says LAST 5 <WEEKDAY>S, so the headline number has its
  //     window attached instead of just a plural weekday.
  //   - Hard Hit is gone. Measured on the live leaderboard: it printed 100%
  //     for five of ten names and 67%+ for the rest, because virtually every
  //     home run clears Statcast's own 95mph bar -- a stat-shaped number
  //     carrying almost no information, at 19 characters a line. Dropping it
  //     takes the post from 4 names to 6 (Donovan: "i just want more names to
  //     be added to help with seo"). hh is still computed in
  //     fetchWeekdayHrLeaders and still on the object if it ever earns a spot.
  const head = `🏟️ HR LEADERS · LAST 5 ${dow.toUpperCase()}S`
  const lines = leaders.map((p) =>
    `${p.name}${p.team ? ` (${p.team})` : ''} ${p.hr} HR · L5 ${p.l5}`)
  // spaced: true (2026-09-15, Donovan: "space between each name") -- opt-in
  // on this post only, see shrinkToFit's own note on why it isn't the
  // default for every list-shaped tweet.
  return shrinkToFit(head, lines, tail, { spaced: true })
}

// ── 4. WHO IS ACTUALLY STILL PLAYABLE ───────────────────────────────────────
//
// 2026-09-07, Donovan: "it should not be tweeting things about the slate
// that's already gone off or players that are not playing anymore."
//
// Every picker above (and pregamePicks/pairsToWatch/longshotPick in
// homerFeed.js) ranks THE PUBLISHED BOARD, which is the whole day's slate as
// it looked when the bot published it that morning. Nothing in any of them
// has ever asked the live snapshot two questions it can answer:
//
//   1. Has this man's game already started, or already ended? The mid-slate
//      reposts fire at 7pm and 9pm ET and re-list the SAME board -- so a 1:05
//      getaway game that ended at 4pm was still being posted at 9pm as "still
//      cooking tonight." Same failure on the pregame side whenever `overdue`
//      lets the 4pm block run late (route.js): a cron gap turns the pregame
//      call into a post about games in the third inning.
//   2. Is he in tonight's lineup at all? A scratch, a rest day, a call-down
//      -- the board row still carries his name and last week's blast rate.
//      The snapshot knows: once `lineupPosted` is true for his game, nine men
//      a side are confirmed and anyone not among them is not playing.
//
// FAILS OPEN, DELIBERATELY. An unknown game, an abbreviation that doesn't
// join, an empty snapshot -- the row is KEPT. The cost of one stale name in a
// list is a bad tweet; the cost of a filter that silently matches nothing is
// the whole feed going quiet with no error anywhere, which is the exact shape
// of the bug this file's own header note (homer_feed_posts_kind_check) was
// written about. Loud beats silent here.

/**
 * Index the live snapshot for the two questions above.
 * Returns { byPlayer: Map<pid, game>, byTeam: Map<abbr, game>, size }.
 * The player index wins over the team index: it is exact, and it is the only
 * one that works for a player whose board abbreviation doesn't join.
 */
export function liveIndexFrom(snap) {
  const byPlayer = new Map()
  const byTeam = new Map()
  const games = Array.isArray(snap?.games) ? snap.games : []
  for (const g of games) {
    const ids = new Set()
    for (const side of ['home', 'away']) {
      for (const r of (g?.lineup?.[side] || [])) {
        const id = txt(r?.id)
        if (id) { ids.add(id); byPlayer.set(id, g) }
      }
    }
    g._lineupIds = ids
    for (const key of ['homeId', 'awayId']) {
      const abbr = TEAM_ABBR[Number(g?.[key])]
      if (abbr && !byTeam.has(abbr)) byTeam.set(abbr, g)
    }
  }
  return { byPlayer, byTeam, size: games.length }
}

/**
 * Drop the rows that shouldn't be in a post going out right now.
 *
 * phase 'pregame' — nothing that has already started or finished.
 * phase 'mid'     — games in progress are the whole point; only FINISHED
 *                   games (and postponements) come out.
 * Both phases drop a confirmed scratch: his game's lineup is posted and he
 * is not in it.
 */
export function playableRows(rows, live, phase = 'pregame') {
  const list = Array.isArray(rows) ? rows : []
  if (!live || !live.size) return list
  return list.filter((r) => {
    const pid = txt(r?.player_id)
    const abbr = txt(r?.team).toUpperCase()
    const g = (pid && live.byPlayer.get(pid)) || live.byTeam.get(abbr) || null
    if (!g) return true                                   // unknown → keep
    if (g.postponed || g.suspended) return false
    const state = txt(g.state)
    if (state === 'Final') return false                   // already gone off
    if (phase === 'pregame' && state === 'Live') return false
    // A posted lineup is nine men a side (lib/liveSlate.js readLineup). Only
    // then does "not in it" mean anything; before that it means "not entered
    // yet", which is not a scratch.
    if (g.lineupPosted && pid && g._lineupIds && !g._lineupIds.has(pid)) return false
    return true
  })
}
// ── 4. BACK-TO-BACK WATCH ────────────────────────────────────────────────────
// dateKey is the slate day; passing it lets backToBack() prove every chase
// off each row's own last_game_date/last_game_hr, so no live-feed setupHr
// Set is needed here -- this can run purely off the board, same as the three
// pickers above.
export function backToBackPicks(rows, day, limit = 10) {
  const { list } = backToBack(Array.isArray(rows) ? rows : [], null, (p) => num(p?.hr_score) || 0, day)
  const seen = new Set()
  const out = []
  for (const p of list) {
    const pid = txt(p?.player_id)
    if (!pid || seen.has(pid)) continue
    seen.add(pid)
    out.push({
      player_id: pid, name: txt(p.name), team: txt(p.team) || null,
      last5_avg: p.last5_avg, last5_hr: p.last5_hr, last5_rbi: p.last5_rbi, last5_status: p.last5_status,
    })
    if (out.length >= limit) break
  }
  return out
}

export function backToBackText(picks, { day = '', site = '', handle = '' } = {}) {
  if (!Array.isArray(picks) || !picks.length) return ''
  const tail = [site, handle].filter(Boolean).join(' · ')
  const head = `🔁 BACK-TO-BACK WATCH`
  const lines = picks.map((p) => {
    const l5 = l5Line(p)
    // "went deep last time out" was 24 characters restating the headline on
    // every single line -- it cost three names (2 fit, 5 fit without it).
    return `${p.name}${p.team ? ` (${p.team})` : ''}${l5 ? ` · ${l5}` : ''}`
  })
  // 2026-09-15 (Donovan: "clean up like the matchup-history tweets" -- the
  // once-a-day formatting batch, see hottestContactText/dangerComboText for
  // the twice-a-day pair that shipped first).
  return shrinkToFit(head, lines, tail, { spaced: true })
}

// ── 5. FUN FACTS ─────────────────────────────────────────────────────────────
// Thin wrapper around lib/funFacts.js's own funFacts() -- every clause it
// returns is already counted from a real published sample (see that file's
// header, "THE HONESTY RULES"); nothing here invents or reformats a number,
// only picks the icon+text pairs and fits them to a post.
export async function funFactsPicks(rows, day, limit = 4) {
  const facts = await funFacts(Array.isArray(rows) ? rows : [], { slateDate: day, limit }).catch((err) => {
    console.error('[tweetFeed] funFacts failed', err)
    return []
  })
  return Array.isArray(facts) ? facts : []
}

export function funFactsText(facts, { day = '', site = '', handle = '' } = {}) {
  if (!Array.isArray(facts) || !facts.length) return ''
  const tail = [site, handle].filter(Boolean).join(' · ')
  const head = `🤯 FUN FACTS`
  const lines = facts.map((f) => `${f?.icon || ''} ${f?.text || ''}`.trim()).filter(Boolean)
  return shrinkToFit(head, lines, tail, { spaced: true })
}
// ── 6. THE FOUR ──────────────────────────────────────────────────────────────
// One name from each of the board's four scored categories -- hr_score,
// hit_score, hrr_score, contact_score -- the same four numbers the site's own
// role badges are built from (lib/roleBadge.js TIERS: hr_bet/hr_lean, hit,
// hrr, contact). Pure board data, no extra pull. Posts only when all four
// categories actually produced a name -- never "the three".
export function theFourPicks(rows) {
  const list = Array.isArray(rows) ? rows : []
  const topBy = (field) => list
    .filter((r) => txt(r?.player_id) && num(r?.[field]) != null && txt(r?.pitcher_name))
    .sort((a, b) => num(b[field]) - num(a[field]))[0] || null
  const cats = [
    { key: 'HR', field: 'hr_score' },
    { key: 'HIT', field: 'hit_score' },
    { key: 'HRR', field: 'hrr_score' },
    { key: 'CONTACT', field: 'contact_score' },
  ]
  const out = []
  for (const { key, field } of cats) {
    const r = topBy(field)
    if (!r) return []
    out.push({
      key, name: txt(r.name), pitcher: txt(r.pitcher_name), score: Math.round(num(r[field]) * 10) / 10,
      last5_avg: r.last5_avg, last5_hr: r.last5_hr, last5_rbi: r.last5_rbi, last5_status: r.last5_status,
    })
  }
  return out
}

export function theFourText(picks, { day = '', site = '', handle = '' } = {}) {
  if (!Array.isArray(picks) || picks.length < 4) return ''
  const tail = [site, handle].filter(Boolean).join(' · ')
  const head = `🎯 THE FOUR`
  const lines = picks.map((p) => {
    const l5 = l5Line(p)
    return `${p.key}: ${p.name} vs ${p.pitcher} ${p.score}${l5 ? ` · ${l5}` : ''}`
  })
  return shrinkToFit(head, lines, tail, { spaced: true })
}

// ── 7. BEST AIR TONIGHT ──────────────────────────────────────────────────────
// weather_label is already a pre-formatted sentence off the same weather
// pipeline lib/conditions.js's airGlance renders on the site's own game
// cards -- this doesn't reformat wind/temp/roof, it posts the line that
// already exists. Ranks by weather_hr_effect_pct when the slate actually
// has weather; falls back to park_hr_factor alone on a night no game has a
// forecast yet (weather_has_data false everywhere).
export function bestAirPicks(rows, limit = 3) {
  const list = Array.isArray(rows) ? rows : []
  const byGame = new Map()
  for (const r of list) {
    const gp = r?.game_pk
    if (!gp || byGame.has(gp)) continue
    if (!txt(r?.team) || !txt(r?.opponent) || !txt(r?.venue_name)) continue
    byGame.set(gp, r)
  }
  const games = [...byGame.values()]
  const withWeather = games.filter((g) => g.weather_has_data && num(g.weather_hr_effect_pct) != null)
  const pool = withWeather.length ? withWeather : games.filter((g) => num(g.park_hr_factor) != null)
  const rankVal = (g) => (withWeather.length ? num(g.weather_hr_effect_pct) : num(g.park_hr_factor))
  const ranked = pool.slice().sort((a, b) => rankVal(b) - rankVal(a))
  return ranked.slice(0, limit).map((g) => ({
    venue: txt(g.venue_name), matchup: `${txt(g.team)} @ ${txt(g.opponent)}`,
    label: txt(g.weather_label) || null,
  }))
}

export function bestAirText(picks, { day = '', site = '', handle = '' } = {}) {
  if (!Array.isArray(picks) || !picks.length) return ''
  const tail = [site, handle].filter(Boolean).join(' · ')
  const head = `🌋 BEST AIR TONIGHT`
  const lines = picks.map((p) => `${p.venue} · ${p.matchup}${p.label ? ` · ${p.label}` : ''}`)
  return shrinkToFit(head, lines, tail, { spaced: true })
}

// ── 8. STORYLINES (pitcher trend) ────────────────────────────────────────────
// pitcher_l3_hr9 -- the exact field Donovan's own hand-drafted "TREND: Lodolo
// -- 2.70 HR/9 over his last three starts" line was built from off a
// screenshot (same name, same number, confirmed against the live board).
// Requires 3 real starts found so an arm who just came off the IL never gets
// tagged off a 1-start sample.
export function storylinesPicks(rows, limit = 3) {
  const list = Array.isArray(rows) ? rows : []
  const seen = new Set()
  const out = []
  for (const r of list.slice().sort((a, b) => num(b?.pitcher_l3_hr9) - num(a?.pitcher_l3_hr9))) {
    const pid = txt(r?.pitcher_id)
    if (!pid || seen.has(pid)) continue
    const l3 = num(r?.pitcher_l3_hr9)
    const starts = num(r?.pitcher_l3_starts_found) || 0
    if (l3 == null || l3 <= 0 || starts < 3) continue
    seen.add(pid)
    out.push({ pitcher: txt(r.pitcher_name), l3hr9: Math.round(l3 * 100) / 100, team: txt(r.pitcher_team) || null })
    if (out.length >= limit) break
  }
  return out
}

export function storylinesText(picks, { day = '', site = '', handle = '' } = {}) {
  if (!Array.isArray(picks) || !picks.length) return ''
  const tail = [site, handle].filter(Boolean).join(' · ')
  const head = `💣 STORYLINES`
  // "TREND:" and "over his last three starts" were 33 characters of boilerplate
  // per line; "L3" says the same thing the rest of this account already uses.
  const lines = picks.map((p) => `${p.pitcher}${p.team ? ` (${p.team})` : ''} ${p.l3hr9} HR/9 L3`)
  return shrinkToFit(head, lines, tail, { spaced: true })
}

// ── 9. THE CALL OF THE NIGHT ─────────────────────────────────────────────────
// One editorial pick a night, three real numbers instead of an adjective:
//   EDGE        his hr_score gap over the #2 name, in standard deviations of
//               tonight's own hr_score spread (not a fixed threshold — a
//               tight board reads as a tight EDGE, honestly).
//   PARK+WEATHER his own game's percentile among tonight's park_hr_factor
//               spread (top or bottom -- a top pick having the worst park
//               tonight is a real, sayable fact, not something to hide).
//   PRICE       his own HR odds if the odds file has a quote, run through
//               lib/gamelogs.js's own impliedPct (the same math the props
//               grid already uses) for the breakeven hit rate.
// Silent about whichever of the three it can't back with a real number
// (no odds quote yet, or too few park_hr_factor values to rank) rather than
// filling the gap with something invented.
export function callOfTheNightPick(rows, odds, day) {
  const list = (Array.isArray(rows) ? rows : [])
    .filter((r) => txt(r?.player_id) && num(r?.hr_score) != null)
    .sort((a, b) => num(b.hr_score) - num(a.hr_score))
  if (list.length < 2) return null
  const top = list[0]
  const second = list[1]
  const scores = list.map((r) => num(r.hr_score))
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length
  const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length
  const sd = Math.sqrt(variance)
  const edgeSd = sd ? Math.round(((num(top.hr_score) - num(second.hr_score)) / sd) * 10) / 10 : null

  const factors = list.map((r) => num(r.park_hr_factor)).filter((v) => v != null).sort((a, b) => a - b)
  let pct = null
  if (factors.length >= 5 && num(top.park_hr_factor) != null) {
    const below = factors.filter((v) => v <= num(top.park_hr_factor)).length
    pct = Math.round((below / factors.length) * 100)
  }

  const q = hrQuoteFor(odds, top.player_id, top.name, day)
  const implied = q ? impliedPct(q.over) : null
  const price = q && implied != null ? { odds: fmtOdds(q.over), book: q.book, breakeven: Math.round(implied) } : null

  return {
    name: txt(top.name), team: txt(top.team) || null, pitcher: txt(top.pitcher_name) || null,
    edgeSd, pct, price,
  }
}

export function callOfTheNightText(pick, { day = '', site = '', handle = '' } = {}) {
  if (!pick) return ''
  const tail = [site, handle].filter(Boolean).join(' · ')
  const head = `👀 THE CALL OF THE NIGHT`
  const who = `${pick.name}${pick.pitcher ? ` vs ${pick.pitcher}` : ''} tonight.`
  const parkLine = pick.pct != null
    ? `PARK+WEATHER: ${pick.pct >= 50 ? 'top' : 'bottom'} ${pick.pct >= 50 ? 100 - pick.pct : pick.pct}% of the slate`
    : null
  const lines = [
    who,
    pick.edgeSd != null ? `EDGE: ${pick.edgeSd} SD clear of the next name on the board` : null,
    parkLine,
    pick.price ? `PRICE: ${pick.price.odds} · ${pick.price.book} · needs to hit ${pick.price.breakeven}% of the time to cash` : null,
  ].filter(Boolean)
  return shrinkToFit(head, lines, tail, { spaced: true })
}

// ── 10. MATCHUP LINES ────────────────────────────────────────────────────────
// Thin wrapper around lib/matchupStory.js's own matchupStories() -- the
// two-sided batter-at-this-park / pitcher-at-this-park sentence the site's
// Storylines panel already builds live off real game logs (see that file's
// own honesty rules — a claim that can't be checked isn't made). Nothing
// here computes a number; it only formats what that function returns.
export async function matchupLinesPicks(rows, limit = 3) {
  const stories = await matchupStories(Array.isArray(rows) ? rows : [], { limit }).catch((err) => {
    console.error('[tweetFeed] matchupStories failed', err)
    return []
  })
  return Array.isArray(stories) ? stories : []
}

export function matchupLinesText(stories, { day = '', site = '', handle = '' } = {}) {
  if (!Array.isArray(stories) || !stories.length) return ''
  const tail = [site, handle].filter(Boolean).join(' · ')
  const head = `⚔️ MATCHUP LINES`
  const lines = stories.map((s) => s?.text).filter(Boolean)
  return shrinkToFit(head, lines, tail, { spaced: true })
}

// ── 11. STREAKS ───────────────────────────────────────────────────────────────
// lib/funFacts.js's own fStreak already computes this (consecutive games
// with a hit, off the same gameLog the props grid uses) -- it just isn't
// always the single highest-`fun` fact on a given night, so a plain
// funFacts() call at its normal small limit can bury it under a hotter
// nemesis/park fact. Asking for more facts than any post would ever use and
// filtering to the streak entry gets the same real number without
// re-implementing the count.
export async function streaksPick(rows, day) {
  const facts = await funFactsPicks(rows, day, 12)
  return facts.find((f) => f?.key === 'streak') || null
}

export function streaksText(pick, { day = '', site = '', handle = '' } = {}) {
  if (!pick || !pick.text) return ''
  const tail = [site, handle].filter(Boolean).join(' · ')
  const head = `🔥 STREAK WATCH`
  return shrinkToFit(head, [pick.text], tail)
}

// ── 12. MATCHUP HISTORY (2026-09-15) ─────────────────────────────────────────
// Donovan: someone requested "players with a HR against tonight's starter" as
// a tweet; approved as two formats ("has a HR" and "who owns him") after
// confirming MLB's own StatsAPI carries the real number -- stats=vsPlayer&
// opposingPlayerId=..., the vsPlayerTotal split inside the response, career
// AB/H/HR against that exact pitcher. No model score, nothing computed,
// nothing invented: verified live 2026-09-15 against Manny Machado vs Kyle
// Freeland (54 AB, 17 H, 0 HR) -- matches MLB's own published career splits.
//
// TWO WAVES, NOT ONE SLATE-WIDE SNAPSHOT (Donovan: "this can fire later in
// the day or middle slate for a later game"). Confirmed lineups don't all
// land at once -- early games post first, night-cap and West Coast games
// often not until a few hours before their own first pitch -- so one fetch
// pregame either fires too early and misses half the slate's lineups, or
// waits so long the early games' trivia is stale by the time it posts. Both
// formats below take an `exclude` set of player_ids already featured
// earlier that day, read back from the day-wave's own stored payload (same
// "read the payload back" pattern boardRoleResultsText's caller already uses
// for pregame/board) -- so the late wave adds new names instead of repeating
// the morning's post.

// Same shape as lib/leaders.js's own pool(): MLB's public API is fine with a
// handful of concurrent requests, not "every confirmed hitter on the slate
// fired at once" -- a bare Promise.all over 100+ pairs risks 429s for no
// real speed gain inside the tick's 60s budget.
async function pool(items, width, fn) {
  const out = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]) }
  }))
  return out
}

const VS_PITCHER_CONCURRENCY = 8

/**
 * Confirmed-lineup rows -> real career lines against tonight's ACTUAL
 * starter (r.pitcher_id -- board.js KEEP, 2026-09-15, added for exactly
 * this). `exclude` skips player_ids already featured in an earlier wave
 * today. Fails open per-pair: one bad fetch drops one player, never the
 * whole post.
 */
export async function vsPitcherCareerLines(rows, { exclude } = {}) {
  const skip = exclude instanceof Set ? exclude : new Set()
  const seen = new Set()
  const pairs = []
  for (const r of Array.isArray(rows) ? rows : []) {
    const pid = txt(r?.player_id)
    const pitcherId = txt(r?.pitcher_id)
    // Only a CONFIRMED lineup slot -- a projected batting order is a guess
    // about who plays, and this post states as fact that he faces this man
    // tonight, not just that the model expects him to.
    if (!pid || !pitcherId || skip.has(pid) || seen.has(pid) || r?.lineup_confirmed !== true) continue
    seen.add(pid)
    pairs.push({
      player_id: pid, name: txt(r.name), team: txt(r.team) || null,
      pitcher_id: pitcherId, pitcher: txt(r.pitcher_name) || null,
    })
  }
  const lines = await pool(pairs, VS_PITCHER_CONCURRENCY, async (p) => {
    try {
      const url = `https://statsapi.mlb.com/api/v1/people/${p.player_id}/stats?stats=vsPlayer&opposingPlayerId=${p.pitcher_id}&group=hitting&season=0`
      const res = await fetch(url, { cache: 'no-store' }).catch(() => null)
      if (!res?.ok) return null
      const json = await res.json().catch(() => null)
      const st = (json?.stats || []).find((s) => s?.type?.displayName === 'vsPlayerTotal')?.splits?.[0]?.stat
      const ab = Number(st?.atBats) || 0
      if (!st || ab <= 0) return null   // never faced him -- nothing to report, not a 0-for-0 "line"
      const h = Number(st.hits) || 0
      const avgNum = Number(st.avg)
      return { ...p, ab, h, hr: Number(st.homeRuns) || 0, avg: Number.isFinite(avgNum) ? avgNum : (ab ? h / ab : 0) }
    } catch { return null }
  })
  return lines.filter(Boolean)
}

/** Tag repeats the way the requested screenshot did: bare name once, "2x"/"3x" after. */
export function hrVsStarterPicks(lines, limit = 12) {
  return (Array.isArray(lines) ? lines : [])
    .filter((l) => l.hr >= 1)
    .sort((a, b) => b.hr - a.hr || b.ab - a.ab)
    .slice(0, limit)
}

// Pure trivia, no model framing -- nothing was called, so no "CALLED IT"
// sign-off; the DASH mark in the tail is enough of a brand touch.
export function hrVsStarterText(picks, { day = '', site = '', handle = '', wave = 'day' } = {}) {
  if (!Array.isArray(picks) || !picks.length) return ''
  const tail = [site, handle].filter(Boolean).join(' · ')
  const head = wave === 'late'
    ? `⚾ HR HISTORY — LATE SLATE`
    : `⚾ HAS A HR VS THE STARTER`
  const lines = picks.map((p) => `${p.name}${p.team ? ` (${p.team})` : ''}${p.hr > 1 ? ` — ${p.hr}x` : ''}`)
  return shrinkToFit(head, lines, tail, { spaced: true })
}

// Real sample floor before a career AVG means anything -- a 2-for-2 headlined
// as "who owns him" is the same small-sample trap flagged against the
// day-of-week idea in the same conversation: the number would be real, the
// implied pattern wouldn't be. Ten AB is the common sports-broadcast floor
// for showing a BvP average on air; matched here rather than inventing a
// a separate bar.
const CAREER_LINE_MIN_AB = 10

export function careerVsStarterPicks(lines, limit = 6) {
  return (Array.isArray(lines) ? lines : [])
    .filter((l) => l.ab >= CAREER_LINE_MIN_AB)
    .sort((a, b) => b.avg - a.avg || b.ab - a.ab)
    .slice(0, limit)
}

export function careerVsStarterText(picks, { day = '', site = '', handle = '', wave = 'day' } = {}) {
  if (!Array.isArray(picks) || !picks.length) return ''
  const tail = [site, handle].filter(Boolean).join(' · ')
  const head = wave === 'late'
    ? `📊 WHO OWNS HIM — LATE SLATE`
    : `📊 WHO OWNS HIM`
  const lines = picks.map((p) => {
    const avgStr = p.avg.toFixed(3).replace(/^0\./, '.').replace(/^-0\./, '-.')
    return `${p.name}${p.team ? ` (${p.team})` : ''} ${p.h}-for-${p.ab}${p.pitcher ? ` vs ${p.pitcher}` : ''} (${avgStr})`
  })
  return shrinkToFit(head, lines, tail, { spaced: true })
}

// ── MILESTONE WATCH (2026-09-15, Donovan: "milestone emoji title then
// players with stats," two posts a day, two different sets of players) ──
//
// This is NOT a new computation. It is components/Storylines.js's own
// milestone tracker (S_MILES/C_MILES/readStat, the exact same rungs, the
// same pickSplit() traded-player fix from lib/seasonSplit.js, the same
// "closest rung only, one row per player" rule) made callable from a cron
// instead of a browser tab. If the rungs ever change on the site, change
// them here too -- these two lists are deliberately identical, not derived
// from one another.
//
// `exclude` is what keeps the two daily posts (AM/mid) from naming the same
// player twice -- the tick route passes the AM wave's player_ids into the
// mid wave's call, same exclude-set shape as vsPitcherCareerLines above.
const S_MILES = [
  { key: 'hits', targets: [100, 150, 200], within: 3, word: 'hits' },
  { key: 'homeRuns', targets: [20, 30, 40, 50, 60], within: 2, word: 'homers' },
  { key: 'rbi', targets: [50, 75, 100, 125, 150], within: 4, word: 'RBI' },
  { key: 'runs', targets: [50, 75, 100, 125], within: 4, word: 'runs' },
  { key: 'stolenBases', targets: [20, 30, 40, 50], within: 2, word: 'steals' },
  { key: 'doubles', targets: [30, 40, 50], within: 2, word: 'doubles' },
  { key: 'triples', targets: [10, 15], within: 1, word: 'triples' },
  { key: 'totalBases', targets: [200, 250, 300, 350, 400], within: 8, word: 'total bases' },
  { key: 'xbh', targets: [50, 60, 70, 80], within: 2, word: 'extra-base hits' },
]
const C_MILES = [
  { key: 'hits', targets: [500, 1000, 1500, 2000, 2500, 3000], within: 5, word: 'career hits' },
  { key: 'homeRuns', targets: Array.from({ length: 14 }, (_, i) => 50 + i * 50), within: 2, word: 'career homers' },
  { key: 'rbi', targets: [500, 1000, 1500, 2000], within: 5, word: 'career RBI' },
  { key: 'runs', targets: [500, 1000, 1500, 2000], within: 5, word: 'career runs' },
  { key: 'doubles', targets: [200, 300, 400, 500], within: 3, word: 'career doubles' },
  { key: 'triples', targets: [50, 100], within: 2, word: 'career triples' },
  { key: 'totalBases', targets: [1000, 2000, 3000, 4000, 5000], within: 10, word: 'career total bases' },
  { key: 'xbh', targets: [300, 500, 700, 1000], within: 4, word: 'career extra-base hits' },
]
const readMileStat = (st, key) => {
  if (!st) return NaN
  if (key === 'xbh') return (Number(st.doubles) || 0) + (Number(st.triples) || 0) + (Number(st.homeRuns) || 0)
  return Number(st[key])
}
const MILESTONE_BATCH = 100

/**
 * Board rows -> real season/career milestone candidates, one per player
 * (nearest rung only), sorted the same way Storylines.js orders them: by
 * how far through its own cutoff window it is, not by raw distance -- so a
 * tight-window stat (2 homers from 40) can rank above a wide-window one (8
 * hits from 500). Same real MLB StatsAPI hydrate call the site already
 * makes for this panel, batched 100 ids at a time. `exclude` drops
 * player_ids already named in an earlier post today.
 */
export async function milestonePicks(rows, { exclude } = {}) {
  const skip = exclude instanceof Set ? exclude : new Set()
  const list = Array.isArray(rows) ? rows : []
  const byId = new Map()
  for (const r of list) {
    const pid = txt(r?.player_id)
    if (pid && !skip.has(pid) && !byId.has(pid)) byId.set(pid, r)
  }
  const ids = [...byId.keys()]
  if (!ids.length) return []
  const people = []
  for (let i = 0; i < ids.length; i += MILESTONE_BATCH) {
    const batch = ids.slice(i, i + MILESTONE_BATCH)
    try {
      const url = `https://statsapi.mlb.com/api/v1/people?personIds=${batch.join(',')}&hydrate=stats(group=[hitting],type=[career,season])&fields=people,id,stats,type,displayName,splits,team,gameType,stat,${HITTING_FIELDS}`
      const res = await fetch(url, { cache: 'no-store' }).catch(() => null)
      if (!res?.ok) continue
      const json = await res.json().catch(() => null)
      for (const person of (json?.people || [])) people.push(person)
    } catch { /* one batch failing drops those players, never the whole post */ }
  }
  const miles = []
  for (const person of people) {
    const r = byId.get(txt(person?.id))
    if (!r) continue
    const season = pickSplit((person.stats || []).find((s) => s?.type?.displayName === 'season'))
    const career = pickSplit((person.stats || []).find((s) => s?.type?.displayName === 'career'))
    const base = { player_id: txt(r.player_id), name: txt(r.name), team: txt(r.team) || null }
    for (const m of S_MILES) {
      const v = readMileStat(season, m.key)
      if (!Number.isFinite(v)) continue
      for (const t of m.targets) {
        const need = t - v
        if (need > 0 && need <= m.within) miles.push({ ...base, need, t, within: m.within, word: `${m.word} this season`, prox: need / m.within })
      }
    }
    for (const m of C_MILES) {
      const v = readMileStat(career, m.key)
      if (!Number.isFinite(v)) continue
      for (const t of m.targets) {
        const need = t - v
        if (need > 0 && need <= m.within) miles.push({ ...base, need, t, within: m.within, word: m.word, prox: need / m.within })
      }
    }
  }
  // ONE ROW PER PLAYER, closest rung first -- same fix Storylines.js already
  // made (2026-08-09) for the same reason: without it a hitter near a homer
  // number AND an RBI number could take two rows.
  miles.sort((a, b) => a.prox - b.prox)
  const seen = new Set()
  const out = []
  for (const m of miles) {
    if (seen.has(m.player_id)) continue
    seen.add(m.player_id)
    out.push(m)
  }
  return out
}

export function milestoneText(picks, { day = '', site = '', handle = '', wave = 'am' } = {}) {
  if (!Array.isArray(picks) || !picks.length) return ''
  const tail = [site, handle].filter(Boolean).join(' · ')
  const head = wave === 'mid'
    ? `🏁 MILESTONE WATCH — STILL CHASING`
    : `🏁 MILESTONE WATCH`
  // 2026-09-15 (Donovan: no card for this one anymore -- "a decent list of
  // names on tweet so people can screenshot and share"). Two changes from
  // the original phrasing: no longer pre-trims to 6 (shrinkToFit decides how
  // many fit), AND the line itself is terser -- "is N away from" plus a
  // "could land today" flourish on every 1-away player was costing enough
  // characters that only 2-3 names ever actually fit under 270 regardless of
  // the pre-trim. The card-style "— N from TARGET" phrasing carries the same
  // information in roughly a third fewer characters, which is what actually
  // buys the longer list he asked for.
  const lines = picks.map((p) =>
    `${p.name}${p.team ? ` (${p.team})` : ''} · ${p.need} from ${p.t.toLocaleString('en-US')} ${p.word}`)
  return shrinkToFit(head, lines, tail, { spaced: true })
}

// ── STORYLINE WATCH, FOUR WAVES (2026-09-15, Donovan: "storylines post 4 a
// day once slate starts for games that havent started") ──
//
// Reuses the two real "human layer" categories already wired at 8am/1pm --
// matchupLinesPicks (lib/matchupStory.js) and funFactsPicks (lib/funFacts.js)
// -- rather than inventing a fourth category. Pass it pregameRows() from the
// tick route (playableRows(..., 'pregame'), the same filter pregame/board/
// matchup-history already use) so it only ever names a game that hasn't
// started, and pass `exclude` (exact text already posted today, across
// matchuplines/funfacts AND any earlier wave) so four posts never say the
// same thing twice. Pulls a wider pool than the 8am/1pm posts do (more
// candidates in, so there is something left after the exclude filter runs)
// and returns whichever real lines/facts survive it -- never pads with a
// repeat to hit a target count.
export async function storylineWatchPicks(rows, day, { exclude } = {}) {
  const skip = exclude instanceof Set ? exclude : new Set()
  const [stories, facts] = await Promise.all([
    matchupLinesPicks(rows, 8).catch(() => []),
    funFactsPicks(rows, day, 10).catch(() => []),
  ])
  const lines = (stories || [])
    .filter((s) => s?.text && !skip.has(s.text))
    .map((s) => ({ kind: 'line', text: s.text }))
  const ffacts = (facts || [])
    .filter((f) => f?.text && !skip.has(`${f?.icon || ''} ${f.text}`.trim()))
    .map((f) => ({ kind: 'fact', text: `${f?.icon || ''} ${f.text}`.trim() }))
  // Interleaved, not lines-then-facts, so a post that only fits a few
  // entries (shrinkToFit trims from the end) doesn't systematically drop
  // every fun fact in favor of matchup lines.
  const out = []
  const max = Math.max(lines.length, ffacts.length)
  for (let i = 0; i < max; i++) {
    if (lines[i]) out.push(lines[i])
    if (ffacts[i]) out.push(ffacts[i])
  }
  return out
}

export function storylineWatchText(picks, { day = '', site = '', handle = '', slot = 1 } = {}) {
  if (!Array.isArray(picks) || !picks.length) return ''
  const tail = [site, handle].filter(Boolean).join(' · ')
  const head = `📖 STORYLINE WATCH`
  const lines = picks.map((p) => p.text).filter(Boolean)
  return shrinkToFit(head, lines, tail, { spaced: true })
}

// ── REVENGE GAMES + GIVEAWAYS, ONE COMBINED POST (2026-09-15, Donovan:
// "thing else post in a combined tweet") ──
//
// Ported from components/Storylines.js's own revenge/giveaway blocks --
// same real MLB StatsAPI yearByYear team-history hydrate, same teamAbbrs()
// helper (lib/gamelogs.js, already used elsewhere), same real schedule
// promotions hydrate, same 4-season recency gate on revenge and the same
// "player-oriented only" giveaway curation (a bobblehead/jersey/replica, or
// a generic giveaway matched to a home player's own surname -- never a
// plain team-logo tee). Nothing here is a new computation.
const REVENGE_RECENCY_SEASONS = 4

export async function revengeGiveawayPicks(rows, day) {
  const list = Array.isArray(rows) ? rows : []
  const byId = new Map()
  for (const r of list) {
    const pid = txt(r?.player_id)
    if (pid && !byId.has(pid)) byId.set(pid, r)
  }
  const ids = [...byId.keys()]
  if (!ids.length) return { revenge: [], giveaways: [] }

  // yearByYear team history, batched exactly like milestonePicks's season/
  // career pull above.
  const history = {}
  for (let i = 0; i < ids.length; i += MILESTONE_BATCH) {
    const batch = ids.slice(i, i + MILESTONE_BATCH)
    try {
      const url = `https://statsapi.mlb.com/api/v1/people?personIds=${batch.join(',')}&hydrate=stats(group=[hitting],type=[yearByYear])&fields=people,id,stats,type,displayName,splits,season,team,id,name`
      const res = await fetch(url, { cache: 'no-store' }).catch(() => null)
      if (!res?.ok) continue
      const json = await res.json().catch(() => null)
      for (const person of (json?.people || [])) {
        const blk = (person.stats || []).find((s) => s?.type?.displayName === 'yearByYear')
        history[String(person.id)] = (blk?.splits || [])
          .map((sp) => ({ season: sp.season, teamId: sp?.team?.id }))
          .filter((x) => x.teamId)
      }
    } catch { /* one batch failing drops those players, never the whole post */ }
  }
  const abbrs = (await teamAbbrs().catch(() => null)) || {}

  // ── revenge games — facing a team he used to wear, last 4 seasons ──
  const thisYear = Number(String(day).slice(0, 4)) || new Date().getFullYear()
  const revenge = []
  for (const [pid, r] of byId) {
    const hist = history[pid] || []
    if (!hist.length) continue
    const own = txt(r?.team) || txt(r?.team_abbr) || txt(r?.batting_team) || ''
    const opp = txt(r?.opponent) || txt(r?.opp) || txt(r?.pitcher_team) || ''
    if (!own || !opp || opp === own) continue
    const yrs = hist.filter((x) => abbrs[x.teamId] === opp).map((x) => Number(x.season))
    const recent = yrs.filter((y) => y >= thisYear - REVENGE_RECENCY_SEASONS)
    if (recent.length) {
      const span = recent.length > 1 ? `${Math.min(...recent)}–${String(Math.max(...recent)).slice(2)}` : String(recent[0])
      revenge.push({ player_id: pid, name: txt(r.name), team: own, opp, span, last: Math.max(...recent) })
    }
  }
  revenge.sort((a, b) => b.last - a.last)

  // ── giveaways — tonight's real promotions schedule, player-oriented only ──
  const byTeamSurname = new Map()
  for (const r of list) {
    const tm = (txt(r?.team) || txt(r?.team_abbr) || txt(r?.batting_team) || '').toUpperCase()
    const ln = txt(r?.name).split(' ').slice(-1)[0].toLowerCase()
    if (!tm || ln.length <= 3) continue
    const k = `${tm}|${ln}`
    if (byTeamSurname.has(k)) byTeamSurname.set(k, null)   // collision: unresolvable
    else byTeamSurname.set(k, r)
  }
  const giveaways = []
  try {
    const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${day}&hydrate=game(promotions)`
    const res = await fetch(url, { cache: 'no-store' }).catch(() => null)
    const json = res?.ok ? await res.json().catch(() => null) : null
    for (const g of json?.dates?.[0]?.games || []) {
      const homeAbbr = txt(abbrs[g?.teams?.home?.team?.id]).toUpperCase()
      for (const pr of g.promotions || []) {
        const nm = txt(pr.name)
        const isBobble = /bobble/i.test(nm)
        if (pr.offerType !== 'Giveaway' && !isBobble) continue
        let star = null
        if (homeAbbr) {
          const low = nm.toLowerCase()
          for (const [k, r] of byTeamSurname) {
            if (!r || !k.startsWith(`${homeAbbr}|`)) continue
            if (low.includes(k.slice(homeAbbr.length + 1))) { star = r; break }
          }
        }
        if (star || isBobble || /jersey|replica|figurine|poster|card|banner|ring|trophy/i.test(nm)) {
          giveaways.push({ home: g?.teams?.home?.team?.name || '', name: nm, isBobble, star: star ? { name: txt(star.name), team: txt(star.team) } : null })
        }
      }
    }
  } catch { /* no promotions data today -- an empty list, never an invented one */ }
  giveaways.sort((a, b) => (b.star ? 1 : 0) - (a.star ? 1 : 0) || (b.isBobble ? 1 : 0) - (a.isBobble ? 1 : 0))

  return { revenge, giveaways }
}

export function revengeGiveawayText({ revenge = [], giveaways = [] } = {}, { day = '', site = '', handle = '' } = {}) {
  const lines = [
    // 2026-09-15 (Donovan: no card for this one either -- same "decent list
    // of names" ask). No longer pre-trimmed to 4 revenge + 3 giveaways, AND
    // dropped the "revenge games are theater, and theater sells" flourish --
    // fine once as a single highlight, wasteful repeated on every line when
    // the goal is fitting more real names under 270 chars.
    ...revenge.map((r) => `${r.name}${r.team ? ` (${r.team})` : ''} vs ${r.opp} · ${r.span}`),
    ...giveaways.map((g) => `🎁 ${g.home}: ${g.name}${g.star ? ` · ${g.star.name}` : ''}`),
  ]
  if (!lines.length) return ''
  const tail = [site, handle].filter(Boolean).join(' · ')
  const head = `😤 REVENGE & GIVEAWAYS`
  return shrinkToFit(head, lines, tail, { spaced: true })
}

// ── IS THE BOARD'S PITCHER COLUMN ACTUALLY TONIGHT'S? (2026-09-18) ───────────
//
// Donovan: "THE TWEETS are sending out yesterday's information again."
//
// What happened, traced against Supabase + the data branch + StatsAPI rather
// than guessed: on 2026-09-18 the bot's Today workflow ran at 06:53Z and then
// not again until 12:11Z (published 13:04Z) -- a 5h18m gap. Every stat post
// that fired inside it (milestone_am 10:00Z, revenge_giveaway 11:00Z,
// matchuplines 12:00Z, hotcontact/callofnight/streaks 13:00Z) read whatever
// the 06:53 run had left on the branch. The MATCHUP LINES post that went out
// at 12:00Z named Nola at Citi, Singer at Great American and Bradley at Angel
// Stadium. Tonight's real starters at those three parks are Painter, Burns and
// Prielipp. All three names it used are that team's PREVIOUS DAY'S starter:
// the batters and the venues were today's, the arms were yesterday's.
//
// board.size ("is there a file") could not see that, and neither could the
// run_meta slate_date gate added on 2026-09-12 -- a board can carry today's
// date and still carry a stale or inferred pitcher column, and the bot's own
// resolve_probable_pitcher() (bots/mlb_dashboard.py, fallback B) explicitly
// GUESSES an arm when MLB has no probable yet, collecting it into
// PROJECTED_PITCHERS with the comment "Marked PROJECTED so the site can say so
// instead of presenting a guess as a fact" -- and then never publishes that
// flag on the row. Until it does, the site has to check for itself.
//
// SLATE-LEVEL, NOT ROW-LEVEL, ON PURPOSE. Dropping individual rows whose arm
// doesn't verify is the "filter that silently matches nothing" failure mode
// playableRows' own header warns about: a legitimately TBD starter, or one
// StatsAPI hiccup, would quietly thin the feed with no error anywhere. This
// asks one question instead -- does the board's pitcher column agree with
// MLB's own probables for this date -- and the answer gates the whole block.
// Fails open everywhere it cannot answer: no fetch, no games, or fewer than
// MIN_CHECKED verifiable games all return "fresh".

const PITCHER_MATCH_FLOOR = 0.5   // below this the column is describing another day
const MIN_CHECKED = 3             // too few verifiable games to judge -> fail open

/**
 * MLB's own probables for a date, as gamePk -> Set(pitcher_id). Null when the
 * schedule cannot be had or carries no probable at all -- callers treat null
 * as "unverifiable", never as "nothing matches".
 */
// One schedule call per day per instance per TTL. The tick runs every minute;
// probables change a handful of times a day, and lib/leaders.js's own pool()
// comment already notes StatsAPI will 429 if this is treated as free.
const PROBABLE_TTL_MS = 10 * 60 * 1000
const _probableCache = { day: '', at: 0, index: null }

export async function probableIndexFor(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ''))) return null
  if (_probableCache.day === day && Date.now() - _probableCache.at < PROBABLE_TTL_MS) {
    return _probableCache.index
  }
  try {
    const res = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${day}&hydrate=probablePitcher`,
      { cache: 'no-store' },
    )
    if (!res.ok) return null
    const body = await res.json()
    const out = new Map()
    for (const d of body?.dates || []) {
      for (const g of d?.games || []) {
        const pk = Number(g?.gamePk)
        if (!pk) continue
        const ids = new Set()
        for (const side of ['home', 'away']) {
          const pid = Number(g?.teams?.[side]?.probablePitcher?.id)
          if (pid) ids.add(pid)
        }
        if (ids.size) out.set(pk, ids)
      }
    }
    const index = out.size ? out : null
    // A null (nothing published yet) is NOT cached: an early-morning tick that
    // finds no probables must ask again, not remember "unverifiable" for ten
    // minutes -- the same reason boardIndex() refuses to cache an empty board.
    if (index) _probableCache.day = day, _probableCache.at = Date.now(), _probableCache.index = index
    return index
  } catch (err) {
    console.error('[tweetFeed] probableIndexFor failed', err)
    return null
  }
}

/**
 * Does the board's pitcher column describe the same day MLB does?
 * Returns { fresh, checked, matched, ratio } -- `fresh` is the only thing a
 * caller needs; the rest is for the tick's own JSON so a hold is explainable
 * without a repro.
 */
export function boardPitchersFresh(rows, probables) {
  if (!probables || !Array.isArray(rows) || !rows.length) {
    return { fresh: true, checked: 0, matched: 0, ratio: null, reason: 'unverifiable' }
  }
  // One verdict per GAME, not per row: nine hitters behind the same arm are
  // one piece of evidence, not nine, and a 9-game slate should not be
  // outvoted by a 15-game one's row count.
  const perGame = new Map()
  for (const r of rows) {
    const pk = Number(r?.game_pk)
    const pid = Number(r?.pitcher_id)
    if (!pk || !pid) continue
    const ids = probables.get(pk)
    if (!ids) continue                       // MLB has no probable here -> nothing to check
    const ok = ids.has(pid)
    perGame.set(pk, (perGame.get(pk) || false) || ok)
  }
  const checked = perGame.size
  const matched = [...perGame.values()].filter(Boolean).length
  if (checked < MIN_CHECKED) {
    return { fresh: true, checked, matched, ratio: null, reason: 'too-few-checked' }
  }
  const ratio = matched / checked
  return { fresh: ratio >= PITCHER_MATCH_FLOOR, checked, matched, ratio: Number(ratio.toFixed(2)), reason: 'checked' }
}

// ── 14. THE HOT STRETCH (2026-09-18) ────────────────────────────────────────
//
// Donovan: "i want player highlights liike this too -- Ronald Acuña Jr in
// September: .339 AVG / .364 OBP / .661 SLG / 1.025 OPS / 5 HR / 13 RBI ...
// for players doing well during the week or throught the month."
//
// TWO WAVES, ONE BUILDER. A month-to-date post in the morning and a last-7-days
// post in the afternoon, never the same player twice in a day (the week wave
// excludes whoever the month wave named, same read-back-the-payload pattern
// milestone_am/milestone_mid already use).
//
// WHERE THE NUMBERS COME FROM. MLB's own byDateRange hitting split --
// /people/{id}/stats?stats=byDateRange&group=hitting&startDate&endDate -- which
// returns avg/obp/slg/ops/homeRuns/rbi for an arbitrary window, already
// formatted the way a slash line prints. Verified 2026-09-18 against the exact
// example above: Acuña, 2026-09-01 to 09-17, comes back .339/.364/.661/1.025,
// 5 HR, 13 RBI -- the same six numbers, from the source, not recomputed here
// and not invented.
//
// THE WINDOW ENDS YESTERDAY, NEVER TODAY. Same rule pastDatesForWeekday
// already follows for the weekday leaderboard: tonight's game hasn't been
// played, and a slate rebuilt mid-evening would otherwise fold a partial
// today into a "this month" line that changes under the post.
//
// BOARD PLAYERS ONLY (Donovan's own call, asked and answered 2026-09-18).
// The pool is tonight's published board, so the post is about someone playing
// tonight and can honestly say so. A league-wide version would be a stat card
// with no reason to be on this account today.
//
// WHY THERE IS A SHORTLIST. A board is ~270 rows and this is one API call per
// player. The board already carries last10_avg/last10_hr/last10_xbh for free,
// which is a good enough "who is worth checking" pre-sort; only the top
// HOT_SHORTLIST get a real fetch, and the real fetch is what decides. The
// pre-sort can never invent a hot line -- at worst it misses one.

const HOT_SHORTLIST = 25
const HOT_CONCURRENCY = 8
// Sample floors. A .500 week on 9 at-bats is not a story.
const HOT_FLOOR = {
  month: { ab: 30, games: 8 },
  week: { ab: 15, games: 4 },
}
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

const shiftIso = (iso, days) => {
  const d = new Date(`${iso}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** The window a wave covers, ending the day BEFORE `day`. */
export function hotWindowFor(day, window = 'month') {
  const end = shiftIso(day, -1)
  if (!end) return null
  if (window === 'week') {
    return { start: shiftIso(day, -7), end, label: 'LAST 7 DAYS', season: day.slice(0, 4) }
  }
  const [y, m] = day.split('-')
  const monthStart = `${y}-${m}-01`
  // Day 1 or 2 of a month has no month-to-date worth posting -- the window
  // would be a game or two. Callers get null and simply don't post.
  if (end < monthStart) return null
  return { start: monthStart, end, label: MONTH_NAMES[Number(m) - 1].toUpperCase(), season: y }
}

/** His full-season line, for the card's "vs his own season" panel. Same
 * endpoint family as dateRangeHitting, one call, winner only. */
async function seasonHitting(playerId, season) {
  try {
    const res = await fetch(
      `https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=season&group=hitting&season=${season}&sportId=1`,
      { cache: 'no-store' },
    )
    if (!res.ok) return null
    const body = await res.json()
    const stat = body?.stats?.[0]?.splits?.[0]?.stat
    if (!stat) return null
    return {
      avg: txt(stat.avg), obp: txt(stat.obp), slg: txt(stat.slg), ops: txt(stat.ops),
      hr: num(stat.homeRuns) || 0, rbi: num(stat.rbi) || 0, games: num(stat.gamesPlayed) || 0,
    }
  } catch { return null }
}

async function dateRangeHitting(playerId, { start, end, season }) {
  try {
    const res = await fetch(
      `https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=byDateRange&group=hitting`
      + `&season=${season}&startDate=${start}&endDate=${end}&sportId=1`,
      { cache: 'no-store' },
    )
    if (!res.ok) return null
    const body = await res.json()
    // The endpoint returns the same split twice; the first is the answer.
    const stat = body?.stats?.[0]?.splits?.[0]?.stat
    return stat || null
  } catch { return null }
}

/**
 * The hottest bat on tonight's board over `window` ('month' | 'week').
 * Returns { pick, runnersUp } -- `pick` is null when nothing clears the floor,
 * which is a normal quiet-slate answer, not an error. `exclude` is a Set of
 * player_ids already featured today.
 */
export async function hotStretchPicks(rows, day, { window = 'month', exclude } = {}) {
  const win = hotWindowFor(day, window)
  if (!win) return { pick: null, runnersUp: [], window: null }
  const skip = exclude instanceof Set ? exclude : new Set()

  const seen = new Set()
  const shortlist = []
  for (const r of Array.isArray(rows) ? rows : []) {
    const pid = txt(r?.player_id)
    if (!pid || seen.has(pid) || skip.has(pid)) continue
    seen.add(pid)
    // Free pre-sort off fields the board already publishes. Not a claim about
    // the window below -- just an ordering for which 25 are worth an API call.
    const heat = (num(r?.last10_hr) || 0) * 3 + (num(r?.last10_xbh) || 0) + (num(r?.last10_avg) || 0) * 10
    shortlist.push({ pid, name: txt(r.name), team: txt(r.team) || null, pitcher: txt(r.pitcher_name) || null, heat })
  }
  shortlist.sort((a, b) => b.heat - a.heat)
  const candidates = shortlist.slice(0, HOT_SHORTLIST)
  if (!candidates.length) return { pick: null, runnersUp: [], window: win }

  const stats = await pool(candidates, HOT_CONCURRENCY, (c) => dateRangeHitting(c.pid, win))
  const floor = HOT_FLOOR[window] || HOT_FLOOR.month
  const lines = []
  candidates.forEach((c, i) => {
    const s = stats[i]
    if (!s) return
    const ab = num(s.atBats) || 0
    const games = num(s.gamesPlayed) || 0
    const ops = num(s.ops)
    if (ab < floor.ab || games < floor.games || ops == null) return
    lines.push({
      player_id: c.pid, name: c.name, team: c.team, pitcher: c.pitcher,
      games, ab,
      avg: txt(s.avg), obp: txt(s.obp), slg: txt(s.slg), ops: txt(s.ops),
      hr: num(s.homeRuns) || 0, rbi: num(s.rbi) || 0,
      _ops: ops,
    })
  })
  lines.sort((a, b) => b._ops - a._ops)
  const pick = lines[0] || null
  // The card's "vs his own season" panel (2026-09-18). One extra call, for the
  // WINNER only -- the whole point of the post is that this window is hotter
  // than he normally is, and until now the card asserted that without showing
  // it. Null when it can't be had; the card simply drops the panel.
  if (pick) pick.season = await seasonHitting(pick.player_id, win.season)
  return { pick, runnersUp: lines.slice(1, 4), window: win }
}

export function hotStretchText(pick, { day = '', site = '', handle = '', window = 'month' } = {}) {
  if (!pick || !pick.ops) return ''
  const win = hotWindowFor(day, window)
  if (!win) return ''
  const icon = window === 'week' ? '⚡' : '🔥'
  const head = `${icon} ${String(pick.name).toUpperCase()}${pick.team ? ` (${pick.team})` : ''}, ${win.label}`
  const stats = [
    `${pick.avg} AVG`,
    `${pick.obp} OBP`,
    `${pick.slg} SLG`,
    `${pick.ops} OPS`,
    `${pick.hr} HR`,
    `${pick.rbi} RBI`,
  ]
  // The closing line is a FACT about tonight, not a flourish: the pool is
  // tonight's board by construction (see the header), so this is the one thing
  // the post can say that a generic stat card cannot.
  // Last name only for the arm -- lib/matchupStory.js has its own armName()
  // but it isn't exported, and one more import for one surname isn't worth it.
  const arm = String(pick.pitcher || '').trim().split(/\s+/).slice(-1)[0] || ''
  const close = arm ? `On tonight's board vs ${arm}.` : "On tonight's board."
  const tail = [site, handle].filter(Boolean).join(' · ')
  const body = [head, '', ...stats, '', close, ...(tail ? ['', tail] : [])]
  const out = body.join('\n')
  if (out.length <= 270) return out
  // Only ever drops the closing line, never a stat -- the six numbers ARE the
  // post. A name long enough to still overflow after that returns nothing
  // rather than a half-built card.
  const shorter = [head, '', ...stats, ...(tail ? ['', tail] : [])].join('\n')
  return shorter.length <= 270 ? shorter : ''
}
