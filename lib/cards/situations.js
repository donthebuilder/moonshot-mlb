// SITUATION STAMPS (2026-10-12; Donovan: "all types"): small FACT-ONLY stamps on the card FRONT.
// A stamp states a thing that is true about the game or the man that day, counted from REAL STORED DATA. It never changes a pick, a score, a rank or a status word,
// and it never leans: no "hot", no "due", no "lock", no "guaranteed", no "bounce-back". Counts and calendar facts only.
//
// ONE config (SITUATIONS, in priority order). Each entry names:
//   key, label     what it is
//   source         the data it reads (so an audit can find it)
//   rule           the EXACT rule, in words (the check script tests every clause)
//   explain        the one-sentence tap explanation (lib/explain.js pattern: shown on tap, never hover-only)
//   stamp(ctx)     pure: the text, or null. A stamp is SKIPPED (null) when the data is missing, stale or unsure, never guessed.
// stampsFor(ctx) returns at most MAX_STAMPS (2) stamps, highest priority first.
//
// ctx (every field optional; an absent field makes the stamps that need it null):
//   sport 'mlb'|'nfl'|'nhl'|'nba'      day 'YYYY-MM-DD' = the game's OWN date (never the wall clock)
//   phase 'post' (default) | 'pre'   post = the log INCLUDES the game (a card drawn after it: streak, season-high and rest count it); pre = the log is the games BEFORE
//                                     it (the pregame player card: a streak "coming in", rest, a milestone, a birthday, the round; never a season-high or a "first")
//   postseason { type, roundName }     type = the schedule's gameType ('F' 'D' 'L' 'W' MLB; 'P' NHL / NFL playoffs), roundName = seriesDescription / round text
//   totals { stat, before, asOf, stale }  the season total AS OF THE CARD ('goals' | 'hr' | 'td'): going into the game on a pregame card, through the game on a post-game one; asOf = the date it was read, stale=true when the source says so
//   log [{ day, goals, hr, td, shots, rec_yds, rush_yds, pts, reb, ast, tpm, pts25 }]  his REGULAR-SEASON games of this season, NEWEST FIRST, the game itself first
//   birth 'YYYY-MM-DD'
//   firstOfSeason { stat, thisGame, before }   how many he had before the game and in it (before === 0 and thisGame >= 1 = his first)
//   firstPostseason { stat, thisGame, careerBefore }   careerBefore = his career postseason total going into the game (0 = his first)
//   prevClubs ['TOR', ...]  opp 'TOR'      the clubs he played for before (stored data only)
//   returnFromInjury { missed }            games he missed, from a stored injury listing (stored data only)
import { ROUNDS, roundOf } from './postseason'
import { ageOn, isBirthdayToday } from '../birthday'

export const MAX_STAMPS = 2
export const BANNED = /\b(hot|cold|due|lock|locked|guarantee|guaranteed|bounce[- ]?back|sure thing|can'?t miss|will score|will hit|overdue)\b/i

const txt = (v) => String(v == null ? '' : v).trim()
const nn = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }
const ISO = /^\d{4}-\d{2}-\d{2}$/
const dayNum = (d) => { if (!ISO.test(String(d || ''))) return null; const [y, m, dd] = d.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, dd) / 864e5) }
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/** The stat words each counting stat prints with: [one, many, short (the stamp's unit)]. */
export const UNITS = {
  goals: { one: 'goal', many: 'goals', short: 'goal' },
  hr: { one: 'HR', many: 'HR', short: 'HR' },
  td: { one: 'TD', many: 'TD', short: 'TD' },
  shots: { one: 'shot', many: 'shots', short: 'shots' },
  rec_yds: { one: 'rec yd', many: 'rec yds', short: 'rec yds' },
  rush_yds: { one: 'rush yd', many: 'rush yds', short: 'rush yds' },
  // BUCKETS (NBA, hidden): the box score's own counts
  pts: { one: 'point', many: 'points', short: 'points' },
  reb: { one: 'rebound', many: 'rebounds', short: 'rebounds' },
  ast: { one: 'assist', many: 'assists', short: 'assists' },
  tpm: { one: 'three', many: 'threes', short: 'threes' },
}

/** The season totals that get a "N from M" stamp, per stat, and how close counts as "from" (1 or 2 away). */
export const MILESTONES = {
  goals: { marks: [10, 20, 25, 30, 40, 50, 60], within: 2 },
  hr: { marks: [10, 20, 25, 30, 40, 50, 60], within: 2 },
  td: { marks: [5, 10, 15, 20], within: 2 },
  // BUCKETS: his season POINTS total as of the card (summed from his regular-season game log, never a rate): 10 or fewer points short of a round thousand-and-a-half mark
  pts: { marks: [500, 1000, 1500, 2000, 2500], within: 10 },
}
/** A streak is only a stamp from this many games, per stat (the game itself counts). */
export const STREAK_MIN = { goals: 3, hr: 3, td: 3, pts25: 3 }   // pts25 = a game of 25 or more points (BUCKETS' event bar, lib/record/nba.js NBA_EVENT_BAR)
/** A season-high stamp needs the game to reach this floor, this many earlier games on the log, and to beat every one of them. */
export const HIGH_RULE = {
  shots: { floor: 5, minPrior: 5 }, hr: { floor: 2, minPrior: 5 }, td: { floor: 2, minPrior: 5 },
  rec_yds: { floor: 100, minPrior: 4 }, rush_yds: { floor: 100, minPrior: 4 },
  // BUCKETS: each floor is that market's own bar (lib/nba/model.js NBA_MARKETS: points 25+, rebounds 10+, assists 8+, threes 4+), and ten earlier games must be on the log
  pts: { floor: 25, minPrior: 10 }, reb: { floor: 10, minPrior: 10 }, ast: { floor: 8, minPrior: 10 }, tpm: { floor: 4, minPrior: 10 },
}
/** Days since his last game that earn the REST number (a count of days only). */
export const REST_MIN_DAYS = 5

// ── the rules (pure) ─────────────────────────────────────────────────────────
/** Does the log sit right against the game? post: its first entry IS the game; pre: its first entry is an earlier day. */
function logFits(ctx, log) {
  if (!Array.isArray(log) || !log.length || !ISO.test(String(ctx?.day || '')) || !ISO.test(String(log[0]?.day || ''))) return false
  return ctx.phase === 'pre' ? log[0].day < ctx.day : log[0].day === ctx.day
}
function postseason(ctx) {
  const p = ctx?.postseason
  if (!p) return null
  const t = txt(p.type).toUpperCase()
  const r = roundOf(t)
  let name = r ? r.name : ''
  if (!name && (t === 'P' || t === 'POST')) name = txt(p.roundName)   // NHL / NFL: the schedule's own round text
  if (r && txt(p.roundName)) name = txt(p.roundName)                  // the schedule's own words win over our table
  if (!name) return null
  return { text: `${name}`, short: name }
}

function milestone(ctx) {
  const m = ctx?.totals
  if (!m || m.stale) return null
  const cfg = MILESTONES[m.stat]
  const before = nn(m.before)
  const asOf = dayNum(m.asOf), day = dayNum(ctx.day)
  if (!cfg || before == null || before < 0 || asOf == null || day == null) return null
  // fresh = read the day before the game or on its own day (a total read earlier than that is unsure: skip)
  if (asOf > day || day - asOf > 1) return null
  const mark = cfg.marks.find((k) => k > before)
  if (mark == null) return null
  const left = mark - before
  if (left > cfg.within) return null
  const u = UNITS[m.stat]
  return { text: `${left} ${left === 1 ? u.one : u.many} from ${mark.toLocaleString('en-US')}` }
}

function streak(ctx) {
  const log = Array.isArray(ctx?.log) ? ctx.log : null
  if (!logFits(ctx, log)) return null   // post: the log must include this very game; pre: it must be the games before it
  const out = []
  for (const stat of ['goals', 'hr', 'td', 'pts25']) {
    if (nn(log[0][stat]) == null) continue   // this game does not carry the stat: no streak of it
    let n = 0
    for (const g of log) { if (nn(g[stat]) != null && nn(g[stat]) >= 1) n += 1; else break }
    if (n >= STREAK_MIN[stat]) out.push({ stat, n })
  }
  if (!out.length) return null
  const best = out.sort((a, b) => b.n - a.n)[0]
  const w = { goals: 'Goal', hr: 'HR', td: 'TD', pts25: '25+ points' }[best.stat]
  return { text: `${w} in ${best.n} straight` }
}

function seasonHigh(ctx) {
  const log = Array.isArray(ctx?.log) ? ctx.log : null
  if (ctx?.phase === 'pre' || !log || log.length < 2 || log[0].day !== ctx.day) return null   // a season-high is something a game DID
  const hits = []
  for (const stat of Object.keys(HIGH_RULE)) {
    const rule = HIGH_RULE[stat]
    const v = nn(log[0][stat])
    if (v == null || v < rule.floor) continue
    const prior = log.slice(1).map((g) => nn(g[stat]))
    if (prior.length < rule.minPrior || prior.some((x) => x == null)) continue   // a game without the stat makes the comparison unsure
    if (prior.every((x) => v > x)) hits.push({ stat, v })
  }
  if (!hits.length) return null
  const h = hits.sort((a, b) => b.v / HIGH_RULE[b.stat].floor - a.v / HIGH_RULE[a.stat].floor)[0]
  const u = UNITS[h.stat]
  return { text: `Season-high ${h.v} ${h.v === 1 ? u.one : u.many}` }
}

function birthday(ctx) {
  if (!ctx?.birth || !ctx.day || !isBirthdayToday(ctx.birth, ctx.day)) return null
  const age = ageOn(ctx.birth, ctx.day)
  return age == null ? null : { text: `Birthday: turns ${age}` }
}

function first(ctx) {
  if (ctx?.phase === 'pre') return null
  const a = ctx?.firstPostseason
  if (a && nn(a.thisGame) >= 1 && nn(a.careerBefore) === 0 && UNITS[a.stat] && ctx.postseason) {
    return { text: `First career postseason ${UNITS[a.stat].short}` }
  }
  const f = ctx?.firstOfSeason
  if (f && nn(f.thisGame) >= 1 && nn(f.before) === 0 && UNITS[f.stat] && !ctx.postseason) return { text: `First ${UNITS[f.stat].short} of the season` }
  return null
}

function formerClub(ctx) {
  const prev = Array.isArray(ctx?.prevClubs) ? ctx.prevClubs.map((c) => txt(c).toUpperCase()) : null
  const opp = txt(ctx?.opp).toUpperCase()
  if (!prev || !opp || !prev.includes(opp)) return null
  return { text: `Against his former club: ${opp}` }
}

function returnFromInjury(ctx) {
  const r = ctx?.returnFromInjury
  const missed = nn(r?.missed)
  if (missed == null || missed < 1) return null
  return { text: `Back after ${plural(missed, 'game', 'games')} out` }
}

function rest(ctx) {
  const log = Array.isArray(ctx?.log) ? ctx.log : null
  if (!logFits(ctx, log)) return null
  let a, b
  if (ctx.phase === 'pre') { a = dayNum(ctx.day); b = dayNum(log[0].day) }
  else { if (log.length < 2) return null; a = dayNum(log[0].day); b = dayNum(log[1].day) }
  if (a == null || b == null || a <= b) return null
  const days = a - b
  if (days < REST_MIN_DAYS) return null
  return { text: `${days} days since his last game` }
}

/** THE CONFIG, in priority order (index 0 wins). */
export const SITUATIONS = [
  { key: 'postseason', label: 'Postseason', source: 'the schedule: gameType + seriesDescription of the game',
    rule: 'The game is a postseason game; the stamp is the round\'s own name from the schedule.', explain: 'This game is part of the postseason; the round is the schedule\'s own name for it.', stamp: postseason },
  { key: 'first', label: 'First', source: 'the goal feed season_goals / the MLB season and career postseason lines',
    rule: 'He had none of the stat before the game and at least one in it (season), or none in his career postseason before it (postseason games only).', explain: 'A count: this is the first one he has recorded this season or in his postseason career.', stamp: first },
  { key: 'milestone', label: 'Milestone', source: 'season totals summed from his game log as of the card (StatsAPI game log; NHL game log; the NFL logs): never the homer feed\'s season_hr, which is stale on some rows',
    rule: 'The season total as of the card is 1 or 2 short of a listed mark, the total was read the day before the game or that day, and is not flagged stale.', explain: 'His season total as of this card, and how far it is from a round number. It is a count, not a forecast.', stamp: milestone },
  { key: 'high', label: 'Season-high', source: 'his regular-season game log',
    rule: 'This game beats every earlier game of the season on the log (at least the floor for the stat, at least the minimum number of earlier games, none missing the stat).', explain: 'More than he has had in any other game this season, from his game log.', stamp: seasonHigh },
  { key: 'streak', label: 'Streak', source: 'his regular-season game log',
    rule: 'He recorded the stat in this game and in every game before it back to the streak start; shown from 3 games. Counts games he played.', explain: 'Consecutive games he played with at least one. A count of games, nothing more.', stamp: streak },
  { key: 'birthday', label: 'Birthday', source: 'lib/birthday.js (the stored birth date)',
    rule: 'His birthday falls on the game\'s own date.', explain: 'His birthday is the date of this game.', stamp: birthday },
  { key: 'former', label: 'Former club', source: 'a stored list of his previous clubs (none is stored today: this stamp is never shown until one is)',
    rule: 'The opponent is on his stored list of previous clubs.', explain: 'He used to play for tonight\'s opponent.', stamp: formerClub },
  { key: 'return', label: 'Return', source: 'a stored injury listing with the games missed (none is stored today: never shown until one is)',
    rule: 'A stored listing says he missed at least one game and he is back in this one.', explain: 'He missed games before this one, from the injury listing.', stamp: returnFromInjury },
  { key: 'rest', label: 'Rest', source: 'his regular-season game log',
    rule: 'Days between this game and his previous game on the log, shown from 5 days. A number only.', explain: 'Calendar days since the last game he played, from his game log. It says nothing about how he will do.', stamp: rest },
]
export const SITUATION_KEYS = SITUATIONS.map((s) => s.key)

/** The stamps for one card: [{ key, label, text, explain }], at most `limit`, highest priority first. A rule that throws or prints a banned word is skipped. */
export function stampsFor(ctx, { limit = MAX_STAMPS } = {}) {
  const out = []
  for (const s of SITUATIONS) {
    if (out.length >= limit) break
    let r = null
    try { r = s.stamp(ctx || {}) } catch { r = null }
    if (!r || !r.text || BANNED.test(r.text)) continue
    out.push({ key: s.key, label: s.label, text: r.text, explain: s.explain })
  }
  return out
}

export { ROUNDS }
