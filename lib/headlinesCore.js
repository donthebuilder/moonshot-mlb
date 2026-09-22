// ── THE MLB HEADLINE BITES, ON THEIR OWN (2026-09-21) ───────────────────────
//
// buildHeadlines() is a pure function and always was: it takes the slate and
// returns text. It lived in lib/headlines.js, which genuinely needs
// 'use client' -- useLiveScores() and useAutoScroll() and their hooks are in
// there -- so a server component could not import the pure half without
// dragging the hooks in with it.
//
// /start renders on the server (the slate is ~890 KB on a small night and
// several MB on a full one, and that page exists for somebody on a phone
// following a link), so it needs exactly this function and none of the rest.
// Same split, same reason, as lib/b2b.js -> lib/b2bCore.js on 2026-09-08 and
// components/nfl/ScoreAnatomy.js -> lib/nfl/scoreLabels.js on 2026-09-18.
//
// MOVED VERBATIM. The function below was sliced out of lib/headlines.js by
// byte range, not retyped -- its smart quotes and em-dashes are the originals.
// lib/headlines.js imports and re-exports it, so every existing caller
// (components/Header.js, components/tabs/Home.js) is untouched and cannot
// drift from this copy.
//
// Every headline is a field already on the slate; nothing is computed beyond
// a sort.
import { C } from './theme'
import { clean, hrScore, n, nameOf, teamOf } from './player'

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
