// PLAYER FACTS, FROM REAL DATA (fix23-facts-1009, 2026-10-09). The fact engine used to find only TEAM
// facts (a streak, an unbeaten start) and one MLB bot-record fact, so on most days it had nothing to say.
// These are the player facts, for every sport, off the same readers the polls and the Slate already use:
//   p_streak       he has done it in N straight games        (hot-sticks / game logs / nfl_logs)
//   p_form         he cleared a bar in 7+ of his last 10     (the market's own standard bar)
//   p_birthday     NFL: his birth_date in the bot's week file is today
//   p_vs_team      NFL: touchdowns in his logged games vs this week's opponent (>= 2 meetings)
//   p_milestone    NFL season totals / MLB season-and-career counts within reach of a round number
//   p_vs_starter   MLB: his record against tonight's confirmed starter (the board's bvp_* fields)
// EVERY figure is a field copied off a stored count; nothing is worked out beyond a count of rows the
// data already holds. Only players the poll adapters let through (on the slate, lineup / starter / goalie /
// injury checks passed, game not started) are ever named. Pure builders first, then one reader per sport.
import { BRAND, POST_WORDS, sportKey } from '../routes'
import { decorate } from './label'
import { easternDate } from '../data'

const num = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }
const int = (v) => { const n = num(v); return n != null && Number.isInteger(n) ? n : null }
const txt = (v) => String(v == null ? '' : v).trim()

const ET = 'America/New_York'
/** '7:05 PM ET', or 'Sun 1:00 PM ET' when the game is not on `today`. */
export function whenOf(startMs, today) {
  if (!Number.isFinite(startMs)) return null
  const time = new Date(startMs).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: ET })
  const day = new Date(startMs).toLocaleDateString('en-CA', { timeZone: ET })
  const wd = day === today ? '' : `${new Date(startMs).toLocaleDateString('en-US', { weekday: 'short', timeZone: ET })} `
  return `${wd}${time} ET`
}

// where each family's numbers come from, said short (no digits; the brand is the registry's)
const VIA_OF = { p_birthday: (b) => `${b} player file`, p_vs_starter: (b) => `${b} head-to-head counts`, p_milestone: (b) => `${b} season and career counts` }
// the fields every player fact carries
function base(sport, family, p, today, extra) {
  const k = sportKey(sport)
  return decorate({
    sport: k, family, date: p.gameDay || today, player: p.name, team: p.team, opp: p.opp || null, when: whenOf(p.startMs, today),
    named: [String(p.id)], pid: String(p.id), startMs: p.startMs, market: POST_WORDS[k].market, proves: [], ...extra,
    via: (VIA_OF[family] || ((brand) => `${brand} game logs`))(BRAND[k].name),
  })
}
const byId = (players) => new Map((players || []).map((p) => [String(p.id), p]))
const rankBonus = (p) => (num(p.rank) != null && p.rank <= 10 ? 4 : 0)

/** HOT STREAK: one per player, his longest active run. streaks = [{ id, what, whatKey, n }]. */
export function streakFacts({ sport, players, streaks, today }) {
  const P = byId(players), best = new Map()
  for (const s of streaks || []) {
    const n = int(s.n)
    if (!P.has(String(s.id)) || n == null || n < 2) continue
    const old = best.get(String(s.id))
    if (!old || n > old.n) best.set(String(s.id), { ...s, n })
  }
  return [...best.values()].map((s) => {
    const p = P.get(String(s.id))
    return base(sport, 'p_streak', p, today, {
      what: txt(s.what), whatKey: txt(s.whatKey), n: s.n,
      id: `${sportKey(sport)}:${p.gameDay || today}:p_streak:${p.id}:${s.whatKey}${s.n}`,
      source: `${sportKey(sport)} game logs, his last ${s.n} games`, why: `${s.what} in ${s.n} straight games`,
      score: 52 + Math.min(s.n, 10) * 3 + rankBonus(p),
    })
  })
}

/** FORM CHECK: he cleared the market's standard bar in at least 7 of a window of at least 8 games. bars = [{ id, label, threshold, cleared, of }]. */
export function formFacts({ sport, players, bars, today, minOf = 8, minRate = 0.7 }) {
  const P = byId(players), seen = new Set(), out = []
  for (const b of bars || []) {
    const p = P.get(String(b.id)), cleared = int(b.cleared), of = int(b.of)
    if (!p || cleared == null || of == null || of < minOf || cleared / of < minRate || seen.has(p.id)) continue
    seen.add(p.id)
    out.push(base(sport, 'p_form', p, today, {
      bar: txt(b.label), threshold: num(b.threshold), cleared, of,
      id: `${sportKey(sport)}:${p.gameDay || today}:p_form:${p.id}:${txt(b.label).replace(/\W+/g, '')}`,
      source: `${sportKey(sport)} game logs, his last ${of} games`, why: `${b.label} in ${cleared} of his last ${of}`,
      score: 40 + Math.round(40 * (cleared / of - minRate)) + (cleared === of ? 8 : 0) + rankBonus(p),
    }))
  }
  return out
}

// ── NFL ─────────────────────────────────────────────────────────────────────
const fmtBorn = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

/** BIRTHDAY: the week file's birth_date is `today` (ET). Age from the birth year -- never a stored age. */
export function nflBirthdayFacts({ data, players, today }) {
  const P = byId(players), mmdd = today.slice(5), out = []
  for (const r of data?.players || []) {
    const p = P.get(txt(r.player_id)), bd = txt(r.birth_date)
    if (!p || !/^\d{4}-\d{2}-\d{2}$/.test(bd) || bd.slice(5) !== mmdd) continue
    const age = Number(today.slice(0, 4)) - Number(bd.slice(0, 4))
    if (!(age >= 18 && age <= 50)) continue
    out.push(base('nfl', 'p_birthday', p, today, {
      age, born: fmtBorn(bd), id: `nfl:${today}:p_birthday:${p.id}`, source: 'the week file (birth_date)', why: `turns ${age} today`, score: 58 + rankBonus(p),
    }))
  }
  return out
}

/** VS THIS TEAM: touchdowns in his logged games against this week's opponent, at least two meetings. */
export function nflVsTeamFacts({ logs, players, today, minMeetings = 2 }) {
  const out = []
  for (const p of players || []) {
    const rows = logs?.logs?.[String(p.id)]?.log
    if (!Array.isArray(rows) || !rows.length || !p.opp) continue
    let tds = 0, meetings = 0
    for (const g of rows) { if (txt(g?.opp) !== p.opp) continue; meetings += 1; tds += num(g?.g_td) || 0 }
    const seasons = rows.map((g) => int(g?.s)).filter((s) => s != null)
    if (tds < 1 || meetings < minMeetings || !seasons.length) continue
    out.push(base('nfl', 'p_vs_team', p, today, {
      tds: Math.round(tds), meetings, since: Math.min(...seasons), id: `nfl:${p.gameDay || today}:p_vs_team:${p.id}:${p.opp}`,
      source: 'nfl game logs', why: `${Math.round(tds)} TD in ${meetings} logged games vs ${p.opp}`, score: 40 + Math.min(Math.round(tds), 6) * 4 + (tds >= meetings ? 6 : 0) + rankBonus(p),
    }))
  }
  return out
}

/** MILESTONE WATCH (NFL): milestoneCountdowns() rows [{ player, stat, have, next, gap, games }]. */
export function nflMilestoneFacts({ countdowns, players, today }) {
  const P = byId(players), out = []
  for (const c of countdowns || []) {
    const p = P.get(txt(c.player?.player_id)), have = int(c.have), next = int(c.next), gap = int(c.gap), games = int(c.games)
    if (!p || have == null || next == null || gap == null || games == null) continue
    out.push(base('nfl', 'p_milestone', p, today, {
      stat: txt(c.stat), have, next, gap, games, id: `nfl:${p.gameDay || today}:p_milestone:${p.id}:${txt(c.stat).replace(/\W+/g, '')}${next}`,
      source: 'nfl game logs, this season', why: `${gap} from ${next} ${c.stat}`, score: 46 + (gap === 1 ? 10 : 0) + rankBonus(p),
    }))
  }
  return out
}

// ── MLB ─────────────────────────────────────────────────────────────────────
/** HEAD TO HEAD: the board row's batter-vs-starter record (bvp_*) against tonight's CONFIRMED starter. */
export function mlbVsStarterFacts({ rows, players, today, minAb = 6 }) {
  const P = byId(players), out = [], seen = new Set()
  for (const r of rows || []) {
    const p = P.get(txt(r.player_id)), ab = int(r.bvp_ab), hits = int(r.bvp_hits), hr = int(r.bvp_hr) ?? 0
    const pitcher = txt(r.pitcher_name), pteam = txt(r.pitcher_team)
    if (!p || seen.has(p.id) || !pitcher || !pteam || r.pitcher_projected === true || ab == null || hits == null || ab < minAb || hits > ab) continue
    if (!(hr >= 2 || hits / ab >= 0.4)) continue
    seen.add(p.id)
    out.push(base('mlb', 'p_vs_starter', p, today, {
      pitcher, pitcherTeam: pteam, ab, hits, hr, id: `mlb:${today}:p_vs_starter:${p.id}:${r.pitcher_id}`,
      source: 'the board bvp fields (batter vs pitcher)', why: `${hits} for ${ab} against ${pitcher}${hr ? `, ${hr} HR` : ''}`, score: 44 + hr * 6 + Math.round(10 * (hits / ab)) + rankBonus(p),
    }))
  }
  return out
}

/** MILESTONE WATCH (MLB): milestonePicks() rows [{ player_id, need, t, word }]. */
export function mlbMilestoneFacts({ picks, players, today }) {
  const P = byId(players), out = []
  for (const m of picks || []) {
    const p = P.get(txt(m.player_id)), gap = int(m.need), next = int(m.t)
    if (!p || gap == null || next == null || gap < 1) continue
    out.push(base('mlb', 'p_milestone', p, today, {
      stat: txt(m.word), gap, next, id: `mlb:${today}:p_milestone:${p.id}:${txt(m.word).replace(/\W+/g, '')}${next}`,
      source: 'MLB Stats API season and career counts', why: `${gap} from ${next} ${m.word}`, score: 46 + (gap === 1 ? 10 : 0) + rankBonus(p),
    }))
  }
  return out
}

// ── THE READER: one call per sport. { active, why, gameDay, firstStartMs, facts, players } ────────
const ADAPTERS = {
  mlb: () => import('../dash/polls/adapters/mlb').then((m) => m.createMlbPollAdapter),
  nfl: () => import('../dash/polls/adapters/nfl').then((m) => m.createNflPollAdapter),
  nhl: () => import('../dash/polls/adapters/nhl').then((m) => m.createNhlPollAdapter),
  nba: () => import('../dash/polls/adapters/nba').then((m) => m.createNbaPollAdapter),
}

/** The ET date of the next NFL kickoff still to come this week (the build-up days read THAT day's slate). */
export function nflGameDay(data, now = Date.now()) {
  const next = (data?.games || []).filter((g) => g?.kickoff && g.completed !== true && Date.parse(g.kickoff) > now).map((g) => Date.parse(g.kickoff)).sort((a, b) => a - b)[0]
  return Number.isFinite(next) ? easternDate(next) : null
}

export async function readPlayerFacts(sport, { today, now = Date.now(), db = null, mlbMilestones = null } = {}) {
  const k = sportKey(sport)
  const make = await ADAPTERS[k]()
  let day = today, week = null
  if (k === 'nfl') {
    // the NFL slate is read for the NEXT game day, so the build-up days (Tue-Sat) have a slate to speak of
    const D = await import('../nfl/dataSource')
    week = await D.fetchNfl(D.nflSlatePaths('this'), D.nflSlateLooksReal).catch(() => null)
    day = week ? nflGameDay(week, now) : null
    if (!day) return { sport: k, active: false, why: week ? 'no NFL game left this week' : 'no week file', gameDay: null, facts: [], players: [] }
  }
  const a = make({ day, now, db, ...(week ? { data: week } : {}) })
  const slate = await a.slate()
  if (!slate.active) return { sport: k, active: false, why: slate.why || 'inactive', gameDay: day, facts: [], players: [] }
  const players = slate.players.map((p) => ({ ...p, gameDay: day }))
  const firstStartMs = Math.min(...players.map((p) => p.startMs).filter(Number.isFinite))
  const [streaks, bars] = await Promise.all([a.streaks().catch(() => []), a.bars().catch(() => [])])
  let facts = [...streakFacts({ sport: k, players, streaks, today }), ...formFacts({ sport: k, players, bars, today })]
  if (k === 'nfl') {
    const [data, logs] = await Promise.all([a.data(), a.logs()])
    const { milestoneCountdowns } = await import('../nfl/storylines')
    facts.push(...nflBirthdayFacts({ data, players, today }))
    if (logs) facts.push(...nflVsTeamFacts({ logs, players, today }), ...nflMilestoneFacts({ countdowns: milestoneCountdowns(data, logs, { limit: 60 }), players, today }))
  }
  if (k === 'mlb') {
    facts.push(...mlbVsStarterFacts({ rows: await a.rows(), players, today }))
    if (mlbMilestones) facts.push(...mlbMilestoneFacts({ picks: await mlbMilestones((await a.rows()).filter((r) => players.some((p) => p.id === txt(r.player_id))).slice(0, 40)), players, today }))
  }
  return { sport: k, active: true, gameDay: day, firstStartMs: Number.isFinite(firstStartMs) ? firstStartMs : null, facts: facts.sort((x, y) => y.score - x.score), players, pending: slate.pending }
}
