'use server'

// SET BEST LINEUP + COMMISSIONER ADD/DROP (2026-09-24).
//
// Donovan: "no button yet: the commissioner add/drop has no button on the
// site ... add these." And 3zzz starting Lawrence over Hurts.
//
// Both actions check who is asking HERE -- the team's owner, or this league's
// commissioner (fantasy_leagues.commissioner_id, the column every RPC trusts)
// -- and then:
//   · setBestLineup writes through the service role, because
//     set_fantasy_lineup_slot resolves "your team" from auth.uid() and so
//     cannot touch another manager's lineup. The plan itself is pure
//     (lib/fantasy/optimizeLineup.js); locked rows are never written.
//   · commissionerAddDrop calls commissioner_roster_move (migration
//     202609232000), which re-checks the commissioner itself.
// A commissioner acting on someone else's team is posted to the league feed.
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

import { createSupabaseServerClient } from '../../../../../lib/supabase/server'
import { planBestLineup } from '../../../../../lib/fantasy/optimizeLineup'
import { loadMatchupData, weeklyProjector } from '../../../../../lib/fantasy/matchupProjection'
import { teamScheduleFor } from '../../../../../lib/fantasy/schedule'
import { FANTASY_SEASON } from '../../../../../lib/fantasy/week'

const back = (path, type, message) => redirect(`${path}${path.includes('?') ? '&' : '?'}${type}=${encodeURIComponent(message)}`)

async function whoMayAct(leagueId, teamId) {
  const supabase = await createSupabaseServerClient()
  if (!supabase) redirect('/fantasy')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/fantasy')
  const [{ data: league }, { data: team }] = await Promise.all([
    supabase.from('fantasy_leagues').select('*').eq('id', leagueId).maybeSingle(),
    supabase.from('fantasy_teams').select('id,name,owner_id,league_id').eq('id', teamId).eq('league_id', leagueId).maybeSingle(),
  ])
  return { supabase, user, league, team, isOwner: team?.owner_id === user.id, isCommish: league?.commissioner_id === user.id }
}

export async function setBestLineup(formData) {
  const leagueId = String(formData.get('leagueId') || '')
  const teamId = String(formData.get('teamId') || '')
  const week = Number(formData.get('week'))
  const returnTo = String(formData.get('returnTo') || `/fantasy/league/${leagueId}/team`)
  const { user, league, team, isOwner, isCommish } = await whoMayAct(leagueId, teamId)
  if (!league || !team) back(returnTo, 'error', 'Team not found in this league')
  if (!isOwner && !isCommish) back(returnTo, 'error', 'Only the owner or the commissioner can set this lineup')
  if (!Number.isFinite(week) || week < 1) back(returnTo, 'error', 'No week to set')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) back(returnTo, 'error', 'The lineup service is not configured')
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const [{ data: rosterRows, error: e1 }, { data: rows, error: e2 }, { data: games, error: e3 }, { data: slate }] = await Promise.all([
    db.from('fantasy_roster_entries').select('player:nfl_players(id,name,position,team,injury_status,source_payload,source_player_id)').eq('team_id', team.id).is('released_at', null),
    db.from('fantasy_lineup_slots').select('id,slot,slot_index,player_id,locked_at').eq('team_id', team.id).eq('season', FANTASY_SEASON).eq('week', week),
    db.from('nfl_week_games').select('home_team,away_team,season_type,kickoff,status').eq('season', FANTASY_SEASON).eq('week', week),
    db.from('nfl_player_week_stats').select('player_id').eq('season', FANTASY_SEASON).eq('week', week),
  ])
  const failed = e1 || e2 || e3
  if (failed) { console.error('[franchise/best-lineup] read failed', failed.message); back(returnTo, 'error', 'Could not read the lineup — nothing changed') }

  const roster = (rosterRows || []).map((r) => r.player).filter(Boolean)
  const schedule = teamScheduleFor(games || [])
  const club = (p) => String(p?.team || '').toUpperCase()
  const now = Date.now()
  const started = (p) => { const g = p && schedule.get(club(p)); return Boolean(g?.kickoff) && new Date(g.kickoff).getTime() <= now }
  const onBye = (p) => (games || []).length > 0 && !schedule.get(club(p))
  const projector = weeklyProjector(league.scoring, schedule, await loadMatchupData())
  const plan = planBestLineup({
    league, roster, rows: rows || [], started, onBye,
    project: (p) => projector(p)?.points ?? 0,
    slateIds: new Set((slate || []).map((r) => r.player_id)), slateKey: (p) => p.id,
  })
  if (!plan.changed) back(returnTo, 'message', 'Already the best lineup — nothing to change')

  // Replace every row the plan is allowed to touch, then write the plan.
  const pinned = new Set(plan.rows.map((r) => r.player_id))
  const removable = (rows || []).filter((r) => !r.locked_at && r.slot !== 'IR' && !started(roster.find((p) => p.id === r.player_id)))
  if (removable.length) {
    const { error } = await db.from('fantasy_lineup_slots').delete().in('id', removable.map((r) => r.id)).is('locked_at', null)
    if (error) back(returnTo, 'error', `Could not clear the lineup: ${error.message}`)
  }
  const inserts = plan.rows.map((r) => ({ league_id: leagueId, team_id: team.id, season: FANTASY_SEASON, week, ...r }))
  if (inserts.length) {
    const { error } = await db.from('fantasy_lineup_slots').insert(inserts)
    if (error) {
      console.error('[franchise/best-lineup] insert failed after clear', error.message, [...pinned])
      back(returnTo, 'error', `Lineup partly cleared and not rewritten (${error.message}) — tap Set best lineup again`)
    }
  }
  if (!isOwner) {
    const { data: mine } = await db.from('fantasy_teams').select('id').eq('league_id', leagueId).eq('owner_id', user.id).maybeSingle()
    await db.from('fantasy_feed_posts').insert({
      league_id: leagueId, author_id: user.id, team_id: mine?.id || team.id,
      body: `Commissioner set the best projected lineup for ${team.name} (Week ${week}).`.slice(0, 500),
    })
  }
  revalidatePath(`/fantasy/league/${leagueId}`, 'layout')
  const lead = plan.starters.slice(0, 3).map((s) => `${s.slot} ${s.player?.name}`).join(', ')
  back(returnTo, 'message', `Best lineup set — ${plan.changed} change${plan.changed === 1 ? '' : 's'}${lead ? ` (${lead}…)` : ''}`)
}

export async function commissionerAddDrop(formData) {
  const leagueId = String(formData.get('leagueId') || '')
  const teamId = String(formData.get('teamId') || '')
  const addId = String(formData.get('addPlayerId') || '') || null
  const dropId = String(formData.get('dropPlayerId') || '') || null
  const returnTo = `/fantasy/league/${leagueId}/team/${teamId}`
  const { supabase, isCommish } = await whoMayAct(leagueId, teamId)
  if (!isCommish) back(returnTo, 'error', 'Commissioner access required')
  if (!addId && !dropId) back(returnTo, 'error', 'Pick a player to add, drop, or both')
  const { error } = await supabase.rpc('commissioner_roster_move', {
    p_league_id: leagueId, p_team_id: teamId, p_add_player_id: addId, p_drop_player_id: dropId,
  })
  if (error) {
    const missing = /could not find the function|PGRST202/i.test(error.message)
    back(returnTo, 'error', missing ? 'Run the commissioner SQL in Supabase first (commissioner_roster_move is not installed)' : error.message)
  }
  revalidatePath(`/fantasy/league/${leagueId}`, 'layout')
  back(returnTo, 'message', 'Commissioner move made — posted to the league feed')
}
