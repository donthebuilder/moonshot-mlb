'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '../../../../../lib/supabase/server'

const routeFor = (leagueId, type, message) =>
  `/fantasy/league/${leagueId}/wire?${type}=${encodeURIComponent(message)}`

async function clientAndUser() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/fantasy')
  return supabase
}

function optionalId(formData, key) {
  return String(formData.get(key) || '') || null
}

export async function addFreeAgent(formData) {
  const leagueId = String(formData.get('leagueId') || '')
  const playerId = String(formData.get('playerId') || '')
  const supabase = await clientAndUser()
  const { error } = await supabase.rpc('add_fantasy_free_agent', {
    p_league_id: leagueId, p_player_id: playerId,
    p_drop_player_id: optionalId(formData,'dropPlayerId'),
  })
  if (error) redirect(routeFor(leagueId,'error',error.message))
  revalidatePath(`/fantasy/league/${leagueId}/wire`)
  revalidatePath(`/fantasy/league/${leagueId}/team`)
  redirect(routeFor(leagueId,'message','Free agent added to your roster'))
}

export async function submitWaiverClaim(formData) {
  const leagueId = String(formData.get('leagueId') || '')
  const playerId = String(formData.get('playerId') || '')
  const supabase = await clientAndUser()
  const { error } = await supabase.rpc('submit_fantasy_waiver_claim', {
    p_league_id: leagueId, p_player_id: playerId,
    p_drop_player_id: optionalId(formData,'dropPlayerId'),
  })
  if (error) redirect(routeFor(leagueId,'error',error.message))
  revalidatePath(`/fantasy/league/${leagueId}/wire`)
  redirect(routeFor(leagueId,'message','Waiver claim submitted'))
}

export async function cancelWaiverClaim(formData) {
  const leagueId = String(formData.get('leagueId') || '')
  const claimId = String(formData.get('claimId') || '')
  const supabase = await clientAndUser()
  const { error } = await supabase.rpc('cancel_fantasy_waiver_claim', { p_claim_id: claimId })
  if (error) redirect(routeFor(leagueId,'error',error.message))
  revalidatePath(`/fantasy/league/${leagueId}/wire`)
  redirect(routeFor(leagueId,'message','Waiver claim cancelled'))
}

export async function processWaivers(formData) {
  const leagueId = String(formData.get('leagueId') || '')
  const supabase = await clientAndUser()
  const { data, error } = await supabase.rpc('process_fantasy_waivers', { p_league_id: leagueId })
  if (error) redirect(routeFor(leagueId,'error',error.message))
  revalidatePath(`/fantasy/league/${leagueId}/wire`)
  revalidatePath(`/fantasy/league/${leagueId}/team`)
  redirect(routeFor(leagueId,'message',`${data} waiver claims awarded`))
}
