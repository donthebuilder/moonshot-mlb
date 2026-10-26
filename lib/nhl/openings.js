// 🏒 LAMP'S OPENINGS (2026-10-26, Donovan: "backfill 2025-26 NHL first goals so LAMP's walls have last season too"). One
// finished game's NHL play-by-play (api-web.nhle.com gamecenter/{id}/play-by-play, the read the tick already makes at grade
// time) -> one opening_games row, sport 'nhl' (supabase/migrations/202610221300_openings.sql, built for this):
//   jump_win_team / jump_players   the opening faceoff: the club that won it, [winner, loser]
//   first_att_*                    the game's first shot attempt (on goal, missed, blocked or a goal), its club and shooter
//   first_score_*                  the first goal: club, scorer, seconds into the game (a shootout goal is not one)
//   win1 / win2 / p1 pts           goals in the first 5 and 10 minutes and the first period, each club
// Read by the first-goal face wall (lib/ledger/firstScorers.js). Pure, plus the write. Nothing is guessed: a field the feed
// lacks stays null.

export const WIN1_S = 300, WIN2_S = 600
const PERIOD_S = 1200

const secs = (t) => { const m = /^(\d+):(\d{2})$/.exec(String(t || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null }
/** seconds into the game: the period's start plus its clock (overtime periods start at 3600) */
function gameSecond(p) {
  const n = Number(p?.periodDescriptor?.number), t = secs(p?.timeInPeriod)
  return Number.isFinite(n) && t != null ? (n - 1) * PERIOD_S + t : null
}
const SHOTS = new Set(['shot-on-goal', 'missed-shot', 'blocked-shot', 'goal'])

/** play-by-play -> the opening_games row, or null for a game with no plays */
export function openingRowNhl(pbp) {
  const plays = [...(pbp?.plays || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  if (!plays.length || !pbp.awayTeam || !pbp.homeTeam) return null
  const away = pbp.awayTeam.abbrev, home = pbp.homeTeam.abbrev
  const club = (id) => (Number(id) === Number(pbp.awayTeam.id) ? away : Number(id) === Number(pbp.homeTeam.id) ? home : null)
  const other = (t) => (t === away ? home : t === home ? away : null)
  const row = {
    sport: 'nhl', game_id: String(pbp.id), game_date: String(pbp.gameDate || '').slice(0, 10), season: Number(pbp.season) || null,
    season_type: Number(pbp.gameType) || null, home, away, win1_s: WIN1_S, win2_s: WIN2_S,
    jump_win_team: null, jump_players: null, first_att_team: null, first_att_player: null, first_att_clock_s: null,
    first_score_team: null, first_score_player: null, first_score_clock_s: null, first_score_pts: null,
    pre_first_att_home: null, pre_first_att_away: null,
    win1_home_pts: 0, win1_away_pts: 0, win2_home_pts: 0, win2_away_pts: 0, p1_home_pts: 0, p1_away_pts: 0,
  }
  // SHOTS TO THE FIRST GOAL (2026-10-26): each club's shots on goal up to and including the first goal (the goal counts).
  // Blocked and missed shots are not shots on goal; a shootout is not play, and a game with no goal before it stays null.
  const sogBy = new Map()
  for (const p of plays) {
    const d = p.details || {}
    if (p.typeDescKey === 'faceoff' && !row.jump_win_team) {
      row.jump_win_team = club(d.eventOwnerTeamId)
      row.jump_players = [d.winningPlayerId, d.losingPlayerId].filter(Boolean).map(String)
    }
    if (SHOTS.has(p.typeDescKey) && !row.first_att_team) {
      // a blocked shot is owned by the blocking club; the shooter's is the other one
      const t = p.typeDescKey === 'blocked-shot' ? other(club(d.eventOwnerTeamId)) : club(d.eventOwnerTeamId)
      row.first_att_team = t
      row.first_att_player = String(d.shootingPlayerId || d.scoringPlayerId || '') || null
      row.first_att_clock_s = gameSecond(p)
    }
    if ((p.typeDescKey === 'shot-on-goal' || p.typeDescKey === 'goal') && p.periodDescriptor?.periodType !== 'SO') {
      const t = club(d.eventOwnerTeamId)
      if (t) sogBy.set(t, (sogBy.get(t) || 0) + 1)
    }
    if (p.typeDescKey === 'goal' && p.periodDescriptor?.periodType !== 'SO') {
      const t = club(d.eventOwnerTeamId), at = gameSecond(p)
      if (!row.first_score_team) {
        Object.assign(row, { first_score_team: t, first_score_player: d.scoringPlayerId ? String(d.scoringPlayerId) : null, first_score_clock_s: at,
          pre_first_att_home: sogBy.get(home) || 0, pre_first_att_away: sogBy.get(away) || 0 })
      }
      const side = t === home ? 'home' : t === away ? 'away' : null
      if (side && at != null) {
        if (at <= WIN1_S) row[`win1_${side}_pts`] += 1
        if (at <= WIN2_S) row[`win2_${side}_pts`] += 1
        if (at <= PERIOD_S) row[`p1_${side}_pts`] += 1
      }
    }
  }
  return row
}

/** Upsert one game's opening. Returns an error message or null. */
export async function writeOpeningNhl(db, pbp, source = 'tick') {
  const r = openingRowNhl(pbp)
  if (!r) return 'no plays'
  const w = await db.from('opening_games').upsert([{ ...r, source }], { onConflict: 'sport,game_id' })
  return w.error ? w.error.message : null
}
