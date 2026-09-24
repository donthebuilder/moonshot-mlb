import { projectedFantasyPoints } from './scoring'
import { isUnavailable, offSlate } from './injury'

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
// `projector(player, scoring)` -> points. The scoring cron passes this week's
// matchup projection (lib/fantasy/matchupProjection.js) so the auto choices
// match the PROJ column managers see; tests and older callers get the average.
const averageProjector = (player, scoring) => projectedFantasyPoints(player, scoring)

export async function autoFillLineups(db, { season, week, now = Date.now(), commit = true, projector = averageProjector, slateIds = null } = {}) {
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
        .select('team_id,player_id,player:nfl_players(id,name,position,team,injury_status,source_payload,source_player_id)')
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
        // Never auto-start a man ruled out (2026-09-23) -- see lib/fantasy/injury.js.
        .filter((p) => !usedPlayers.has(p.id) && !onBye(p) && !started(p) && !isUnavailable(p) && !offSlate(p, slateIds, (x) => !onBye(x)))
        .map((p) => ({ player: p, value: projector(p, league?.scoring) }))
        .sort((a, b) => b.value - a.value)

      const chosen = []
      const order = [...openSlots].sort((a, b) => FILL_ORDER.indexOf(a[0]) - FILL_ORDER.indexOf(b[0]))
      for (const [slot, index] of order) {
        const pick = bench.find((c) => !c.taken && eligible(c.player, slot))
        if (!pick) continue
        pick.taken = true
        chosen.push({ slot, index, player: pick.player, value: pick.value })
        // league_id IS NOT NULL on this table and nothing defaults it. Without it
        // here every upsert failed ("null value in column league_id") and the
        // net never caught anyone: Week 1 2026 ended with three teams and no
        // QB, four with no DEF, and not one row written by this function
        // (2026-09-14, found while sweeping for Week 2).
        inserts.push({ league_id: team.league_id, team_id: team.id, season, week, slot, slot_index: index, player_id: pick.player.id })
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

// ── LAST WEEK'S LINEUP IS THIS WEEK'S STARTING POINT (2026-09-14) ───────────
//
// Lineups are stored one row per (team, week, slot). Nothing ever wrote the
// next week's rows, so every manager opened Week 2 to nine "Open slot" rows
// and had to rebuild a lineup he had already set -- and if he did not, the
// auto-fill above built one by projection that ignored every choice he made
// in Week 1. Every platform people have used carries a lineup forward; this
// is that.
//
//  · Runs for the week the feed is on, so Week N+1 is seeded the morning the
//    bot rolls to it (Tuesday), days before anyone needs to touch it.
//  · Fills only what is EMPTY this week: a slot the manager already set, or a
//    player he already placed, is never touched. A stray early edit does not
//    block the rest of the lineup carrying over.
//  · Only players still on the roster. A man dropped or traded since last
//    week is simply not carried; his slot stays open for the manager or, an
//    hour before kickoff, the auto-fill.
//  · Bye weeks are NOT resolved here on purpose. The team page prints BYE on
//    the row and dashes his projection; moving him is the manager's call and
//    a carried-over lineup that quietly benched someone would be a decision
//    made for him. The auto-fill never starts a bye player, so an empty slot
//    is still safe.
//
// Same shape as autoFillLineups: never throws, returns what it did.
export async function carryForwardLineups(db, { season, week, commit = true } = {}) {
  const result = { carried: [], rowsCarried: 0, skipped: null }
  try {
    if (!db || !season || !week || week < 2) return { ...result, skipped: week < 2 ? 'first_week' : 'missing_arguments' }
    const [{ data: leagues }, { data: teams }] = await Promise.all([
      db.from('fantasy_leagues').select('id').eq('status', 'active'),
      db.from('fantasy_teams').select('id,league_id,name'),
    ])
    const activeLeagues = new Set((leagues || []).map((l) => l.id))
    const liveTeams = (teams || []).filter((t) => activeLeagues.has(t.league_id))
    if (!liveTeams.length) return { ...result, skipped: 'no_active_leagues' }
    const teamIds = liveTeams.map((t) => t.id)
    const [{ data: previous }, { data: current }, { data: rosterRows }] = await Promise.all([
      db.from('fantasy_lineup_slots').select('team_id,slot,slot_index,player_id')
        .in('team_id', teamIds).eq('season', season).eq('week', week - 1),
      db.from('fantasy_lineup_slots').select('team_id,slot,slot_index,player_id')
        .in('team_id', teamIds).eq('season', season).eq('week', week),
      db.from('fantasy_roster_entries').select('team_id,player_id')
        .in('team_id', teamIds).is('released_at', null),
    ])
    if (!(previous || []).length) return { ...result, skipped: 'no_previous_week' }
    const byTeam = (rows) => {
      const out = new Map()
      for (const row of rows || []) {
        if (!out.has(row.team_id)) out.set(row.team_id, [])
        out.get(row.team_id).push(row)
      }
      return out
    }
    const prevByTeam = byTeam(previous)
    const curByTeam = byTeam(current)
    const rosterByTeam = byTeam(rosterRows)

    const inserts = []
    for (const team of liveTeams) {
      const last = prevByTeam.get(team.id) || []
      if (!last.length) continue
      const now = curByTeam.get(team.id) || []
      const takenSlots = new Set(now.map((r) => `${r.slot}#${r.slot_index}`))
      const usedPlayers = new Set(now.map((r) => r.player_id))
      const onRoster = new Set((rosterByTeam.get(team.id) || []).map((r) => r.player_id))
      let carried = 0
      for (const row of last) {
        if (takenSlots.has(`${row.slot}#${row.slot_index}`)) continue
        if (usedPlayers.has(row.player_id)) continue
        if (!onRoster.has(row.player_id)) continue
        inserts.push({ league_id: team.league_id, team_id: team.id, season, week, slot: row.slot, slot_index: row.slot_index, player_id: row.player_id })
        takenSlots.add(`${row.slot}#${row.slot_index}`)
        usedPlayers.add(row.player_id)
        carried += 1
      }
      if (carried) {
        result.carried.push({ teamId: team.id, team: team.name, leagueId: team.league_id, rows: carried, fromWeek: week - 1 })
        result.rowsCarried += carried
      }
    }
    if (commit && inserts.length) {
      const { error } = await db.from('fantasy_lineup_slots')
        .upsert(inserts, { onConflict: 'team_id,season,week,slot,slot_index', ignoreDuplicates: true })
      if (error) return { ...result, skipped: `insert_failed:${error.message}` }
    }
    return result
  } catch (error) {
    return { ...result, skipped: `error:${String(error?.message || error).slice(0, 120)}` }
  }
}


// ── AN INJURED STARTER GETS BENCHED, JUST IN CASE (2026-09-23) ──────────────
//
// Donovan: "make sure teams don't start injured players. auto just in case."
//
// The auto-fill above only ever touches EMPTY slots, so a starter a manager
// set -- or one the carry-forward brought over from last week -- stayed in the
// lineup after he was ruled out, and scored zero. This is the one place the
// system edits a filled slot, so it is narrow on purpose:
//
//  · Only a starter who is NOT AVAILABLE (lib/fantasy/injury.js: out,
//    doubtful, IR, PUP, suspended). Questionable players are left alone.
//  · Only while neither man's game has kicked off, and only an unlocked slot.
//  · Only when there is a healthy, eligible replacement not on bye. With no
//    replacement the injured man stays put: an empty slot scores the same
//    zero and would look like the system lost a player.
//  · The replacement is the best projected bench/unassigned player for that
//    slot. The injured man takes the replacement's bench slot, or none if the
//    replacement was unassigned -- he stays on the roster either way.
//  · Runs every scoring tick, so a Sunday-morning OUT is caught before the
//    game, and a man who is upgraded is simply never touched.
//
// Same contract as the other two: never throws, returns what it did, and
// writes nothing when commit is false.
export async function benchUnavailableStarters(db, { season, week, now = Date.now(), commit = true, projector = averageProjector, slateIds = null } = {}) {
  const result = { swaps: [], swapped: 0, skipped: null }
  try {
    if (!db || !season || !week) return { ...result, skipped: 'missing_arguments' }
    const { data: games } = await db.from('nfl_week_games')
      .select('kickoff,home_team,away_team').eq('season', season).eq('week', week)
    const weekGames = games || []
    if (!weekGames.length) return { ...result, skipped: 'no_games' }
    const kickoffByClub = new Map()
    for (const game of weekGames) {
      const at = new Date(game.kickoff).getTime()
      for (const club of [game.home_team, game.away_team]) {
        const key = String(club || '').toUpperCase()
        if (!key || !Number.isFinite(at)) continue
        const seen = kickoffByClub.get(key)
        if (seen == null || at < seen) kickoffByClub.set(key, at)
      }
    }
    const clubOf = (p) => String(p?.team || '').toUpperCase()
    const started = (p) => { const at = kickoffByClub.get(clubOf(p)); return at != null && now >= at }
    const onBye = (p) => Boolean(clubOf(p)) && kickoffByClub.size > 0 && !kickoffByClub.has(clubOf(p))

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
        .select('team_id,player_id,player:nfl_players(id,name,position,team,injury_status,source_payload,source_player_id)')
        .in('team_id', teamIds).is('released_at', null),
      db.from('fantasy_lineup_slots').select('id,team_id,slot,slot_index,player_id,locked_at')
        .in('team_id', teamIds).eq('season', season).eq('week', week),
    ])

    for (const team of liveTeams) {
      const league = leagueById.get(team.league_id)
      const roster = new Map((rosterRows || []).filter((r) => r.team_id === team.id && r.player).map((r) => [r.player_id, r.player]))
      const slots = (slotRows || []).filter((r) => r.team_id === team.id)
      const starting = new Set(startingSlotsFor(league).map(([slot, index]) => `${slot}#${index}`))
      const isStarter = (row) => starting.has(`${row.slot}#${row.slot_index}`)
      const startersNow = new Set(slots.filter(isStarter).map((r) => r.player_id))

      for (const row of slots.filter(isStarter)) {
        const out = roster.get(row.player_id)
        const cannotPlay = (p) => isUnavailable(p) || offSlate(p, slateIds, (x) => !onBye(x))
        if (!out || row.locked_at || started(out) || !cannotPlay(out)) continue
        const benchRowOf = new Map(slots.filter((r) => !isStarter(r)).map((r) => [r.player_id, r]))
        const candidates = [...roster.values()]
          .filter((p) => !startersNow.has(p.id) && eligible(p, row.slot) && !cannotPlay(p) && !onBye(p) && !started(p))
          .filter((p) => !benchRowOf.get(p.id)?.locked_at)
          .map((p) => ({ p, value: projector(p, league?.scoring) }))
          .sort((a, b) => b.value - a.value)
        const pick = candidates[0]
        if (!pick) continue
        const benchRow = benchRowOf.get(pick.p.id) || null
        result.swaps.push({
          teamId: team.id, team: team.name, leagueId: team.league_id,
          slot: `${row.slot}${row.slot_index > 1 ? row.slot_index : ''}`,
          benched: `${out.name} (${out.injury_status || 'not on this week\'s slate'})`,
          started: `${pick.p.name} (${pick.value.toFixed(1)})`,
        })
        result.swapped += 1
        startersNow.delete(out.id); startersNow.add(pick.p.id)
        if (!commit) continue
        // Order matters for the unique (team, season, week, player) index:
        // free the replacement's bench row, put him in the starting slot, then
        // give the injured man the bench slot the replacement left.
        if (benchRow) {
          const { error: e1 } = await db.from('fantasy_lineup_slots').delete().eq('id', benchRow.id)
          if (e1) return { ...result, skipped: `delete_failed:${e1.message}` }
        }
        const { error: e2 } = await db.from('fantasy_lineup_slots').update({ player_id: pick.p.id }).eq('id', row.id).is('locked_at', null)
        if (e2) return { ...result, skipped: `update_failed:${e2.message}` }
        if (benchRow) {
          const { error: e3 } = await db.from('fantasy_lineup_slots').insert({
            league_id: team.league_id, team_id: team.id, season, week,
            slot: benchRow.slot, slot_index: benchRow.slot_index, player_id: out.id,
          })
          if (e3) return { ...result, skipped: `bench_insert_failed:${e3.message}` }
        }
      }
    }
    return result
  } catch (error) {
    return { ...result, skipped: `error:${String(error?.message || error).slice(0, 120)}` }
  }
}
