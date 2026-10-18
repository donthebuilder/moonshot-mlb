// 🏒 LAMP GOAL COMPOSITE, THE FETCH-AND-JOIN HALF (lamp-goal-comp-v1; the definition is lib/nhl/goalCompositeModel.js). Server only.
// Takes the night buildNight() already scored (candidates, legs, the opponents' shots-against and goalie lines, the confirmed starter) and joins the
// two feeds the goal board does not read: form (seasonLine.readForm: games BEFORE the date only) and power-play goals / the opponent's special
// teams (spots.js). Every feed is optional: a failed read leaves that group neutral for the men it touches, never an error. Called by the tick
// inside the lock window only, in its own try/catch; nothing here touches the live goal board.
import { readForm } from './seasonLine'
import { readPpGoals, readSpecialTeams } from './spots'
import { scoreCompositeNight, netSave } from './goalCompositeModel'

const safe = async (what, fn, fallback) => { try { return await fn() } catch (e) { console.error(`[lamp composite] ${what}: ${e?.message}`); return fallback } }

/** Score the night's composite and hang it on it: night.compByGame = Map(gameId -> [every scored skater]). Returns { feeds } for the tick's log. */
export async function attachComposite(night, date) {
  const rows = (night?.rows || []).filter((r) => r.legs?.ok)
  const teams = [...new Set(rows.flatMap((r) => [r.team, r.opp]))]
  const cur = night.season?.current || night.season?.id
  const [form, ppGoals, spots] = await Promise.all([
    safe('form', () => readForm(cur, date), new Map()),
    safe('pp goals', () => readPpGoals(teams, cur), new Map()),
    safe('special teams', () => readSpecialTeams(), null),
  ])
  // last season's special teams are not this season's (v4): a stale report is not used
  const st = spots && !spots.stale ? new Map(spots.teams.map((t) => [t.abbrev, t])) : new Map()
  const feed = night.compFeed || { sa60: {}, goalies: {} }
  const candidates = rows.map((r) => {
    const net = netSave(feed.goalies?.[r.opp], r.context?.oppGoalie?.id ?? null)
    const f = form.get(Number(r.playerId)) || null
    return {
      gameId: r.gameId, playerId: r.playerId, name: r.name, pos: r.pos, team: r.team, opp: r.opp, home: r.home, legs: r.legs, context: r.context,
      ang: {
        oppSa60: feed.sa60?.[r.opp] ?? null, oppSv: net.sv, oppSvBasis: net.basis,
        oppShPg: st.get(r.opp)?.shPg ?? null, oppPkPct: st.get(r.opp)?.pkPct ?? null,
        form: f ? { l5: f.l5, gp5: f.gp5, l10: f.l10, gp10: f.gp10 } : null,
        ppGoals: ppGoals.has(Number(r.playerId)) ? ppGoals.get(Number(r.playerId)) : null,
      },
    }
  })
  const out = scoreCompositeNight(candidates)
  night.compByGame = out.byGame
  return { feeds: { form: form.size, ppGoals: ppGoals.size, specialTeams: st.size, scored: out.rows.length } }
}
