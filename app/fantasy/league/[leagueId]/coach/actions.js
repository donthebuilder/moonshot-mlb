'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { loadFranchiseNflFeed } from '../../../../../lib/fantasy/nflFeed'
import { createSupabaseServerClient } from '../../../../../lib/supabase/server'
import {syncCatalogChunked,syncWeekFeedChunked} from '../../../../../lib/fantasy/sync'

const routeFor=(leagueId,type,message)=>`/fantasy/league/${leagueId}/coach?${type}=${encodeURIComponent(message)}`

async function clientAndUser() {
  const supabase=await createSupabaseServerClient()
  if(!supabase)redirect('/fantasy')
  const {data:{user}}=await supabase.auth.getUser()
  if(!user)redirect('/fantasy')
  return supabase
}

export async function syncNflWeekFeed(formData) {
  const leagueId=String(formData.get('leagueId')||'')
  const supabase=await clientAndUser()
  const feed=await loadFranchiseNflFeed()
  // Chunked, same as the cron. A commissioner pressing this button and a cron
  // run must not have different limits.
  let data
  try {
    await syncCatalogChunked(supabase,feed.catalog)
    data=await syncWeekFeedChunked(supabase,feed.games,feed.players)
  } catch(error) {
    redirect(routeFor(leagueId,'error',String(error?.message||error)))
  }
  revalidatePath(`/fantasy/league/${leagueId}`, 'layout')
  redirect(routeFor(leagueId,'message',`${data?.games||0} games, ${data?.players||0} player updates, and injury statuses refreshed`))
}

export async function refreshMatchupScores(formData) {
  const leagueId=String(formData.get('leagueId')||'')
  const supabase=await clientAndUser()
  const {data,error}=await supabase.rpc('refresh_fantasy_matchup_scores',{
    p_league_id:leagueId,p_season:Number(formData.get('season')||2026),p_week:Number(formData.get('week')||1),
  })
  if(error)redirect(routeFor(leagueId,'error',error.message))
  revalidatePath(`/fantasy/league/${leagueId}`, 'layout')
  redirect(routeFor(leagueId,'message',`${data||0} matchups recalculated`))
}
