// TUDDY'S FACT FINDERS (BATCH-FACT-ENGINE, 2026-10-02). Code, no AI: each
// scans nflverse's schedule file (every regular-season game since 1999, free)
// and returns facts with every number, name, range and source on them. Team
// codes go through the franchise map (lib/facts/franchise.js) before any count.
// A "first since 1999" is only ever a computed check over 1999..now -- the
// file starts in 1999, so nothing here can say "ever".
import { franchiseOf, pairKey } from './franchise'
import { NFL_TEAMS } from '../nfl/teams'
import { decorate } from './label'

export const NFL_GAMES_URL = 'https://github.com/nflverse/nfldata/raw/master/data/games.csv'
export const NFL_SINCE = 1999
const SOURCE = `nflverse schedule (games.csv), regular season ${NFL_SINCE}-`

const NAME = Object.fromEntries(NFL_TEAMS.map(([a, n]) => [a, n]))
const TWO = { NE: 'Patriots', TB: 'Buccaneers', WAS: 'Commanders', SF: '49ers' }
export const nick = (t) => TWO[t] || String(NAME[t] || t).split(' ').pop()

// Themed groups (the nickname is what makes them a group).
export const NFL_THEMES = {
  cats: { word: 'cat', teams: ['JAX', 'CIN', 'DET', 'CAR'] },
  birds: { word: 'bird', teams: ['ARI', 'ATL', 'BAL', 'PHI', 'SEA'] },
}

/** games.csv -> rows (quotes-aware, the columns this file reads). */
export function parseGames(csv) {
  const lines = String(csv || '').split(/\r?\n/).filter(Boolean)
  const head = splitCsv(lines.shift() || '')
  const ix = (k) => head.indexOf(k)
  const c = { season: ix('season'), type: ix('game_type'), week: ix('week'), day: ix('gameday'), away: ix('away_team'), as: ix('away_score'), home: ix('home_team'), hs: ix('home_score') }
  return lines.map((l) => {
    const r = splitCsv(l)
    const num = (i) => (r[i] === '' || r[i] == null ? null : Number(r[i]))
    return { season: num(c.season), type: r[c.type], week: num(c.week), day: r[c.day], away: franchiseOf('nfl', r[c.away]), home: franchiseOf('nfl', r[c.home]), as: num(c.as), hs: num(c.hs) }
  }).filter((g) => g.type === 'REG' && g.season >= NFL_SINCE)
}
function splitCsv(line) {
  const out = []; let cur = ''; let q = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1 } else if (ch === '"') q = false; else cur += ch }
    else if (ch === '"') q = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

/** Each team's W-L-T entering `week` of `season` (games already scored). */
export function recordsBefore(games, season, week) {
  const rec = {}
  for (const g of games) {
    if (g.season !== season || g.week >= week || g.as == null || g.hs == null) continue
    for (const [t, us, them] of [[g.away, g.as, g.hs], [g.home, g.hs, g.as]]) {
      rec[t] ||= { w: 0, l: 0, t: 0 }
      if (us > them) rec[t].w += 1; else if (us < them) rec[t].l += 1; else rec[t].t += 1
    }
  }
  return rec
}
const recStr = (r) => `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}`
const fmtDay = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

/** The last meeting of two franchises before `before` (a date), scored. */
function lastMeeting(games, a, b, before) {
  const k = pairKey('nfl', a, b)
  const past = games.filter((g) => g.day < before && g.as != null && pairKey('nfl', g.away, g.home) === k).sort((x, y) => (x.day < y.day ? 1 : -1))
  const g = past[0]
  if (!g) return null
  const w = g.hs >= g.as ? { team: g.home, pts: g.hs } : { team: g.away, pts: g.as }
  const l = g.hs >= g.as ? { team: g.away, pts: g.as } : { team: g.home, pts: g.hs }
  return { day: g.day, date: fmtDay(g.day), winner: nick(w.team), winnerPts: w.pts, loser: nick(l.team), loserPts: l.pts, tie: g.hs === g.as, meetings: past.length }
}

/** All the week's facts. `season`/`week` = the week about to be played. */
export function nflFacts(games, { season, week }) {
  if (!games?.length || !season || !week || week < 2) return []
  const out = []
  const slate = games.filter((g) => g.season === season && g.week === week)
  const rec = recordsBefore(games, season, week)
  const played = (t) => { const r = rec[t]; return r ? r.w + r.l + r.t : 0 }

  // ── BOTH UNBEATEN / BOTH WINLESS, MEETING ─────────────────────────────────
  for (const g of slate) {
    const ra = rec[g.away], rh = rec[g.home]
    if (!ra || !rh || played(g.away) < 2 || played(g.home) < 2) continue
    for (const kind of ['unbeaten', 'winless']) {
      const both = kind === 'unbeaten' ? (ra.l === 0 && ra.t === 0 && rh.l === 0 && rh.t === 0) : (ra.w === 0 && rh.w === 0)
      if (!both) continue
      // this pair, both unbeaten (winless) entering a meeting this late (week >= this one), any season since 1999
      const k = pairKey('nfl', g.away, g.home)
      let prior = 0
      for (let s = NFL_SINCE; s < season; s += 1) {
        const m = games.find((x) => x.season === s && x.week >= week && pairKey('nfl', x.away, x.home) === k)
        if (!m) continue
        const r2 = recordsBefore(games, s, m.week)
        const A = r2[m.away], H = r2[m.home]
        if (!A || !H) continue
        const ok = kind === 'unbeaten' ? (A.l === 0 && A.t === 0 && H.l === 0 && H.t === 0) : (A.w === 0 && H.w === 0)
        if (ok) prior += 1
      }
      const last = lastMeeting(games, g.away, g.home, g.day)
      out.push({
        sport: 'nfl', family: kind === 'unbeaten' ? 'both_unbeaten' : 'both_winless',
        id: `nfl:${season}w${week}:${kind}:${k}`,
        date: g.day, week, season,
        teams: [{ code: g.away, name: nick(g.away), record: recStr(ra) }, { code: g.home, name: nick(g.home), record: recStr(rh) }],
        prior, since: prior === 0 ? NFL_SINCE : null,
        proves: prior === 0 ? ['first'] : [],
        last,
        source: SOURCE,
        why: prior === 0 ? `the first time since ${NFL_SINCE} these two meet both ${kind} this late` : `both ${kind} entering week ${week}`,
        score: (kind === 'unbeaten' ? 60 : 40) + (prior === 0 ? 30 : 0) + Math.min(ra.w + rh.w + ra.l + rh.l, 10),
      })
    }
  }

  // ── TEAM START (3-0 or better / 0-3 or worse), with the franchise's own history ─
  for (const [t, r] of Object.entries(rec)) {
    const n = played(t)
    if (n < 3) continue
    const perfect = r.l === 0 && r.t === 0, winless = r.w === 0 && r.t === 0
    if (!perfect && !winless) continue
    const same = []
    for (let s = NFL_SINCE; s <= season; s += 1) {
      const first = games.filter((x) => x.season === s && (x.away === t || x.home === t) && x.as != null).sort((a, b) => a.week - b.week).slice(0, n)
      if (first.length < n) continue
      const wins = first.filter((x) => (x.home === t ? x.hs > x.as : x.as > x.hs)).length
      const losses = first.filter((x) => (x.home === t ? x.hs < x.as : x.as < x.hs)).length
      if ((perfect && wins === n) || (winless && losses === n)) same.push(s)
    }
    // seasons running (this one and the ones straight before it)
    let running = 0
    for (let s = season; same.includes(s); s -= 1) running += 1
    out.push({
      sport: 'nfl', family: perfect ? 'team_start_unbeaten' : 'team_start_winless',
      id: `nfl:${season}w${week}:start:${t}:${recStr(r)}`,
      date: slate.find((x) => x.away === t || x.home === t)?.day || null, week, season,
      teams: [{ code: t, name: nick(t), record: recStr(r) }],
      seasons: same, count: same.length, running,
      since: NFL_SINCE, proves: [],
      source: SOURCE,
      why: running >= 2 ? `${recStr(r)} ${running} seasons running` : `${recStr(r)} starts since ${NFL_SINCE}: ${same.join(', ')}`,
      score: (perfect ? 45 : 35) + (running >= 2 ? 25 : 0) + (same.length <= 3 ? 15 : 0),
    })
  }

  // ── THEMED WEEKS (cats vs cats, birds vs birds) ──────────────────────────
  for (const [key, th] of Object.entries(NFL_THEMES)) {
    const set = new Set(th.teams)
    const these = slate.filter((g) => set.has(g.away) && set.has(g.home))
    if (these.length < 2) continue
    // weeks since 1999 with at least as many of these games
    const byWeek = {}
    for (const g of games) if (set.has(g.away) && set.has(g.home) && !(g.season === season && g.week === week)) { const k = `${g.season}w${g.week}`; byWeek[k] = (byWeek[k] || 0) + 1 }
    const prior = Object.values(byWeek).filter((c) => c >= these.length).length
    out.push({
      sport: 'nfl', family: 'themed_week', theme: key,
      id: `nfl:${season}w${week}:theme:${key}`,
      date: these[0].day, week, season,
      games: these.map((g) => ({ away: nick(g.away), home: nick(g.home) })),
      count: these.length, prior, members: th.teams.length,
      since: NFL_SINCE, proves: prior === 0 ? ['first'] : [],
      source: SOURCE,
      why: prior === 0 ? `the only week since ${NFL_SINCE} with ${these.length} ${th.word}-vs-${th.word} games` : `${these.length} ${th.word}-vs-${th.word} games`,
      score: prior === 0 ? 55 : 15,
    })
  }
  return out.map(decorate).sort((a, b) => b.score - a.score)
}

