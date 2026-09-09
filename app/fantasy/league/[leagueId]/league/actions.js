'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '../../../../../lib/supabase/server'

export async function generateWeeklyContent(formData) {
  const leagueId=String(formData.get('leagueId')||'')
  const week=Number(formData.get('week')||1)
  const supabase=await createSupabaseServerClient()
  if(!supabase)redirect('/fantasy')
  const {data:{user}}=await supabase.auth.getUser()
  if(!user)redirect('/fantasy')
  const {data,error}=await supabase.rpc('generate_fantasy_weekly_content',{p_league_id:leagueId,p_season:2026,p_week:week})
  const route=`/fantasy/league/${leagueId}/league?view=recap&week=${week}`
  if(error)redirect(`${route}&error=${encodeURIComponent(error.message)}`)
  revalidatePath(`/fantasy/league/${leagueId}`, 'layout')
  redirect(`${route}&message=${encodeURIComponent(`${data?.rankings||0} rankings and ${data?.awards||0} awards generated`)}`)
}
