import { timingSafeEqual } from 'node:crypto'

import { createClient } from '@supabase/supabase-js'

import { loadFranchiseNflFeed } from '../../../../lib/fantasy/nflFeed'

export const dynamic='force-dynamic'
export const runtime='nodejs'

function authorized(request) {
  const expected=process.env.FRANCHISE_CRON_SECRET||process.env.CRON_SECRET
  const supplied=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||''
  if(!expected||!supplied)return false
  const a=Buffer.from(expected);const b=Buffer.from(supplied)
  return a.length===b.length&&timingSafeEqual(a,b)
}

async function synchronize(request) {
  if(!authorized(request))return Response.json({error:'Unauthorized'},{status:401})
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY
  if(!url||!serviceKey)return Response.json({error:'Scoring service is not configured'},{status:503})
  const supabase=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})
  let runId=null
  try {
    const feed=await loadFranchiseNflFeed()
    const weeks=[...new Set(feed.games.map((game)=>game.week))].sort((a,b)=>a-b)
    const {data:run,error:runError}=await supabase.from('fantasy_scoring_sync_runs').insert({source:feed.source,season:feed.season,weeks}).select('id').single()
    if(runError)throw runError
    runId=run.id
    const {error:catalogError}=await supabase.rpc('sync_nfl_player_catalog',{p_catalog:feed.catalog})
    if(catalogError)throw catalogError
    const {data:sync,error:syncError}=await supabase.rpc('sync_nfl_week_feed',{p_games:feed.games,p_players:feed.players})
    if(syncError)throw syncError
    let matchups=0
    for(const week of weeks){const {data,error}=await supabase.rpc('refresh_all_fantasy_matchup_scores',{p_season:feed.season,p_week:week});if(error)throw error;matchups+=Number(data||0)}
    await supabase.from('fantasy_scoring_sync_runs').update({status:'complete',games_synced:Number(sync?.games||0),players_synced:Number(sync?.players||0),matchups_refreshed:matchups,completed_at:new Date().toISOString()}).eq('id',runId)
    return Response.json({ok:true,season:feed.season,weeks,games:Number(sync?.games||0),players:Number(sync?.players||0),matchups,builtAt:feed.builtAt})
  } catch(error) {
    if(runId)await supabase.from('fantasy_scoring_sync_runs').update({status:'failed',error_message:String(error?.message||error).slice(0,500),completed_at:new Date().toISOString()}).eq('id',runId)
    return Response.json({error:'Scoring synchronization failed'},{status:500})
  }
}

export const GET=synchronize
export const POST=synchronize
