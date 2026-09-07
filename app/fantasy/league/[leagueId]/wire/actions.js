'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '../../../../../lib/supabase/server'

const routeFor = (leagueId, type, message) =>
  `/fantasy/league/${leagueId}/wire?${type}=${encodeURIComponent(message)}`

async function clientAndUser() {
  const supabase = await createSupabaseServerClient()
  if (!supabase) redirect('/fantasy')
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
  revalidatePath(`/fantasy/league/${leagueId}`, 'layout')
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
  revalidatePath(`/fantasy/league/${leagueId}`, 'layout')
  redirect(routeFor(leagueId,'message','Waiver claim submitted'))
}

export async function cancelWaiverClaim(formData) {
  const leagueId = String(formData.get('leagueId') || '')
  const claimId = String(formData.get('claimId') || '')
  const supabase = await clientAndUser()
  const { error } = await supabase.rpc('cancel_fantasy_waiver_claim', { p_claim_id: claimId })
  if (error) redirect(routeFor(leagueId,'error',error.message))
  revalidatePath(`/fantasy/league/${leagueId}`, 'layout')
  redirect(routeFor(leagueId,'message','Waiver claim cancelled'))
}

export async function processWaivers(formData) {
  const leagueId = String(formData.get('leagueId') || '')
  const supabase = await clientAndUser()
  const { data, error } = await supabase.rpc('process_fantasy_waivers', { p_league_id: leagueId })
  if (error) redirect(routeFor(leagueId,'error',error.message))
  revalidatePath(`/fantasy/league/${leagueId}`, 'layout')
  redirect(routeFor(leagueId,'message',`${data} waiver claims awarded`))
}

// ── DROPPING A PLAYER, ON ITS OWN (2026-09-07) ──────────────────────────────
//
// Donovan: "removing players should be easier." It was not hard, it was
// impossible: p_drop_player_id exists only as a parameter of the two functions
// above, so releasing a man required signing another in the same motion. A
// full roster, a player you no longer want, and nobody worth adding had no
// way out at all.
//
// drop_fantasy_player (migration 202609071000) is the drop half of
// add_fantasy_free_agent with the add removed -- same lock rule, same
// 24-hour waiver window, same transaction row.
//
// UNTIL THAT MIGRATION IS RUN this action fails loudly with Postgres's own
// "could not find the function" message rather than appearing to work. That
// is deliberate: the last thing shipped here that needed a hand-run migration
// failed SILENTLY for a full day (homer_feed_posts_kind_check) because nobody
// checked an error. A visible error on the first click is the cheap version of
// that lesson.
export async function dropPlayer(formData) {
  const leagueId = String(formData.get('leagueId') || '')
  const playerId = String(formData.get('playerId') || '')
  const supabase = await clientAndUser()
  const { error } = await supabase.rpc('drop_fantasy_player', {
    p_league_id: leagueId, p_player_id: playerId,
  })
  if (error) redirect(routeFor(leagueId,'error',error.message))
  revalidatePath(`/fantasy/league/${leagueId}`, 'layout')
  redirect(routeFor(leagueId,'message','Player dropped — he is on waivers for 24 hours'))
}
