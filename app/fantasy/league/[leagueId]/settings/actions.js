'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '../../../../../lib/supabase/server'

const routeFor=(leagueId,type,message)=>`/fantasy/league/${leagueId}/settings?${type}=${encodeURIComponent(message)}`

async function clientAndUser(){const supabase=await createSupabaseServerClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect('/fantasy');return supabase}

export async function updateLeagueSettings(formData) {
  const leagueId=String(formData.get('leagueId')||'')
  const supabase=await clientAndUser()
  const settings={
    name:String(formData.get('name')||'').trim().slice(0,60),team_count:Number(formData.get('teamCount')),
    scoring:String(formData.get('scoring')||''),has_kicker:formData.get('hasKicker')==='on',
    has_defense:formData.get('hasDefense')==='on',ir_slots:Number(formData.get('irSlots')),
    draft_timer_seconds:Number(formData.get('draftTimer')),draft_order_method:String(formData.get('draftOrder')||''),
  }
  const {error}=await supabase.rpc('update_fantasy_league_settings',{p_league_id:leagueId,p_settings:settings})
  if(error)redirect(routeFor(leagueId,'error',error.message))
  revalidatePath(`/fantasy/league/${leagueId}`, 'layout')
  redirect(routeFor(leagueId,'message','League settings saved'))
}

export async function regenerateInviteCode(formData) {
  const leagueId=String(formData.get('leagueId')||'')
  const supabase=await clientAndUser()
  const {data,error}=await supabase.rpc('regenerate_fantasy_invite_code',{p_league_id:leagueId})
  if(error)redirect(routeFor(leagueId,'error',error.message))
  revalidatePath(`/fantasy/league/${leagueId}`, 'layout')
  redirect(routeFor(leagueId,'message',`New invite code: ${data}`))
}

export async function deleteLeague(formData) {
  const leagueId=String(formData.get('leagueId')||'')
  const confirmation=String(formData.get('confirmation')||'')
  const supabase=await clientAndUser()
  const {error}=await supabase.rpc('delete_fantasy_league',{p_league_id:leagueId,p_confirmation:confirmation})
  if(error)redirect(routeFor(leagueId,'error',error.message))
  revalidatePath('/fantasy')
  redirect('/fantasy?message=League%20deleted')
}

// Starting a draft used to be a one-way door: the league leaves 'setup', the
// invite code stops working, and prepare/start both refuse forever. A single
// test draft therefore burned a league. This is the way back.
export async function resetDraft(formData) {
  const leagueId = String(formData.get('leagueId') || '')
  const confirmation = String(formData.get('confirmation') || '')
  const supabase = await createSupabaseServerClient()
  if (!supabase) redirect('/fantasy')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/fantasy')
  const route = `/fantasy/league/${leagueId}/settings`
  const { data, error } = await supabase.rpc('reset_fantasy_draft', {
    p_league_id: leagueId, p_confirmation: confirmation,
  })
  if (error) {
    const missing = /reset_fantasy_draft/i.test(error.message) && /does not exist/i.test(error.message)
    redirect(`${route}?error=${encodeURIComponent(missing
      ? 'The reset function is not installed yet — run DRAFT-NIGHT-FIXES.sql in the Supabase SQL editor first.'
      : error.message)}`)
  }
  revalidatePath(`/fantasy/league/${leagueId}`, 'layout')
  revalidatePath('/fantasy')
  redirect(`${route}?message=${encodeURIComponent(`Draft reset — ${data || 0} picks cleared and the invite code is open again`)}`)
}
