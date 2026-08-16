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
// THE CALENDAR FAMILY HAS ONE SOURCE (the park family added two more on
// 2026-08-16 — lib/venueHr.js and lib/pitcherVenueHr.js, documented at the
// PARK-HISTORY block below):
//
// lib/gamelogs.js thresholdRates(pid), which is the hitting gameLog
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
//   6. NOTHING HERE IS A SCORE. No number computed in this file is read by the
//      HR model, the pick logic, or any ranking on the site. These are things
//      to notice, and a thing to notice that starts moving a number stops
//      being a thing to notice.
//
// ── COST ────────────────────────────────────────────────────────────────────
//
// A slate is 150-270 hitters. One gameLog call each would be a sweep of a
// public API for numbers nobody asked for, so this takes a SHORT list: the
// bot's designated picks first, then the top scorers, capped by `look`
// (default 40), pulled in small batches. thresholdRates caches per player for
// the session, so any hitter whose card has been opened is already free, and
// the assembled facts are cached per slate date + candidate set.
//
// The park family below costs more per player than that — two game-log seasons
// plus schedule batches to resolve venue IDs, see venueHr.js — so it gets its
// own, much shorter list: `parkLook` bats (default 8) and `parkArms` starters
// (default 6), taken off the FRONT of the same ranking so they are the same
// players lib/matchupStory.js is most likely to have pulled already. Both libs
// share venueHr's per-player+park cache, so any overlap costs nothing twice.

// ── 🏟 THE PARK-HISTORY FAMILY (2026-08-16) ─────────────────────────────────
//
// Donovan: "storyline like top hitters with no hrs in a park. or things like
// that can we add something like those too."
//
// So a second family of facts, about THIS BUILDING rather than about the
// calendar: a power bat who has never gone deep here, a bat who owns the
// place, an arm that has been taken deep here, an arm nobody has taken deep
// here. All four come out of lib/venueHr.js and lib/pitcherVenueHr.js, which
// join the hitting/pitching game log to the schedule's venue IDs because the
// league publishes no byVenue split — read those files before touching this.
//
// FOUR RULES, and they are the reason this family is allowed to exist at all:
//
//   1. THE DENOMINATOR IS IN THE SENTENCE, ALWAYS. Never "0 homers here" —
//      always "0 HR in 41 PA there". Two seasons of road games at one park is
//      a handful of dates, and venueHr.js says so in its own header. A bare
//      count is the exact way this data gets misread.
//   2. EVERY FLOOR IS WRITTEN DOWN WITH ITS ARITHMETIC (see PARK_* below). A
//      drought over 6 PA is not a drought, it is a Tuesday.
//   3. COLOR, NEVER A SCORE. Nothing in this file is read by the model, the
//      HR score, the pick logic or any ranking. `fun` is a DISPLAY sort for
//      this panel and nothing else — see the note on it below.
//   4. NO CAUSAL LANGUAGE. "has not homered here in 41 PA" is a counted fact.
//      "the park doesn't suit him" is an invention: parks really do have
//      handedness effects, but at eleven games this data cannot separate one
//      from noise, so the sentence never reaches for a reason.
//
// WHAT IS DELIBERATELY NOT BUILT: "he has never played in this building."
// venueRecord() covers this season and last, so zero games there means "no
// games in the window" — and it ALSO means "the schedule batch failed". Those
// two are indistinguishable from the outside, and one of them would print a
// confident lie, so the absence of history is never itself a fact here.
import { venueRecord } from './venueHr'
import { pitcherVenueRecord } from './pitcherVenueHr'
import { shortPark } from './matchupStory'
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
//   { key, icon, pid, player, parts, text, fun, sample, source? }
// `fun` IS A DISPLAY SORT AND NOTHING ELSE — it decides which sentence leads
// the panel when more facts survive than fit. It is not a rating of the
// player, it never leaves this file, and no score, ranking or pick on this
// site reads anything computed here.
// `player` is the slate row to open on tap, or null for a fact about somebody
// who isn't on the hitters slate (the pitcher park facts) — the panel makes
// those rows unclickable rather than opening the wrong card.
// `source` is the provenance line for the tooltip; facts that don't set one
// get the panel's default, which describes the season game log.
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

// ── 🏟 the park-history facts ────────────────────────────────────────────────
//
// THE FLOORS, AND THE ARITHMETIC BEHIND EACH ONE. These are the whole honesty
// story of this family, so they are constants with their reasoning attached
// rather than magic numbers buried in a filter.
//
// PARK_PA — 40 plate appearances at the park, for the drought fact.
//   A 30-homer bat goes deep about once every 18 PA. Over 40 PA that is ~2.2
//   expected homers, so a zero is roughly a 1-in-9 night — thin, but a genuine
//   oddity worth saying. Over 25 PA the same bat expects 1.4 and a zero is
//   about 1-in-4, which is not a drought, it is a coincidence with a name on
//   it. 40 is where the number stops being free.
// PARK_G — 6 games there, so 40 PA can't come from one freak doubleheader
//   weekend where he batted nine times a day.
// PARK_POWER_HR / PARK_POWER_G — he has to actually be a power bat, measured
//   over the SAME two-season window the park number comes from (no second
//   fetch, no slate field that might cover a different span): 20 homers in at
//   least 100 games. A part-time bat with no homers anywhere is not a story
//   about a building.
const PARK_PA = 40
const PARK_G = 6
const PARK_POWER_HR = 20
const PARK_POWER_G = 100
// OWNS-THE-BUILDING floors. Same 40 PA / 10 games denominator so the sentence
// can't be built on three trips, at least 4 homers there (three is inside the
// noise of ten games for anyone), and his park pace has to be at least 1.75×
// his own pace over the identical window — a comparison of a man to himself,
// which is the only comparison this data can honestly make.
const OWN_HR = 4
const OWN_G = 10
const OWN_RATIO = 1.75
// ARM floors. A starter faces ~24 hitters, so 3 outings is ~70 batters faced —
// the point where "in this building" has any content at all. The punished fact
// also wants a rate that is genuinely ugly (1.5 HR per outing is roughly twice
// a league-average start) so it can't fire on a merely normal night count.
const ARM_BF = 70
const ARM_G = 3
const ARM_HR = 5
const ARM_HR_PER_G = 1.5

// The unit a pitcher's park sample is quoted in. `bf` counts EVERY appearance
// at the park, so the sentence must quote appearances too whenever he has
// relieved here — quoting "3 starts, 96 batters faced" when one of those
// batters came in a mop-up inning would be a denominator that doesn't match
// its numerator. Starts are only named as starts when that is all there was.
const armUnit = (r) => (r.starts === r.games
  ? `${r.starts} ${plural(r.starts, 'start')}`
  : `${r.games} ${plural(r.games, 'appearance')}`)

const startYear = (seasons) => String(seasons || '').slice(0, 4)

// 🧊 THE ASK ITSELF: a real power bat who has not gone deep in this building.
// The window is named in the sentence ("since the start of 2025") because
// venueRecord only knows this season and last — an unqualified "never" would
// be a claim about a career we did not look at.
function fParkDrought(parks) {
  const cands = parks.filter((x) => {
    const r = x.rec
    return r && r.hr === 0
      && num(r.pa, 0) >= PARK_PA && num(r.games, 0) >= PARK_G
      && num(r.hrAll, 0) >= PARK_POWER_HR && num(r.gamesAll, 0) >= PARK_POWER_G
  })
  if (!cands.length) return null
  // biggest sample first — the longest quiet stretch is the one worth saying
  const x = cands.sort((a, b) => b.rec.pa - a.rec.pa || b.rec.hrAll - a.rec.hrAll)[0]
  const r = x.rec
  return finish(
    // Fixed, and the highest of the park family: this is the sentence that was
    // actually asked for, and it is the rarest of the four — a big bat needs
    // forty quiet plate appearances in one building for it to exist at all.
    { key: 'parkdrought', icon: '🧊', pid: x.pid, player: x.p, fun: 92,
      sample: `${r.pa} PA at ${x.venue} in ${r.games} games, ${r.seasons}`,
      source: `Counted from his hitting game log for ${r.seasons}, joined to the schedule's venue IDs — ${r.pa} plate appearances at ${x.venue} across ${r.games} games. Two seasons at one park is a small number of dates, which is why the sentence says the sample out loud. Nothing here is modelled, and nothing here feeds a score.` },
    [
      NAME(x.who), T(' has not homered at '), T(x.park), T(' since the start of '),
      N(startYear(r.seasons)), T(': '), N('0 HR'), T(' in '), N(`${r.pa} PA`),
      T(' there, across '), N(r.games), T(` ${plural(r.games, 'game')} — and `),
      N(r.hrAll), T(' homers everywhere else in the same span. A fact, not a forecast.'),
    ],
  )
}

// 🏟 THE INVERSE: he does it here at a clip he does not manage anywhere else.
// Both rates come out of the same two seasons of the same game log, so it is
// him against himself — not against the league, and not against the park.
function fParkOwner(parks) {
  const cands = parks.filter((x) => {
    const r = x.rec
    return r && num(r.hr, 0) >= OWN_HR && num(r.games, 0) >= OWN_G && num(r.pa, 0) >= PARK_PA
      && num(r.vsSelf, 0) >= OWN_RATIO && num(r.rate, 0) > 0 && num(r.rateAll, 0) > 0
  })
  if (!cands.length) return null
  const x = cands.sort((a, b) => b.rec.vsSelf - a.rec.vsSelf || b.rec.hr - a.rec.hr)[0]
  const r = x.rec
  return finish(
    { key: 'parkowner', icon: '🏟', pid: x.pid, player: x.p, fun: 72 + Math.min(16, r.hr * 3),
      sample: `${r.games} games and ${r.pa} PA at ${x.venue}, ${r.seasons}`,
      source: `Counted from his hitting game log for ${r.seasons}, joined to the schedule's venue IDs — ${r.hr} homers in ${r.games} games at ${x.venue} (${r.pa} PA), against ${r.hrAll} in ${r.gamesAll} games overall in the same window. Both rates come from the one log, so it is a comparison of him to himself. Color only — nothing here feeds a score.` },
    [
      NAME(x.who), T(' does his damage at '), T(x.park), T(': '), N(`${r.hr} HR`),
      T(' in '), N(r.games), T(` ${plural(r.games, 'game')} there (`), N(`${r.pa} PA`),
      T('), '), T(r.seasons), T(' — '), N(r.rate.toFixed(2)),
      T(' per game in this building against '), N(r.rateAll.toFixed(2)),
      T(' per game overall in the same span.'),
    ],
  )
}

// 💣 THE ARM THAT KEEPS GETTING TAGGED HERE. hr/games/bf are all counted over
// the same set of appearances at this park, so the numerator and denominator
// belong to each other; his overall line rides along for scale.
function fArmTagged(parks, arms) {
  const cands = arms.filter((x) => {
    const r = x.rec
    return r && num(r.hr, 0) >= ARM_HR && num(r.games, 0) >= ARM_G && num(r.starts, 0) >= 2
      && num(r.bf, 0) >= ARM_BF && r.hr / r.games >= ARM_HR_PER_G
  })
  if (!cands.length) return null
  const x = cands.sort((a, b) => (b.rec.hr / b.rec.games) - (a.rec.hr / a.rec.games) || b.rec.hr - a.rec.hr)[0]
  const r = x.rec
  return finish(
    // No `player`: this fact is about the man on the mound, and he is not a
    // row on the hitters slate — handing the panel a hitter to open here would
    // attach the wrong card to the sentence.
    { key: 'armtagged', icon: '💣', pid: x.pid, player: null, fun: 64 + Math.min(18, r.hr * 2),
      sample: `${armUnit(r)} at ${x.venue}, ${r.bf} batters faced, ${r.seasons}`,
      source: `Counted from his pitching game log for ${r.seasons}, joined to the schedule's venue IDs — ${r.hr} homers allowed over ${armUnit(r)} at ${x.venue}, ${r.bf} batters faced. A handful of outings at one park is a small sample, which is why the batters-faced count is in the line. Color only — nothing here feeds a score.` },
    [
      NAME(x.who), T(' has been taken deep '), N(`${r.hr} times`), T(' in '),
      N(armUnit(r)), T(' at '), T(x.park), T(' — '), N(`${r.bf} batters faced`),
      T(', '), T(r.seasons), T(' — against '), N(r.hrAll), T(' in '), N(r.gamesAll),
      T(' outings overall.'),
    ],
  )
}

// 🔒 THE INVERSE ARM: nobody has got one out on him here. Gated on the FULL
// park record being zero, not just his starts, so "has not allowed a homer at
// Comerica" needs no asterisk about a relief inning.
function fArmClean(parks, arms) {
  const cands = arms.filter((x) => {
    const r = x.rec
    return r && r.hr === 0 && num(r.games, 0) >= ARM_G && num(r.starts, 0) >= 2 && num(r.bf, 0) >= ARM_BF
  })
  if (!cands.length) return null
  const x = cands.sort((a, b) => b.rec.bf - a.rec.bf)[0]
  const r = x.rec
  return finish(
    { key: 'armclean', icon: '🔒', pid: x.pid, player: null, fun: 48 + Math.min(14, r.games * 2),
      sample: `${armUnit(r)} at ${x.venue}, ${r.bf} batters faced, ${r.seasons}`,
      source: `Counted from his pitching game log for ${r.seasons}, joined to the schedule's venue IDs — ${r.bf} batters faced over ${armUnit(r)} at ${x.venue}, no homers allowed. Color only — nothing here feeds a score.` },
    [
      NAME(x.who), T(' has not allowed a homer at '), T(x.park), T(' since the start of '),
      N(startYear(r.seasons)), T(': '), N('0'), T(' in '), N(armUnit(r)), T(' there, '),
      N(`${r.bf} batters faced`), T('.'),
    ],
  )
}

// Same uniform (parks, arms) signature as BUILDERS' (profiles, today, checked),
// so the runner calls every builder the same way; the hitter facts ignore the
// second argument and the arm facts ignore the first.
const PARK_BUILDERS = [fParkDrought, fParkOwner, fArmTagged, fArmClean]

// ── the park pulls ───────────────────────────────────────────────────────────
// One row per hitter / per starter, or null. EVERY failure path lands on null,
// which means "no fact" — never a fact with a hole in it. A slate row with no
// venue never spends a call at all.
async function parkRow(p) {
  const pid = pidOf(p)
  const venue = String(p?.venue_name || '').trim()
  if (!pid || !venue) return null
  const rec = await venueRecord(pid, venue, p?.game_pk ?? null).catch(() => null)
  if (!rec) return null
  return { p, pid, who: nameOf(p), venue, park: shortPark(venue) || venue, rec }
}

async function armRow(p) {
  const pid = num(p?.pitcher_id)
  const venue = String(p?.venue_name || '').trim()
  const who = String(p?.pitcher_name || '').trim()
  if (!pid || !venue || !who) return null
  const rec = await pitcherVenueRecord(pid, venue, p?.game_pk ?? null).catch(() => null)
  if (!rec) return null
  return { p, pid, who, venue, park: shortPark(venue) || venue, rec }
}

// ── the slate ────────────────────────────────────────────────────────────────
//
// `slateDate` is the YYYY-MM-DD the page is showing (today, or tomorrow in
// tomorrow mode) — the weekday and month facts are about THAT date, not about
// the wall clock, so a tomorrow slate reads "Mr. Saturday" correctly.
const _cache = new Map()

// `parkLook` / `parkArms` cap the park family's own, much more expensive pull
// (see COST). `skipPitchers` lets a caller hand over the arms that are already
// being talked about somewhere else on the page — the matchup lines name a
// starter's park record too, and printing the same arm twice in one panel
// reads like a bug. Unknown ids are simply never matched, so a caller passing
// nothing loses nothing.
export async function funFacts(players = [], {
  look = 40, limit = 4, batch = 6, slateDate = '',
  parkLook = 8, parkArms = 6, skipPitchers = [],
} = {}) {
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

  // THE PARK LISTS, off the front of the same ranking. Hitters need a venue to
  // have a park history at all; arms are deduped by pitcher id, so the nine
  // hitters in one game cost one starter pull between them.
  const skip = new Set((skipPitchers || []).map((x) => Number(x)).filter(Boolean))
  const parkList = list.filter((p) => String(p?.venue_name || '').trim()).slice(0, Math.max(0, parkLook))
  const armList = []
  {
    const armSeen = new Set()
    list.forEach((p) => {
      const ap = num(p?.pitcher_id)
      if (!ap || armSeen.has(ap) || skip.has(ap)) return
      if (!String(p?.venue_name || '').trim() || !String(p?.pitcher_name || '').trim()) return
      armSeen.add(ap)
      if (armList.length < Math.max(0, parkArms)) armList.push(p)
    })
  }

  // The cache key carries everything that can change the answer, the skipped
  // arms included — otherwise a page that learns its matchup lines late would
  // keep serving the fun facts computed before it knew them.
  const key = `${day}|${list.map(pidOf).join(',')}|${limit}|${parkList.length}:${armList.map((p) => num(p?.pitcher_id)).join('.')}`
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
    // The park pull runs in its own small batches AFTER the log pass rather
    // than alongside it: these are the heavy calls, and a slate should never
    // have both waves of them in flight at once. A batch of 3, because one
    // park row is itself up to a dozen requests.
    const parks = []
    for (let i = 0; i < parkList.length; i += 3) {
      const got = await Promise.all(parkList.slice(i, i + 3).map((p) => parkRow(p).catch(() => null)))
      got.forEach((r) => { if (r) parks.push(r) })
    }
    const arms = []
    for (let i = 0; i < armList.length; i += 3) {
      const got = await Promise.all(armList.slice(i, i + 3).map((p) => armRow(p).catch(() => null)))
      got.forEach((r) => { if (r) arms.push(r) })
    }
    // Either wave can come back empty — a failed people/stats call must not
    // take the other family down with it.
    if (!profiles.length && !parks.length && !arms.length) return []
    // "of the N we checked" must be the number that ACTUALLY produced a log,
    // not the number we asked for — a hitter whose fetch failed was not checked.
    const checked = profiles.length
    const facts = [
      ...(profiles.length ? BUILDERS.map((b) => b(profiles, today, checked)) : []),
      ...PARK_BUILDERS.map((b) => b(parks, arms)),
    ].filter(Boolean)
    // rule 5: one fact per player, keeping his best one. The pitcher facts key
    // on the arm's id, which can't collide with a hitter's — league ids are
    // unique across people — so an arm and his opponent can both be quoted.
    const used = new Set()
    return facts
      .sort((a, b) => b.fun - a.fun)
      .filter((f) => (used.has(f.pid) ? false : (used.add(f.pid), true)))
      .slice(0, limit)
  })().catch(() => [])

  _cache.set(key, run)
  return run
}
