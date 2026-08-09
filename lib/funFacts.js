// 🎩 FUN FACTS — the whimsical layer (2026-08-10).
//
// Donovan, verbatim: "I want to know in-game storylines like 'Mr. Sunday' —
// Christian Walker, he's got the most HRs on Sunday in the game. Fun things
// like that, whimsical stats that help."
//
// So: facts that are FUN to say out loud, computed from published game logs and
// nothing else. The bar is the same one lib/matchupStory.js sets — every clause
// is counted from a real sample, the sample is stated in the line, and a claim
// that can't be checked isn't made.
//
// ── WHERE EVERY NUMBER COMES FROM ───────────────────────────────────────────
//
// ONE SOURCE: lib/gamelogs.js thresholdRates(pid), which is the hitting gameLog
// (`/api/v1/people/{id}/stats?stats=gameLog&group=hitting&season=YYYY`) already
// fetched and cached per player for the prop grid. Its `logAll` rows carry
// exactly the fields this file uses, every one of them in production use
// elsewhere on the site before today:
//
//   iso    YYYY-MM-DD, the split's own date       (added 2026-08-10)
//   hr     homeRuns                               (props grid, 1+ HR market)
//   h      hits                                   (props grid, 1+ Hit market)
//   ab     atBats                                 (the 0-AB filter)
//   home   isHome                                 (ThresholdGrid home/away split)
//   oppId  opponent.id                            (gamelogs.starterHands)
//
// Nothing new is requested from the API, so nothing here can be built on a
// field that turns out not to exist. Day/night is DELIBERATELY ABSENT: the
// gameLog carries no day/night flag, lib/situational.js only has day/night for
// PITCHERS (sitCodes d,n on the pitching group), and a hitter's day/night split
// would need a sitCode nobody here has verified on the hitting group. An
// unverified split is exactly the kind of thing this file exists not to print.
//
// ── THE HONESTY RULES ───────────────────────────────────────────────────────
//
//   1. EVERY LINE STATES ITS SAMPLE. "7 HR on Sundays" is meaningless without
//      "in 19 Sunday games this season", so the sample is in the sentence.
//   2. A "MOST" CLAIM IS CHECKED ACROSS EVERYTHING WE COMPUTED, and the line
//      says how many that was. We do not compute the whole slate (see COST),
//      so the claim is "most of the 40 bats we checked tonight" — which is
//      true — and never a bare "most in the game", which would not be.
//   3. THIN NUMBERS DON'T GET CROWNS. 2 HR on Sundays is not Mr. Sunday. Each
//      fact carries its own floor, and below it nothing is printed at all.
//   4. TIES ARE NAMED AS TIES. One name on a shared record is a lie of
//      omission, and this is the line people repeat out loud.
//   5. ONE FACT PER PLAYER. Otherwise the biggest bat on the slate wins every
//      row and the panel stops being a spread of the night's oddities.
//
// ── COST ────────────────────────────────────────────────────────────────────
//
// A slate is 150-270 hitters. One gameLog call each would be a sweep of a
// public API for numbers nobody asked for, so this takes a SHORT list: the
// bot's designated picks first, then the top scorers, capped by `look`
// (default 40), pulled in small batches. thresholdRates caches per player for
// the session, so any hitter whose card has been opened is already free, and
// the assembled facts are cached per slate date + candidate set.

import { thresholdRates, teamAbbrs } from './gamelogs'

const num = (v, d = null) => { const x = Number(v); return Number.isFinite(x) ? x : d }
const nameOf = (p) => String(p?.name || p?.player || p?.player_name || '').trim()
const pidOf = (p) => num(p?.player_id ?? p?.id)

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December']

// Parse YYYY-MM-DD at UTC NOON, never at local midnight. `new Date('2026-08-09')`
// is midnight UTC, which in every American timezone is the 8th — every weekday
// west of Greenwich would come out one day early, and "Mr. Sunday" would
// silently be Mr. Saturday. Noon is far enough from both edges that no offset
// on earth crosses a date boundary.
function parts(iso) {
  const s = String(iso || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(`${s}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  return { dow: d.getUTCDay(), month: d.getUTCMonth(), year: d.getUTCFullYear() }
}

const plural = (k, word) => `${word}${k === 1 ? '' : 's'}`

// The slate's opponent is an abbreviation; the game log's opponent is a team
// id. teamAbbrs() is id → abbreviation (one cached fetch, already used by the
// props timeline), so this is its inverse. A hitter whose slate abbreviation
// doesn't appear simply gets no opponent fact — no fuzzy matching, because a
// wrong join here would print a homer count against the wrong team.
function invert(abbrs) {
  const out = {}
  Object.entries(abbrs || {}).forEach(([id, ab]) => { if (ab) out[String(ab).toUpperCase()] = Number(id) })
  return out
}

// ── the cheap pre-rank ───────────────────────────────────────────────────────
// Who is worth a game-log call. Slate fields only, no network. Designated picks
// always come first: they're the hitters the page is actually about, so a fun
// fact about one of them is worth more than the same fact about the 60th bat.
export function candidateScore(p) {
  if (!p || !pidOf(p)) return -1
  let s = num(p.hr_score, 0) || 0
  if (String(p.game_pick_role || '').trim()) s += 1000
  if (num(p.games_since_last_hr, 99) === 0) s += 15
  return s
}

// ── one hitter's raw counts, straight off his log ────────────────────────────
// Returns null if he has no games with an at-bat this season. Everything here
// is a count of rows; nothing is rated, weighted or projected.
async function profile(p, oppIdByAbbr, today) {
  const pid = pidOf(p)
  if (!pid || !today) return null
  const data = await thresholdRates(pid).catch(() => null)
  const log = (data?.logAll || []).filter((g) => parts(g.iso))
  if (!log.length) return null

  let dowHr = 0, dowG = 0
  let homeHr = 0, homeG = 0, awayHr = 0, awayG = 0
  let multi = 0
  const byMonth = {}   // month index → { hr, g }

  log.forEach((g) => {
    const t = parts(g.iso)
    const hr = num(g.hr, 0) || 0
    if (t.dow === today.dow) { dowHr += hr; dowG += 1 }
    if (g.home) { homeHr += hr; homeG += 1 } else { awayHr += hr; awayG += 1 }
    if (hr >= 2) multi += 1
    const m = byMonth[t.month] || (byMonth[t.month] = { hr: 0, g: 0 })
    m.hr += hr; m.g += 1
  })

  // vs tonight's opponent, this season. Joined on the log's own opponent id.
  const oppAbbr = String(p?.opponent || p?.opp || '').trim().toUpperCase()
  const oppId = oppIdByAbbr[oppAbbr] ?? null
  let oppHr = 0, oppG = 0
  if (oppId != null) {
    log.forEach((g) => { if (Number(g.oppId) === oppId) { oppHr += num(g.hr, 0) || 0; oppG += 1 } })
  }

  // Current hit streak: consecutive most-recent games with a hit. logAll is
  // already most-recent-first, and games with no at-bat were already dropped
  // upstream — which is how a hit streak is conventionally counted anyway.
  let streak = 0
  for (const g of log) { if ((num(g.h, 0) || 0) >= 1) streak += 1; else break }

  const monthRows = Object.entries(byMonth).map(([m, v]) => ({ month: Number(m), ...v }))
  const bestMonth = monthRows.reduce((a, m) => (a && a.hr >= m.hr ? a : m), null)
  const monthTied = bestMonth ? monthRows.filter((m) => m.hr === bestMonth.hr).length > 1 : false

  return {
    p, pid, who: nameOf(p),
    games: log.length,
    seasonHr: log.reduce((a, g) => a + (num(g.hr, 0) || 0), 0),
    dowHr, dowG,
    homeHr, homeG, awayHr, awayG,
    multi,
    oppAbbr: oppId != null ? oppAbbr : '',
    oppHr, oppG,
    streak,
    thisMonth: byMonth[today.month] || null,
    bestMonth, monthTied,
  }
}

// ── the leaderboard helper ───────────────────────────────────────────────────
// Returns { best, list } where list is EVERY profile tied at the top. `min` is
// the floor below which there is no story at all.
function leaders(profiles, valueOf, min) {
  let best = -Infinity
  let list = []
  profiles.forEach((x) => {
    const v = valueOf(x)
    if (v == null || !Number.isFinite(v) || v < min) return
    if (v > best) { best = v; list = [x] } else if (v === best) list.push(x)
  })
  return list.length ? { best, list } : null
}

// Render a tie as words. Two names get "and", three or more get "N hitters".
function tieNames(list) {
  if (list.length === 1) return null
  if (list.length === 2) return `tied with ${list[1].who}`
  return `tied with ${list.length - 1} others`
}

// ── the facts ────────────────────────────────────────────────────────────────
//
// Each builder returns zero or one fact:
//   { key, icon, pid, player, parts, text, fun, sample }
// `parts` uses the same {type:'name'|'num'|'text'} shape lib/matchupStory.js
// returns, so the storyline panel renders both with the same code — names bold,
// every counted number in the mono font, so a reader can see which claims are
// counted and which are prose.
const NAME = (t) => ({ type: 'name', text: t })
const N = (t) => ({ type: 'num', text: String(t) })
const T = (t) => ({ type: 'text', text: t })
const finish = (base, bits) => ({
  ...base,
  parts: bits,
  text: bits.map((x) => x.text).join(''),
})

function fMrWeekday(profiles, today, checked) {
  // The floor is 3. Two homers on Sundays is a coincidence, not a nickname,
  // and crowning it would be exactly the false "most" this file refuses.
  const top = leaders(profiles, (x) => x.dowHr, 3)
  if (!top) return null
  const x = top.list[0]
  const day = WEEKDAYS[today.dow]
  const tie = tieNames(top.list)
  return finish(
    { key: 'weekday', icon: '🎩', pid: x.pid, player: x.p, fun: 100 + top.best * 6,
      sample: `${x.dowG} ${day} games this season` },
    [
      T(`Mr. ${day}: `), NAME(x.who), T(' has '), N(`${top.best} HR`),
      T(` on ${day}s this season, in `), N(x.dowG), T(` ${plural(x.dowG, `${day} game`)}`),
      T(tie ? ` — ${tie} — ` : ' — '),
      T(`the most of the `), N(checked), T(' bats we checked tonight.'),
    ],
  )
}

function fStreak(profiles, today, checked) {
  // Five is where a hit streak starts being said out loud.
  const top = leaders(profiles, (x) => x.streak, 5)
  if (!top) return null
  const x = top.list[0]
  const tie = tieNames(top.list)
  return finish(
    { key: 'streak', icon: '🔥', pid: x.pid, player: x.p, fun: 78 + top.best * 3,
      sample: `${top.best} straight games with a hit` },
    [
      NAME(x.who), T(' is on a '), N(`${top.best}-game`), T(' hit streak'),
      T(tie ? `, ${tie}` : ''),
      T(` — the longest of the `), N(checked), T(' bats we checked tonight.'),
    ],
  )
}

function fNemesis(profiles) {
  // His own count against tonight's opponent — no leaderboard, because "most
  // homers vs the Cubs" across a slate where only a few teams are playing is a
  // comparison between different opponents, which means nothing.
  const cands = profiles.filter((x) => x.oppAbbr && x.oppHr >= 2 && x.oppG >= 2)
  if (!cands.length) return null
  const x = cands.sort((a, b) => b.oppHr - a.oppHr || a.oppG - b.oppG)[0]
  return finish(
    { key: 'nemesis', icon: '😈', pid: x.pid, player: x.p, fun: 66 + x.oppHr * 8,
      sample: `${x.oppG} games vs ${x.oppAbbr} this season` },
    [
      NAME(x.who), T(' has already taken '), N(`${x.oppHr} HR`),
      T(` off ${x.oppAbbr} this season, in `), N(x.oppG),
      T(` ${plural(x.oppG, 'meeting')} — and here they are again.`),
    ],
  )
}

function fMonthMan(profiles, today) {
  // Only fires when TONIGHT'S month is his outright best month for homers, and
  // only from 3 up. "So far" is in the sentence because the current month is
  // by definition still being played.
  const cands = profiles.filter((x) =>
    x.bestMonth && !x.monthTied && x.bestMonth.month === today.month && x.bestMonth.hr >= 3)
  if (!cands.length) return null
  const x = cands.sort((a, b) => b.bestMonth.hr - a.bestMonth.hr)[0]
  const m = MONTHS[today.month]
  return finish(
    { key: 'month', icon: '📅', pid: x.pid, player: x.p, fun: 58 + x.bestMonth.hr * 4,
      sample: `${x.bestMonth.g} games in ${m}` },
    [
      T(`${m} is `), NAME(x.who), T('’s month: '), N(`${x.bestMonth.hr} HR`),
      T(` in ${m} so far, in `), N(x.bestMonth.g), T(` ${plural(x.bestMonth.g, 'game')}`),
      T(' — more than he has hit in any other month this season.'),
    ],
  )
}

function fSplit(profiles) {
  // Homestand hero or road warrior. Needs 8 homers to have a split at all, and
  // the big side has to be at least double the small one — anything gentler is
  // noise wearing a story's clothes. BOTH sides are printed, always.
  const cands = profiles
    .filter((x) => x.seasonHr >= 8 && x.homeG >= 10 && x.awayG >= 10)
    .map((x) => {
      const homeSide = x.homeHr >= x.awayHr
      const big = homeSide ? x.homeHr : x.awayHr
      const small = homeSide ? x.awayHr : x.homeHr
      return { x, homeSide, big, small, edge: big - small }
    })
    .filter((c) => c.big >= 2 * Math.max(1, c.small) && c.edge >= 4)
  if (!cands.length) return null
  const c = cands.sort((a, b) => b.edge - a.edge)[0]
  const { x } = c
  return finish(
    { key: 'split', icon: c.homeSide ? '🏠' : '🧳', pid: x.pid, player: x.p, fun: 46 + c.edge * 3,
      sample: `${x.homeG} home games, ${x.awayG} road games` },
    [
      NAME(x.who), T(c.homeSide ? ' does it at home: ' : ' is a road warrior: '),
      N(`${c.big} of his ${x.seasonHr} HR`),
      T(c.homeSide ? ' have come at home this season — ' : ' have come on the road this season — '),
      N(x.homeHr), T(` in ${x.homeG} home ${plural(x.homeG, 'game')}, `),
      N(x.awayHr), T(` in ${x.awayG} away ${plural(x.awayG, 'game')}.`),
    ],
  )
}

function fMulti(profiles, today, checked) {
  const top = leaders(profiles, (x) => x.multi, 2)
  if (!top) return null
  const x = top.list[0]
  const tie = tieNames(top.list)
  return finish(
    { key: 'multi', icon: '⚡', pid: x.pid, player: x.p, fun: 52 + top.best * 10,
      sample: `${x.games} games this season` },
    [
      NAME(x.who), T(' has '), N(top.best), T(` multi-homer ${plural(top.best, 'game')} this season`),
      T(tie ? `, ${tie}` : ''),
      T(` — the most of the `), N(checked), T(' bats we checked tonight. When he goes, he goes twice.'),
    ],
  )
}

// Every builder takes the same (profiles, today, checked) so the runner can
// call them uniformly; the ones that don't need a later argument just ignore it.
const BUILDERS = [fMrWeekday, fStreak, fNemesis, fMonthMan, fSplit, fMulti]

// ── the slate ────────────────────────────────────────────────────────────────
//
// `slateDate` is the YYYY-MM-DD the page is showing (today, or tomorrow in
// tomorrow mode) — the weekday and month facts are about THAT date, not about
// the wall clock, so a tomorrow slate reads "Mr. Saturday" correctly.
const _cache = new Map()

export async function funFacts(players = [], { look = 40, limit = 4, batch = 6, slateDate = '' } = {}) {
  const day = String(slateDate || '').slice(0, 10) || new Date().toLocaleDateString('en-CA')
  const today = parts(day)
  if (!today) return []

  const cands = players
    .map((p) => ({ p, s: candidateScore(p) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)
  // one entry per player — a hitter can appear on the slate more than once
  const seen = new Set()
  const list = []
  cands.forEach(({ p }) => {
    const pid = pidOf(p)
    if (seen.has(pid)) return
    seen.add(pid)
    if (list.length < look) list.push(p)
  })
  if (!list.length) return []

  const key = `${day}|${list.map(pidOf).join(',')}|${limit}`
  if (_cache.has(key)) return _cache.get(key)

  const run = (async () => {
    const oppIdByAbbr = invert(await teamAbbrs().catch(() => null))
    const profiles = []
    for (let i = 0; i < list.length; i += batch) {
      const got = await Promise.all(
        list.slice(i, i + batch).map((p) => profile(p, oppIdByAbbr, today).catch(() => null)),
      )
      got.forEach((r) => { if (r) profiles.push(r) })
    }
    if (!profiles.length) return []
    // "of the N we checked" must be the number that ACTUALLY produced a log,
    // not the number we asked for — a hitter whose fetch failed was not checked.
    const checked = profiles.length
    const facts = BUILDERS.map((b) => b(profiles, today, checked)).filter(Boolean)
    // rule 5: one fact per player, keeping his best one
    const used = new Set()
    return facts
      .sort((a, b) => b.fun - a.fun)
      .filter((f) => (used.has(f.pid) ? false : (used.add(f.pid), true)))
      .slice(0, limit)
  })().catch(() => [])

  _cache.set(key, run)
  return run
}
