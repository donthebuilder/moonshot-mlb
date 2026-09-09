import { projectedFantasyPoints } from './scoring'

// ── NOBODY SHOULD SCORE ZERO BECAUSE THEY WERE BUSY ─────────────────────────
//
// 2026-09-07, Donovan: "make sure it auto lineups if the time comes."
//
// Franchise locked lineups at kickoff and did nothing else. A manager who
// never opened the app started nobody and scored nothing, and his opponent got
// a free win that says nothing about either team. On the Sunday this was
// written, FIVE OF NINE teams in the DASH league had 0 of 9 starters set with
// Week 1 three days out. That is not an edge case; it is most of the league.
//
// The draft already had this exact safety net -- an expired pick auto-picks
// rather than stalling the room. A lineup deadline is the same event with the
// same right answer.
//
// WHAT IT WILL AND WILL NOT DO
//
//  · It only fills EMPTY starting slots. A lineup a human set is never
//    touched, reordered, or second-guessed, however bad it looks.
//  · It only starts a player whose own game has not kicked off. Filling a slot
//    with a man whose game ended at one o'clock is worse than leaving it empty:
//    it looks like a decision.
//  · It skips a player on bye, for the same reason -- a bye is a guaranteed
//    zero wearing the clothes of a real start.
//  · It runs from an hour before the week's first kickoff. Earlier would take
//    the week away from managers who set their lineup on Sunday morning;
//    later leaves Thursday-night slots empty. Anything it fills stays editable
//    until that player's own game locks it, so an early fill costs a manager
//    nothing and an empty slot costs him the week.
//
// SCARCEST SLOT FIRST. Filling in board order hands FLEX the best running back
// and then finds nothing left for RB2. K, DEF, QB and TE have exactly one
// eligible pool each and are filled first; FLEX is filled last, from whoever
// is left.
const FILL_ORDER = ['K', 'DEF', 'QB', 'TE', 'RB', 'WR', 'FLEX']

/** Minutes before the first kickoff of the week that the net goes up. */
export const AUTO_FILL_LEAD_MS = 60 * 60 * 1000

/** The starting slots a league uses. Mirrors slotsFor() on the Team page --
 *  if that list changes, this changes with it. */
export function startingSlotsFor(league) {
  const slots = [['QB', 1], ['RB', 1], ['RB', 2], ['WR', 1], ['WR', 2], ['TE', 1], ['FLEX', 1]]
  if (league?.has_kicker) slots.push(['K', 1])
  if (league?.has_defense) slots.push(['DEF', 1])
  return slots
}

const eligible = (player, slot) =>
  slot === 'FLEX' ? ['RB', 'WR', 'TE'].includes(player?.position) : player?.position === slot

/**
 * Fill every empty starting slot in every league for one week.
 *
 * Pure-ish: reads through `db`, returns the rows it wants inserted plus a
 * per-team explanation, and only writes when `commit` is true. That split is
 * what makes it testable without a database and safe to dry-run in production.
 *
 * Never throws -- it runs inside the scoring cron, and a lineup helper must
 * not be able to take scoring down with it.
 */
export async function autoFillLineups(db, { season, week, now = Date.now(), commit = true } = {}) {
  const result = { filled: [], slotsFilled: 0, skipped: null }
  try {
    if (!db || !season || !week) return { ...result, skipped: 'missing_arguments' }

    const { data: games } = await db.from('nfl_week_games')
      .select('kickoff,status,home_team,away_team').eq('season', season).eq('week', week)
    const weekGames = games || []
    if (!weekGames.length) return { ...result, skipped: 'no_games' }

    const kickoffs = weekGames.map((g) => new Date(g.kickoff).getTime()).filter(Number.isFinite)
    const firstKickoff = kickoffs.length ? Math.min(...kickoffs) : null
    if (firstKickoff == null) return { ...result, skipped: 'no_kickoffs' }
    if (now < firstKickoff - AUTO_FILL_LEAD_MS) return { ...result, skipped: 'too_early' }

    // A team's game has started if ANY game its NFL club is in has kicked off.
    const kickoffByClub = new Map()
    for (const game of weekGames) {
      const at = new Date(game.kickoff).getTime()
      for (const club of [game.home_team, game.away_team]) {
        const key = String(club || '').toUpperCase()
        if (!key) continue
        const seen = kickoffByClub.get(key)
        if (seen == null || at < seen) kickoffByClub.set(key, at)
      }
    }
    const started = (player) => {
      const at = kickoffByClub.get(String(player?.team || '').toUpperCase())
      // A club with no game this week is on bye and is caught by onBye() below;
      // a club we cannot resolve is treated as NOT started, so the worst case is
      // an optimistic start rather than a silently empty slot.
      return at != null && now >= at
    }

    const [{ data: leagues }, { data: teams }] = await Promise.all([
      db.from('fantasy_leagues').select('id,scoring,has_kicker,has_defense').eq('status', 'active'),
      db.from('fantasy_teams').select('id,league_id,name'),
    ])
    const leagueById = new Map((leagues || []).map((l) => [l.id, l]))
    const liveTeams = (teams || []).filter((t) => leagueById.has(t.league_id))
    if (!liveTeams.length) return { ...result, skipped: 'no_active_leagues' }

    const teamIds = liveTeams.map((t) => t.id)
    const [{ data: rosterRows }, { data: slotRows }] = await Promise.all([
      db.from('fantasy_roster_entries')
        .select('team_id,player_id,player:nfl_players(id,name,position,team,injury_status,source_payload)')
        .in('team_id', teamIds).is('released_at', null),
      db.from('fantasy_lineup_slots').select('team_id,slot,slot_index,player_id')
        .in('team_id', teamIds).eq('season', season).eq('week', week),
    ])

    const rosterByTeam = new Map()
    for (const row of rosterRows || []) {
      if (!row.player) continue
      if (!rosterByTeam.has(row.team_id)) rosterByTeam.set(row.team_id, [])
      rosterByTeam.get(row.team_id).push(row.player)
    }
    const slotsByTeam = new Map()
    for (const row of slotRows || []) {
      if (!slotsByTeam.has(row.team_id)) slotsByTeam.set(row.team_id, [])
      slotsByTeam.get(row.team_id).push(row)
    }

    // A bye is simply "no game this week": the clubs playing are exactly the
    // clubs named in weekGames, so this needs no separate bye table. If the
    // slate failed to load we have no clubs at all, and then nobody is treated
    // as on bye rather than everybody.
    const playingClubs = new Set([...kickoffByClub.keys()])
    const onBye = (player) => {
      const club = String(player?.team || '').toUpperCase()
      if (!club || !playingClubs.size) return false
      return !playingClubs.has(club)
    }

    const inserts = []
    for (const team of liveTeams) {
      const league = leagueById.get(team.league_id)
      const roster = rosterByTeam.get(team.id) || []
      const existing = slotsByTeam.get(team.id) || []
      if (!roster.length) continue

      const takenSlots = new Set(existing.map((r) => `${r.slot}#${r.slot_index}`))
      const usedPlayers = new Set(existing.map((r) => r.player_id))
      const openSlots = startingSlotsFor(league).filter(([slot, index]) => !takenSlots.has(`${slot}#${index}`))
      if (!openSlots.length) continue

      const bench = roster
        .filter((p) => !usedPlayers.has(p.id) && !onBye(p) && !started(p))
        .map((p) => ({ player: p, value: projectedFantasyPoints(p, league?.scoring) }))
        .sort((a, b) => b.value - a.value)

      const chosen = []
      const order = [...openSlots].sort((a, b) => FILL_ORDER.indexOf(a[0]) - FILL_ORDER.indexOf(b[0]))
      for (const [slot, index] of order) {
        const pick = bench.find((c) => !c.taken && eligible(c.player, slot))
        if (!pick) continue
        pick.taken = true
        chosen.push({ slot, index, player: pick.player, value: pick.value })
        inserts.push({ team_id: team.id, season, week, slot, slot_index: index, player_id: pick.player.id })
      }
      if (chosen.length) {
        result.filled.push({
          teamId: team.id,
          team: team.name,
          leagueId: team.league_id,
          slotsOpen: openSlots.length,
          slotsFilled: chosen.length,
          picks: chosen.map((c) => `${c.slot}${c.index > 1 ? c.index : ''}: ${c.player.name} (${c.value.toFixed(1)})`),
        })
        result.slotsFilled += chosen.length
      }
    }

    if (commit && inserts.length) {
      // ignoreDuplicates: two ticks ten minutes apart must not fight over the
      // same slot, and the unique indexes on (team,season,week,slot,index) and
      // (team,season,week,player) make a re-run a no-op rather than an error.
      const { error } = await db.from('fantasy_lineup_slots')
        .upsert(inserts, { onConflict: 'team_id,season,week,slot,slot_index', ignoreDuplicates: true })
      if (error) return { ...result, skipped: `insert_failed:${error.message}` }
    }
    return result
  } catch (error) {
    return { ...result, skipped: `error:${String(error?.message || error).slice(0, 120)}` }
  }
}
