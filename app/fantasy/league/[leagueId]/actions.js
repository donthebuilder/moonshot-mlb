'use server'

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { normalizeNflCatalog } from '../../../../lib/nfl/playerCatalog'
import { fantasyDefenseCatalog } from '../../../../lib/nfl/teams'
import { createSupabaseServerClient } from '../../../../lib/supabase/server'

const routeFor = (leagueId, type, message) =>
  `/fantasy/league/${leagueId}?${type}=${encodeURIComponent(message)}`

async function clientAndUser() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/fantasy?error=Sign%20in%20first')
  return { supabase, user }
}

export async function syncPlayerCatalog(formData) {
  const leagueId = String(formData.get('leagueId') || '')
  const { supabase } = await clientAndUser()
  const raw = JSON.parse(await readFile(path.join(process.cwd(), 'public/data/nfl/week.json'), 'utf8'))
  const normalized = normalizeNflCatalog(raw)
  const season = Number(raw.season || raw.stat_season)
  const catalog = [...normalized, ...fantasyDefenseCatalog(season)]
  const { data, error } = await supabase.rpc('sync_nfl_player_catalog', { p_catalog: catalog })
  if (error) redirect(routeFor(leagueId, 'error', error.message))
  revalidatePath(`/fantasy/league/${leagueId}`)
  redirect(routeFor(leagueId, 'message', `${data} NFL players synced`))
}

export async function prepareDraft(formData) {
  const leagueId = String(formData.get('leagueId') || '')
  const { supabase } = await clientAndUser()
  const { data: league, error: leagueError } = await supabase
    .from('fantasy_leagues').select('draft_order_method').eq('id', leagueId).single()
  const { data: teams, error: teamError } = await supabase
    .from('fantasy_teams').select('id').eq('league_id', leagueId).order('created_at')
  if (leagueError || teamError || !teams?.length) redirect(routeFor(leagueId, 'error', leagueError?.message || teamError?.message || 'No teams found'))

  let order = teams.map((team) => team.id)
  if (league.draft_order_method === 'random') {
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
  } else {
    order = teams.map((team) => ({ id: team.id, position: Number(formData.get(`position_${team.id}`)) || 999 }))
      .sort((a, b) => a.position - b.position).map((team) => team.id)
  }

  const { error } = await supabase.rpc('prepare_fantasy_draft', {
    p_league_id: leagueId, p_order_team_ids: order, p_rounds: 15,
  })
  if (error) redirect(routeFor(leagueId, 'error', error.message))
  revalidatePath(`/fantasy/league/${leagueId}`)
  redirect(routeFor(leagueId, 'message', 'Snake draft board prepared'))
}

export async function startDraft(formData) {
  const leagueId = String(formData.get('leagueId') || '')
  const { supabase } = await clientAndUser()
  const { error } = await supabase.rpc('start_fantasy_draft', { p_league_id: leagueId })
  if (error) redirect(routeFor(leagueId, 'error', error.message))
  revalidatePath(`/fantasy/league/${leagueId}`)
  redirect(routeFor(leagueId, 'message', 'The draft is live'))
}

export async function draftPlayer(formData) {
  const leagueId = String(formData.get('leagueId') || '')
  const playerId = String(formData.get('playerId') || '')
  const { supabase } = await clientAndUser()
  const { error } = await supabase.rpc('make_fantasy_draft_pick', {
    p_league_id: leagueId, p_player_id: playerId,
  })
  if (error) redirect(routeFor(leagueId, 'error', error.message))
  revalidatePath(`/fantasy/league/${leagueId}`)
  redirect(routeFor(leagueId, 'message', 'Pick locked in'))
}

export async function setDraftState(formData) {
  const leagueId = String(formData.get('leagueId') || '')
  const state = String(formData.get('state') || '')
  const { supabase } = await clientAndUser()
  const { error } = await supabase.rpc('set_fantasy_draft_state', {
    p_league_id: leagueId, p_state: state,
  })
  if (error) redirect(routeFor(leagueId, 'error', error.message))
  revalidatePath(`/fantasy/league/${leagueId}`)
  redirect(routeFor(leagueId, 'message', state === 'paused' ? 'Draft paused' : 'Draft resumed'))
}

export async function addToQueue(formData) {
  const leagueId = String(formData.get('leagueId') || '')
  const playerId = String(formData.get('playerId') || '')
  const { supabase } = await clientAndUser()
  const { error } = await supabase.rpc('add_fantasy_draft_queue', { p_league_id: leagueId, p_player_id: playerId })
  if (error) redirect(routeFor(leagueId, 'error', error.message))
  revalidatePath(`/fantasy/league/${leagueId}`)
  redirect(routeFor(leagueId, 'message', 'Player added to your queue'))
}

export async function removeFromQueue(formData) {
  const leagueId = String(formData.get('leagueId') || '')
  const playerId = String(formData.get('playerId') || '')
  const { supabase } = await clientAndUser()
  const { error } = await supabase.rpc('remove_fantasy_draft_queue', { p_league_id: leagueId, p_player_id: playerId })
  if (error) redirect(routeFor(leagueId, 'error', error.message))
  revalidatePath(`/fantasy/league/${leagueId}`)
  redirect(routeFor(leagueId, 'message', 'Player removed from queue'))
}

export async function runAutoPick(formData) {
  const leagueId = String(formData.get('leagueId') || '')
  const { supabase } = await clientAndUser()
  const { error } = await supabase.rpc('run_expired_fantasy_auto_pick', { p_league_id: leagueId })
  if (error) redirect(routeFor(leagueId, 'error', error.message))
  revalidatePath(`/fantasy/league/${leagueId}`)
  redirect(routeFor(leagueId, 'message', 'Expired pick completed automatically'))
}

export async function assignDraftPick(formData) {
  const leagueId = String(formData.get('leagueId') || '')
  const overallPick = Number(formData.get('overallPick'))
  const playerId = String(formData.get('playerId') || '')
  const { supabase } = await clientAndUser()
  const { error } = await supabase.rpc('commissioner_assign_fantasy_pick', {
    p_league_id: leagueId, p_overall_pick: overallPick, p_player_id: playerId,
  })
  if (error) redirect(routeFor(leagueId, 'error', error.message))
  revalidatePath(`/fantasy/league/${leagueId}`)
  redirect(routeFor(leagueId, 'message', `Pick ${overallPick} assigned`))
}
