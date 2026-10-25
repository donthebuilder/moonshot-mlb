// 📋 WHO IS CALLED TODAY, GATHERED ONCE (2026-10-25). The entries behind "Copy called" (the text) and the CALLED card (the picture):
// one reader per sport, the boards' own statuses, so the text and the card can never disagree. Server-safe: `getJSON` is handed in
// (the page fetches its own origin; the card route fetches the same routes by absolute URL). An entry:
//   { gameKey, title, start, name, team, opp, id, date, lane }   -- lib/calledList.js groupCalled() groups them by game.
import { tdPool } from './nfl/tdPool'
import { tdStatusFor } from './nfl/tdStatus'

const NBA_LANES = { pts: 'PTS 25+', reb: 'REB 10+', ast: 'AST 8+', '3pm': '3PM 4+', pra: 'PRA 35+', dd: 'DD', td: 'TD', first: 'FIRST BASKET' }
const NHL_LANES = { GOAL: 'GOAL', G2: '2+ GOALS', SOG: 'SHOTS' }
const q = (date, extra = {}) => { const p = new URLSearchParams(); if (date) p.set('date', date); for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v); const s = p.toString(); return s ? `?${s}` : '' }
export const dayWord = (d) => { try { return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }) } catch { return d || '' } }

/** BUCKETS: every lane's board; CALLED in any lane = CALLED. */
export async function nbaCalled(getJSON, date = null, base = '') {
  const out = []
  let day = date
  for (const [m, lane] of Object.entries(NBA_LANES)) {
    const b = await getJSON(`${base}/api/buckets/board${q(date, { market: m === 'pts' ? null : m })}`)
    day = day || b?.date || null
    for (const r of b?.rows || []) if (r.status === 'called') {
      const g = (b.games || []).find((x) => x.id === r.gameId)
      out.push({ gameKey: String(r.gameId), title: g ? `${g.away?.abbrev} @ ${g.home?.abbrev}` : `${r.team} vs ${r.opp}`, start: g?.start || null, name: r.name, team: r.team, opp: r.opp, id: String(r.playerId), date: b.date, lane })
    }
  }
  return { head: `🏀 BUCKETS · CALLED · ${dayWord(day)}`, day, entries: out }
}

/** LAMP: the goal board, 2+ goals and shots (the 0c rule). */
export async function nhlCalled(getJSON, date = null, base = '') {
  const out = []
  let day = date
  for (const [m, lane] of Object.entries(NHL_LANES)) {
    const b = await getJSON(`${base}/api/lamp/board${q(date, { market: m === 'GOAL' ? null : m })}`)
    day = day || b?.date || null
    for (const g of b?.games || []) for (const r of g.rows || []) if (r.status === 'called') {
      const gm = g.game || {}
      out.push({ gameKey: String(gm.id), title: `${gm.away?.abbrev} @ ${gm.home?.abbrev}`, start: gm.startUtc || null, name: r.name, team: r.team, opp: r.opp, id: String(r.playerId), date: b.date, lane: r.line ? `${lane} ${r.line}` : lane })
    }
  }
  return { head: `🚨 LAMP · CALLED · ${dayWord(day)}`, day, entries: out }
}

/** TUDDY: its week file + pick card + game calls (already on the page, or read by the route). Each man labelled by the market that called him. */
export function nflCalled(data, picks, gameCalls) {
  const games = data?.games || []
  const gameOf = (team) => games.find((g) => g.home === team || g.away === team)
  const out = []
  const push = (p, lane) => {
    const g = gameOf(p.team)
    out.push({ gameKey: String(g?.game_id || p.team), title: g ? `${g.away} @ ${g.home}` : `${p.team} vs ${p.opp || ''}`, start: g?.kickoff || null, name: p.name, team: p.team, opp: p.opp || null, id: String(p.player_id), date: g?.kickoff ? String(g.kickoff).slice(0, 10) : null, lane })
  }
  // the TD lane: TUDDY's own status (the TD ladder + the locked game calls); onBotOf says WHICH market called him, and a man CALLED
  // only by another market (a QB's passing yards, a kicker's points) is labelled by that market below
  const { statusOf, onBotOf } = tdStatusFor({ picksCard: picks?.card, gameCalls, games, board: tdPool(data).rows })
  for (const p of data?.players || []) {
    if (statusOf(p) !== 'called') continue
    const ob = onBotOf(p)
    if (ob?.market === 'TD') push(p, 'Anytime TD')
    else if (ob?.market === 'GAME') push(p, `${ob.role === 'TOP' ? 'TOP' : 'TD'} game call`)
  }
  for (const [k, c] of Object.entries(picks?.card || {})) if (k !== 'TD') for (const r of c.rungs || []) push(r, c.label || k)
  return { head: `🏈 TUDDY · CALLED · week ${picks?.week ?? data?.week ?? ''}`, day: null, entries: out, weekday: true }
}
