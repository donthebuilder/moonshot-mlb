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
import { matchupTag, alignedSignals } from './dvpSignal'

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
    if (!bestGame || total > bestGame.total) bestGame = { total, away: g.away, home: g.home }
  }

  if (top) out.push({
    k: 'top', icon: '🎯', tag: "THE BOT'S #1", name: nameOf(top),
    why: teamLine(top), stat: `TD ${Math.round(top.scores[MARKET])}`, col: C.green, p: top,
  })
  if (highConf) out.push({
    k: 'highconf', icon: '⭐', tag: 'HIGH-CONFIDENCE', name: nameOf(highConf),
    why: `Bot's own high-confidence flag · ${teamLine(highConf)}`, stat: `TD ${Math.round(highConf.scores[MARKET])}`, col: C.yellow, p: highConf,
  })
  if (aligned) out.push({
    k: 'aligned', icon: '🧩', tag: 'SIGNAL STACK', name: nameOf(aligned.p),
    why: signalsLine(aligned), stat: `${aligned.hits} of 3 aligned`, col: C.cyan, p: aligned.p,
  })
  if (softest) out.push({
    k: 'matchup', icon: '🛡️', tag: 'SOFTEST MATCHUP', name: nameOf(softest.p),
    why: softest.tag.detail, stat: `#${softest.tag.rank} of 32`, col: C.lime, p: softest.p,
  })
  if (bestGame && bestGame.total > 0) out.push({
    k: 'game', icon: '🏟️', tag: 'GAME TO CIRCLE', name: `${bestGame.away} @ ${bestGame.home}`,
    why: 'the strongest touchdown board on the slate', stat: `${bestGame.total.toFixed(1)} xTD`, col: C.blue, nav: 'games',
  })

  return out
}
