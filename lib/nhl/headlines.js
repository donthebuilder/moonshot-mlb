// 🏒 LAMP'S HEADLINE CARDS (2026-09-26, shell-parity step 2) -- the cards
// components/HeadlineStrip.js rolls on LAMP's home, in the shape MOONSHOT's
// (lib/headlines.js) and TUDDY's (lib/nfl/headlines.js) use:
// { k, tag, icon, name, why, stat, col, playerId?, gameId? }.
//
// EVERY CARD IS A FIELD. A card whose field isn't there is left out, never
// estimated:
//   THE BOARD'S #1  rankNight(board.games)[0]            (/api/lamp/board)
//   GAME TO CIRCLE  the game whose three CALLED scores sum highest (same)
//   GOALS LEADER    leaders.skaters.goals[0]             (/api/lamp/leaders)
//   LAST NIGHT      the latest graded night's CALLED skater with the most
//                   goals, only if one scored           (/api/lamp/record)
import { rankNight } from './goalModel'

export function buildLampHeadlines({ board = null, leaders = null, record = null, C }) {
  const out = []
  const games = board?.games || []

  const top = rankNight(games)[0]
  if (top) {
    out.push({
      k: 'top', tag: "THE BOARD'S #1", icon: '🎯', col: C.ice, playerId: top.playerId,
      name: top.name,
      why: `${top.team} ${top.home ? 'vs' : '@'} ${top.opp} · #${top.rank} in his game${top.stamp === 'preview' ? ' · PREVIEW, not a call yet' : ''}`,
      stat: String(top.score),
    })
  }

  let best = null
  for (const g of games) {
    const called = (g.rows || []).filter((r) => r.status === 'called' && r.score != null)
    if (called.length < 3) continue
    const sum = called.reduce((n, r) => n + r.score, 0)
    if (!best || sum > best.sum) best = { g, called, sum }
  }
  if (best) {
    out.push({
      k: 'circle', tag: 'GAME TO CIRCLE', icon: '🏟', col: C.teal, gameId: best.g.game?.id,
      name: `${best.g.game?.away?.abbrev} @ ${best.g.game?.home?.abbrev}`,
      why: `The night's strongest three: ${best.called.map((r) => r.name).join(' · ')}`,
      stat: `Σ ${best.sum}`,
    })
  }

  const gl = leaders?.skaters?.goals?.[0]
  if (gl) {
    out.push({
      k: 'goals', tag: `GOALS LEADER${leaders.seasonLabel ? ` · ${leaders.seasonLabel}` : ''}`, icon: '🚨', col: C.lamp, playerId: gl.id,
      name: gl.name, why: `${gl.team} · leads the league in goals, regular season`, stat: `${gl.value} G`,
    })
  }

  const night = record?.nights?.[0]
  const hit = (night?.called || []).filter((r) => r.hit).sort((a, b) => (b.goals || 0) - (a.goals || 0) || (a.rank || 99) - (b.rank || 99))[0]
  if (night && hit) {
    out.push({
      k: 'last', tag: 'LAST NIGHT', icon: '✅', col: C.cream, playerId: hit.playerId,
      name: hit.name, why: `${hit.team} · called #${hit.rank} in his game, and scored`, stat: `${hit.goals} G`,
    })
  }
  return out
}
