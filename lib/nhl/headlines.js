// 🏒 LAMP'S HEADLINE CARDS (2026-09-26, shell-parity step 2) -- the cards
// components/HeadlineStrip.js rolls on LAMP's home, in the shape MOONSHOT's
// (lib/headlines.js) and TUDDY's (lib/nfl/headlines.js) use:
// { k, tag, icon, name, why, stat, col, playerId?, team?, gameId? } -- team rides
// along (2026-09-29) so the strip can show his face (nhlMug needs the club).
//
// EVERY CARD IS A FIELD. A card whose field isn't there is left out, never
// estimated:
//   THE BOARD'S #1  rankNight(board.games)[0]            (/api/lamp/board)
//   GAME TO CIRCLE  the game whose CALLED scores (one per team) sum highest (same)
//   GOALS LEADER    leaders.skaters.goals[0]             (/api/lamp/leaders)
//   LAST NIGHT      the latest graded night's CALLED skater with the most
//                   goals, only if one scored           (/api/lamp/record)
import { rankNight } from './goalModel'

export function buildLampHeadlines({ board = null, leaders = null, record = null, hot = null, C }) {
  const out = []
  const games = board?.games || []

  const top = rankNight(games)[0]
  if (top) {
    out.push({
      k: 'top', tag: "THE BOARD'S #1", icon: '🎯', col: C.ice, playerId: top.playerId, team: top.team,
      name: top.name,
      why: `${top.team} ${top.home ? 'vs' : '@'} ${top.opp} · #${top.rank} in his game${top.stamp === 'preview' ? ' · PREVIEW, not a call yet' : ''}`,
      stat: String(top.score),
    })
  }

  let best = null
  for (const g of games) {
    const called = (g.rows || []).filter((r) => r.status === 'called' && r.score != null)
    // One called per team since lamp-goal-v2 (2026-10-01): a game has two, so
    // asking for three hid this card on every night after the switch.
    if (called.length < 2) continue
    const sum = called.reduce((n, r) => n + r.score, 0)
    if (!best || sum > best.sum) best = { g, called, sum }
  }
  if (best) {
    out.push({
      k: 'circle', tag: 'GAME TO CIRCLE', icon: '🏟', col: C.teal, gameId: best.g.game?.id,
      name: `${best.g.game?.away?.abbrev} @ ${best.g.game?.home?.abbrev}`,
      why: `The night's strongest calls: ${best.called.map((r) => r.name).join(' · ')}`,
      stat: `Σ ${best.sum}`,
    })
  }

  const gl = leaders?.skaters?.goals?.[0]
  if (gl) {
    out.push({
      k: 'goals', tag: `GOALS LEADER${leaders.seasonLabel ? ` · ${leaders.seasonLabel}` : ''}`, icon: '🚨', col: C.lamp, playerId: gl.id, team: gl.team,
      name: gl.name, why: `${gl.team} · leads the league in goals, regular season`, stat: `${gl.value} G`,
    })
  }

  const night = record?.nights?.[0]
  const hit = (night?.called || []).filter((r) => r.hit).sort((a, b) => (b.goals || 0) - (a.goals || 0) || (a.rank || 99) - (b.rank || 99))[0]
  if (night && hit) {
    out.push({
      k: 'last', tag: 'LAST NIGHT', icon: '✅', col: C.cream, playerId: hit.playerId, team: hit.team,
      name: hit.name, why: `${hit.team} · called #${hit.rank} in his game, and scored`, stat: `${hit.goals} G`,
    })
  }
  // ── AROUND THE LEAGUE (BATCH-HEADLINE-PICKS step 4, 2026-09-27) ─────────
  // What the board flagged, never a pick; every row from a page that exists:
  //   SHOT VOLUME     the most shots/game among tonight's rated skaters
  //                   (board rows' legs.shotsPg -- the goal model's own leg)
  //   POWER PLAY EDGE tonight's best PP% against the worst PK it faces
  //                   (board games' spots: the special-teams reports; last
  //                   season's, labelled, before the new one has games)
  //   REST EDGE       a club with rest facing one on the 2nd night of a
  //                   back-to-back (board games' spots: rest / b2b)
  //   HOT STICK       most goals in his last 5 among tonight's clubs, 3+
  //                   (/api/lamp/hotsticks; never last season's)
  // The Longshot row is left out: LAMP's home already carries the longshots
  // preview directly below.
  const rows = games.flatMap((g) => (g.rows || []).map((r) => ({ ...r, g })))
  const vol = rows.filter((r) => Number.isFinite(r.legs?.shotsPg)).sort((a, b) => b.legs.shotsPg - a.legs.shotsPg)[0]
  if (vol) {
    out.push({ k: 'shots', tag: 'SHOT VOLUME', icon: '🎯', col: C.teal, playerId: vol.playerId, team: vol.team, name: vol.name, why: `${vol.team} ${vol.home ? 'vs' : '@'} ${vol.opp} · shots on goal a game, the most of tonight's skaters`, stat: `${vol.legs.shotsPg.toFixed(1)} SOG/g` })
  }
  const stale = board?.spotsSeason?.stale ? ` · ${board.spotsSeason.label}` : ''
  let pp = null
  for (const g of games) {
    for (const [side, other] of [['away', 'home'], ['home', 'away']]) {
      const a = g.spots?.[side]; const b = g.spots?.[other]
      if (!Number.isFinite(a?.ppPct) || !Number.isFinite(b?.pkPct)) continue
      const edge = a.ppPct - b.pkPct
      if (!pp || edge > pp.edge) pp = { edge, team: g.game?.[side]?.abbrev, opp: g.game?.[other]?.abbrev, a, b, gameId: g.game?.id }
    }
  }
  if (pp) {
    out.push({ k: 'pp', tag: 'POWER PLAY EDGE', icon: '⚡', col: C.amber, gameId: pp.gameId, name: `${pp.team} vs ${pp.opp}`, why: `${pp.team} power play ${(100 * pp.a.ppPct).toFixed(1)}% against a ${(100 * pp.b.pkPct).toFixed(1)}% kill${stale}`, stat: `PP ${(100 * pp.a.ppPct).toFixed(1)}%` })
  }
  for (const g of games) {
    for (const [side, other] of [['away', 'home'], ['home', 'away']]) {
      const a = g.spots?.[side]; const b = g.spots?.[other]
      if (!(b?.b2b && Number(a?.rest) >= 1)) continue
      out.push({ k: 'rest', tag: 'REST EDGE', icon: '😴', col: C.ice, gameId: g.game?.id, name: `${g.game?.[side]?.abbrev} vs ${g.game?.[other]?.abbrev}`, why: `${g.game?.[other]?.abbrev} on the 2nd night of a back-to-back; ${g.game?.[side]?.abbrev} had ${a.rest} day${a.rest === 1 ? '' : 's'} off`, stat: `${a.rest}d rest` })
      break
    }
    if (out.some((c) => c.k === 'rest')) break
  }
  if (hot && !hot.stale) {
    const tonight = hot.tonight || {}
    const h = (hot.rows || []).filter((r) => tonight[r.team] && r.g5 >= 3).sort((a, b) => b.g5 - a.g5 || b.sog5 - a.sog5)[0]
    if (h) out.push({ k: 'hot', tag: 'HOT STICK', icon: '🔥', col: C.lamp, playerId: Number(h.id), team: h.team, name: h.name, why: `${h.team} · ${h.g5} goals in his last ${h.gp5}, on ${h.sog5} shots`, stat: `${h.g5} G L5` })
  }
  return out
}
