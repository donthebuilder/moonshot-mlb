'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '../../../../../lib/supabase/server'

export async function saveLineupSlot(formData) {
  const leagueId = String(formData.get('leagueId') || '')
  const season = Number(formData.get('season'))
  const week = Number(formData.get('week'))
  const slot = String(formData.get('slot') || '')
  const slotIndex = Number(formData.get('slotIndex'))
  const playerId = String(formData.get('playerId') || '') || null
  const supabase = await createSupabaseServerClient()
  if (!supabase) redirect('/fantasy')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/fantasy')
  const { error } = await supabase.rpc('set_fantasy_lineup_slot', {
    p_league_id: leagueId, p_season: season, p_week: week,
    p_slot: slot, p_slot_index: slotIndex, p_player_id: playerId,
  })
  const route = `/fantasy/league/${leagueId}/team`
  if (error) redirect(`${route}?week=${week}&error=${encodeURIComponent(error.message)}`)
  revalidatePath(`/fantasy/league/${leagueId}`, 'layout')
  redirect(`${route}?week=${week}&message=${encodeURIComponent(`${slot}${slotIndex > 1 ? ` ${slotIndex}` : ''} saved`)}`)
}
