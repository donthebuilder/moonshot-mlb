// X POLLS: THE FIVE FORMATS AND THE REVEAL (X overhaul stage 3 piece 2, 2026-10-09). Pure.
//
// Every builder takes REAL data an adapter read (lib/dash/polls/adapters/<sport>.js) and returns
//   { format, category, kind, key, text, options, named, payload, discordText } or null
// null = not enough real data for this format right now (the next format is tried). Nothing here
// invents a name, a number or a result, and nothing prints a model probability: the context line
// of an over/under is a COUNT ("cleared it in 6 of his last 10"), a fact.
//
// Copy (STYLE GUIDE): line 1 the sport emoji + LABEL IN CAPS ('🏈 TUDDY POLL'), a blank line,
// a short question, at most two emoji in all, no link, no hashtag, no "bot", full names.
// A poll option is at most 25 characters and the options are distinct (xPolicy.distinctOptions).
import { BRAND, sportKey } from '../../routes'
import { distinctOptions } from '../xPolicy'
import { CATEGORY, FUN_ORDER, OPTION_MAX, kindFor, questionWindowDays } from './kinds'

// The sport's own words. Sport differences live in this table (and the adapters), never in a ternary
// inside the copy. `guess` is absent for a sport with no stored result to reveal from (BUCKETS today).
export const WORDS = Object.freeze({
  mlb: { when: 'tonight', first: 'goes deep first', guess: { metric: 'hr_most', noun: 'hitters', asks: 'goes deep the most tonight' } },
  nfl: { when: 'today', first: 'scores first', guess: { metric: 'td_longest', noun: 'players', asks: 'has the longest touchdown today' } },
  nhl: { when: 'tonight', first: 'scores first', guess: { metric: 'goals_most', noun: 'skaters', asks: 'scores the most goals tonight' } },
  nba: { when: 'tonight', first: 'hits 25 first', guess: null },
})

/** '⚾ MOONSHOT POLL' from the registry (lib/routes.js BRAND). */
export const headerFor = (sport) => { const b = BRAND[sportKey(sport)]; return `${b.icon} ${b.name} POLL` }
export const resultHeaderFor = (sport) => `${headerFor(sport)} RESULT`

// a short stable hash -> the starting offset into a candidate list, so a day's choice is
// deterministic (two racing ticks pick the same poll) yet differs from day to day.
export function hashOf(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) } return h >>> 0 }
const rotate = (list, by) => (list.length ? [...list.slice(by % list.length), ...list.slice(0, by % list.length)] : [])
const fits = (p) => p && p.id && p.name && p.name.length <= OPTION_MAX
const usable = (players, exclude) => (players || []).filter((p) => fits(p) && !(exclude && exclude.has(String(p.id))))
const idsKey = (ids) => [...ids].map(String).sort().join(',')
const matchup = (a, b) => (a.team && b.team && a.opp === b.team && b.opp === a.team ? `${a.team} vs ${b.team}` : null)

function spec({ sport, format, key, lines, options, named, payload }) {
  const text = [headerFor(sport), '', ...lines].join('\n')
  const opts = distinctOptions(options, 4)
  if (opts.length < 2 || opts.length !== options.length) return null    // an option collided or was dropped: not a poll
  const lettered = opts.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join('\n')
  return {
    sport, format, category: CATEGORY[format], kind: kindFor(sport, format), key: `${format}:${key}`,
    text, options: opts, named: [...new Set(named.map(String))],
    payload: { format, category: CATEGORY[format], question_key: `${format}:${key}`, options: opts, named: [...new Set(named.map(String))], ...payload },
    discordText: `${text}\n\n${lettered}`,
  }
}

const open = (ctx, key) => !(ctx.usedKeys && ctx.usedKeys.has(`${ctx.format}:${key}`))

// ── 1. PICK ONE: two real players, one race. Same game first (a real matchup), else the top two.
export function buildPickOne(ctx) {
  const { sport, day } = ctx
  const W = WORDS[sport]
  const ps = usable(ctx.players, ctx.exclude).slice(0, 8)
  const pairs = []
  for (let i = 0; i < ps.length; i += 1) for (let j = i + 1; j < ps.length; j += 1) pairs.push([ps[i], ps[j]])
  const same = pairs.filter(([a, b]) => matchup(a, b))
  const order = [...rotate(same, hashOf(`${sport}|${day}|pick`)), ...pairs.filter((p) => !same.includes(p))]
  for (const [a, b] of order) {
    const key = idsKey([a.id, b.id])
    if (!open({ ...ctx, format: 'pick' }, key)) continue
    const m = matchup(a, b)
    const made = spec({
      sport, format: 'pick', key,
      lines: [`Who ${W.first} ${W.when}?`, '', `${a.name} (${a.team}) or ${b.name} (${b.team})`, ...(m ? [m] : [])],
      options: [a.name, b.name, 'Neither'],
      named: [a.id, b.id],
      payload: { players: [{ id: String(a.id), name: a.name }, { id: String(b.id), name: b.name }] },
    })
    if (made) return made
  }
  return null
}

// ── 2. OVER OR UNDER: the market's standard bar, his real count over his last games as context.
// bars: [{ id, label: '2+ total bases', threshold: 2, cleared: 6, of: 10 }] (cleared/of are COUNTS).
export function buildOverUnder(ctx) {
  const { sport, day } = ctx
  const byId = new Map(usable(ctx.players, ctx.exclude).map((p) => [String(p.id), p]))
  const bars = (ctx.bars || []).filter((b) => byId.has(String(b.id)) && Number.isInteger(b.threshold) && b.threshold >= 1 && Number.isInteger(b.cleared) && Number.isInteger(b.of) && b.of >= 5 && b.cleared >= 0 && b.cleared <= b.of)
  for (const b of rotate(bars, hashOf(`${sport}|${day}|over`))) {
    const key = `${b.id}:${b.label}`
    if (!open({ ...ctx, format: 'over' }, key)) continue
    const p = byId.get(String(b.id))
    const under = b.threshold - 1
    const made = spec({
      sport, format: 'over', key,
      lines: [`${p.name} (${p.team}): ${b.label} ${WORDS[sport].when}?`, `Cleared it in ${b.cleared} of his last ${b.of}.`, '', 'Over or under?'],
      options: [`Over (${b.threshold}+)`, under === 0 ? 'Under (0)' : `Under (${under} or fewer)`],
      named: [p.id],
      payload: { player: { id: String(p.id), name: p.name }, bar: b.label, threshold: b.threshold, l10: { cleared: b.cleared, of: b.of } },
    })
    if (made) return made
  }
  return null
}

// ── 3. GUESS THE STAT: three players, answered by a REVEAL post after the games (buildReveal).
export function buildGuess(ctx) {
  const { sport, day } = ctx
  const g = WORDS[sport]?.guess
  if (!g) return null
  const ps = usable(ctx.players, ctx.exclude).slice(0, 7)
  const triples = []
  for (let i = 0; i < ps.length; i += 1) for (let j = i + 1; j < ps.length; j += 1) for (let k = j + 1; k < ps.length; k += 1) triples.push([ps[i], ps[j], ps[k]])
  for (const t of rotate(triples, hashOf(`${sport}|${day}|guess`))) {
    const key = idsKey(t.map((p) => p.id))
    if (!open({ ...ctx, format: 'guess' }, key)) continue
    const made = spec({
      sport, format: 'guess', key,
      lines: [`Which of these 3 ${g.noun} ${g.asks}?`],
      options: t.map((p) => p.name),
      named: t.map((p) => p.id),
      payload: { guess: { metric: g.metric, day, players: t.map((p) => ({ id: String(p.id), name: p.name })) } },
    })
    if (made) return made
  }
  return null
}

// ── 4. STREAK WATCH: three players on the same real streak. streaks: [{ id, what, whatKey, n, min }].
export function buildStreak(ctx) {
  const { sport, day } = ctx
  const byId = new Map(usable(ctx.players, ctx.exclude).map((p) => [String(p.id), p]))
  const groups = new Map()
  for (const s of ctx.streaks || []) {
    if (!byId.has(String(s.id)) || !(s.n >= (s.min || 2))) continue
    if (!groups.has(s.whatKey)) groups.set(s.whatKey, [])
    groups.get(s.whatKey).push(s)
  }
  for (const [, list] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    const top = list.sort((a, b) => b.n - a.n).slice(0, 6)
    const triples = []
    for (let i = 0; i < top.length; i += 1) for (let j = i + 1; j < top.length; j += 1) for (let k = j + 1; k < top.length; k += 1) triples.push([top[i], top[j], top[k]])
    for (const t of rotate(triples, hashOf(`${sport}|${day}|streak`))) {
      const n = Math.min(...t.map((s) => s.n))                       // true for all three: each has at least n
      const key = `${idsKey(t.map((s) => s.id))}:${t[0].whatKey}:${n}`
      if (!open({ ...ctx, format: 'streak' }, key)) continue
      const made = spec({
        sport, format: 'streak', key,
        lines: [`These 3 have ${t[0].what} in each of their last ${n}.`, '', `Who makes it ${n + 1}?`],
        options: [...t.map((s) => byId.get(String(s.id)).name), 'None of them'],
        named: t.map((s) => s.id),
        payload: { streak: { what: t[0].what, n, players: t.map((s) => ({ id: String(s.id), name: byId.get(String(s.id)).name })) } },
      })
      if (made) return made
    }
  }
  return null
}

// ── 5. BOARD QUESTION: only names the public pregame / slate post already carried (called), and who
// are still eligible now. called: [{ id, name, team }] in the post's order.
export function buildBoard(ctx) {
  const { sport } = ctx
  const ok = new Set((ctx.players || []).map((p) => String(p.id)))
  const names = usable(ctx.called, ctx.exclude).filter((c) => ok.has(String(c.id))).slice(0, 4)
  if (names.length < 2) return null
  const key = idsKey(names.map((c) => c.id))
  if (!open({ ...ctx, format: 'board' }, key)) return null
  return spec({
    sport, format: 'board', key,
    lines: [`Which of ${WORDS[sport].when}'s CALLED players cashes first?`],
    options: names.map((c) => c.name),
    named: names.map((c) => c.id),
    payload: { players: names.map((c) => ({ id: String(c.id), name: c.name })) },
  })
}

export const BUILDERS = Object.freeze({ pick: buildPickOne, over: buildOverUnder, guess: buildGuess, streak: buildStreak, board: buildBoard })

/**
 * The order formats are tried in: board and fun ALTERNATE (the last poll's category decides), and the
 * fun formats rotate (the one after the last fun format first). Falls through to everything else, so a
 * sport with thin data still gets a poll when any format can be built.
 */
export function formatOrder(last, lastFun = null) {
  const from = FUN_ORDER.indexOf(lastFun) + 1            // -1 + 1 = 0 when there was none
  const fun = [...FUN_ORDER.slice(from), ...FUN_ORDER.slice(0, from)]
  return last?.category === 'fun' ? ['board', ...fun] : [...fun, 'board']
}

/**
 * Pick the day's poll. Pure. `data` = what the adapter read:
 *   players  eligible (every pre-naming check passed), best first
 *   bars, streaks, called
 * `history` = [{ day, kind, payload }] this sport's polls in the last 8 days (newest first or any order).
 * `excludeFor(format)` -> Set of ids this format's kind named too recently (the repeat guard, early).
 * @returns the spec, or null.
 */
export function rotationState({ sport, day, history = [] }) {
  const dayNo = (d) => Math.floor(Date.parse(`${d}T12:00:00Z`) / 864e5)
  const win = questionWindowDays(sport)
  const usedKeys = new Set(history.filter((r) => dayNo(day) - dayNo(r.day) < win && r.payload?.question_key).map((r) => r.payload.question_key))
  const prior = history.filter((r) => r.day < day && r.payload?.format).sort((a, b) => (a.day < b.day ? 1 : -1))[0]
  const last = prior ? { format: prior.payload.format, category: prior.payload.category || CATEGORY[prior.payload.format] } : null
  // the fun format the rotation is at: the most recent prior fun poll's
  const lastFun = history.filter((r) => r.day < day && FUN_ORDER.includes(r.payload?.format)).sort((a, b) => (a.day < b.day ? 1 : -1))[0]?.payload.format || null
  return { usedKeys, last, lastFun }
}

export function choosePoll({ sport, day, data, history = [], excludeFor = () => new Set() }) {
  const { usedKeys, last, lastFun } = rotationState({ sport, day, history })
  for (const format of formatOrder(last, lastFun)) {
    const s = BUILDERS[format]({ sport, day, usedKeys, exclude: excludeFor(format), ...data })
    if (s) return s
  }
  return null
}

// ── THE REVEAL (INFO, quotes the poll). `guess` = the poll's stored payload.guess; `result` = what the
// adapter read from STORED results: { known, ranking: [{ id, name, value }] } -- only candidates who
// actually registered the stat, best first. Unknown or empty = null = post nothing.
const plural = (n, one, many) => (n === 1 ? one : many)
export function buildReveal({ sport, guess, result }) {
  if (!guess || !result || result.known !== true) return null
  const rank = (result.ranking || []).filter((r) => r && r.name && Number.isFinite(Number(r.value)) && Number(r.value) > 0)
  if (!rank.length) return null
  const top = rank.filter((r) => Number(r.value) === Number(rank[0].value))
  const v = Number(rank[0].value)
  const names = top.map((r) => r.name)
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  let line
  if (guess.metric === 'hr_most') line = top.length === 1 ? `${who} led the three with ${v} ${plural(v, 'home run', 'home runs')}.` : `${who} tied for the lead with ${v} ${plural(v, 'home run', 'home runs')} each.`
  else if (guess.metric === 'td_longest') line = top.length === 1 ? `${who} had the longest touchdown of the three: ${v} ${plural(v, 'yard', 'yards')}.` : `${who} tied for the longest touchdown of the three: ${v} ${plural(v, 'yard', 'yards')}.`
  else if (guess.metric === 'goals_most') line = top.length === 1 ? `${who} led the three with ${v} ${plural(v, 'goal', 'goals')}.` : `${who} tied for the lead with ${v} ${plural(v, 'goal', 'goals')} each.`
  else return null
  return { text: [resultHeaderFor(sport), '', line].join('\n'), named: top.map((r) => String(r.id)).filter(Boolean) }
}
