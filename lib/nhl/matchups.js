// 🏒 LAMP MATCHUPS, THE READ (2026-09-27, matchups plan Part B, in the shape
// Donovan signed off on TUDDY: a ranked table of tonight's defences leads,
// a tap opens the detail). Server only.
//
// One row per DEFENCE playing tonight, ranked by goals allowed per game
// (the stated measure -- no composite score is invented here). Beside it,
// all from what LAMP already reads:
//   PK%          the defence's penalty kill        readSpecialTeams (via the board)
//   opp PP%      the attacking club's power play   same report
//   rest / B2B   both sides                        readRest (via the board)
//   who fits     the ATTACKING club's called skaters tonight (the board's
//                top 3 per game that belong to it), with the league's mug
// League averages are the plain mean over the 32 clubs. Seasons are named:
// standings and the team reports each say whether they are last season's.
import { readBoard } from './boardRead'
import { readStandings } from './readers'
import { nhlMug } from './format'
import { readSpecialTeams } from './spots'

const mean = (xs) => { const v = xs.filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
const rankOf = (vals, v, desc = true) => (Number.isFinite(v) ? 1 + vals.filter((x) => Number.isFinite(x) && (desc ? x > v : x < v)).length : null)
const r1 = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : null)

export async function buildMatchups(date) {
  const [board, standings, st] = await Promise.all([
    readBoard(date, { market: 'GOAL', net: false }),
    readStandings().catch(() => null),
    readSpecialTeams().catch(() => null),   // cached an hour; the board read it too
  ])
  const table = standings?.rows || []
  const gaPg = new Map(table.filter((t) => t.abbrev && t.gp > 0).map((t) => [t.abbrev, t.ga / t.gp]))
  const gaVals = [...gaPg.values()]

  // League means and ranks over all 32 clubs' reports (not just tonight's).
  const rows = []
  const pkVals = (st?.teams || []).map((t) => t.pkPct).filter(Number.isFinite)
  const ppVals = (st?.teams || []).map((t) => t.ppPct).filter(Number.isFinite)
  for (const g of board.games || []) {
    const pairs = [['home', 'away'], ['away', 'home']]   // [defence side, attack side]
    for (const [dSide, aSide] of pairs) {
      const def = g.game?.[dSide]?.abbrev
      const opp = g.game?.[aSide]?.abbrev
      if (!def || !opp) continue
      const ds = g.spots?.[dSide] || {}
      const os = g.spots?.[aSide] || {}
      const called = (g.rows || []).filter((r) => r.team === opp && Number(r.rank) >= 1 && Number(r.rank) <= 3)
        .map((r) => ({ playerId: r.playerId, name: r.name, pos: r.pos, rank: r.rank, mug: nhlMug(g.game?.season || board.season, opp, r.playerId) }))
      const ga = gaPg.get(def)
      rows.push({
        def, opp, gameId: g.game?.id ?? null, home: dSide === 'home', startUtc: g.game?.startUtc || null,
        gaPg: r1(ga), gaRank: rankOf(gaVals, ga, true),
        pk: ds.pkPct ?? null, pkRank: rankOf(pkVals, ds.pkPct, false),
        oppPp: os.ppPct ?? null, oppPpRank: rankOf(ppVals, os.ppPct, true),
        rest: ds.rest ?? null, b2b: Boolean(ds.b2b), oppRest: os.rest ?? null, oppB2b: Boolean(os.b2b),
        called,
      })
    }
  }
  rows.sort((a, b) => (b.gaPg ?? -1) - (a.gaPg ?? -1))
  return {
    date, season: board.season,
    standingsSeason: standings ? { id: standings.seasonId ?? null, stale: Boolean(standings.stale) } : null,
    reportSeason: board.spotsSeason || null,
    league: { gaPg: r1(mean(gaVals)), pk: mean(pkVals), pp: mean(ppVals), clubs: pkVals.length },
    rows: rows.map((r, i) => ({ ...r, rank: i + 1 })),
  }
}
