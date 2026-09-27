// ⚾ MOONSHOT'S STORIES, ONE ENGINE (BATCH-STORYLINES-PAGE step 1, 2026-09-27).
// Server-safe. Everything components/Storylines.js computed in the browser --
// matchup lines, fun facts, back-to-back, milestones, BvP duels, revenge,
// rivalries, birthdays, giveaways -- plus History Watch, as the shared story
// shape (lib/stories/shape.js), each tied to its game (game_pk). The rules
// are the panel's own, carried over with their reasons; the long histories
// behind them stay in components/Storylines.js's comments and git.
//
//   buildMlbStories(input)  pure: the slate rows + what the loader fetched
//   loadMlbStories(day)     the fetches (statsapi, homer_feed, the board)
//
// RARITY (0-1), per type:
//   history    0.95   a query-backed "first since" claim
//   matchup    0.80 for the lib's strongest line, down 0.04 a rank (lib/matchupStory.js sorts by strength)
//   funfact    0.78 for the lib's rarest fact, down 0.04 a rank (lib/funFacts.js sorts by `fun`)
//   milestone  0.45 + 0.35 x (1 - need / window)   one away inside a tight window is rarest
//   duel       0.65 owned (2+ HR or 1.050+ OPS on 8+ PA), 0.50 never solved him
//   b2b        0.55 back-to-back, 0.45 a day-off return
//   revenge    0.50 + 0.05 per recent season with the old club (max 0.70)
//   rivalry    0.30   game-level
//   birthday   0.20
//   giveaway   0.35 his own night, 0.20 a bobblehead / player item
import { createClient } from '@supabase/supabase-js'
import { nameOf, teamOf, oppOf, n as num0 } from '../player'
import { pickSplit, HITTING_FIELDS } from '../seasonSplit'
import { teamAbbrs } from '../gamelogs'
import { matchupStories } from '../matchupStory'
import { funFacts } from '../funFacts'
import { backToBack } from '../b2bCore'
import { mlbWatch } from '../history/watch'
import { fetchBoardFull } from '../dash/board'
import { slateDateFromRows } from '../data'
import { story, parts, name, num, byRarity } from './shape'

// The panel's rungs (components/Storylines.js S_MILES / C_MILES), unchanged.
export const S_MILES = [
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
export const C_MILES = [
  { key: 'hits', targets: [500, 1000, 1500, 2000, 2500, 3000], within: 5, word: 'career hits' },
  { key: 'homeRuns', targets: Array.from({ length: 14 }, (_, i) => 50 + i * 50), within: 2, word: 'career homers' },
  { key: 'rbi', targets: [500, 1000, 1500, 2000], within: 5, word: 'career RBI' },
  { key: 'runs', targets: [500, 1000, 1500, 2000], within: 5, word: 'career runs' },
  { key: 'doubles', targets: [200, 300, 400, 500], within: 3, word: 'career doubles' },
  { key: 'triples', targets: [50, 100], within: 2, word: 'career triples' },
  { key: 'totalBases', targets: [1000, 2000, 3000, 4000, 5000], within: 10, word: 'career total bases' },
  { key: 'xbh', targets: [300, 500, 700, 1000], within: 4, word: 'career extra-base hits' },
]
export const RIVALS = [
  ['NYY', 'BOS'], ['LAD', 'SF'], ['LAD', 'SD'], ['CHC', 'STL'], ['CHC', 'CWS'],
  ['NYY', 'NYM'], ['NYM', 'PHI'], ['NYM', 'ATL'], ['HOU', 'TEX'], ['BAL', 'WSH'], ['LAA', 'LAD'],
]

const readStat = (st, key) => {
  if (!st) return NaN
  if (key === 'xbh') return (Number(st.doubles) || 0) + (Number(st.triples) || 0) + (Number(st.homeRuns) || 0)
  return Number(st[key])
}
const statOf = (person, type) => pickSplit((person.stats || []).find((s) => s?.type?.displayName === type))
const pidOf = (p) => Number(p?.player_id ?? p?.id)
// lib parts ({ type, text }) -> story parts ({ t, v })
const libParts = (ps) => (ps || []).map((x) => ({ t: x.type === 'name' ? 'name' : x.type === 'num' ? 'num' : 'text', v: String(x.text ?? '') }))

/**
 * @param rows      the day's board rows (player_id, game_pk, team, opponent, bvp_*, pitcher_name, season_hr, hr_score, last_game_*)
 * @param day       the slate's own date
 * @param people    statsapi people with career + season hitting (and birthDate)
 * @param history   { [mlbam]: [{ season, teamId }] } yearByYear
 * @param abbrs     { [teamId]: 'NYM' }
 * @param promos    statsapi schedule for the day with game(promotions)
 * @param setupHr   Set(mlbam) who homered on the day that sets up tonight
 * @param mlines    lib/matchupStory.js output;  ffacts  lib/funFacts.js output
 * @param watch     History Watch items (lib/history/watch.js mlbWatch)
 * @param october   true on a postseason date: no milestone countdowns
 */
export function buildMlbStories({ rows = [], day, people = [], history = null, abbrs = null, promos = null, setupHr = null, mlines = [], ffacts = [], watch = [], october = false }) {
  const out = []
  const byId = new Map(rows.map((p) => [pidOf(p), p]))
  const base = (p, extra) => ({
    sport: 'mlb', day, game_id: p?.game_pk ?? null, player_id: pidOf(p) || null, name: nameOf(p), team: teamOf(p) || null, opp: oppOf(p) || null, ...extra,
  })

  for (const w of watch || []) {
    const p = byId.get(Number(w.player_id))
    if (!p) continue
    const lead = w.kind === 'DROUGHT'
      ? parts(name(w.team), ` hasn't homered this postseason — a homer tonight: ${w.claim}`)
      : parts(name(w.name), ' has ', num(w.hr), ` ${w.unit || 'HR'} — one more: ${w.claim}`)
    out.push(story(base(p, { type: 'history', icon: '📜', rarity: 0.95, source: 'hist_mlb / hist_mlb_post (Lahman) + StatsAPI', proof: w.proof, parts: lead, numbers: { have: w.hr, rung: w.rung, kind: w.kind || 'SEASON' } })))
    for (const more of (w.more || []).slice(0, 1)) out[out.length - 1].numbers.also = more
  }

  mlines.forEach((m, i) => {
    const p = m.player || byId.get(Number(m.pid))
    if (!p) return
    out.push(story(base(p, { type: 'matchup', icon: '⚾', rarity: 0.8 - 0.04 * i, source: `game logs ${m.seasons || 'this season and last'} at ${m.venue} (lib/matchupStory.js)`, parts: libParts(m.parts), numbers: { strength: m.strength, venue: m.venue, arm: m.arm } })))
  })

  ffacts.forEach((f, i) => {
    const p = f.player || null
    // A park fact about a starting pitcher has no slate row: tie it to the game it names, if any.
    const gamePk = p?.game_pk ?? f.game_pk ?? f.gamePk ?? null
    if (!gamePk) return
    out.push(story({ sport: 'mlb', day, game_id: gamePk, player_id: p ? pidOf(p) : null, name: p ? nameOf(p) : null, team: p ? teamOf(p) : null, opp: p ? oppOf(p) : null, type: 'funfact', icon: f.icon || '🎩', rarity: 0.78 - 0.04 * i, source: f.source || `his hitting game log this season — ${f.sample || ''}`.trim(), parts: libParts(f.parts), numbers: { key: f.key } }))
  })

  const { list: b2b } = backToBack(rows, setupHr, null, day)
  b2b.slice().sort((a, b) => num0(b?.hr_score, 0) - num0(a?.hr_score, 0)).forEach((x) => {
    const gap = x?._b2bGapDays ?? 1
    const when = gap <= 1 ? 'last night' : `${gap - 1} game${gap - 1 === 1 ? '' : 's'} ago`
    const claim = gap <= 1 ? 'back-to-back watch for tonight' : 'returning from a day off for tonight'
    out.push(story(base(x, { type: 'b2b', icon: gap <= 1 ? '🔁' : '🌙', rarity: gap <= 1 ? 0.55 : 0.45, source: 'homer_feed (the setup day) / his last_game_date', parts: parts(name(nameOf(x)), ` homered ${when} — ${claim}`, ' · ', num(num0(x?.season_hr, 0)), ' HR szn'), numbers: { gapDays: gap, seasonHr: num0(x?.season_hr, 0) } })))
  })

  // Milestones: one row per player, his nearest; none in October.
  const miles = []
  if (!october) {
    for (const person of people) {
      const p = byId.get(person.id)
      if (!p) continue
      const season = statOf(person, 'season'); const career = statOf(person, 'career')
      for (const [list, st, suffix] of [[S_MILES, season, ' this season'], [C_MILES, career, '']]) {
        for (const m of list) {
          const v = readStat(st, m.key)
          if (!Number.isFinite(v)) continue
          for (const t of m.targets) { const need = t - v; if (need > 0 && need <= m.within) miles.push({ p, need, t, within: m.within, word: `${m.word}${suffix}`, prox: need / m.within }) }
        }
      }
    }
  }
  miles.sort((a, b) => a.prox - b.prox)
  const seenM = new Set()
  for (const m of miles) {
    const pid = pidOf(m.p)
    if (seenM.has(pid)) continue
    seenM.add(pid)
    out.push(story(base(m.p, { type: 'milestone', icon: '🏁', rarity: 0.45 + 0.35 * (1 - m.prox), source: 'statsapi people (season + career hitting)', parts: parts(name(nameOf(m.p)), ' is ', num(m.need), ' away from ', num(m.t.toLocaleString('en-US')), ` ${m.word}`, m.need === 1 ? ' — could land tonight' : ''), numbers: { need: m.need, target: m.t, word: m.word } })))
  }

  for (const p of rows) {
    const pa = num0(p?.bvp_pa, 0), h = num0(p?.bvp_hits, 0), hr = num0(p?.bvp_hr, 0)
    const ab = num0(p?.bvp_ab, pa), avg = num0(p?.bvp_avg, 0), ops = num0(p?.bvp_ops, 0)
    const arm = String(p?.pitcher_name || '').split(' ').slice(-1)[0]
    if (!arm) continue
    if (pa >= 8 && (hr >= 2 || ops >= 1.05)) {
      out.push(story(base(p, { type: 'duel', icon: '⚔', rarity: 0.65, source: 'board bvp_* (lifetime vs tonight\'s starter)', parts: parts(name(nameOf(p)), ' owns this matchup — ', num(`${h}-for-${ab}${hr ? `, ${hr} HR` : ''} lifetime vs ${arm}`)), numbers: { pa, ab, h, hr, ops, own: true } })))
    } else if (pa >= 10 && avg <= 0.125 && hr === 0) {
      out.push(story(base(p, { type: 'duel', icon: '🥶', rarity: 0.5, source: 'board bvp_* (lifetime vs tonight\'s starter)', parts: parts(name(nameOf(p)), ' has never solved him: ', num(`${h}-for-${ab} lifetime vs ${arm}`), ' — tiny samples, big folklore'), numbers: { pa, ab, h, hr, avg, own: false } })))
    }
  }

  // Revenge: facing a club he wore in the last four seasons (the panel's recency gate).
  if (history && abbrs) {
    const thisYear = Number(String(day).slice(0, 4))
    for (const p of rows) {
      const opp = oppOf(p), own = teamOf(p)
      const recent = (history[pidOf(p)] || []).filter((x) => abbrs[x.teamId] === opp && opp !== own).map((x) => Number(x.season)).filter((y) => y >= thisYear - 4)
      if (!recent.length) continue
      const span = recent.length > 1 ? `${Math.min(...recent)}–${String(Math.max(...recent)).slice(2)}` : String(recent[0])
      out.push(story(base(p, { type: 'revenge', icon: '😤', rarity: Math.min(0.7, 0.5 + 0.05 * new Set(recent).size), source: 'statsapi yearByYear (team by season)', parts: parts(name(nameOf(p)), ' faces his old team — wore ', name(opp), ' in ', num(span), '. Revenge games are theater, and theater sells.'), numbers: { opp, seasons: [...new Set(recent)] } })))
    }
  }

  // Rivalries: one per game, from the curated classics.
  const games = new Map()
  for (const p of rows) if (p?.game_pk && teamOf(p) && oppOf(p)) games.set(p.game_pk, [teamOf(p), oppOf(p)])
  const seenR = new Set()
  for (const [gamePk, [a, b]] of games) {
    const k = [a, b].sort().join('|')
    if (seenR.has(k) || !RIVALS.some(([x, y]) => [x, y].sort().join('|') === k)) continue
    seenR.add(k)
    const [ra, rb] = RIVALS.find(([x, y]) => [x, y].sort().join('|') === k)
    out.push(story({ sport: 'mlb', day, game_id: gamePk, player_id: null, type: 'rivalry', icon: '🔥', rarity: 0.3, source: 'the curated rivalry list', parts: parts('Rivalry night: ', name(`${ra} vs ${rb}`), ' — the games that never need a storyline get one anyway'), numbers: { teams: [ra, rb] } }))
  }

  // Birthdays: age from the birth year and the slate year, not currentAge.
  const mmdd = String(day).slice(5)
  for (const person of people) {
    if (String(person.birthDate || '').slice(5) !== mmdd || !byId.has(person.id)) continue
    const age = Number(String(day).slice(0, 4)) - Number(String(person.birthDate).slice(0, 4))
    if (!Number.isFinite(age)) continue
    const p = byId.get(person.id)
    out.push(story(base(p, { type: 'birthday', icon: '🎂', rarity: 0.2, source: 'statsapi people (birthDate)', parts: parts(name(nameOf(p)), ' turns ', num(age), ' today — birthday bombs are folklore, not physics, but nobody fades the birthday boy on stream'), numbers: { age } })))
  }

  // Giveaways: player-oriented only; a surname matches only the HOME club's
  // roster, and a surname two home hitters share attaches to nobody.
  const byTeamSurname = new Map()
  for (const p of rows) {
    const tm = String(teamOf(p) || '').toUpperCase(); const ln = String(nameOf(p)).split(' ').slice(-1)[0].toLowerCase()
    if (!tm || ln.length <= 3) continue
    const k = `${tm}|${ln}`
    byTeamSurname.set(k, byTeamSurname.has(k) ? null : p)
  }
  for (const g of promos?.dates?.[0]?.games || []) {
    const home = g?.teams?.home?.team?.name || ''
    const homeAbbr = String(abbrs?.[g?.teams?.home?.team?.id] || '').toUpperCase()
    for (const pr of g.promotions || []) {
      const nm = String(pr.name || '')
      const isBobble = /bobble/i.test(nm)
      if (pr.offerType !== 'Giveaway' && !isBobble) continue
      let star = null
      if (homeAbbr) for (const [k, p] of byTeamSurname) { if (p && k.startsWith(`${homeAbbr}|`) && nm.toLowerCase().includes(k.slice(homeAbbr.length + 1))) { star = p; break } }
      if (!(star || isBobble || /jersey|replica|figurine|poster|card|banner|ring|trophy/i.test(nm))) continue
      out.push(story({ sport: 'mlb', day, game_id: g.gamePk, player_id: star ? pidOf(star) : null, name: star ? nameOf(star) : null, team: star ? teamOf(star) : null, opp: star ? oppOf(star) : null,
        type: 'giveaway', icon: isBobble ? '🧸' : '🎁', rarity: star ? 0.35 : 0.2, source: 'statsapi schedule (game promotions)',
        parts: parts(name(home), `: ${nm}`, pr.distribution ? ` · ${pr.distribution}` : '', star ? ` — ${nameOf(star)}'s own night, the folklore game` : ''), numbers: { promo: nm } }))
    }
  }

  return out.filter((s) => s.game_id).sort(byRarity)
}

// ── THE LOADER ──────────────────────────────────────────────────────────────
const db = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null
}
const shiftDay = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10)
const api = (p) => fetch(`https://statsapi.mlb.com/api/v1${p}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)

/** Every MLB story for today's board. Returns { day, rows, stories }; empty when the board isn't today's. */
export async function loadMlbStories({ want = null } = {}) {
  const rows = await fetchBoardFull('today').catch(() => null)
  const day = rows?.length ? slateDateFromRows(rows) : null
  if (!rows?.length || !day || (want && want !== day)) return { day: want || day, rows: [], stories: [] }
  const ids = [...new Set(rows.map(pidOf).filter(Boolean))]
  const people = []; const history = {}
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100).join(',')
    const [a, b] = await Promise.all([
      api(`/people?personIds=${chunk}&hydrate=stats(group=[hitting],type=[career,season])&fields=people,id,fullName,birthDate,currentAge,stats,type,displayName,splits,team,gameType,stat,${HITTING_FIELDS}`),
      api(`/people?personIds=${chunk}&hydrate=stats(group=[hitting],type=[yearByYear])&fields=people,id,stats,type,displayName,splits,season,team,id,name`),
    ])
    people.push(...(a?.people || []))
    for (const person of b?.people || []) {
      const blk = (person.stats || []).find((x) => x?.type?.displayName === 'yearByYear')
      history[person.id] = (blk?.splits || []).map((sp) => ({ season: sp.season, teamId: sp?.team?.id })).filter((x) => x.teamId)
    }
  }
  const [promos, abbrs, sched] = await Promise.all([
    api(`/schedule?sportId=1&date=${day}&hydrate=game(promotions)`),
    teamAbbrs().catch(() => ({})),
    api(`/schedule?sportId=1&date=${day}&gameType=F,D,L,W&fields=totalGames`),
  ])
  // Who homered on the setup day: every MLB homer is in homer_feed.
  let setupHr = null
  const c = db()
  if (c) {
    const { data, error } = await c.from('homer_feed').select('player_id').eq('day', shiftDay(day, -1))
    if (!error) setupHr = new Set((data || []).map((r) => Number(r.player_id)).filter(Boolean))
  }
  const [mlines, watch] = await Promise.all([
    matchupStories(rows, { look: 20, limit: 5 }).catch(() => []),
    mlbWatch(rows, Number(day.slice(0, 4)), { day }).catch(() => []),
  ])
  const ffacts = await funFacts(rows, { look: 40, limit: 6, slateDate: day, skipPitchers: (mlines || []).map((m) => Number(m?.player?.pitcher_id)).filter(Boolean) }).catch(() => [])
  const october = sched ? Number(sched.totalGames || 0) > 0 : false
  return { day, rows, stories: buildMlbStories({ rows, day, people, history, abbrs, promos, setupHr, mlines: mlines || [], ffacts: ffacts || [], watch: watch || [], october }) }
}
