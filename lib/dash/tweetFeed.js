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
//      for the last several dates on the same weekday and tallies real
//      outcomes: HR count + average exit velocity, off the FULL-LEAGUE
//      outcome ledger (every player who went deep, not just the ~90 the bot
//      tracks — see lib/ledgerArchive.js's own note on that distinction).

import { gradedResultsUrl } from '../dataSource'

const txt = (v) => String(v == null ? '' : v).trim()
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null }
// Board rates are decimals (0.183, not 18.3) — see lib/hrOverlay.js's own
// `rate()`/`pct()` helpers, which do the same *100 before display.
const pct1 = (v) => { const n = num(v); return n == null ? null : Math.round(n * 1000) / 10 }

const fits270 = (arr) => arr.filter(Boolean).join('\n').length <= 270

// Same shrink-from-the-end-not-the-top shape as pregameText/pairsToWatchText
// in homerFeed.js: drop names off the bottom of the ranking, never off #1,
// until the post fits X's 280 (we hold to 270 for the tail's margin).
function shrinkToFit(head, lines, tail) {
  for (let n = lines.length; n >= 0; n -= 1) {
    const cut = lines.length - n
    const body = [head, ...lines.slice(0, n), cut ? `+${cut} more on the card` : '', tail]
    if (fits270(body)) return body.filter(Boolean).join('\n')
  }
  return [head, tail].filter(Boolean).join('\n')
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
    ? `🔥 Still cooking tonight${day ? ` — ${day.slice(5).replace('-', '/')}` : ''}`
    : `🔥 Hottest contact tonight${day ? ` — ${day.slice(5).replace('-', '/')}` : ''}`
  const lines = picks.map((p, i) =>
    `${i + 1}. ${p.name}${p.team ? ` (${p.team})` : ''} — ${p.blastPct}% blast rate vs ${p.pitcher}${p.pitcherTeam ? ` (${p.pitcherTeam})` : ''}`)
  return shrinkToFit(head, lines, tail)
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
    ? `⚠️ Still dangerous${day ? ` — ${day.slice(5).replace('-', '/')}` : ''}`
    : `⚠️ Danger combos${day ? ` — ${day.slice(5).replace('-', '/')}` : ''}`
  const lines = picks.map((p, i) =>
    `${i + 1}. ${p.name}${p.team ? ` (${p.team})` : ''} (${p.blastPct}% blast) vs ${p.pitcher}${p.pitcherTeam ? ` (${p.pitcherTeam})` : ''} (${p.pitcherHrBbePct}% HR/BBE)`)
  return shrinkToFit(head, lines, tail)
}

// ── 3. MLB HR LEADERS BY DAY OF WEEK ─────────────────────────────────────────

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

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

/**
 * Fetches up to `occurrences` graded_results_<date>.json files (same
 * weekday as `day`, most recent first) and tallies real HR outcomes.
 *
 * CAPPED ON PURPOSE. publish_data.sh keeps the last ~150 graded_results
 * files, so a full-season tally is possible — but this runs inside a 60s
 * serverless function once a day, and each file runs a couple MB. Eight
 * occurrences of one weekday is already a real sample (about two months)
 * without risking the timeout. Fetched in parallel: this posts once a day,
 * not once a minute the way homerBackfill's one-file-a-tick pacing needs to,
 * so a small burst here costs nothing extra.
 *
 * Reads hr_capture_report.all_homer_entries — the FULL-LEAGUE outcome
 * ledger (every player who went deep that game), not graded_slots (the
 * bot's own ~90 tracked candidates). See lib/ledgerArchive.js's rule #1 for
 * why that distinction matters: a leaderboard branded "MLB HR Leaders" has
 * to mean the whole league, not just the names the bot was watching.
 */
export async function fetchWeekdayHrLeaders(day, { occurrences = 8, limit = 10 } = {}) {
  const d = new Date(`${day}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return { leaders: [], dow: '', datesUsed: [] }
  const dow = WEEKDAY_NAMES[d.getUTCDay()]
  const dates = pastDatesForWeekday(day, d.getUTCDay(), occurrences)
  const files = await Promise.all(dates.map(async (date) => {
    try {
      const res = await fetch(gradedResultsUrl(date), { cache: 'no-store' })
      if (!res.ok) return null
      return await res.json()
    } catch { return null }
  }))
  const byPlayer = new Map()
  const datesUsed = []
  files.forEach((j, i) => {
    const entries = j?.hr_capture_report?.all_homer_entries
    if (!Array.isArray(entries) || !entries.length) return
    datesUsed.push(dates[i])
    for (const e of entries) {
      const pid = txt(e?.player_id)
      const hr = num(e?.hr) || 0
      if (!pid || hr < 1) continue
      const cur = byPlayer.get(pid) || { name: txt(e?.name) || `#${pid}`, team: txt(e?.team) || null, hr: 0, evSum: 0, evN: 0 }
      cur.hr += hr
      const ev = num(e?.max_ev_mph)
      if (ev != null) { cur.evSum += ev; cur.evN += 1 }
      if (txt(e?.team)) cur.team = txt(e.team)   // a trade mid-window — last one wins
      byPlayer.set(pid, cur)
    }
  })
  const leaders = Array.from(byPlayer.values())
    .map((p) => ({ name: p.name, team: p.team, hr: p.hr, avgEv: p.evN ? Math.round((p.evSum / p.evN) * 10) / 10 : null }))
    .sort((a, b) => b.hr - a.hr || (b.avgEv || 0) - (a.avgEv || 0))
    .slice(0, limit)
  return { leaders, dow, datesUsed }
}

export function hrLeadersByDowText(leaders, dow, { day = '', site = '', handle = '' } = {}) {
  if (!Array.isArray(leaders) || !leaders.length || !dow) return ''
  const tail = [site, handle].filter(Boolean).join(' · ')
  const head = `🏟️ MLB HR LEADERS — ${dow.toUpperCase()}S`
  const lines = leaders.map((p, i) =>
    `${i + 1}. ${p.name}${p.team ? ` (${p.team})` : ''} — ${p.hr} HR${p.avgEv != null ? `, ${p.avgEv} mph avg EV` : ''}`)
  return shrinkToFit(head, lines, tail)
}
