// 🏒 THE CLUB-GAME LINE (lamp-team-v1, 2026-10-08). One row per club per game, from that game's shots:
// what the club scored and allowed, the shots on goal it took and gave up and the xG on them
// (lib/nhl/xg.js, empty-net shots left off the curve), and the goalies in its net with what each faced.
// Pure: no fetch, no clock. The tick writes these at grade time (right after the game's shots), and
// scripts/backfill-lamp-team-xg.mjs writes the history, both through THIS function, so the table the
// projection reads is built one way (lib/nhl/teamProj.js reads it; scripts/eval-lamp-xg-games.mjs
// proves the projection on it).
//
//   gf, ga        goals for / against, every goal of the game (an empty-net goal counts)
//   sog, xg       this club's shots on goal that a goalie faced, and their summed xG
//   sog_a, xg_a   the same for the shots it ALLOWED
//   en            empty-net goals this club scored
//   goalies       this club's goalies: { goalie_id: [shots faced, goals allowed, xG faced] }
import { xgShot, isEmptyNet } from './xg'

/** lamp_shots rows (any games) -> club-game rows, two per game that has shots from both clubs. */
export function teamGameRows(shots) {
  const G = new Map()
  for (const r of shots) {
    let g = G.get(r.game_id)
    if (!g) G.set(r.game_id, g = { id: r.game_id, date: r.game_date, season: r.season, type: r.game_type, t: {} })
    const t = g.t[r.team] || (g.t[r.team] = { gf: 0, sog: 0, xg: 0, en: 0, goalies: {} })
    if (r.result === 'goal') t.gf += 1
    if (r.result !== 'sog' && r.result !== 'goal') continue
    if (isEmptyNet(r)) { if (r.result === 'goal') t.en += 1; continue }
    const v = xgShot(r)
    if (v == null) continue
    t.sog += 1; t.xg += v
    // by the SHOOTING club: the goalie they faced. Re-keyed below to the club that goalie plays for.
    const k = String(r.goalie_id)
    const a = t.goalies[k] || (t.goalies[k] = [0, 0, 0])
    a[0] += 1; a[1] += r.result === 'goal' ? 1 : 0; a[2] += v
  }
  const out = []
  for (const g of G.values()) {
    const teams = Object.keys(g.t)
    if (teams.length !== 2) continue
    for (const team of teams) {
      const opp = teams.find((x) => x !== team)
      const me = g.t[team]; const them = g.t[opp]
      out.push({
        game_id: g.id, team, opp, game_date: g.date, season: g.season, game_type: g.type,
        gf: me.gf, ga: them.gf, sog: me.sog, xg: me.xg, sog_a: them.sog, xg_a: them.xg, en: me.en,
        goalies: them.goalies,   // the shots THEY took were faced by MY goalies
      })
    }
  }
  return out.sort((a, b) => (a.game_date < b.game_date ? -1 : a.game_date > b.game_date ? 1 : a.game_id - b.game_id || (a.team < b.team ? -1 : 1)))
}

/**
 * Upsert club-game rows into lamp_team_game_xg; { rows } or throws. Same values on a rerun.
 * Until supabase/migrations/202610081200_lamp_team_game_xg.sql has run the table is missing: that is
 * { rows: 0, missing: true }, never a thrown error (the grade step must not fail over it).
 */
export async function writeTeamGames(db, rows) {
  if (!rows.length) return { rows: 0 }
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db.from('lamp_team_game_xg').upsert(rows.slice(i, i + 200), { onConflict: 'game_id,team' })
    if (error) {
      if (/lamp_team_game_xg|schema cache|does not exist/i.test(error.message)) return { rows: 0, missing: true }
      throw new Error(error.message)
    }
  }
  return { rows: rows.length }
}
