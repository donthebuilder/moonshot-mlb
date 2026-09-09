import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

import { createClient } from '@supabase/supabase-js'

if(process.env.FRANCHISE_STRESS_TEST!=='1')throw new Error('Set FRANCHISE_STRESS_TEST=1 to run the isolated draft test')

const envText=await readFile(new URL('../.env.local',import.meta.url),'utf8')
const env=Object.fromEntries(envText.split(/\r?\n/).filter((line)=>line&&!line.startsWith('#')).map((line)=>{const index=line.indexOf('=');return [line.slice(0,index),line.slice(index+1)]}))
const url=env.NEXT_PUBLIC_SUPABASE_URL
const anon=env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey=env.SUPABASE_SERVICE_ROLE_KEY
if(!url||!anon||!serviceKey)throw new Error('Supabase test configuration is incomplete')

const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})
const run=randomUUID().slice(0,8)
const password=`Dash-${randomUUID()}!a9`
const users=[]
let leagueId

const assert=(condition,message)=>{if(!condition)throw new Error(message)}
const rpc=async(client,name,args)=>{const {data,error}=await client.rpc(name,args);if(error)throw error;return data}

try{
  for(let index=0;index<8;index++){
    const email=`franchise-stress-${run}-${index}@example.invalid`
    const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:`Stress Owner ${index+1}`}})
    if(error)throw error
    users.push({id:data.user.id,email})
  }
  await new Promise((resolve)=>setTimeout(resolve,250))
  for(const user of users){
    user.client=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}})
    const {error}=await user.client.auth.signInWithPassword({email:user.email,password})
    if(error)throw error
  }

  leagueId=await rpc(users[0].client,'create_fantasy_league',{p_name:`Draft Stress ${run}`,p_team_name:'Stress Team 1',p_settings:{team_count:8,scoring:'ppr',has_kicker:true,has_defense:true,ir_slots:1,draft_timer_seconds:30,draft_order_method:'manual'}})
  const {data:league,error:leagueError}=await admin.from('fantasy_leagues').select('invite_code').eq('id',leagueId).single()
  if(leagueError)throw leagueError
  const joins=await Promise.all(users.slice(1).map((user,index)=>rpc(user.client,'join_fantasy_league',{p_invite_code:league.invite_code,p_team_name:`Stress Team ${index+2}`})))
  assert(joins.every((id)=>id===leagueId),'Concurrent joins returned the wrong league')
  const forbiddenDelete=await users[1].client.rpc('delete_fantasy_league',{p_league_id:leagueId,p_confirmation:`Draft Stress ${run}`})
  assert(forbiddenDelete.error?.message.includes('Commissioner'),'A member was allowed to delete the league')
  const unconfirmedDelete=await users[0].client.rpc('delete_fantasy_league',{p_league_id:leagueId,p_confirmation:'wrong league'})
  assert(unconfirmedDelete.error?.message.includes('exactly'),'Deletion did not require the exact league name')

  const {data:teams,error:teamError}=await admin.from('fantasy_teams').select('id,owner_id').eq('league_id',leagueId).order('created_at')
  if(teamError)throw teamError
  assert(teams.length===8,'Eight simultaneous owners did not retain eight teams')
  const order=teams.map((team)=>team.id)
  await rpc(users[0].client,'prepare_fantasy_draft',{p_league_id:leagueId,p_order_team_ids:order,p_rounds:2})
  await rpc(users[0].client,'start_fantasy_draft',{p_league_id:leagueId})
  const restart=await users[0].client.rpc('start_fantasy_draft',{p_league_id:leagueId})
  assert(restart.error?.message.includes('already started'),'A live draft was incorrectly allowed to restart')

  const {data:players,error:playerError}=await admin.from('nfl_players').select('id').eq('active',true).order('name').limit(20)
  if(playerError)throw playerError
  assert(players.length>=12,'The stress test needs at least twelve active players')
  const ownerClient=(teamId)=>users.find((user)=>user.id===teams.find((team)=>team.id===teamId)?.owner_id)?.client

  const firstOwner=ownerClient(order[0])
  const wrongOwner=users.find((user)=>user.id!==teams[0].owner_id&&user.id!==users[0].id).client
  const opening=await Promise.all([
    firstOwner.rpc('make_fantasy_draft_pick',{p_league_id:leagueId,p_player_id:players[0].id}),
    wrongOwner.rpc('make_fantasy_draft_pick',{p_league_id:leagueId,p_player_id:players[1].id}),
  ])
  assert(opening.filter((result)=>!result.error).length===1,'Turn ownership did not reject an out-of-turn pick')

  const secondOwner=ownerClient(order[1])
  const burst=await Promise.all(players.slice(2,10).map((player)=>secondOwner.rpc('make_fantasy_draft_pick',{p_league_id:leagueId,p_player_id:player.id})))
  assert(burst.filter((result)=>!result.error).length===1,'Concurrent pick requests assigned more than one player')

  const {data:afterBurst,error:afterBurstError}=await admin.from('fantasy_drafts').select('current_overall_pick').eq('league_id',leagueId).single()
  if(afterBurstError)throw afterBurstError
  assert(afterBurst.current_overall_pick===3,'Draft pointer did not advance exactly once during the request burst')
  const thirdOwner=ownerClient(order[2])
  const duplicate=await Promise.all([
    thirdOwner.rpc('make_fantasy_draft_pick',{p_league_id:leagueId,p_player_id:players[10].id}),
    users[0].client.rpc('make_fantasy_draft_pick',{p_league_id:leagueId,p_player_id:players[10].id}),
  ])
  assert(duplicate.filter((result)=>!result.error).length===1,'The same player was drafted twice during a race')

  const [{data:picks,error:picksError},{data:roster,error:rosterError},{data:draft,error:draftError}]=await Promise.all([
    admin.from('fantasy_draft_picks').select('overall_pick,team_id,player_id').eq('league_id',leagueId).not('player_id','is',null).order('overall_pick'),
    admin.from('fantasy_roster_entries').select('player_id,team_id').eq('league_id',leagueId).is('released_at',null),
    admin.from('fantasy_drafts').select('current_overall_pick,status').eq('league_id',leagueId).single(),
  ])
  if(picksError||rosterError||draftError)throw picksError||rosterError||draftError
  assert(picks.length===3&&roster.length===3,'Draft picks and roster entries diverged')
  assert(new Set(picks.map((pick)=>pick.player_id)).size===3,'Duplicate players reached the draft board')
  assert(draft.current_overall_pick===4&&draft.status==='live','Draft state did not settle on pick four')
  console.log(JSON.stringify({ok:true,owners:users.length,teams:teams.length,simultaneousJoiners:7,raceRequests:12,acceptedPicks:picks.length,currentPick:draft.current_overall_pick}))
}finally{
  if(leagueId){const {error}=await admin.from('fantasy_leagues').delete().eq('id',leagueId);if(error)console.error(`Test league cleanup failed: ${error.message}`)}
  const cleanup=await Promise.all(users.map((user)=>admin.auth.admin.deleteUser(user.id)))
  const failed=cleanup.filter((result)=>result.error)
  if(failed.length)console.error(`${failed.length} temporary test users could not be cleaned up`)
}
