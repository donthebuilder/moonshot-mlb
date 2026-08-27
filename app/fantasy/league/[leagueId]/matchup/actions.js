'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '../../../../../lib/supabase/server'

const routeFor = (leagueId, type, message) =>
  `/fantasy/league/${leagueId}/matchup?${type}=${encodeURIComponent(message)}`

export async function generateSchedule(formData) {
  const leagueId = String(formData.get('leagueId') || '')
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/fantasy')
  const { data, error } = await supabase.rpc('generate_fantasy_schedule', {
    p_league_id: leagueId, p_season: 2026, p_weeks: 14,
  })
  if (error) redirect(routeFor(leagueId, 'error', error.message))
  revalidatePath(`/fantasy/league/${leagueId}/matchup`)
  revalidatePath(`/fantasy/league/${leagueId}/league`)
  redirect(routeFor(leagueId, 'message', `${data} matchups scheduled`))
}
