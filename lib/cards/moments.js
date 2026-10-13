// THE CARD MOMENTS: ONE config for every "special card" (pure, no I/O, no JSX; safe for scripts and unit tests).
// A moment is a real thing that happened that is worth a card of its own (a goal, a hat trick, a 100-yard game ...). Each entry names
//   key, sport, label           what it is
//   needs                       the fields its data row must carry (the loaders in lib/cards/specialData.js build exactly these)
//   trigger(row)                the EXACT real-data rule, a pure function over one data row: true or false, never a guess
//   tierOf(row)                 'base' | 'star' | 'elite' | 'legend' from the same row (a rarity of the event, never a chance)
//   holoFrom                    the lowest tier that is drawn as a full holo card (rainbow foil); null = never. A STAR card always SHIMMERS
//                               (a quiet foil: thin strip + one soft sheen band + faint sparkle, no rainbow wash); ELITE = holo; LEGEND = gold holo.
//                               Foil is a RARITY, never a result: it never changes a word on the card.
//   print(row)                  what the card prints: { kicker, hero:{word,value}, tag, tiles:[{label,value,unit,sub}], line, note }
//   statusOf(row)               'called' | 'board' | null : the label the SOURCE stored (lib/callStatus; never re-derived here).
//                               null means "no call word on the card": a man who was not called is never shown as called.
// Rows are "data rows": a lamp_goal_feed row, or one of the groupers below over stored rows (hat trick = the goals of one man in one game).
// Nothing here prints a probability, a "lock", a "due" or a "guarantee"; wins are stated only as facts (a count, a clock, a yardage).
import { callStatus, tdCallStatus, hasRoleIn, HR_CALL_ROLES } from '../callStatus'

// THE TIER WORDS (Donovan, 2026-10-12): BASE (common) · STAR (rare) · ELITE (epic) · LEGEND (legendary)
export const TIERS = ['base', 'star', 'elite', 'legend']
export const TIER_WORD = { base: 'BASE', star: 'STAR', elite: 'ELITE', legend: 'LEGEND' }
export const tierRank = (t) => TIERS.indexOf(t)
/** The lowest tier that shimmers: a STAR card and up carry foil (STAR shimmers, ELITE / LEGEND are holo). */
export const SHIMMER_FROM = 'star'

const txt = (v) => String(v == null ? '' : v).trim()
const nn = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }
const secs = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(txt(t)); return m ? Number(m[1]) * 60 + Number(m[2]) : 0 }
const ord = (n) => { const r = n % 100; return `${n}${r >= 11 && r <= 13 ? 'TH' : ['TH', 'ST', 'ND', 'RD'][n % 10] || 'TH'}` }
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 'S'}`

/** The tier a count reaches: `steps` = [[min, tier], ...] ascending. */
const byCount = (n, steps) => steps.reduce((t, [min, tier]) => (n >= min ? tier : t), 'base')

// ── NHL words (from the goal feed's own fields) ─────────────────────────────
/** "1ST" / "2ND" / "OT" / "2OT" from a feed row's period + period_type. */
export const periodShort = (r) => {
  const n = nn(r.period) || 0
  if (txt(r.period_type).toUpperCase() === 'OT') { const k = n - 3; return k > 1 ? `${k}OT` : 'OT' }
  return ord(n)
}
export const strengthCode = (r) => (r.empty_net ? 'EN' : txt(r.strength).toLowerCase() === 'pp' ? 'PP' : txt(r.strength).toLowerCase() === 'sh' ? 'SH' : 'EV')
const STRENGTH_WORD = { EV: 'EVEN STRENGTH', PP: 'POWER PLAY', SH: 'SHORTHANDED', EN: 'EMPTY NET' }
const statusFromFeed = (s) => (s === 'called' || s === 'board' ? s : null)
const goalOrder = (a, b) => (nn(a.period) - nn(b.period)) || (secs(a.time_in_period) - secs(b.time_in_period))

// ── groupers: stored rows -> the data rows the moments read (pure) ──────────

/** lamp_goal_feed rows -> Map('gameId:playerId' -> line). Standing goals only (overturned and shootout goals are not goals); an assist
 *  counts for the man named in a standing goal's `assists`. A man who only assisted carries the feed's short name and NO status. */
export function nhlGameLines(feedRows) {
  const out = new Map()
  const line = (r, id, name, scorer) => {
    const k = `${r.game_id}:${id}`
    if (!out.has(k)) out.set(k, { game_id: Number(r.game_id), player_id: Number(id), day: r.day, team: r.team, opp: r.opp, name, goals: [], assists: [], status: null, scorer })
    return out.get(k)
  }
  for (const r of feedRows || []) {
    if (r.overturned_at || txt(r.period_type).toUpperCase() === 'SO' || !r.player_id) continue
    const s = line(r, r.player_id, r.name, true)
    s.scorer = true; s.name = r.name; s.goals.push(r)
    s.status = statusFromFeed(r.status)
    for (const a of r.assists || []) if (a?.id) { const l = line(r, a.id, a.name, false); l.assists.push(r) }
  }
  for (const l of out.values()) { l.goals.sort(goalOrder); l.points = l.goals.length + l.assists.length }
  return out
}

/** homer_feed rows -> Map('gamePk:playerId' -> line): his DISTINCT home runs of the game (one per hr_n; a repeated hr_n is one homer). */
export function mlbGameLines(rows) {
  const out = new Map()
  for (const r of rows || []) {
    if (!r.player_id || r.hr_n == null) continue
    const k = `${r.game_pk}:${r.player_id}`
    if (!out.has(k)) out.set(k, { game_pk: String(r.game_pk), player_id: String(r.player_id), day: r.day, name: r.name, team: r.team, opponent: r.opponent, home: r.home, hrs: [], first: r })
    const l = out.get(k)
    if (!l.hrs.some((x) => Number(x.hr_n) === Number(r.hr_n))) l.hrs.push(r)
  }
  for (const l of out.values()) l.hrs.sort((a, b) => Number(a.hr_n) - Number(b.hr_n))
  return out
}

/**
 * Which side each club was in a game, from the feed's own running score: the side whose score went up on a club's touchdown is the side that
 * club is on. Map(game_id -> { home, away }) of club codes; a game where no touchdown moved a score has no entry (the card then draws no "vs" / "@").
 */
export function nflSides(rows) {
  const out = new Map()
  const byGame = new Map()
  for (const r of rows || []) { if (!byGame.has(String(r.game_id))) byGame.set(String(r.game_id), []); byGame.get(String(r.game_id)).push(r) }
  for (const [g, rs] of byGame) {
    rs.sort((a, b) => Number(a.td_n) - Number(b.td_n))
    let ph = 0, pa = 0
    const sides = {}
    for (const r of rs) {
      const h = nn(r.home_score), a = nn(r.away_score)
      if (h == null || a == null) continue
      if (h > ph && a === pa) sides.home = r.team
      else if (a > pa && h === ph) sides.away = r.team
      ph = h; pa = a
    }
    if (sides.home || sides.away) out.set(g, sides)
  }
  return out
}
/** true / false / null: is `team` the home club of `game_id` according to nflSides. */
export function nflHomeOf(sides, game_id, team) {
  const s = sides.get(String(game_id))
  if (!s) return null
  if (s.home === team) return true
  if (s.away === team) return false
  if (s.home) return false
  if (s.away) return true
  return null
}

/** nfl_td_feed rows -> Map('gameId:gsisId' -> line): the touchdowns HE scored (the passer of a pass TD is not the scorer). */
export function nflGameLines(rows) {
  const out = new Map()
  const sides = nflSides(rows)
  for (const r of rows || []) {
    if (!r.gsis_id) continue
    const k = `${r.game_id}:${r.gsis_id}`
    if (!out.has(k)) out.set(k, { game_id: String(r.game_id), gsis_id: String(r.gsis_id), day: r.day, name: r.scorer_name, team: r.team, opponent: r.opponent, home: nflHomeOf(sides, r.game_id, r.team), tds: [], first: r })
    const l = out.get(k)
    if (!l.tds.some((x) => Number(x.td_n) === Number(r.td_n))) l.tds.push(r)
  }
  for (const l of out.values()) l.tds.sort((a, b) => Number(a.td_n) - Number(b.td_n))
  return out
}

/** nfl_logs.json (logs[gsis].log = one entry per game: s, w, d, h, tm, opp, g_ruyd, g_car, g_recyd, g_rec, g_td) -> yardage rows, every week it holds. `names` = Map(gsis -> name). */
export function nflLogYardRows({ logs, names = new Map(), only = null }) {
  const out = []
  for (const [id, v] of Object.entries(logs?.logs || {})) {
    if (only && String(only) !== id) continue
    for (const g of v?.log || []) {
      const rush = nn(g.g_ruyd), rec = nn(g.g_recyd)
      if ((rush || 0) < 100 && (rec || 0) < 100) continue
      out.push({ gsis_id: id, name: names.get(id) || null, team: g.tm || null, opp: g.opp || null, home: g.h === 1 ? true : g.h === 0 ? false : null, season: nn(g.s), week: nn(g.w), day: g.d || null, rush_yds: rush, rush_att: nn(g.g_car), rec_yds: rec, rec: nn(g.g_rec), td: nn(g.g_td) })
    }
  }
  return out
}

// ── shared print pieces ─────────────────────────────────────────────────────
const goalTile = (g, label) => ({ label, value: txt(g.time_in_period) || '—', sub: `${strengthCode(g)} · ${txt(g.score_after)}`.replace(/ · $/, '') })
/** "top 4th" -> "TOP 4TH", "bot 8th" -> "BOT 8TH" (the feed's own inning text, upper-cased; anything else as it is). */
const inningWord = (v) => txt(v).toUpperCase() || '—'
const assistWords = (g) => (g.assists || []).map((a) => a.name).filter(Boolean).join(', ')

// ── THE MOMENTS ─────────────────────────────────────────────────────────────
export const MOMENTS = {
  nhl_goal: {
    key: 'nhl_goal', sport: 'nhl', label: 'A goal', holoFrom: null,
    needs: ['game_id', 'player_id', 'goal_n', 'day', 'period', 'period_type', 'time_in_period', 'strength', 'empty_net', 'team', 'opp', 'name', 'season_goals', 'assists', 'score_after', 'status', 'overturned_at'],
    trigger: (r) => Boolean(r && r.player_id && r.name && !r.overturned_at && txt(r.period_type).toUpperCase() !== 'SO' && txt(r.time_in_period)),
    // an overtime goal is a STAR; every other goal is BASE
    tierOf: (r) => (txt(r.period_type).toUpperCase() === 'OT' ? 'star' : 'base'),
    statusOf: (r) => statusFromFeed(r.status),
    print: (r) => {
      const code = strengthCode(r)
      const tiles = [{ label: 'STRENGTH', value: code, sub: STRENGTH_WORD[code] }]
      if (txt(r.score_after)) tiles.push({ label: 'SCORE AFTER', value: txt(r.score_after).replace(/ · /g, '  ·  '), small: true })
      if (nn(r.season_goals) != null) tiles.push({ label: 'THIS SEASON', value: `${nn(r.season_goals)}`, unit: nn(r.season_goals) === 1 ? 'GOAL' : 'GOALS' })
      if (assistWords(r)) tiles.push({ label: 'ASSISTS', value: assistWords(r), small: true })
      const when = txt(r.period_type).toUpperCase() === 'OT' ? (periodShort(r) === 'OT' ? 'OVERTIME' : `${periodShort(r)} OVERTIME`) : `${periodShort(r)} PERIOD`
      return { kicker: txt(r.period_type).toUpperCase() === 'OT' ? 'OT GOAL' : 'GOAL', hero: { word: `${periodShort(r)} · ${code}`, value: txt(r.time_in_period) }, tag: nn(r.season_goals) != null ? `GOAL #${nn(r.season_goals)} THIS SEASON` : '', tiles, line: `GOAL · ${when} · ${txt(r.time_in_period)}`, note: 'from the NHL score feed, as the goal was confirmed' }
    },
  },

  nhl_hat_trick: {
    key: 'nhl_hat_trick', sport: 'nhl', label: 'Hat trick', holoFrom: 'elite',
    needs: ['game_id', 'player_id', 'day', 'team', 'opp', 'name', 'goals[period, period_type, time_in_period, strength, empty_net, score_after, season_goals, overturned_at]', 'status'],
    trigger: (l) => Boolean(l && l.scorer && (l.goals || []).length >= 3),
    tierOf: (l) => byCount((l.goals || []).length, [[3, 'elite'], [4, 'legend']]),
    statusOf: (l) => l.status || null,
    print: (l) => {
      const n = l.goals.length
      const tiles = l.goals.slice(0, 6).map((g, i) => ({ label: `GOAL ${i + 1} · ${periodShort(g)}`, value: txt(g.time_in_period), sub: `${strengthCode(g)} · ${txt(g.score_after)}`.replace(/ · $/, '') }))
      const last = l.goals.at(-1)
      return { kicker: n >= 4 ? `${n}-GOAL GAME` : 'HAT TRICK', hero: { word: 'GOALS', value: String(n) }, tag: nn(last.season_goals) != null ? `${nn(last.season_goals)} GOALS THIS SEASON` : '', tiles, line: plural(n, 'GOAL'), note: 'every goal is a standing goal in the NHL score feed (shootout goals do not count)' }
    },
  },

  nhl_three_points: {
    key: 'nhl_three_points', sport: 'nhl', label: '3+ point night', holoFrom: 'elite',
    needs: ['game_id', 'player_id', 'day', 'team', 'opp', 'name', 'goals[]', 'assists[] (the goal rows he assisted on)', 'status (only when he scored)'],
    // a hat trick has its own card, so a 3-goal night is not repeated here
    trigger: (l) => Boolean(l && (l.goals.length + l.assists.length) >= 3 && l.goals.length < 3),
    tierOf: (l) => byCount(l.goals.length + l.assists.length, [[3, 'star'], [5, 'elite'], [7, 'legend']]),
    statusOf: (l) => l.status || null,
    print: (l) => {
      const g = l.goals.length, a = l.assists.length, p = g + a
      const tiles = [{ label: 'GOALS', value: String(g) }, { label: 'ASSISTS', value: String(a) }]
      if (g) tiles.push({ label: 'LAST GOAL', value: txt(l.goals.at(-1).time_in_period), sub: `${periodShort(l.goals.at(-1))} · ${strengthCode(l.goals.at(-1))}` })
      return { kicker: `${p}-POINT NIGHT`, hero: { word: 'POINTS', value: String(p) }, tag: `${plural(g, 'GOAL')} · ${plural(a, 'ASSIST')}`, tiles, line: plural(p, 'POINT'), note: 'goals and assists as the NHL score feed lists them' }
    },
  },

  nhl_season_goal_milestone: {
    key: 'nhl_season_goal_milestone', sport: 'nhl', label: 'Season goal milestone', holoFrom: 'elite',
    needs: ['the nhl_goal fields', 'season_goals (the league feed\'s goalsToDate, counting this goal)'],
    trigger: (r) => MOMENTS.nhl_goal.trigger(r) && NHL_MILESTONES.includes(nn(r.season_goals)),
    tierOf: (r) => ({ 20: 'star', 25: 'star', 30: 'star', 40: 'elite', 50: 'legend', 60: 'legend' }[nn(r.season_goals)] || 'star'),
    statusOf: (r) => statusFromFeed(r.status),
    print: (r) => {
      const n = nn(r.season_goals)
      const base = MOMENTS.nhl_goal.print(r)
      return { ...base, kicker: `GOAL #${n}`, hero: { word: 'THIS SEASON', value: `#${n}` }, tag: `${periodShort(r)} · ${txt(r.time_in_period)}`, tiles: base.tiles.filter((t) => t.label !== 'THIS SEASON'), line: `GOAL #${n} OF THE SEASON` }
    },
  },

  mlb_multi_hr: {
    key: 'mlb_multi_hr', sport: 'mlb', label: 'Multi-HR game', holoFrom: 'elite',
    needs: ['game_pk', 'player_id', 'day', 'name', 'team', 'opponent', 'hrs[hr_n, inning]', 'role / on_board / board_rank / stats.board_of (for the label)'],
    trigger: (l) => Boolean(l && (l.hrs || []).length >= 2),
    tierOf: (l) => byCount(l.hrs.length, [[2, 'star'], [3, 'elite'], [4, 'legend']]),
    statusOf: (l) => { const s = callStatus({ role: l.first?.role, on_board: l.first?.on_board, board_rank: l.first?.board_rank, board_of: l.first?.stats?.board_of }); return s === 'off' ? null : s },
    print: (l) => {
      const n = l.hrs.length
      const tiles = l.hrs.slice(0, 6).map((h, i) => ({ label: `HOME RUN ${i + 1}`, value: inningWord(h.inning) }))
      return { kicker: n === 2 ? 'TWO-HOMER GAME' : `${n}-HOMER GAME`, hero: { word: 'HOME RUNS', value: String(n) }, tag: '', tiles, line: plural(n, 'HOME RUN'), note: 'home runs as the MOONSHOT homer feed logged them' }
    },
  },

  nfl_multi_td: {
    key: 'nfl_multi_td', sport: 'nfl', label: '2+ TD game', holoFrom: 'elite',
    needs: ['game_id', 'gsis_id', 'day', 'scorer_name', 'team', 'opponent', 'tds[td_n, quarter, clock, kind, kind_word, yards, passer_name]', 'on_bot / td_board (for the label)'],
    trigger: (l) => Boolean(l && (l.tds || []).length >= 2),
    tierOf: (l) => byCount(l.tds.length, [[2, 'star'], [3, 'elite'], [4, 'legend']]),
    statusOf: (l) => { const s = tdCallStatus({ on_bot: l.first?.on_bot, td_board: l.first?.td_board }); return s === 'off' ? null : s },
    print: (l) => {
      const n = l.tds.length
      const tiles = l.tds.slice(0, 6).map((t, i) => ({ label: `TD ${i + 1} · Q${t.quarter} · ${txt(t.clock)}`, value: nn(t.yards) != null ? String(nn(t.yards)) : '—', unit: 'YD', sub: txt(t.kind_word) + (t.kind === 'pass' && t.passer_name ? ` from ${t.passer_name}` : '') }))
      return { kicker: `${n} TOUCHDOWNS`, hero: { word: 'TOUCHDOWNS', value: String(n) }, tag: '', tiles, line: plural(n, 'TOUCHDOWN'), note: 'scoring plays from the TUDDY touchdown feed' }
    },
  },

  nfl_100_yards: {
    key: 'nfl_100_yards', sport: 'nfl', label: '100-yard game', holoFrom: 'elite',
    needs: ['gsis_id', 'name', 'team', 'opp', 'season', 'week', 'day', 'rush_yds', 'rush_att', 'rec_yds', 'rec', 'td (the player game logs the site publishes: nfl_logs.json, every week of the season)'],
    trigger: (r) => Boolean(r && ((nn(r.rush_yds) || 0) >= 100 || (nn(r.rec_yds) || 0) >= 100)),
    tierOf: (r) => { const y = Math.max(nn(r.rush_yds) || 0, nn(r.rec_yds) || 0); return y >= 200 ? 'legend' : y >= 150 ? 'elite' : 'star' },
    statusOf: () => null,   // the yardage file does not carry the call label, so the card draws none
    print: (r) => {
      const rush = (nn(r.rush_yds) || 0) >= (nn(r.rec_yds) || 0)
      const y = rush ? nn(r.rush_yds) : nn(r.rec_yds)
      const tiles = []
      if (nn(r.rush_yds) != null && (rush || nn(r.rush_yds) > 0)) tiles.push({ label: 'RUSH YDS', value: String(nn(r.rush_yds)), sub: nn(r.rush_att) != null ? `${nn(r.rush_att)} carries` : '' })
      if (nn(r.rec_yds) != null && (!rush || nn(r.rec_yds) > 0)) tiles.push({ label: 'REC YDS', value: String(nn(r.rec_yds)), sub: nn(r.rec) != null ? `${nn(r.rec)} catches` : '' })
      if (nn(r.td) != null) tiles.push({ label: 'TOUCHDOWNS', value: String(nn(r.td)) })
      return { kicker: rush ? '100-YARD RUSHING GAME' : '100-YARD RECEIVING GAME', hero: { word: rush ? 'RUSH YDS' : 'REC YDS', value: String(y) }, tag: nn(r.week) != null ? `WEEK ${nn(r.week)}` : '', tiles, line: `${y} ${rush ? 'RUSHING' : 'RECEIVING'} YARDS`, note: "from the game log TUDDY publishes (the week's box score)" }
    },
  },

  long_shot_cashed: {
    key: 'long_shot_cashed', sport: 'any', label: 'A called pick that cashed at a long price', holoFrom: 'elite',
    needs: ['sport', 'player_id', 'day', 'name', 'team', 'opp', 'market', 'role', 'status = called', 'hit = true (the event happened)', 'best (American price from stored odds)', 'books (how many listed it)'],
    trigger: (r) => Boolean(r && r.status === 'called' && r.hit === true && nn(r.best) != null && nn(r.best) >= LONG_SHOT.floor && nn(r.books) >= 1),
    tierOf: (r) => (nn(r.best) >= LONG_SHOT.legend ? 'legend' : nn(r.best) >= LONG_SHOT.elite ? 'elite' : 'star'),
    statusOf: (r) => (r.status === 'called' ? 'called' : null),
    print: (r) => {
      const price = `+${Math.round(nn(r.best))}`
      return { kicker: 'LONG SHOT CASHED', hero: { word: 'BEST PRICE', value: price }, tag: `BEST OF ${nn(r.books)} BOOK${nn(r.books) === 1 ? '' : 'S'}`, tiles: [{ label: 'THE CALL', value: txt(r.market).toUpperCase(), small: true }, { label: 'RESULT', value: 'CASHED' }], line: `CALLED · ${txt(r.market).toUpperCase()} · CASHED`, note: 'price from the stored odds snapshot, never a closing line' }
    },
  },
}

// THE LONG SHOT (Donovan, 2026-10-12: "+750 or better is a true long shot"): a CALLED pick that happened, with a best stored price (American odds)
// of +floor or longer and at least one book. The three numbers are the ONE place to change it: the floor is the STAR tier, then ELITE, then LEGEND.
export const LONG_SHOT = { floor: 750, elite: 1200, legend: 2000 }
export const LONG_PRICE = LONG_SHOT.floor
/** The season goal totals that get their own card (NHL, regular season). */
export const NHL_MILESTONES = [20, 25, 30, 40, 50, 60]

// ── BUCKETS' MOMENTS (NBA): HIDDEN (2026-10-12, BUCKETS parity pass) ──────────────────────────────────────────────────────────────────
// Five moments, each a plain count from the FINAL box score as BUCKETS grades it (buckets_log rows: graded, regular season / playoffs, the man played, not void).
// They live in their OWN table, not in MOMENTS, on purpose: MOMENTS / MOMENT_KEYS are the PUBLIC cards (the shelf, the binder, the pushes, the posts and the
// special-card route enumerate them), so a hidden sport's moment can never be listed by a public loop. A route that draws one must first pass the BUCKETS gate
// (lib/nba/gate.js): app/api/card/special does. Nothing here is posted or pushed (lib/openSwitch.js), and a record is never built from them.
//
// THE DATA ROW (nbaGameLines groups stored rows into it): { game_id, player_id, day, name, team, opp, home, pts, reb, ast, tpm, tens, status }
//   pts reb ast tpm   from the graded rows' `actual` of the pts / reb / ast / 3pm markets (the ESPN box: points, rebounds, assists, threes made)
//   tens              how many of points / rebounds / assists / steals / blocks he had 10 or more of: the exact count from his double-double / triple-double row when BUCKETS
//                     scored him there, else counted from the three he has (a LOWER BOUND, so a double-double is never claimed that the box did not prove)
//   status            { pts, 3pm, dd, td } = the label each market's row LOCKED with before tip ('called' | 'board' | 'off'), the board's own word, never re-derived
// Tiers are a rarity of the EVENT, never a chance: a 30-point night STAR, 40+ ELITE, 50+ LEGEND, a double-double BASE, a triple-double ELITE, 10+ threes ELITE, 12+ LEGEND.
export const NBA_BARS = Object.freeze({ thirty: 30, forty: 40, fifty: 50, threes: 10, threesLegend: 12 })
const statusOfMarket = (row, market) => { const s = row?.status?.[market]; return s === 'called' || s === 'board' ? s : null }
const nnTens = (r) => nn(r.tens)
/** A "points" tile set shared by the scoring cards. */
const lineTiles = (r) => [
  nn(r.pts) != null ? { label: 'POINTS', value: String(nn(r.pts)) } : null, nn(r.reb) != null ? { label: 'REBOUNDS', value: String(nn(r.reb)) } : null,
  nn(r.ast) != null ? { label: 'ASSISTS', value: String(nn(r.ast)) } : null, nn(r.tpm) != null ? { label: 'THREES', value: String(nn(r.tpm)) } : null,
].filter(Boolean)
const NBA_NOTE = "counted from the final box score, as BUCKETS grades it"

export const NBA_MOMENTS = {
  nba_30_points: {
    key: 'nba_30_points', sport: 'nba', hidden: true, label: '30-point game', holoFrom: 'elite',
    needs: ['game_id', 'player_id', 'day', 'name', 'team', 'opp', 'pts (the graded points row\'s actual)', 'reb', 'ast', 'tpm', 'status.pts'],
    // a 40-point game has its own card, so a 40-point night is not repeated here (the hat trick / 3-point night pattern)
    trigger: (r) => Boolean(r && r.player_id && r.name && nn(r.pts) != null && nn(r.pts) >= NBA_BARS.thirty && nn(r.pts) < NBA_BARS.forty),
    tierOf: () => 'star',
    statusOf: (r) => statusOfMarket(r, 'pts'),
    print: (r) => ({ kicker: '30-POINT GAME', hero: { word: 'POINTS', value: String(nn(r.pts)) }, tag: '', tiles: lineTiles(r), line: `${nn(r.pts)} POINTS`, note: NBA_NOTE }),
  },
  nba_40_points: {
    key: 'nba_40_points', sport: 'nba', hidden: true, label: '40-point game', holoFrom: 'elite',
    needs: ['game_id', 'player_id', 'day', 'name', 'team', 'opp', 'pts', 'reb', 'ast', 'tpm', 'status.pts'],
    trigger: (r) => Boolean(r && r.player_id && r.name && nn(r.pts) != null && nn(r.pts) >= NBA_BARS.forty),
    tierOf: (r) => (nn(r.pts) >= NBA_BARS.fifty ? 'legend' : 'elite'),
    statusOf: (r) => statusOfMarket(r, 'pts'),
    print: (r) => ({ kicker: nn(r.pts) >= NBA_BARS.fifty ? '50-POINT GAME' : '40-POINT GAME', hero: { word: 'POINTS', value: String(nn(r.pts)) }, tag: '', tiles: lineTiles(r), line: `${nn(r.pts)} POINTS`, note: NBA_NOTE }),
  },
  nba_double_double: {
    key: 'nba_double_double', sport: 'nba', hidden: true, label: 'Double-double', holoFrom: 'elite',
    needs: ['game_id', 'player_id', 'day', 'name', 'team', 'opp', 'tens (2 exactly)', 'pts', 'reb', 'ast', 'status.dd'],
    // a triple-double has its own card
    trigger: (r) => Boolean(r && r.player_id && r.name && nnTens(r) === 2),
    tierOf: () => 'base',
    statusOf: (r) => statusOfMarket(r, 'dd'),
    print: (r) => ({ kicker: 'DOUBLE-DOUBLE', hero: { word: 'DOUBLE-DOUBLE', value: `${nn(r.pts)}-${nn(r.reb)}-${nn(r.ast)}` }, tag: 'PTS-REB-AST', tiles: lineTiles(r), line: 'DOUBLE-DOUBLE', note: NBA_NOTE }),
  },
  nba_triple_double: {
    key: 'nba_triple_double', sport: 'nba', hidden: true, label: 'Triple-double', holoFrom: 'elite',
    needs: ['game_id', 'player_id', 'day', 'name', 'team', 'opp', 'tens (3 or more)', 'pts', 'reb', 'ast', 'status.td'],
    trigger: (r) => Boolean(r && r.player_id && r.name && nnTens(r) != null && nnTens(r) >= 3),
    tierOf: () => 'elite',
    statusOf: (r) => statusOfMarket(r, 'td'),
    print: (r) => ({ kicker: 'TRIPLE-DOUBLE', hero: { word: 'TRIPLE-DOUBLE', value: `${nn(r.pts)}-${nn(r.reb)}-${nn(r.ast)}` }, tag: 'PTS-REB-AST', tiles: lineTiles(r), line: 'TRIPLE-DOUBLE', note: NBA_NOTE }),
  },
  nba_10_threes: {
    key: 'nba_10_threes', sport: 'nba', hidden: true, label: '10 threes', holoFrom: 'elite',
    needs: ['game_id', 'player_id', 'day', 'name', 'team', 'opp', 'tpm (the graded 3PM row\'s actual)', 'pts', 'status.3pm'],
    trigger: (r) => Boolean(r && r.player_id && r.name && nn(r.tpm) != null && nn(r.tpm) >= NBA_BARS.threes),
    tierOf: (r) => (nn(r.tpm) >= NBA_BARS.threesLegend ? 'legend' : 'elite'),
    statusOf: (r) => statusOfMarket(r, '3pm'),
    print: (r) => ({ kicker: `${nn(r.tpm)} THREES`, hero: { word: 'THREES MADE', value: String(nn(r.tpm)) }, tag: nn(r.pts) != null ? `${nn(r.pts)} POINTS` : '', tiles: lineTiles(r), line: `${nn(r.tpm)} THREES MADE`, note: NBA_NOTE }),
  },
}

/** buckets_log rows (GRADED regular-season / playoff rows only; the caller leaves out preseason, void and ungraded) -> Map('gameId:playerId' -> the data row above). Pure. */
export function nbaGameLines(rows) {
  const out = new Map()
  for (const r of rows || []) {
    if (!r || r.player_id == null || r.game_id == null || r.hit == null && r.actual == null) continue
    if (r.void_reason || r.graded_at === null || r.season_type === 1) continue
    const a = nn(r.actual)
    if (a == null) continue
    const k = `${r.game_id}:${r.player_id}`
    if (!out.has(k)) out.set(k, { game_id: String(r.game_id), player_id: String(r.player_id), day: r.game_date, name: r.name, team: r.team, opp: r.opp, home: r.home ?? null, pts: null, reb: null, ast: null, tpm: null, tensExact: null, status: {} })
    const l = out.get(k)
    const lab = r.status === 'called' || r.status === 'board' ? r.status : 'off'
    if (r.market === 'pts') { l.pts = a; l.status.pts = lab }
    else if (r.market === 'reb') { l.reb = a; l.status.reb = lab }
    else if (r.market === 'ast') { l.ast = a; l.status.ast = lab }
    else if (r.market === '3pm') { l.tpm = a; l.status['3pm'] = lab }
    else if (r.market === 'dd') { l.tensExact = Math.max(l.tensExact ?? 0, a); l.status.dd = lab }
    else if (r.market === 'td') { l.tensExact = Math.max(l.tensExact ?? 0, a); l.status.td = lab }
  }
  for (const l of out.values()) {
    const three = [l.pts, l.reb, l.ast].filter((v) => v != null && v >= 10).length
    l.tens = l.tensExact != null ? Math.max(l.tensExact, three) : three > 0 ? three : null
  }
  return out
}

/** Every moment, public and hidden, by key (the lookups below). The PUBLIC list is MOMENTS / MOMENT_KEYS alone. */
export const ALL_MOMENTS = { ...MOMENTS, ...NBA_MOMENTS }
export const NBA_MOMENT_KEYS = Object.keys(NBA_MOMENTS)
export const isHiddenMoment = (key) => Object.hasOwn(NBA_MOMENTS, String(key))

/** The moment keys, in display order. PUBLIC moments only: a hidden sport's are NBA_MOMENT_KEYS. */
export const MOMENT_KEYS = Object.keys(MOMENTS)
export const momentOf = (key) => (Object.hasOwn(ALL_MOMENTS, String(key)) ? ALL_MOMENTS[String(key)] : null)

/** The tier a data row earns for a moment, or null when the trigger is false. */
export function evaluate(key, row) {
  const m = momentOf(key)
  if (!m || !m.trigger(row)) return null
  const tier = m.tierOf(row)
  const holo = m.holoFrom != null && tierRank(tier) >= tierRank(m.holoFrom)
  // STAR (and anything a moment does not draw as holo) shimmers: a quiet foil, never the rainbow
  return { key, sport: m.sport, tier, holo, shimmer: !holo && tierRank(tier) >= tierRank(SHIMMER_FROM), status: m.statusOf(row), print: m.print(row) }
}
