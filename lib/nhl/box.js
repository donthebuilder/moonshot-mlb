// LAMP'S BOX SCORE ROWS (2026-10-25; table: supabase/migrations/202610252200_lamp_box.sql). One finished game's NHL box score
// (api-web.nhle.com gamecenter/{id}/boxscore, the same read the tick grades from) -> one row per dressed player with ice time:
// goals, assists, points, shots on goal, power-play goals, hits, blocks, ice time; saves for a goalie. Pure, plus the write.
// Read by LAMP Trending (/api/lamp/trending) and, next, LAMP's WITHOUT split. Nothing is guessed: a field the box lacks is null.

const n = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const toiSec = (t) => { const m = /^(\d+):(\d{2})$/.exec(String(t || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null }
const savesOf = (s) => { const m = /^(\d+)\/(\d+)$/.exec(String(s || '')); return m ? { saves: Number(m[1]), against: Number(m[2]) } : null }

/** box -> lamp_box rows. Players with no ice time (scratches, a backup goalie who never played) are left out. */
export function boxRowsNhl(box) {
  const out = []
  if (!box?.playerByGameStats || !box.awayTeam || !box.homeTeam) return out
  const date = String(box.gameDate || '').slice(0, 10)
  for (const [side, team, opp, home] of [['awayTeam', box.awayTeam.abbrev, box.homeTeam.abbrev, false], ['homeTeam', box.homeTeam.abbrev, box.awayTeam.abbrev, true]]) {
    const s = box.playerByGameStats[side] || {}
    for (const p of [...(s.forwards || []), ...(s.defense || []), ...(s.goalies || [])]) {
      const toi = toiSec(p.toi)
      if (!p.playerId || !toi) continue
      const g = p.position === 'G'
      const sv = g ? savesOf(p.saveShotsAgainst) : null
      out.push({
        game_id: Number(box.id), player_id: Number(p.playerId), game_date: date, season: Number(box.season), game_type: Number(box.gameType),
        team, opp, home, name: p.name?.default || String(p.playerId), pos: p.position || null, sweater: n(p.sweaterNumber), toi_s: toi,
        goals: g ? null : n(p.goals), assists: g ? null : n(p.assists), points: g ? null : n(p.points), sog: g ? null : n(p.sog),
        pp_goals: g ? null : n(p.powerPlayGoals), hits: g ? null : n(p.hits), blocks: g ? null : n(p.blockedShots), pim: n(p.pim),
        shifts: g ? null : n(p.shifts), plus_minus: g ? null : n(p.plusMinus),
        saves: g ? (sv ? sv.saves : n(p.saves)) : null, shots_against: g ? (sv ? sv.against : n(p.shotsAgainst)) : null, goals_against: g ? n(p.goalsAgainst) : null,
      })
    }
  }
  return out
}

/** Upsert the rows. { rows, missing }: a table that is not there yet (the SQL not run) is said, never thrown -- the grade goes on. */
export async function writeBox(db, rows) {
  if (!rows?.length) return { rows: 0, missing: false }
  const w = await db.from('lamp_box').upsert(rows, { onConflict: 'game_id,player_id' })
  if (w.error) {
    if (/lamp_box/.test(w.error.message) && /(does not exist|schema cache|relation)/i.test(w.error.message)) return { rows: 0, missing: true }
    throw new Error(w.error.message)
  }
  return { rows: rows.length, missing: false }
}
