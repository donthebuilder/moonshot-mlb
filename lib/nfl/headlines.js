// NO 'use client' HERE, DELIBERATELY (2026-09-21). This file is a pure
// function: it has no hooks, no window, no document, no state -- verified by
// grep before the directive came off. It carried one anyway, which meant a
// server component could not import it, which is the same wall
// ScoreAnatomy.js hit on 2026-09-18 (fixed there by splitting LABELS/WHY out
// into lib/nfl/scoreLabels.js). /start renders on the server and builds these
// bites there, so the 874 KB matchup payload never reaches a browser.
// Removing the directive is backward compatible: a plain module imported by a
// client component is still bundled into that client component, so
// NflHeader.js is unaffected. Do not add it back without a reason -- and a
// hook or a window read would be that reason.
// ── NFL HEADLINE STORY-BITES (2026-09-16) ───────────────────────────────────
//
// Donovan, side by side with MOONSHOT: "the banners...dont look the same."
// MOONSHOT's ticker mixes live scores with real, icon-tagged "headline"
// story-bites (season power leader, hottest bat, best air/park edge...) --
// lib/headlines.js's buildHeadlines(). TUDDY's ticker only ever showed plain
// aggregate stats (Games, Top TD, Pool...): no story-bites, no icons, just
// numbers. This is the NFL equivalent, same output shape ({k, icon, tag,
// name, why, stat, col, p/nav}) so NflHeader's ticker can push these into
// the exact kind of Tile list MOONSHOT's Pill list already renders.
//
// NEVER INVENT DATA (project rule #16): every bite here reads a field the
// bot already publishes, the same way an existing TUDDY page already reads
// it -- nothing computed or guessed here for the first time.
//   high_confidence_td_flag, p.scores.TD           -- Touchdowns.js, TdCompare.js
//   p.components / market weights (data.markets)   -- Touchdowns.js's own
//                                                       anatomyOf() call
//   matchupTag() / alignedSignals()                -- lib/nfl/dvpSignal.js,
//                                                       already shipped and
//                                                       used by Games.js
// `matchup` is the same payload NflDashboard.js already fetches
// (nflMatchupPaths()) for every other tab -- this only threads it one more
// place, it does not add a new fetch.
import { C } from './theme'
import { matchupTag, alignedSignals, softRole, softLine } from './dvpSignal'
import { streakMarkets, streakBoard } from './streaks'

const MARKET = 'TD'
const DEFAULT_POSITIONS = ['RB', 'WR', 'TE']

const nameOf = (p) => p?.name || 'that player'
const teamLine = (p) => `${p?.team || '?'}${p?.opp ? ` vs ${p.opp}` : ''}`
const signalsLine = (a) => {
  const bits = []
  if (a.matchupHit) bits.push('softest matchup')
  if (a.finisherHit) bits.push('red-zone finisher')
  if (a.risingHit) bits.push('rising usage')
  return `${bits.join(' + ')} lining up together`
}

export function buildNflHeadlines({ players = [], games = [], markets = [], matchup = null } = {}) {
  const out = []
  const spec = (markets || []).find((m) => m.key === MARKET)
  const elig = new Set(spec?.positions || DEFAULT_POSITIONS)
  const pool = players.filter((p) => !p.on_bye && elig.has(p.position) && Number.isFinite(Number(p.scores?.[MARKET])))
  if (!pool.length) return out

  const byTd = [...pool].sort((a, b) => (b.scores[MARKET] ?? 0) - (a.scores[MARKET] ?? 0))
  const top = byTd[0] || null

  // Distinct from `top`: TdCompare.js's own second signal ("the bot's own
  // high-confidence TD flag"), not just a re-sort of the same score.
  const highConf = byTd.find((p) => p !== top && p.high_confidence_td_flag) || null

  // Composite signal (matchup + finisher + rising usage all real, all
  // stacking) -- dvpSignal.js's own alignedSignals(), unchanged. Needs the
  // live matchup payload; simply absent from the strip without it, same as
  // every other conditional bite here.
  let aligned = null
  if (matchup) {
    const hit = byTd.find((p) => p !== top && p !== highConf && alignedSignals(matchup, p).aligned)
    if (hit) aligned = { p: hit, ...alignedSignals(matchup, hit) }
  }

  // The single softest DVP matchup on the board this week, by the same
  // TARGET tag Games.js already paints per player.
  let softest = null
  if (matchup) {
    for (const p of byTd) {
      if (p === top || p === highConf || p === aligned?.p) continue
      const tag = matchupTag(matchup, p, MARKET)
      if (tag?.tag === 'TARGET') { softest = { p, tag }; break }
    }
  }

  // Same "best game" arithmetic NflHeader already does for its own Best
  // game tile (sum of xTD by team, per matchup) -- computed again here
  // rather than threaded in as a param, so this function stays a single
  // self-contained read of {players, games, markets, matchup}.
  const byTeam = new Map()
  for (const p of pool) {
    const t = String(p?.team || '').toUpperCase()
    if (!t) continue
    byTeam.set(t, (byTeam.get(t) || 0) + (p?.stats?.xTD || 0))
  }
  let bestGame = null
  for (const g of games) {
    const total = (byTeam.get(String(g.away || '').toUpperCase()) || 0)
      + (byTeam.get(String(g.home || '').toUpperCase()) || 0)
    if (!bestGame || total > bestGame.total) bestGame = { total, away: g.away, home: g.home, gameId: g.game_id ?? null }
  }

  if (top) out.push({
    k: 'top', icon: '🎯', tag: 'TOP CALL', name: nameOf(top),
    why: teamLine(top), stat: `TD ${Math.round(top.scores[MARKET])}`, col: C.green, p: top,
  })
  if (highConf) out.push({
    k: 'highconf', icon: '⭐', tag: 'HIGH-CONFIDENCE', name: nameOf(highConf),
    why: `High-confidence flag · ${teamLine(highConf)}`, stat: `TD ${Math.round(highConf.scores[MARKET])}`, col: C.green, p: highConf,
  })
  if (aligned) out.push({
    k: 'aligned', icon: '🧩', tag: 'SIGNAL STACK', name: nameOf(aligned.p),
    why: signalsLine(aligned), stat: `${aligned.hits} of 3 aligned`, col: C.green, p: aligned.p,
  })
  if (softest) out.push({
    k: 'matchup', icon: '🛡️', tag: 'SOFTEST MATCHUP', name: nameOf(softest.p),
    why: softest.tag.detail, stat: `#${softest.tag.rank} of 32`, col: C.green, p: softest.p,
  })
  if (bestGame && bestGame.total > 0) out.push({
    k: 'game', icon: '🏟️', tag: 'GAME TO CIRCLE', name: `${bestGame.away} @ ${bestGame.home}`,
    why: 'the strongest touchdown board on the slate', stat: `${bestGame.total.toFixed(1)} xTD`, col: C.text2, nav: 'games', gameId: bestGame.gameId,
  })

  return out
}

// ── AROUND THE LEAGUE: EACH PAGE'S OWN #1 (2026-09-27, TUDDY depth step 3 /
// headline plan step 4). One row per existing page, ranked EXACTLY the way
// that page ranks its top row, tapping through to the page (nav = tab key).
// A row with no data this week is left out -- it never says "none".
//   RED-ZONE LEADER   RedZone.js: stats.RZ desc, not on bye, RZ > 0; team
//                     share = RZ / the team's tracked RZ (same as the page)
//   BIG-PLAY THREAT   Explosive.js: matchup.player_explosive by rec_20 desc,
//                     joined to the week's players
//   HOTTEST STREAK    Streaks.js: first streak market, its bar, 'over',
//                     30-game window, eligible positions, not on bye
//   SOFTEST DEFENSE   Matchups.js's measure (dvpSignal softRole, season) run
//                     over every defense playing this week; the largest z
//                     that is a standout (z >= 1)
// No longshot row: TUDDY's strip already carries the Longshots preview.
export function buildNflLeaderRows({ players = [], games = [], markets = [], matchup = null, logs = null } = {}) {
  const out = []
  const live = (players || []).filter((p) => !p?.on_bye)
  const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v))
  const one = (v) => Math.round(v * 10) / 10

  const rz = live.filter((p) => Number.isFinite(num(p?.stats?.RZ)) && num(p.stats.RZ) > 0).sort((a, b) => num(b.stats.RZ) - num(a.stats.RZ))[0]
  if (rz) {
    const teamRz = live.filter((p) => p.team === rz.team && Number.isFinite(num(p?.stats?.RZ))).reduce((a, p) => a + num(p.stats.RZ), 0)
    const share = teamRz > 0 ? Math.round((100 * num(rz.stats.RZ)) / teamRz) : null
    out.push({ k: 'lead-rz', icon: '🎯', tag: 'RED-ZONE LEADER', name: nameOf(rz), why: `${one(num(rz.stats.RZ))} red-zone opportunities a game${share != null ? ` · ${share}% of ${rz.team}'s` : ''}`, stat: `RZ ${one(num(rz.stats.RZ))}/g`, col: C.green, nav: 'redzone' })
  }

  const byId = new Map(live.map((p) => [String(p.player_id), p]))
  const exp = Object.entries(matchup?.player_explosive || {}).map(([id, v]) => ({ ...v, p: byId.get(String(id)) })).filter((r) => r.p)
    .sort((a, b) => (num(b.rec_20) || 0) - (num(a.rec_20) || 0))[0]
  if (exp && num(exp.rec_20) > 0) {
    out.push({ k: 'lead-exp', icon: '💥', tag: 'BIG-PLAY THREAT', name: nameOf(exp.p), why: `${num(exp.rec_20)} catches of 20+ yards${Number.isFinite(num(exp.lng)) ? ` · long of ${num(exp.lng)}` : ''}`, stat: `20+ ×${num(exp.rec_20)}`, col: C.green, nav: 'explosive' })
  }

  const m = logs ? streakMarkets(logs)[0] : null
  if (m) {
    const spec = (markets || []).find((x) => x.key === m.key)
    const eligible = new Set(spec?.positions || [])
    const pool = live.filter((p) => !eligible.size || eligible.has(p.position))
    const hot = streakBoard(logs, pool, m.field, m.bar, 'over', 30, m.key).filter((r) => r.streak > 0)[0]
    if (hot) out.push({ k: 'lead-streak', icon: '🔥', tag: 'HOTTEST STREAK', name: nameOf(hot.player), why: `${hot.streak} straight games at ${m.bar}+ ${spec?.label || m.key} · ${hot.hits} of his last ${hot.games}`, stat: `${hot.streak} straight`, col: C.text3, nav: 'streaks' })
  }

  const playing = new Set((games || []).flatMap((g) => [String(g?.away || '').toUpperCase(), String(g?.home || '').toUpperCase()]).filter(Boolean))
  let soft = null
  for (const team of Object.keys(matchup?.dvp?.season || {})) {
    if (playing.size && !playing.has(team.toUpperCase())) continue
    const d = softRole(matchup, team, 'season')
    if (d?.standout && (!soft || d.z > soft.d.z)) soft = { team, d }
  }
  if (soft) out.push({ k: 'lead-def', icon: '🛡️', tag: 'SOFTEST DEFENSE', name: `${soft.team} defense`, why: softLine(soft.d), stat: soft.d.multiple ? `${Math.round(soft.d.multiple * 10) / 10}x avg` : `${Math.round(soft.d.z * 10) / 10} sd`, col: C.green, nav: 'matchups' })

  return out
}
