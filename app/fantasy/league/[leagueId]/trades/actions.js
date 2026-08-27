'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '../../../../../lib/supabase/server'

const routeFor=(leagueId,type,message)=>`/fantasy/league/${leagueId}/trades?${type}=${encodeURIComponent(message)}`

async function runTradeRpc(formData,name,args,success) {
  const leagueId=String(formData.get('leagueId')||'')
  const supabase=await createSupabaseServerClient()
  const {data:{user}}=await supabase.auth.getUser()
  if(!user)redirect('/fantasy')
  const {error}=await supabase.rpc(name,args)
  if(error)redirect(routeFor(leagueId,'error',error.message))
  revalidatePath(`/fantasy/league/${leagueId}/trades`)
  revalidatePath(`/fantasy/league/${leagueId}/team`)
  redirect(routeFor(leagueId,'message',success))
}

export async function proposeTrade(formData) {
  const leagueId=String(formData.get('leagueId')||'')
  return runTradeRpc(formData,'propose_fantasy_trade',{
    p_league_id:leagueId,
    p_recipient_team_id:String(formData.get('recipientTeamId')||''),
    p_offered_player_ids:formData.getAll('offeredPlayerIds').map(String),
    p_requested_player_ids:formData.getAll('requestedPlayerIds').map(String),
    p_note:String(formData.get('note')||'').trim().slice(0,280),
  },'Trade offer sent')
}

export async function respondTrade(formData) {
  return runTradeRpc(formData,'respond_fantasy_trade',{
    p_trade_id:String(formData.get('tradeId')||''),p_response:String(formData.get('response')||''),
  },formData.get('response')==='accepted'?'Trade accepted — awaiting commissioner review':'Trade rejected')
}

export async function cancelTrade(formData) {
  return runTradeRpc(formData,'cancel_fantasy_trade',{
    p_trade_id:String(formData.get('tradeId')||''),
  },'Trade offer cancelled')
}

export async function reviewTrade(formData) {
  const decision=String(formData.get('decision')||'')
  return runTradeRpc(formData,'review_fantasy_trade',{
    p_trade_id:String(formData.get('tradeId')||''),p_decision:decision,
    p_note:String(formData.get('commissionerNote')||'').trim().slice(0,280),
  },decision==='approve'?'Trade approved and rosters updated':'Trade vetoed')
}
