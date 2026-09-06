'use client'
// ── HEADLINES + LIVE SCORES, ONE SOURCE (2026-09-06) ────────────────────────
//
// Donovan: "I wanted those aspects on the header ... maybe even the scoring
// updates across the slate and NFL if possible." So the headline cards the
// front page rolls and the strip the header rolls are built by ONE function
// here, and the live scores both of them carry come from ONE hook here --
// the same MLB schedule call the score rail already makes (lib/boxscore.js,
// 30s cache) and the same ESPN scoreboard TUDDY's live page makes
// (lib/nfl/liveSlate.js). Two surfaces, zero extra requests.
//
// Every headline is a field already on the slate; nothing is computed beyond
// a sort. Order is the order a viewer opens the show for.
import { useEffect, useState } from 'react'
import { C } from './theme'
import { nameOf, teamOf, clean, n, hrScore } from './player'
import { scheduleFor, slateDay } from './boxscore'
import { fetchNflLive } from './nfl/liveSlate'

const avg3 = (v) => n(v, 0).toFixed(3).replace(/^0/, '')

export function buildHeadlines({ players = [], headline, results, isLive, airRanked = [] }) {
  const out = []
  const by = (fn) => [...players].filter((p) => Number.isFinite(fn(p))).sort((a, b) => fn(b) - fn(a))[0] || null
  const top = by(hrScore)
  const p3 = [...players].filter((p) => n(p?.power3_score, 0) > 0 && n(p?.season_bbe_n, 0) >= 60).sort((a, b) => n(b.power3_score, 0) - n(a.power3_score, 0))[0]
  const hot = [...players].filter((p) => n(p?.last5_hr, 0) >= 2).sort((a, b) => (n(b.last5_hr, 0) - n(a.last5_hr, 0)) || (n(b.last5_avg, 0) - n(a.last5_avg, 0)))[0]
  const hitBat = by((p) => n(p?.hit_score, NaN))
  const hrrBat = by((p) => n(p?.hrr_score, NaN))
  const tbBat = by((p) => n(p?.contact_score, NaN))
  const hrw = by((p) => n(p?.hrw_score, NaN))
  const homers = results?.merged_homers || results?.hr_capture_report?.all_homer_entries || []
  const latest = isLive && homers.length ? homers[homers.length - 1] : null
  const air = airRanked[0]
  const weak = players.filter((p) => p?.weak_spot_flag).length

  if (latest) out.push({ k: 'gone', icon: '💣', tag: 'WENT DEEP', name: clean(latest.name, ''), why: `${latest.longest_ft ? `${latest.longest_ft} ft` : 'gone'}${latest.max_ev_mph ? ` · ${latest.max_ev_mph} mph` : ''}`, stat: `${homers.length} HR tonight`, col: C.orange, p: latest.base_row || null })
  if (top) out.push({ k: 'top', icon: '🎯', tag: 'THE BOT’S #1', name: nameOf(top), why: `${teamOf(top)}${clean(top?.pitcher_name, '') ? ` vs ${clean(top?.pitcher_name, '')}` : ''}${n(top?.pitcher_hr9, 0) > 0 ? ` · ${n(top?.pitcher_hr9, 0).toFixed(2)} HR/9` : ''}`, stat: `HR ${hrScore(top).toFixed(0)}`, col: C.orange, p: top })
  if (p3 && p3 !== top) out.push({ k: 'p3', icon: '⚡', tag: 'SEASON POWER', name: nameOf(p3), why: `Power-3 #${n(p3?.power3_rank, 0) || 1} · ${n(p3?.season_avg_ev, 0).toFixed(1)} avg EV · max ${n(p3?.season_max_ev, 0).toFixed(0)}`, stat: `P3 ${n(p3?.power3_score, 0).toFixed(0)}`, col: C.yellow, p: p3 })
  if (hot && hot !== top && hot !== p3) out.push({ k: 'hot', icon: '🔥', tag: 'HOTTEST BAT', name: nameOf(hot), why: `${n(hot?.last5_hr, 0)} HR in his last 5 · ${avg3(hot?.last5_avg)} over them`, stat: `L5 HR ${n(hot?.last5_hr, 0)}`, col: C.red, p: hot })
  if (headline?.g) {
    const who = (headline.bats || []).map((b) => nameOf(b)).filter(Boolean).slice(0, 2)
    out.push({ k: 'game', icon: '⭐', tag: 'GAME TO CIRCLE', name: `${clean(headline.g.away, '?')} @ ${clean(headline.g.home, '?')}`, why: who.length ? `${who.join(' and ')} carry the heat` : 'the strongest board on the slate', stat: 'OPEN', col: C.blue, nav: 'games' })
  }
  if (hitBat) out.push({ k: 'hit', icon: '🧢', tag: 'HIT MACHINE', name: nameOf(hitBat), why: `${n(hitBat?.last5_hits, 0)} H in his last 5 · ${avg3(hitBat?.season_avg)} season · K ${(n(hitBat?.season_k_rate, 0) * 100).toFixed(0)}%`, stat: `HIT ${n(hitBat?.hit_score, 0).toFixed(0)}`, col: C.purple, p: hitBat })
  if (hrrBat && hrrBat !== hitBat) out.push({ k: 'hrr', icon: '🏃', tag: 'RUNS + RBI', name: nameOf(hrrBat), why: `bats ${n(hrrBat?.lineup_spot, 0) || '—'} · ${n(hrrBat?.last5_rbi, 0)} RBI / ${n(hrrBat?.last5_runs, 0)} R last 5 · OBP ${avg3(hrrBat?.season_obp)}`, stat: `HRR ${n(hrrBat?.hrr_score, 0).toFixed(0)}`, col: C.cyan, p: hrrBat })
  if (tbBat && tbBat !== hitBat && tbBat !== top) out.push({ k: 'tb', icon: '💪', tag: 'TOTAL BASES', name: nameOf(tbBat), why: `${n(tbBat?.last5_xbh, 0)} XBH last 5 · ISO ${avg3(tbBat?.season_iso)} · SLG ${avg3(tbBat?.season_slg)}`, stat: `TB ${n(tbBat?.contact_score, 0).toFixed(0)}`, col: C.green, p: tbBat })
  if (hrw && hrw !== top) out.push({ k: 'hrw', icon: '🌋', tag: 'HR WINDOW', name: nameOf(hrw), why: `HRW ${n(hrw?.hrw_score, 0).toFixed(0)} — the audit’s strongest bot term (80+ homered 25%)`, stat: `HRW ${n(hrw?.hrw_score, 0).toFixed(0)}`, col: C.orange, p: hrw })
  if (air && air.edge > 0) out.push({ k: 'air', icon: '🌤', tag: 'BEST AIR', name: air.venue, why: `${air.matchup ? `${air.matchup} plays there · ` : ''}park + weather`, stat: `+${air.edge.toFixed(0)}%`, col: C.orange, nav: 'power' })
  if (weak > 0) out.push({ k: 'weak', icon: '★', tag: 'WEAK SPOTS', name: `${weak} hitters`, why: 'draw a lineup spot tonight’s starter has already been beaten in', stat: 'BOARDS', col: C.yellow, nav: 'board' })
  return out
}

// ── live scores, both sports ─────────────────────────────────────────────────
//
// MLB: the league schedule for the slate day, with linescores (30s cache in
// lib/boxscore.js). NFL: ESPN's scoreboard (TUDDY's own cache). Items are
// already strings so the ticker and the crawl can print them as-is; `col`
// says live (green) / final (grey) / pregame (dim).
const inn = (g) => (g.inning ? `${/top/i.test(g.inningState) ? '▲' : '▼'}${g.inning}` : '')

export function useLiveScores({ nfl = true } = {}) {
  const [mlb, setMlb] = useState([])
  const [nflGames, setNfl] = useState([])
  useEffect(() => {
    let alive = true
    const pullMlb = () => scheduleFor(slateDay(0)).then((g) => { if (alive && Array.isArray(g)) setMlb(g) }).catch(() => {})
    const pullNfl = () => (nfl ? fetchNflLive().then((s) => { if (alive && s?.games) setNfl(s.games) }).catch(() => {}) : null)
    pullMlb(); pullNfl()
    const a = setInterval(pullMlb, 30_000)
    const b = setInterval(pullNfl, 60_000)
    return () => { alive = false; clearInterval(a); clearInterval(b) }
  }, [nfl])

  const items = []
  for (const g of mlb) {
    if (!g?.away?.abbr || !g?.home?.abbr) continue
    if (g.live) items.push({ k: `mlb-${g.pk}`, sport: 'mlb', icon: '⚾', text: `${g.away.abbr} ${g.away.score ?? 0} – ${g.home.score ?? 0} ${g.home.abbr}`, sub: inn(g), col: C.green, live: true, nav: 'scoreboard' })
    else if (g.final) items.push({ k: `mlb-${g.pk}`, sport: 'mlb', icon: '⚾', text: `${g.away.abbr} ${g.away.score ?? 0} – ${g.home.score ?? 0} ${g.home.abbr}`, sub: 'F', col: C.text3, nav: 'scoreboard' })
    else if (g.startTime) {
      const t = new Date(g.startTime)
      if (Number.isFinite(t.getTime())) items.push({ k: `mlb-${g.pk}`, sport: 'mlb', icon: '⚾', text: `${g.away.abbr} @ ${g.home.abbr}`, sub: t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), col: C.text3, pregame: true, nav: 'scoreboard' })
    }
  }
  for (const g of nflGames) {
    if (!g?.away || !g?.home) continue
    if (g.state === 'in') items.push({ k: `nfl-${g.game_id}`, sport: 'nfl', icon: '🏈', text: `${g.away} ${g.away_score ?? 0} – ${g.home_score ?? 0} ${g.home}`, sub: `${g.period ? `Q${g.period}` : ''}${g.clock ? ` ${g.clock}` : ''}`.trim(), col: C.green, live: true })
    else if (g.state === 'post') items.push({ k: `nfl-${g.game_id}`, sport: 'nfl', icon: '🏈', text: `${g.away} ${g.away_score ?? 0} – ${g.home_score ?? 0} ${g.home}`, sub: 'F', col: C.text3 })
  }
  return { items, mlb, nfl: nflGames }
}

// The next first pitch, live: which game, when, and how long until it. Once
// everything has started it says so and names the last one to go.
export function nextPitch(games = [], now = Date.now()) {
  const list = games.map((g) => ({ g, t: new Date(g.game_time || g.startTime || 0).getTime() })).filter((x) => x.t > 0).sort((a, b) => a.t - b.t)
  if (!list.length) return null
  const up = list.find((x) => x.t > now)
  if (up) return { kind: 'next', at: new Date(up.t), ms: up.t - now, label: `${clean(up.g.away, '')} @ ${clean(up.g.home, '')}`.trim(), remaining: list.filter((x) => x.t > now).length }
  const last = list[list.length - 1]
  return { kind: 'all', at: new Date(last.t), ms: 0, label: `${clean(last.g.away, '')} @ ${clean(last.g.home, '')}`.trim(), remaining: 0 }
}

export function fmtCountdown(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`
  return `${sec}s`
}
