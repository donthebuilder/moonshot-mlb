// THE X SCHEDULER (Donovan, 2026-10-09, X overhaul stage 3 piece 4).
//
// ONE question every scheduled X post asks before it is built and claimed:
//
//     mayPostNow({ kind, sport, now, games, tag, posted, postseason, startMs, legacyHour })
//       -> { ok, reason, nextWindow, drop, tag, tier, period, experiment }
//
// It replaces the hard-coded `etHoursSinceNoon() >= SOME_HOUR` checks in the tick
// routes (the OLD schedule: nothing 8pm-7am ET, and a 7am ET = 4am Phoenix post
// into the dead zone). Pure: no database, no network, no clock but `now`.
// lib/dash/xGate.js (scheduleGate) reads today's posts and calls this.
//
// THE PLAN (Donovan's approved 10-09 plan). The day is a PHOENIX day (America/Phoenix,
// no DST, converted with Intl -- never "+N hours"). 20 scheduled/counted posts:
//   12-6am 3 (an OVERNIGHT EXPERIMENT, tagged), 6-9am 3, 9am-12pm 4, 12-3pm 4 (best
//   block), 3-6pm 3, 6-9pm 2, 9pm-12am 1 (Thursday night 3: TNF, the ~11pm spike).
// CALLED alerts and the board posts are exempt, uncounted and event-driven; so are
// the receipts and the write-ups tied to first pitch / puck drop / kickoff.
// RULES: >= 45 min between planned posts; no two of the same kind group in a row;
// a sport mix weighted by that day's games; MLB toned down in the postseason;
// the priority near the cap is xPolicy's (CALLED > slate > write-ups > facts >
// polls > numerology); a post that is not ready for its window is HELD (the tick
// asks again next minute) and DROPPED 30 minutes before its game starts.
// EVERY scheduled kind carries exactly one TAG, INFO or FUN; a kind with no tag
// does not post (and fails scripts/check-x-schedule.mjs).
//
// EMERGENCY OFF: X_SCHEDULE_OFF=on falls back to the old hour of the call site
// (`legacyHour`, hours since noon ET), nothing else.
import { RETIRED_BY_RECEIPT, RETIRED_KINDS, X_POLICY, capAllows, sportOfKind, tierOf } from './xPolicy'
import { POLL_KINDS, POLL_RESULT_KINDS } from './polls/kinds'

// TODO (adversarial review of integ5-1009, findings M5 and M6): noted, NOT fixed in this pass -- see that review's
// notes for their wording. (M1, the Slate bypassing this scheduler, is intentional: lib/posts/slate.js says why.)

// ────────────────────────────────────────────────────────────────────────────
// THE SCHEDULER CONFIG: the one object. Periods, counts, gap, tags, sport weights.
// ────────────────────────────────────────────────────────────────────────────
export const TZ = 'America/Phoenix'
export const SCHEDULE = Object.freeze({
  tz: TZ,
  dailyBudget: 20,                 // = X_POLICY.dailyCap (asserted in the check)
  minGapMin: 45,                   // between planned (counted) posts; live CALLED alerts skip it
  graceMin: 30,                    // a slot waits this long for its lead tier before any allowed tier may fill it
  dropBeforeStartMin: X_POLICY.holdUntilBeforeStartMin,   // 30: a held post is dropped this long before its game starts
  // The periods of the Phoenix day. `slots` = planned times (HH:MM Phoenix), `lead` = the
  // tier each slot is for (write-ups are event-driven, tied to first pitch, so no slot leads with one),
  // `allow` = every tier that may post in the period at all.
  // `thursday` overrides slots/lead on Thursdays (TNF; the ~11pm Thursday spike).
  periods: Object.freeze([
    { id: '00-06', from: '00:00', to: '06:00', experiment: 'experiment_overnight',
      // one ~1am for night owls, two ~4-5:30am for the East Coast morning (7-8:30am ET in October)
      slots: ['01:00', '04:15', '05:30'], lead: ['poll', 'fact', 'fact'], allow: ['fact', 'poll'] },
    { id: '06-09', from: '06:00', to: '09:00',
      slots: ['06:45', '07:30', '08:30'], lead: ['slate', 'fact', 'fact'], allow: ['slate', 'writeup', 'fact'],
      thursday: { slots: ['06:45', '08:30'], lead: ['slate', 'fact'] } },
    { id: '09-12', from: '09:00', to: '12:00',
      slots: ['09:15', '10:00', '10:50', '11:40'], lead: ['fact', 'fact', 'poll', 'fact'], allow: ['slate', 'writeup', 'fact', 'poll'] },
    { id: '12-15', from: '12:00', to: '15:00',      // the best block
      slots: ['12:30', '13:20', '14:05', '14:50'], lead: ['fact', 'poll', 'fact', 'fact'], allow: ['slate', 'writeup', 'fact', 'poll'] },
    { id: '15-18', from: '15:00', to: '18:00',
      slots: ['15:40', '16:30', '17:20'], lead: ['poll', 'fact', 'fact'], allow: ['writeup', 'fact', 'poll'],
      thursday: { slots: ['15:50', '17:10'], lead: ['poll', 'fact'] } },
    { id: '18-21', from: '18:00', to: '21:00',      // mostly event-driven
      slots: ['18:15', '19:30'], lead: ['poll', 'numerology'], allow: ['fact', 'poll', 'numerology'] },
    { id: '21-24', from: '21:00', to: '24:00',
      slots: ['23:00'], lead: ['numerology'], allow: ['fact', 'poll', 'numerology'],
      thursday: { slots: ['21:45', '22:35', '23:20'], lead: ['fact', 'poll', 'poll'] } },
  ]),
  // Sport mix: a sport's share of the day = its games x this weight. NFL games are fewer but each is the whole day.
  sportWeight: Object.freeze({ mlb: 1, nhl: 1, nba: 1, nfl: 3 }),
  quotaSlack: 2,                   // a sport may run this many posts over its share before it waits
  // MLB postseason toned down: at most this many per day (by tier), counting write-ups already out.
  mlbPostseasonMax: Object.freeze({ slate: 1, writeup: 1, fact: 3 }),
})

// ────────────────────────────────────────────────────────────────────────────
// KIND TAGS. Every kind the repo can post to X, with its mode and its one tag.
//   mode 'scheduled' : takes a slot in the plan (window, gap, adjacency, counts)
//   mode 'event'     : tied to a live event / game start / reply; ignores windows
//   mode 'retired'   : never posts again (history rows stay)
//   mode 'members'   : Discord members-only; never reaches X
// `group` = what "the same kind" means for back-to-back; `sport` = 'all' for cross-sport.
// ────────────────────────────────────────────────────────────────────────────
const pollSportOf = (k) => (/^(nfl|nhl|nba)_/.exec(String(k)) || [null, 'mlb'])[1]   // MLB is the bare poll_* name
const S = (tag, group, sport) => ({ mode: 'scheduled', tag, group, sport })
const E = (tag, group, sport) => ({ mode: 'event', tag, group, sport })
const R = { mode: 'retired' }
const M = { mode: 'members' }
export const KIND_TAGS = Object.freeze({
  // ── live CALLED alerts and the boards: event-driven, exempt, uncounted
  homer: E('INFO', 'called', 'mlb'), td: E('INFO', 'called', 'nfl'), nhlgoal: E('INFO', 'called', 'nhl'), nba30: E('INFO', 'called', 'nba'),
  board: E('INFO', 'board', 'mlb'), nfl_board: E('INFO', 'board', 'nfl'), nhl_board: E('INFO', 'board', 'nhl'),
  // ── TOP TOTALS (2026-10-09): each sport's three highest projected-total games, called before the first game; event-driven (tied to the lock), INFO, names no player
  top_totals: E('INFO', 'totals', 'mlb'), nfl_top_totals: E('INFO', 'totals', 'nfl'), nhl_top_totals: E('INFO', 'totals', 'nhl'), nba_top_totals: E('INFO', 'totals', 'nba'),
  // ── the slate (cross-sport, morning) -- callofnight/thefour/pregame fold into it
  slate: S('INFO', 'slate', 'all'), callofnight: S('INFO', 'slate', 'mlb'), thefour: S('INFO', 'slate', 'mlb'),   // 'slate' = THE SLATE (cross-sport); the two old MLB builders fold into it
  pregame: E('INFO', 'slate', 'mlb'),                 // tied to the first-pitch lock (1h before), so event-driven
  // ── write-ups and receipts: tied to first pitch / puck drop / kickoff / the final out
  writeup: E('INFO', 'writeup', 'all'), writeup_mlb: E('INFO', 'writeup', 'mlb'), writeup_nfl: E('INFO', 'writeup', 'nfl'), writeup_nhl: E('INFO', 'writeup', 'nhl'),
  call: E('INFO', 'writeup', 'mlb'),                  // call_<game_pk>: the MLB per-game write-up
  // THE NIGHT RECEIPT (lib/posts/receipt.js): ONE cross-sport post, event-driven (every game that held a named player is
  // final), quoting the post that named the man who cashed. weekly / monthly are the same receipt over the nights, on their
  // own schedule (Monday morning, the 1st). nfl_results is the NFL board's own graded row (/called reads it).
  receipt: E('INFO', 'receipt', 'all'), nfl_results: E('INFO', 'receipt', 'nfl'), weekly: E('INFO', 'receipt', 'all'), monthly: E('INFO', 'receipt', 'all'),
  story_t3: E('INFO', 'receipt', 'mlb'),              // the storylines results thread, a reply under the story post
  // ── replies under a post that already named the player
  nfl_callsheet_reply: E('INFO', 'reply', 'nfl'), homer_board_reply: E('INFO', 'reply', 'mlb'), mlbhr_reply: E('INFO', 'reply', 'mlb'),
  // ── the fact engine: its own window is "2h before the day's first game", so event-driven
  facts: E('INFO', 'facts', 'all'),
  // ── scheduled INFO: facts, lists, longshots, matchups, milestones (the fact tier)
  hotcontact: S('INFO', 'hotcontact', 'mlb'), dangercombos: S('INFO', 'dangercombos', 'mlb'), backtoback: S('INFO', 'backtoback', 'mlb'),
  hrleadersdow: S('INFO', 'hrleadersdow', 'mlb'), matchuplines: S('INFO', 'matchup', 'mlb'),
  matchup_hr: S('INFO', 'matchup', 'mlb'), matchup_career: S('INFO', 'matchup', 'mlb'),
  matchup_hr_late: S('INFO', 'matchup', 'mlb'), matchup_career_late: S('INFO', 'matchup', 'mlb'),
  storylines: S('INFO', 'storylines', 'mlb'), storyline_watch_1: S('INFO', 'storylines', 'mlb'),
  bestair: S('INFO', 'bestair', 'mlb'), hot_month: S('INFO', 'hot', 'mlb'), hot_week: S('INFO', 'hot', 'mlb'),
  history_watch: S('INFO', 'milestone', 'mlb'),       // milestone chase; a "watch" but a fact about a count, not a guess
  pairswatch: S('INFO', 'pairs', 'mlb'),
  longshot: S('INFO', 'longshots', 'mlb'), longshots: S('INFO', 'longshots', 'mlb'), nfl_longshots: S('INFO', 'longshots', 'nfl'), nhl_longshots: S('INFO', 'longshots', 'nhl'),
  multi_club: S('INFO', 'multiclub', 'mlb'), nfl_multi_club: S('INFO', 'multiclub', 'nfl'), nhl_multi_club: S('INFO', 'multiclub', 'nhl'),
  list_mlb: S('INFO', 'list', 'mlb'), list_nfl: S('INFO', 'list', 'nfl'), list_nhl: S('INFO', 'list', 'nhl'),
  nhlhardest: S('INFO', 'hardest', 'nhl'),
  nfl_milestone: S('INFO', 'milestone', 'nfl'), nfl_whyboard: S('INFO', 'whyboard', 'nfl'),
  nfl_redzone: S('INFO', 'nfl_usage', 'nfl'), nfl_goalline: S('INFO', 'nfl_usage', 'nfl'), nfl_tdhistory: S('INFO', 'nfl_usage', 'nfl'),
  nfl_spotlight: S('INFO', 'spotlight', 'nfl'), nfl_bigweek: S('INFO', 'bigweek', 'nfl'),
  // ── scheduled FUN: polls, pick-one, and numerology
  // the five poll formats (lib/dash/polls/kinds.js): every sport, FUN, tier 'poll'; the reveal is an INFO receipt that quotes its poll
  ...Object.fromEntries(POLL_KINDS.map((k) => [k, S('FUN', 'poll', pollSportOf(k))])),
  ...Object.fromEntries(POLL_RESULT_KINDS.map((k) => [k, E('INFO', 'receipt', pollSportOf(k))])),
  numerology: S('FUN', 'numerology', 'all'),
  // the OLD poll kinds (replaced 10-09 by the five formats above; history rows stay, nothing posts them)
  botpoll: R, community_pick: R, nfl_botpoll: R, nfl_community: R,
  // ── retired for good (10-09 _mid pair; the route's own RETIRED_KINDS; legacy names still in the kind check)
  ...Object.fromEntries(RETIRED_KINDS.map((k) => [k, R])),   // the two _mid kinds (xPolicy owns that list)
  ...Object.fromEntries(RETIRED_BY_RECEIPT.map((k) => [k, R])),   // accountability / recap / board_results: the night receipt absorbed them (10-09)
  angles: R, hotsheet: R, birthday: R, funfacts: R, streaks: R,
  milestone_mid: R, revenge_giveaway: R, storyline_watch_2: R, storyline_watch_3: R, storyline_watch_4: R, milestone_am: R,
  // ── members-only Discord kinds: never X
  mlb_members_board: M, mlb_members_grade: M, nfl_members_board: M, nfl_members_grade: M,
})
const PREFIX_KIND = [['call_', 'call'], ['writeup_nfl_', 'writeup_nfl'], ['writeup_nhl_', 'writeup_nhl'], ['writeup_mlb_', 'writeup_mlb'], ['writeup_', 'writeup']]

/** The KIND_TAGS entry for a kind (exact, then prefix), or null when the kind is not in the table. */
export function kindInfo(kind) {
  const k = String(kind || '')
  if (KIND_TAGS[k]) return { kind: k, ...KIND_TAGS[k] }
  for (const [p, to] of PREFIX_KIND) if (k.startsWith(p)) return { kind: k, ...KIND_TAGS[to] }
  return null
}
export const TAGS = Object.freeze(['INFO', 'FUN'])
/** INFO / FUN, or null when the kind has no tag (a kind without a tag does not post). */
export const tagOf = (kind) => { const i = kindInfo(kind); return i && TAGS.includes(i.tag) ? i.tag : null }
export const modeOf = (kind) => kindInfo(kind)?.mode || null
/** Kinds in `table` that should carry a tag and do not (scheduled/event kinds with a missing or unknown tag). Must be []. */
export const untagged = (table = KIND_TAGS) => Object.entries(table).filter(([, v]) => (v.mode === 'scheduled' || v.mode === 'event') && !TAGS.includes(v.tag)).map(([k]) => k)

// ────────────────────────────────────────────────────────────────────────────
// TIME. Zones by Intl only. A "wall clock" is read back from the zone, never added.
// ────────────────────────────────────────────────────────────────────────────
const _fmt = new Map()
function fmtFor(tz) {
  if (!_fmt.has(tz)) _fmt.set(tz, new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' }))
  return _fmt.get(tz)
}
/** The wall clock in `tz` at instant `ms`: { day:'YYYY-MM-DD', hour, minute, min (minutes since midnight), dow (0=Sun) }. */
export function clockIn(tz, ms) {
  const o = {}
  for (const p of fmtFor(tz).formatToParts(new Date(ms))) o[p.type] = p.value
  const hour = Number(o.hour) % 24
  const minute = Number(o.minute)
  return { day: `${o.year}-${o.month}-${o.day}`, hour, minute, min: hour * 60 + minute, dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday) }
}
/** The instant (ms) at which the wall clock in `tz` reads `day` + 'HH:MM' ('24:00' = the next midnight). */
export function wallToMs(tz, day, hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number)
  const [y, mo, d] = day.split('-').map(Number)
  const asUtc = Date.UTC(y, mo - 1, d, h, m)
  let guess = asUtc
  for (let i = 0; i < 3; i++) {      // the zone's offset at the guess; repeat so a DST edge settles
    const c = clockIn(tz, guess)
    const [cy, cmo, cd] = c.day.split('-').map(Number)
    const wall = Date.UTC(cy, cmo - 1, cd, c.hour, c.minute)
    const diff = asUtc - wall
    if (diff === 0) break
    guess += diff
  }
  return guess
}
export const phxClock = (ms) => clockIn(TZ, ms)
const addDays = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10)
const dowOf = (day) => new Date(`${day}T12:00:00Z`).getUTCDay()
const pad = (n) => String(n).padStart(2, '0')
const hhmmOf = (tz, ms) => { const c = clockIn(tz, ms); return `${pad(c.hour)}:${pad(c.minute)}` }
/** Hours since noon US Eastern (-12..+11.99), the unit the old hour constants were written in. Same as lib/data.js etHoursSinceNoon. */
export const etHoursSinceNoon = (ms) => { const c = clockIn('America/New_York', ms); return c.hour + c.minute / 60 - 12 }

// ────────────────────────────────────────────────────────────────────────────
// GAMES -> SPORT SHARES
// ────────────────────────────────────────────────────────────────────────────
const SPORTS = ['mlb', 'nfl', 'nhl', 'nba']
function gameMs(g) {
  for (const v of [g?.startMs, g?.start, g?.game_time, g?.startTime]) {
    const t = typeof v === 'number' ? v : Date.parse(v || '')
    if (Number.isFinite(t)) return t
  }
  return NaN
}
/** { mlb: 0.62, nfl: 0.38 }: each sport's share of the day, by games x weight. {} when there are no games. */
export function sportShares(games) {
  const w = {}
  for (const g of games || []) {
    const s = String(g?.sport || '').toLowerCase()
    if (SPORTS.includes(s)) w[s] = (w[s] || 0) + SCHEDULE.sportWeight[s]
  }
  const total = Object.values(w).reduce((a, b) => a + b, 0)
  const out = {}
  if (total) for (const s of Object.keys(w)) out[s] = w[s] / total
  return out
}
const sportQuota = (shares, sport) => (shares[sport] ? Math.ceil(shares[sport] * SCHEDULE.dailyBudget) + SCHEDULE.quotaSlack : null)

// ────────────────────────────────────────────────────────────────────────────
// THE PLAN
// ────────────────────────────────────────────────────────────────────────────
const periodSlots = (p, dow) => (dow === 4 && p.thursday ? { slots: p.thursday.slots, lead: p.thursday.lead } : { slots: p.slots, lead: p.lead })

/** The planned slots of one Phoenix day (YYYY-MM-DD), in time order, for a posting-log or a preview. */
export function planDay(day, games = [], { postseason = false } = {}) {
  const dow = dowOf(day)
  const shares = sportShares(games)
  const sports = Object.keys(shares)
  const credit = Object.fromEntries(sports.map((s) => [s, 0]))
  const slots = []
  for (const p of SCHEDULE.periods) {
    const { slots: times, lead } = periodSlots(p, dow)
    times.forEach((t, i) => {
      const at = wallToMs(TZ, day, t)
      const tier = lead[i]
      // sport hint: smooth weighted round robin over the day's sports; cross-sport tiers are 'all'
      let sport = 'all'
      if (tier !== 'slate' && tier !== 'numerology' && sports.length) {
        for (const s of sports) credit[s] += shares[s]
        sport = sports.reduce((a, b) => (credit[b] > credit[a] ? b : a), sports[0])
        credit[sport] -= 1
      }
      slots.push({ n: slots.length + 1, period: p.id, phx: t, et: hhmmOf('America/New_York', at), at, tier, tag: tier === 'poll' || tier === 'numerology' ? 'FUN' : 'INFO', sport, experiment: p.experiment || null })
    })
  }
  // MLB in the postseason is toned down: its sport hint never lands on a slate/write-up beyond the limit (those lead tiers are cross-sport or event-driven)
  void postseason
  return slots
}
/** Plan lines for a human: "01:00 PHX (04:00 ET)  poll  FUN  mlb  [experiment_overnight]". */
export const planLines = (slots) => slots.map((s) => `${s.phx} PHX (${s.et} ET)  ${s.tier.padEnd(10)} ${s.tag}  ${s.sport}${s.experiment ? `  [${s.experiment}]` : ''}`)

function periodAt(ms) {
  const c = phxClock(ms)
  return { clock: c, period: SCHEDULE.periods.find((p) => c.min >= toMin(p.from) && c.min < toMin(p.to)) }
}
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }

// ────────────────────────────────────────────────────────────────────────────
// mayPostNow
// ────────────────────────────────────────────────────────────────────────────
const off = () => /^(on|1|true)$/i.test(String(process.env.X_SCHEDULE_OFF || '').trim())
export const scheduleOff = off

/** The next slot at or after `fromMs` whose period allows `tier` (today's plan, then tomorrow's), or null. */
function nextWindow(tier, fromMs, games) {
  const today = phxClock(fromMs).day
  for (const day of [today, addDays(today, 1)]) {
    for (const s of planDay(day, games)) {
      const p = SCHEDULE.periods.find((q) => q.id === s.period)
      if (s.at >= fromMs && p.allow.includes(tier)) return { at: s.at, phx: s.phx, period: s.period, day }
    }
  }
  return null
}

/**
 * May a post of `kind` go out now?
 *   kind, sport     what it is (sport defaults to the kind table, then xPolicy.sportOfKind)
 *   now             ms (injected, so tests run a fake clock)
 *   games           the day's games [{ sport, startMs|start|game_time }]: sport mix
 *   tag             optional; must equal the table's tag when given
 *   posted          today's counted posts so far [{ kind, at (ms), sport? }] (Phoenix day); the caller reads them
 *   postseason      true while MLB is in the postseason (toned down)
 *   startMs         the start of the game this post is about: a post still held 30 min before is dropped
 *   legacyHour      the call site's old hour (hours since noon ET): used only when X_SCHEDULE_OFF=on
 * Returns { ok, reason, nextWindow:{at,phx,period,day}|null, drop, tag, tier, period, experiment }.
 */
export function mayPostNow({ kind, sport = null, now = Date.now(), games = [], tag = null, posted = [], postseason = false, startMs = NaN, legacyHour = null } = {}) {
  const info = kindInfo(kind)
  const t = info && TAGS.includes(info.tag) ? info.tag : null
  const tier = tierOf(kind)
  const base = { ok: false, reason: '', nextWindow: null, drop: false, tag: t, tier, period: null, experiment: null }
  const no = (reason, extra = {}) => {
    const drop = Number.isFinite(startMs) && now >= startMs - SCHEDULE.dropBeforeStartMin * 60e3
    return { ...base, ...extra, ok: false, reason: drop ? `${reason} (dropped: ${SCHEDULE.dropBeforeStartMin} min to start)` : reason, drop }
  }

  // 0. the kind must be known, tagged, and not retired -- before anything else, even with the switch off
  if (!info) return no('unknown kind: no tag')
  if (info.mode === 'retired') return no('retired kind')
  if (info.mode === 'members') return no('members-only kind never reaches X')
  if (!t) return no('kind has no tag (INFO or FUN)')
  if (tag != null && tag !== t) return no(`tag mismatch: table says ${t}, caller says ${tag}`)

  // 1. the emergency switch: the old hour, nothing else
  if (off()) {
    if (info.mode === 'event' || legacyHour == null) return { ...base, ok: true, reason: 'X_SCHEDULE_OFF: old hours (no hour)' }
    const ok = etHoursSinceNoon(now) >= legacyHour
    return ok ? { ...base, ok: true, reason: 'X_SCHEDULE_OFF: old hour reached' } : no('X_SCHEDULE_OFF: before the old hour')
  }

  // 2. event-driven kinds ignore windows (CALLED alerts, receipts, write-ups, boards, replies)
  if (info.mode === 'event') return { ...base, ok: true, reason: 'event-driven: ignores windows' }

  // 3. scheduled: which period are we in, and what is left in it
  const { clock, period } = periodAt(now)
  const day = clock.day
  const sp = sport || info.sport || sportOfKind(kind)
  const out = { ...base, period: period.id, experiment: period.experiment || null }
  const shares = sportShares(games)
  const counted = (posted || []).filter((p) => p && Number.isFinite(p.at) && !['called', 'board'].includes(tierOf(p.kind)) && phxClock(p.at).day === day)
    .sort((a, b) => a.at - b.at)
  const sportOf = (p) => p.sport || kindInfo(p.kind)?.sport || sportOfKind(p.kind)

  // 3a. the daily cap and the tiers near it (xPolicy): the budget in the plan is 20 counted posts
  if (!capAllows(kind, counted.length)) return no(`daily budget (${tier} tier, ${counted.length} of ${X_POLICY.dailyCap} out)`, out)
  // 3b. the period must allow this tier
  const nw = (reason) => no(reason, { ...out, nextWindow: nextWindow(tier, now, games) })
  if (!period.allow.includes(tier)) return nw(`${tier} posts do not go out ${period.from}-${period.to} Phoenix`)
  // 3c. a slot must be due and unfilled: the plan's times in this period that have arrived, minus the scheduled posts already in it
  const { slots: times, lead } = periodSlots(period, clock.dow)
  const periodStart = wallToMs(TZ, day, period.from)
  const periodEnd = wallToMs(TZ, day, period.to)
  const filled = counted.filter((p) => p.at >= periodStart && p.at < periodEnd && kindInfo(p.kind)?.mode === 'scheduled').length
  const due = times.map((s, i) => ({ at: wallToMs(TZ, day, s), tier: lead[i], phx: s })).filter((s) => s.at <= now)
  if (due.length <= filled) return nw(due.length ? `no open slot in ${period.id} (${filled} of ${times.length} filled)` : `before the first slot of ${period.id} (${times[0]} Phoenix)`)
  const slot = due[filled]
  // the slot's own tier gets it first; any tier the period allows may take it after the grace
  if (slot.tier !== tier && now < slot.at + SCHEDULE.graceMin * 60e3) return nw(`the ${slot.phx} slot is for ${slot.tier} (open to others at +${SCHEDULE.graceMin} min)`)
  // 3d. 45 minutes since the last counted post, and not the same kind group twice in a row
  const last = counted[counted.length - 1]
  if (last && now - last.at < SCHEDULE.minGapMin * 60e3) {
    const at = last.at + SCHEDULE.minGapMin * 60e3
    return no(`${SCHEDULE.minGapMin}-minute gap since the last post`, { ...out, nextWindow: { at, phx: hhmmOf(TZ, at), period: periodAt(at).period.id, day: phxClock(at).day } })
  }
  if (last && kindInfo(last.kind)?.group === info.group) return no(`same kind back to back (${info.group})`, out)
  // 3e. the sport mix and the MLB postseason
  const quota = sp === 'all' ? null : sportQuota(shares, sp)
  if (quota != null && counted.filter((p) => sportOf(p) === sp).length >= quota) return no(`${sp} has its share of today's posts (${quota})`, out)
  if (postseason && sp === 'mlb') {
    const max = SCHEDULE.mlbPostseasonMax[tier]
    if (max != null && counted.filter((p) => sportOf(p) === 'mlb' && tierOf(p.kind) === tier).length >= max) return no(`MLB postseason: at most ${max} ${tier} post${max > 1 ? 's' : ''} a day`, out)
  }
  return { ...out, ok: true, reason: `slot ${slot.phx} Phoenix (${period.id})` }
}

/**
 * The cheap, DB-free half of the question for the pre-checks before a post is built: is the clock inside a period
 * that allows the kind, with a slot that has arrived? (The fill, gap and mix are checked at the claim.)
 */
export function windowOpen({ kind, now = Date.now(), legacyHour = null } = {}) {
  const info = kindInfo(kind)
  if (!info || info.mode === 'retired' || info.mode === 'members' || !TAGS.includes(info.tag)) return false
  if (off()) return info.mode === 'event' || legacyHour == null ? true : etHoursSinceNoon(now) >= legacyHour
  if (info.mode === 'event') return true
  const { clock, period } = periodAt(now)
  if (!period.allow.includes(tierOf(kind))) return false
  const { slots } = periodSlots(period, clock.dow)
  return wallToMs(TZ, clock.day, slots[0]) <= now
}

/** The payload fields a scheduled post carries: its tag, and the overnight experiment mark. */
export function payloadFor(kind, now = Date.now()) {
  const tag = tagOf(kind)
  const info = kindInfo(kind)
  const out = tag ? { x_tag: tag } : {}
  if (info?.mode === 'scheduled' || info?.mode === 'event') {
    const p = periodAt(now).period
    if (p?.experiment) out.experiment = p.experiment
  }
  return out
}

/** The Phoenix day window [startMs, endMs) containing `ms`: what "today's posts" are read over. */
export function phxDayWindow(ms) {
  const day = phxClock(ms).day
  return { day, startMs: wallToMs(TZ, day, '00:00'), endMs: wallToMs(TZ, addDays(day, 1), '00:00') }
}
