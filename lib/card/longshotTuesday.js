// LONGSHOT TUESDAY (Donovan, 2026-10-20: "sure" to "one post on Tuesdays with each sport's +550 long shot, replacing the daily
// Long Shot post on X"). The weekly anchor (CALLED-IT-PLAYBOOK, TUE).
//
//   THE POST    on a Tuesday game day (the card's own date, never the wall clock): ONE X post naming each sport's Long Shot of the day
//               (the bot's long_shot row, lib/card/core.js pickLongShot, +550 or longer at the stored median, FLOORS.longShot). It goes when
//               every sport with a full slate today has locked its Card, or 20 minutes before the first of its legs starts, whichever is
//               first; a leg whose game has started is left out, a sport that locks later is left out (its long shot is still in Discord).
//               Each man's front card rides as a picture (up to four). X only: the daily long shot already went to each sport's free channel.
//   THE RESULT  the next ET day or later, once every leg named is graded: ONE reply under the Tuesday post, wins and misses alike.
//
// The other six days the Long Shot of the day stays where it was (the site, the ledger, each sport's free Discord channel), but not X
// (lib/card/post.js postLongShot / postLongShotResult, toX: false). Nothing about the pick, the floor or the record changes.
// Undo: LONGSHOT_TUESDAY_OFF=on stops both posts; reverting the commit puts the daily X post back.
import { BRAND } from '../routes'
import { HEAD, prettyDay, legLine, legMarket, cleanPublic } from './text'
import { fmtAmerican, legPriceOf, FULL_SLATE, CARD_SPORTS, CARD_LOCK_LEAD_MIN } from './core'
import { HARD_LIMIT, postLimit, xLen } from '../dash/postLimit'

export const TUESDAY_KIND = 'card_ls_tuesday'
export const TUESDAY_RESULT_KIND = 'card_ls_tuesday_result'
export const LOCK_GRACE_MIN = 15           // a card whose lock moment passed this recently may still be about to lock (the tick runs every ten minutes)
export const TUESDAY_LEAD_MIN = 20          // post no later than this many minutes before the first named leg starts
export const tuesdayOff = () => /^(on|1|true)$/i.test(String(process.env.LONGSHOT_TUESDAY_OFF || '').trim())

/** True when a card date (YYYY-MM-DD, the game's own date) is a Tuesday. */
export const isTuesday = (day) => /^\d{4}-\d{2}-\d{2}$/.test(String(day || '')) && new Date(`${day}T12:00:00Z`).getUTCDay() === 2

const glyph = (t) => xLen(t)   // X's weighting (emoji count 2)
const ORDER = (s) => { const i = CARD_SPORTS.indexOf(s); return i < 0 ? 99 : i }

/** One leg's line: "🏒 NHL · Name · TOR vs BOS · anytime goal · +650". null without a name or a stored price. */
export function tuesdayLegLine({ sport, leg }) {
  const f = legPriceOf(leg)
  if (!leg?.name || !f || !HEAD[sport]) return null
  return `${BRAND[sport]?.icon || ''} ${HEAD[sport]} · ${legLine(leg)} · ${legMarket(sport, leg)} · ${fmtAmerican(f.median)}`.trim()
}

/**
 * THE POST. `items` = [{ sport, leg }] (each sport's long shot leg), any order. Returns { text, named } or { text: '' }.
 * Every leg goes in or the post shrinks its words, never its names (a long post first; 280 when the account is on the free limit).
 */
export function tuesdayText({ day, items, hardLimit = postLimit() }) {
  const rows = (items || []).filter((i) => tuesdayLegLine(i)).sort((a, b) => ORDER(a.sport) - ORDER(b.sport))
  if (!rows.length) return { text: '', named: [] }
  const lines = rows.map(tuesdayLegLine)
  const one = rows.length === 1
  const head = `\u{1F3AF} LONGSHOT TUESDAY · ${prettyDay(day)}`
  const intro = one ? 'One long shot tonight, +550 or longer at the median price on file.' : 'One long shot from each board tonight. Each one +550 or longer at the median price on file.'
  const ask = one ? 'Most of these miss. Does this one land?' : 'Most of these miss. Which one lands?'
  const shapes = [
    [head, '', intro, '', ...lines, '', ask],
    [head, '', ...lines, '', ask],
    [head, ...lines, ask],
    [head, ...lines],
  ]
  for (const s of shapes) {
    const t = s.join('\n')
    if (glyph(t) + 4 <= Math.max(hardLimit, HARD_LIMIT) && cleanPublic(t)) return { text: t, named: rows.map((r) => String(r.leg.player_id)) }
  }
  return { text: '', named: [] }
}

const VERB = { hit: 'landed', miss: 'missed', void: 'void (did not play)', push: 'pushed' }
const MARK = { hit: '✓', miss: '✗', void: '–', push: '=' }
/**
 * THE RESULT REPLY. `items` = [{ sport, name, result }] for the legs the Tuesday post named. '' until every one is graded.
 * Wins and misses alike, no record line (each sport's long shot record lives in its ledger; BUCKETS is under its 30-night floor).
 */
export function tuesdayResultText({ day, items, hardLimit = postLimit() }) {
  const rows = (items || []).slice().sort((a, b) => ORDER(a.sport) - ORDER(b.sport))
  if (!rows.length || rows.some((r) => !VERB[r.result])) return { text: '' }
  const landed = rows.filter((r) => r.result === 'hit').length
  const graded = rows.filter((r) => r.result === 'hit' || r.result === 'miss').length
  const head = `\u{1F4CB} LONGSHOT TUESDAY · ${prettyDay(day)} · result`
  const hook = landed ? (landed === 1 ? 'One of them got there.' : `${landed} of them got there.`) : (graded ? 'None of them got there this week.' : null)
  const lines = rows.map((r) => `${MARK[r.result]} ${r.name} (${HEAD[r.sport] || ''}) · ${VERB[r.result]}`)
  const tail = 'Every long shot is graded. See you next Tuesday.'
  for (const s of [[head, '', ...(hook ? [hook, ''] : []), ...lines, '', tail], [head, '', ...lines, '', tail], [head, ...lines]]) {
    const t = s.join('\n')
    if (glyph(t) + 4 <= Math.max(hardLimit, HARD_LIMIT) && cleanPublic(t)) return { text: t }
  }
  return { text: '' }
}

/**
 * WHEN THE POST GOES (pure). `rows` = today's Card rows (every sport), `windows` = { sport: [windows] } the tick last read, `now`.
 * Returns { go, legs, reason }: `legs` = [{ sport, leg }] the post may name (bot long shots, locked, game still to come).
 */
export function tuesdayTiming({ day, rows, windows = {}, now = Date.now() }) {
  if (!isTuesday(day)) return { go: false, legs: [], reason: 'not a Tuesday' }
  const legs = (rows || [])
    .filter((r) => r.lane === 'bot' && r.product === 'long_shot' && String(r.card_date).slice(0, 10) === day && Date.parse(r.locks_at) <= now && r.legs?.[0])
    .map((r) => ({ sport: r.sport, leg: r.legs[0], start: Date.parse(r.legs[0].start_at || r.start_at) }))
    .filter((l) => l.start > now)
  if (!legs.length) return { go: false, legs: [], reason: 'no long shot locked yet' }
  const lockedSports = new Set((rows || []).filter((r) => r.lane === 'bot' && String(r.card_date).slice(0, 10) === day).map((r) => r.sport))
  // a sport still to lock a full slate today (its long shot may come): wait for it, unless the first leg is about to start
  // ...but only while its lock is still AHEAD (or just passed, a tick's grace): a sport whose lock moment has gone with no bot row (BUCKETS: nothing clears the
  // +120 floor, no anytime market) cannot produce a long shot any more, and the post used to wait for it until 20 minutes before the first leg (batch 3, 2026-10-26)
  const stillCanLock = (w) => w.first_start_ms - (CARD_LOCK_LEAD_MIN - LOCK_GRACE_MIN) * 60e3 > now
  const waiting = CARD_SPORTS.filter((s) => !lockedSports.has(s) && (windows[s] || []).some((w) => w.card_date === day && (w.games || 0) >= FULL_SLATE && w.first_start_ms > now && stillCanLock(w)))
  const first = Math.min(...legs.map((l) => l.start))
  const late = now >= first - TUESDAY_LEAD_MIN * 60e3
  if (waiting.length && !late) return { go: false, legs, reason: `waiting for ${waiting.join(', ')} to lock` }
  return { go: true, legs: legs.map(({ sport, leg }) => ({ sport, leg })), reason: waiting.length ? `going without ${waiting.join(', ')} (first leg starts soon)` : 'every board is in' }
}
