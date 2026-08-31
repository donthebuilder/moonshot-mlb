import { timingSafeEqual } from 'node:crypto'

import { createClient } from '@supabase/supabase-js'

import { loadFranchiseNflFeed } from '../../../../lib/fantasy/nflFeed'
import { createSupabaseServerClient } from '../../../../lib/supabase/server'
import {syncCatalogChunked,syncWeekFeedChunked} from '../../../../lib/fantasy/sync'

export const dynamic='force-dynamic'
export const runtime='nodejs'

function hasCronAuthorization(request) {
  // Vercel automatically sends CRON_SECRET as a Bearer token. Keep the
  // Franchise-specific alias for manual/external runners, but production
  // Vercel Cron must have CRON_SECRET configured as well.
  const supplied=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||''
  if(!supplied)return false
  return [process.env.CRON_SECRET,process.env.FRANCHISE_CRON_SECRET].filter(Boolean).some((expected)=>{
    const a=Buffer.from(expected);const b=Buffer.from(supplied)
    return a.length===b.length&&timingSafeEqual(a,b)
  })
}

async function authorization(request) {
  if(hasCronAuthorization(request))return {ok:true,mode:'service'}
  const leagueId=new URL(request.url).searchParams.get('leagueId')
  if(!leagueId)return {ok:false}
  const sessionClient=await createSupabaseServerClient()
  const {data:{user}}=await sessionClient?.auth.getUser()||{data:{user:null}}
  if(!user)return {ok:false}
  const {data:membership}=await sessionClient.from('fantasy_league_memberships').select('league_id').eq('league_id',leagueId).eq('user_id',user.id).maybeSingle()
  return {ok:Boolean(membership),mode:'member'}
}

async function synchronize(request) {
  const access=await authorization(request)
  if(!access.ok)return Response.json({error:'Unauthorized'},{status:401})
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY
  if(!url||!serviceKey)return Response.json({error:'Scoring service is not configured'},{status:503})
  const supabase=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})
  let runId=null
  try {
    if(access.mode==='member'){
      // Throttle on the LATEST run whatever its status: keying on
      // status='complete' meant every open tab could start another sync while
      // one was still in flight.
      const {data:latest}=await supabase.from('fantasy_scoring_sync_runs').select('started_at,completed_at,status').order('started_at',{ascending:false}).limit(1).maybeSingle()
      const startedAgo=latest?.started_at?Date.now()-new Date(latest.started_at).getTime():Infinity
      if(latest&&latest.status!=='failed'&&startedAgo<25000)return Response.json({ok:true,cached:true,status:latest.status,completedAt:latest.completed_at||null})
    }
    const feed=await loadFranchiseNflFeed()
    const weeks=[...new Set(feed.games.map((game)=>game.week))].sort((a,b)=>a-b)
    const {data:run,error:runError}=await supabase.from('fantasy_scoring_sync_runs').insert({source:feed.source,season:feed.season,weeks}).select('id').single()
    if(runError)throw runError
    runId=run.id
    // Chunked, so one big slate cannot fail the whole sync on a payload cap
    // and freeze every score silently. See lib/fantasy/sync.js.
    await syncCatalogChunked(supabase,feed.catalog)
    const sync=await syncWeekFeedChunked(supabase,feed.games,feed.players)
    let matchups=0
    for(const week of weeks){const {data,error}=await supabase.rpc('refresh_all_fantasy_matchup_scores',{p_season:feed.season,p_week:week});if(error)throw error;matchups+=Number(data||0)}
    await supabase.from('fantasy_scoring_sync_runs').update({status:'complete',games_synced:Number(sync?.games||0),players_synced:Number(sync?.players||0),matchups_refreshed:matchups,completed_at:new Date().toISOString()}).eq('id',runId)
    return Response.json({ok:true,season:feed.season,weeks,games:Number(sync?.games||0),players:Number(sync?.players||0),matchups,builtAt:feed.builtAt})
  } catch(error) {
    console.error('[franchise/scoring] sync failed', error)
    if(runId)await supabase.from('fantasy_scoring_sync_runs').update({status:'failed',error_message:String(error?.message||error).slice(0,500),completed_at:new Date().toISOString()}).eq('id',runId)
    return Response.json({error:'Scoring synchronization failed'},{status:500})
  }
}

export const GET=synchronize
export const POST=synchronize
