'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

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

  // THIS BUTTON WAS SILENTLY BROKEN (2026-09-12, found while closing
  // OPEN-ITEMS #1). sync_nfl_player_catalog and sync_nfl_week_feed write
  // public.nfl_players / public.nfl_week_games -- global tables read by
  // every league -- and migration 202609071000 revoked EXECUTE on both from
  // `authenticated` entirely, because the OLD guard accepted "commissioner
  // of ANY league" with no league_id check. That fix updated this button's
  // sibling in ../actions.js (syncPlayerCatalog) to check commissioner OF
  // THIS LEAGUE and route the write through a service-role client. This
  // file was never updated the same way -- it was still calling the RPC
  // with the signed-in user's own client, so every press since that
  // migration landed has failed outright with a permission-denied error.
  // Same fix, mirrored here.
  const {data:{user}}=await supabase.auth.getUser()
  if(!user)redirect('/fantasy')
  const {data:membership}=await supabase.from('fantasy_league_memberships')
    .select('role').eq('league_id',leagueId).eq('user_id',user.id).maybeSingle()
  if(membership?.role!=='commissioner'){
    redirect(routeFor(leagueId,'error','Only this league\u2019s commissioner can refresh the NFL feed'))
  }
  const serviceUrl=process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY
  if(!serviceUrl||!serviceKey){
    redirect(routeFor(leagueId,'error','The feed service is not configured'))
  }
  const service=createClient(serviceUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})

  const feed=await loadFranchiseNflFeed()
  // Chunked, same as the cron. A commissioner pressing this button and a cron
  // run must not have different limits.
  let data
  try {
    await syncCatalogChunked(service,feed.catalog)
    data=await syncWeekFeedChunked(service,feed.games,feed.players)
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
