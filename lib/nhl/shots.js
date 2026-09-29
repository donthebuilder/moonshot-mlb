// 🏒 THE SHOT ARCHIVE (lamp research step 3, 2026-09-26). One play-by-play
// -> lamp_shots rows: every shot on goal, goal, miss and block, with the
// feed's own coordinates. Pure: no fetch here, so the tick's grade step and
// the one-off backfill (scripts/backfill-lamp-shots.mjs) write identical rows.
//
//   shooter   details.scoringPlayerId on a goal, shootingPlayerId otherwise
//   team      the shooter's club from the game's rosterSpots -- NOT the
//             event's owner, which on a blocked shot can be the other side
//   strength  situationCode "AGAS HSHG" read as [away goalie, away skaters,
//             home skaters, home goalie], from the shooter's side; a pulled
//             goalie's extra attacker is not a power play
//   shootout  left out: a shootout attempt is not a shot in any NHL total
const RESULT = { 'shot-on-goal': 'sog', goal: 'goal', 'missed-shot': 'miss', 'blocked-shot': 'block' }
const int = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.round(Number(v)) : null)
const secs = (mmss) => { const m = /^(\d+):(\d{2})$/.exec(String(mmss || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null }

function strengthFor(code, shooterHome) {
  const s = String(code || '')
  if (!/^\d{4}$/.test(s)) return null
  const [ag, as, hs, hg] = s.split('').map(Number)
  const eff = (sk, g) => sk - (g === 0 ? 1 : 0)   // an empty net's extra attacker is not a man advantage
  const us = shooterHome ? eff(hs, hg) : eff(as, ag)
  const them = shooterHome ? eff(as, ag) : eff(hs, hg)
  return us > them ? 'pp' : us < them ? 'sh' : 'ev'
}

/** play-by-play JSON -> lamp_shots rows (possibly empty). */
export function shotsFromPlayByPlay(pbp) {
  if (!pbp || !Array.isArray(pbp.plays)) return []
  const home = { id: Number(pbp.homeTeam?.id), abbrev: pbp.homeTeam?.abbrev }
  const away = { id: Number(pbp.awayTeam?.id), abbrev: pbp.awayTeam?.abbrev }
  const teamOf = new Map((pbp.rosterSpots || []).map((r) => [Number(r.playerId), Number(r.teamId)]))
  const rows = []
  for (const p of pbp.plays) {
    const result = RESULT[p?.typeDescKey]
    if (!result) continue
    const periodType = p.periodDescriptor?.periodType || null
    if (periodType === 'SO') continue
    const d = p.details || {}
    const shooter = int(result === 'goal' ? d.scoringPlayerId : d.shootingPlayerId)
    if (!shooter) continue
    const teamId = teamOf.get(shooter)
    const side = teamId === home.id ? home : teamId === away.id ? away : null
    if (!side?.abbrev) continue
    rows.push({
      game_id: Number(pbp.id), event_id: int(p.eventId), game_date: pbp.gameDate, season: int(pbp.season), game_type: int(pbp.gameType),
      period: int(p.periodDescriptor?.number), period_type: periodType, time_s: secs(p.timeInPeriod),
      player_id: shooter, team: side.abbrev, goalie_id: int(d.goalieInNetId),
      x: int(d.xCoord), y: int(d.yCoord), zone: d.zoneCode || null, shot_type: d.shotType || null,
      result, strength: strengthFor(p.situationCode, side === home), situation_code: p.situationCode || null,
      // Why it missed, as the feed says it (wide-left, hit-crossbar, ...); misses only.
      miss_reason: result === 'miss' ? (d.reason || null) : null,
    })
  }
  return rows.filter((r) => r.event_id != null && r.period != null)
}

/** Upsert a game's shots; returns { rows } or throws. Same values on a rerun. */
// Until supabase/migrations/202609282300_lamp_shots_miss_reason.sql has run,
// the table has no miss_reason column and PostgREST refuses the whole write.
// Retry once without it rather than lose the game's shots over one field.
export async function writeShots(db, rows) {
  let out = rows
  for (let i = 0; i < out.length; i += 500) {
    let { error } = await db.from('lamp_shots').upsert(out.slice(i, i + 500), { onConflict: 'game_id,event_id' })
    if (error && /miss_reason/.test(error.message) && 'miss_reason' in (out[0] || {})) {
      out = out.map(({ miss_reason, ...r }) => r)
      ;({ error } = await db.from('lamp_shots').upsert(out.slice(i, i + 500), { onConflict: 'game_id,event_id' }))
    }
    if (error) throw new Error(error.message)
  }
  return { rows: rows.length }
}
