// FRANCHISE EVENTS, WHICH ARE A DIFFERENT SHAPE FROM EVERY OTHER EVENT HERE.
//
// MOONSHOT and TUDDY events are BROADCAST: something happens to a player, and
// it goes to everybody who follows him. Nobody owns a home run.
//
// A draft pick is owned. "You are on the clock" is addressed to exactly one
// person, and sending it to anyone else is not a slightly wrong notification,
// it is a wrong one. So these events carry an `owner` -- the auth user id off
// fantasy_teams.owner_id -- and the sender delivers them to that person's
// devices and nobody else's. The follow list is not consulted, because
// following has nothing to do with whose turn it is.
//
// That id needs no new plumbing: fantasy_teams.owner_id references auth.users,
// which is the same column dash_push_subscriptions.user_id already keys on.
//
// WHY ONLY THE DRAFT, FOR NOW. These three are the ones with a shelf life.
// "You are on the clock" is worth everything for ninety seconds and nothing
// afterwards; an auto-pick is the message you most need and least want, and
// you need it immediately. Trades, waivers and matchup swings matter for hours
// or days and can wait for a later pass without anybody losing anything.

import { byeTeamsFor } from '../fantasy/bye'
import { easternDate } from '../data'

const txt = (v) => String(v == null ? '' : v).trim()
const BRAND = '\u{1F3C6} DASH'
const URL_FOR = (leagueId) => `/fantasy/league/${leagueId}`

const frEvent = (e) => ({ brand: BRAND, sport: 'fantasy', ...e })

// IMPORTED FROM NOWHERE, THE FIRST TIME (2026-09-01). byeStarterEventsFrom
// called lastName() as though this file had it; it lives in pushRules.js and
// this file never imported it. The producer threw a ReferenceError on its
// very first useful row and the "never throws" catch below turned that into
// silence -- an alert that simply never fired, with nothing anywhere to say
// why. That catch protects the tick from a bad query; it will hide a typo
// just as happily, which is the price of it and the reason this producer is
// simulated rather than read.
//
// Re-declared here rather than imported, so franchise.js keeps depending on
// nothing but data.
const lastName = (full) => {
  const parts = txt(full).split(/\s+/).filter(Boolean)
  if (!parts.length) return ''
  if (parts.length === 1) return parts[0]
  const tail = parts.slice(1).filter((p) => !/^(jr\.?|sr\.?|i{2,3}|iv|v)$/i.test(p))
  return (tail.length ? tail : parts.slice(1)).join(' ')
}

/**
 * Everything worth telling a franchise owner about right now.
 *
 * Reads with the service-role client, because RLS scopes these tables to
 * members and a cron is not a member of anything.
 *
 * Never throws: a franchise query that fails must not take the baseball and
 * football half of the tick down with it.
 */
export async function franchiseEventsFrom(db) {
  if (!db) return []
  try {
    // Only drafts that are actually happening. A draft in setup has no clock,
    // and a completed one has nothing left to say -- except an auto-pick made
    // in its final minutes, which is why `complete` is allowed a short tail.
    const { data: drafts } = await db
      .from('fantasy_drafts')
      .select('id,league_id,status,current_overall_pick,pick_deadline,started_at,completed_at')
      .in('status', ['live', 'complete'])
    const active = (drafts || []).filter((d) => {
      if (d.status === 'live') return true
      const done = Date.parse(d.completed_at || '')
      return Number.isFinite(done) && Date.now() - done < 60 * 60 * 1000
    })
    if (!active.length) return []

    const leagueIds = [...new Set(active.map((d) => d.league_id))]
    const [{ data: teams }, { data: leagues }] = await Promise.all([
      db.from('fantasy_teams').select('id,league_id,owner_id,name').in('league_id', leagueIds),
      db.from('fantasy_leagues').select('id,name').in('id', leagueIds),
    ])
    const teamById = new Map((teams || []).map((t) => [t.id, t]))
    const leagueName = new Map((leagues || []).map((l) => [l.id, txt(l.name)]))

    const out = []

    // ── THE DRAFT IS LIVE ────────────────────────────────────────────────
    // One per draft, to every owner in the league. The only event here that
    // is not addressed to one person, and it still is not a broadcast: it
    // goes to that league's owners and nobody else.
    for (const d of active) {
      if (d.status !== 'live') continue
      const started = Date.parse(d.started_at || '')
      if (!Number.isFinite(started) || Date.now() - started > 30 * 60 * 1000) continue
      for (const t of (teams || []).filter((x) => x.league_id === d.league_id)) {
        if (!t.owner_id) continue
        out.push(frEvent({
          key: `fr:${d.id}:started:${t.id}`,
          category: 'frdraft', priority: 0, owner: t.owner_id,
          title: '\u{1F3C6} The draft is live',
          body: `${leagueName.get(d.league_id) || 'Your league'} is drafting now`,
          short: leagueName.get(d.league_id) || 'your league', group: 'drafts started',
          url: URL_FOR(d.league_id),
        }))
      }
    }

    // ── ON THE CLOCK ─────────────────────────────────────────────────────
    // Every pick row is created up front with its team already assigned, so
    // whose turn it is is a lookup rather than a re-derivation of the snake
    // order -- which is the kind of thing you only want implemented once.
    const liveDrafts = active.filter((d) => d.status === 'live')
    if (liveDrafts.length) {
      const { data: onClock } = await db
        .from('fantasy_draft_picks')
        .select('draft_id,league_id,team_id,overall_pick,round')
        .in('draft_id', liveDrafts.map((d) => d.id))
      for (const d of liveDrafts) {
        const pick = (onClock || []).find(
          (p) => p.draft_id === d.id && p.overall_pick === d.current_overall_pick)
        const team = pick && teamById.get(pick.team_id)
        if (!team?.owner_id) continue
        const left = Math.max(0, Math.round((Date.parse(d.pick_deadline || '') - Date.now()) / 1000))
        out.push(frEvent({
          key: `fr:${d.id}:clock:${d.current_overall_pick}`,
          category: 'frclock', priority: 0, owner: team.owner_id,
          title: '\u{23F1}\u{FE0F} You are on the clock',
          body: `Pick ${d.current_overall_pick}, round ${pick.round || '?'}${
            Number.isFinite(left) && left > 0 ? ` \u{00B7} ${left}s left` : ''}`,
          short: `pick ${d.current_overall_pick}`, group: 'are on the clock',
          url: URL_FOR(d.league_id),
        }))
      }
    }

    // ── THE CLOCK PICKED FOR YOU ─────────────────────────────────────────
    // The message nobody wants and everybody needs. Bounded to the last half
    // hour so a finished draft does not re-offer every auto-pick it ever made
    // to the dedupe table on every tick.
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const { data: autos } = await db
      .from('fantasy_draft_picks')
      .select('draft_id,league_id,team_id,player_id,overall_pick,round,picked_at')
      .in('draft_id', active.map((d) => d.id))
      .eq('assignment_type', 'auto')
      .gte('picked_at', since)
    const playerIds = [...new Set((autos || []).map((a) => a.player_id).filter(Boolean))]
    let nameOf = new Map()
    if (playerIds.length) {
      const { data: players } = await db
        .from('nfl_players').select('id,name,position,team').in('id', playerIds)
      nameOf = new Map((players || []).map((p) => [p.id, p]))
    }
    for (const a of (autos || [])) {
      const team = teamById.get(a.team_id)
      if (!team?.owner_id) continue
      const p = nameOf.get(a.player_id)
      out.push(frEvent({
        key: `fr:${a.draft_id}:auto:${a.overall_pick}`,
        category: 'frauto', priority: 0, owner: team.owner_id,
        title: `\u{26A0}\u{FE0F} Auto-picked: ${txt(p?.name) || 'a player'}`,
        body: `Your timer ran out on pick ${a.overall_pick}${
          p?.position ? ` \u{00B7} ${p.position}${p.team ? `, ${p.team}` : ''}` : ''}`,
        short: txt(p?.name) || `pick ${a.overall_pick}`, group: 'were auto-picked',
        url: URL_FOR(a.league_id),
      }))
    }

    return out
  } catch {
    return []
  }
}

// ── A STARTING SPOT IS STILL EMPTY ─────────────────────────────────────────
//
// The one fantasy alert worth more than every in-game one put together,
// because it is the only one you can still do something about. An empty
// starting slot is points you were never going to score, and the person it
// happens to always finds out on Sunday night.
//
// It is also the alert with the narrowest honest window. Too early and it is
// nagging about a lineup nobody has opened yet; too late and there is nothing
// to do. Three hours before a kickoff is when somebody can still fix it and is
// plausibly near a phone.
//
// WHY IT IS NOT ONE MESSAGE A WEEK. Slots lock per PLAYER, at his own game's
// kickoff -- see sync_nfl_week_feed -- not all at once on Thursday night. A
// Sunday-afternoon slot is still fillable at noon on Sunday, so a
// Thursday-only warning would be technically true and practically useless.
// The dedupe key therefore carries the Eastern DATE of the kickoff: at most
// one per team on Thursday, one Sunday, one Monday, and only on the days a
// slot is actually still empty. Fix it after the first one and the rest never
// fire, which is the whole design.
const LINEUP_WARN_MS = 3 * 60 * 60 * 1000

// QB, RB, RB, WR, WR, TE, FLEX -- plus K and DEF where the league uses them.
// The same shape slotsFor() builds on the Team page. If that list changes,
// this has to change with it.
const BASE_STARTERS = 7

/**
 * Owners with an empty starting slot and a kickoff coming.
 *
 * Owned events, like the draft ones above: addressed to one person, delivered
 * to that person's devices, follow list not consulted. Never throws.
 */
export async function lineupGapEventsFrom(db) {
  if (!db) return []
  try {
    // The next regular-season game that has not kicked off. Preseason is
    // excluded for the reason everything else now excludes it: its weeks are
    // numbered 1, 2 and 3 as well, and the resolver cannot tell them apart
    // without this predicate.
    const { data: upcoming } = await db
      .from('nfl_week_games')
      .select('season,week,kickoff')
      .eq('season_type', 2)
      .eq('status', 'scheduled')
      .gt('kickoff', new Date().toISOString())
      .order('kickoff')
      .limit(1)
    const next = (upcoming || [])[0]
    if (!next) return []

    const kickoff = Date.parse(next.kickoff)
    const until = kickoff - Date.now()
    if (!(until > 0 && until <= LINEUP_WARN_MS)) return []

    const season = Number(next.season)
    const week = Number(next.week)
    if (!Number.isFinite(season) || !Number.isFinite(week)) return []
    const day = easternDate(kickoff)

    // Only leagues with a matchup this week. A league whose schedule has not
    // been generated has no lineup to be late with.
    const { data: matchups } = await db
      .from('fantasy_matchups')
      .select('league_id,home_team_id,away_team_id')
      .eq('season', season).eq('week', week)
    if (!matchups?.length) return []

    const leagueIds = [...new Set(matchups.map((m) => m.league_id))]
    const teamIds = [...new Set(
      matchups.flatMap((m) => [m.home_team_id, m.away_team_id]).filter(Boolean))]
    if (!teamIds.length) return []

    const [{ data: leagues }, { data: teams }, { data: slots }] = await Promise.all([
      db.from('fantasy_leagues').select('id,name,has_kicker,has_defense').in('id', leagueIds),
      db.from('fantasy_teams').select('id,league_id,owner_id,name').in('id', teamIds),
      db.from('fantasy_lineup_slots').select('team_id,slot,player_id')
        .eq('season', season).eq('week', week).in('team_id', teamIds),
    ])
    const leagueById = new Map((leagues || []).map((l) => [l.id, l]))

    // Bench and IR rows are not starts. Everything else in the slot check
    // constraint is: QB, RB, WR, TE, FLEX, K, DEF.
    const filled = new Map()
    for (const s of (slots || [])) {
      if (!s.player_id || s.slot === 'BENCH' || s.slot === 'IR') continue
      filled.set(s.team_id, (filled.get(s.team_id) || 0) + 1)
    }

    const mins = Math.max(1, Math.round(until / 60000))
    const when = mins < 90 ? `${mins} minutes` : `${Math.round(mins / 60)} hours`

    const out = []
    for (const t of (teams || [])) {
      if (!t.owner_id) continue
      const league = leagueById.get(t.league_id)
      if (!league) continue
      const need = BASE_STARTERS + (league.has_kicker ? 1 : 0) + (league.has_defense ? 1 : 0)
      const have = filled.get(t.id) || 0
      if (have >= need) continue
      const gap = need - have
      out.push(frEvent({
        // Once per team per kickoff day. Not per tick, and not per empty
        // slot: four holes in a lineup is one problem, not four messages.
        key: `fr:${t.league_id}:${t.id}:${season}:${week}:lineup:${day}`,
        category: 'frlineup', priority: 0, owner: t.owner_id,
        title: `\u{1F6A8} ${gap} empty spot${gap === 1 ? '' : 's'} in your lineup`,
        body: `Kickoff in ${when} \u{00B7} ${have} of ${need} starters set${
          txt(league.name) ? ` \u{00B7} ${txt(league.name)}` : ''}`,
        short: `${txt(t.name) || 'your team'} (${gap})`,
        group: 'have empty lineup spots',
        url: `${URL_FOR(t.league_id)}/team`,
      }))
    }
    return out
  } catch {
    return []
  }
}

// ── YOU ARE STARTING A MAN WHO IS NOT PLAYING ──────────────────────────────
//
// lineupGapEventsFrom above catches an EMPTY starting slot. A player on bye
// fills his slot, so that producer sees a complete lineup and says nothing --
// while you start somebody who cannot score. From week 5 that is the commoner
// mistake of the two, and it is the quieter one.
//
// SAME WINDOW, SEPARATE MESSAGE, SEPARATE SWITCH. Three hours before the next
// kickoff, once per team per WEEK -- a bye is a whole-week fact, not a
// per-day one, so unlike frlineup this key carries no date. One message, and
// it names the men.
//
// ITS OWN PRODUCER, like the lineup gap. It reads a different set of rows
// (the whole week's game list, and the team on every rostered player) and
// must not be able to take the empty-slot alert down with it.
export async function byeStarterEventsFrom(db) {
  if (!db) return []
  try {
    const { data: upcoming } = await db
      .from('nfl_week_games')
      .select('season,week,kickoff')
      .eq('season_type', 2)
      .eq('status', 'scheduled')
      .gt('kickoff', new Date().toISOString())
      .order('kickoff')
      .limit(1)
    const next = (upcoming || [])[0]
    if (!next) return []

    const kickoff = Date.parse(next.kickoff)
    const until = kickoff - Date.now()
    if (!(until > 0 && until <= LINEUP_WARN_MS)) return []

    const season = Number(next.season)
    const week = Number(next.week)
    if (!Number.isFinite(season) || !Number.isFinite(week)) return []

    // The WHOLE week, not just the next game: who is on bye is the thirty-two
    // minus whoever has a row, and one row cannot answer that.
    const { data: weekGames } = await db
      .from('nfl_week_games')
      .select('home_team,away_team,season_type')
      .eq('season', season).eq('week', week)
    // Null when the slate is too thin to be sure. Same guard as the site's --
    // "everybody is on bye" is the failure mode, and it would arrive as a
    // push notification.
    const byeTeams = byeTeamsFor(weekGames)
    if (!byeTeams || !byeTeams.size) return []

    const { data: matchups } = await db
      .from('fantasy_matchups')
      .select('league_id,home_team_id,away_team_id')
      .eq('season', season).eq('week', week)
    if (!matchups?.length) return []

    const teamIds = [...new Set(
      matchups.flatMap((m) => [m.home_team_id, m.away_team_id]).filter(Boolean))]
    if (!teamIds.length) return []

    const [{ data: teams }, { data: slots }] = await Promise.all([
      db.from('fantasy_teams').select('id,league_id,owner_id,name').in('id', teamIds),
      db.from('fantasy_lineup_slots')
        .select('team_id,slot,player_id,player:nfl_players(name,team)')
        .eq('season', season).eq('week', week).in('team_id', teamIds),
    ])

    // Starters only. A man on bye sitting on your bench is not a problem.
    const byTeam = new Map()
    for (const s of (slots || [])) {
      if (!s.player_id || s.slot === 'BENCH' || s.slot === 'IR') continue
      const team = txt(s.player?.team).toUpperCase()
      if (!team || !byeTeams.has(team)) continue
      const list = byTeam.get(s.team_id) || []
      list.push({ name: txt(s.player?.name), slot: s.slot, team })
      byTeam.set(s.team_id, list)
    }
    if (!byTeam.size) return []

    const mins = Math.max(1, Math.round(until / 60000))
    const when = mins < 90 ? `${mins} minutes` : `${Math.round(mins / 60)} hours`

    const out = []
    for (const t of (teams || [])) {
      if (!t.owner_id) continue
      const men = byTeam.get(t.id)
      if (!men?.length) continue
      const who = men.map((m) => `${lastName(m.name) || m.slot} (${m.team})`)
      out.push(frEvent({
        // Once per team per week. A bye does not change from Thursday to
        // Sunday, so unlike the empty-slot alert this carries no date.
        key: `fr:${t.league_id}:${t.id}:${season}:${week}:bye`,
        category: 'frbye', priority: 0, owner: t.owner_id,
        title: `\u{1F634} ${men.length === 1 ? who[0] : `${men.length} starters`} on bye`,
        body: `${men.length === 1 ? 'He is' : `${who.slice(0, 3).join(', ')} are`} not playing week ${week} \u{00B7} kickoff in ${when}`,
        short: `${txt(t.name) || 'your team'} (${men.length})`,
        group: 'are starting players on bye',
        url: `${URL_FOR(t.league_id)}/team`,
      }))
    }
    return out
  } catch {
    return []
  }
}
