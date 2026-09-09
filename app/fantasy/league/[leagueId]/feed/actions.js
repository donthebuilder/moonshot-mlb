'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '../../../../../lib/supabase/server'

const routeFor=(leagueId,type,message)=>`/fantasy/league/${leagueId}/feed?${type}=${encodeURIComponent(message)}`

async function run(formData,name,args,message,{silent=false}={}) {
  const leagueId=String(formData.get('leagueId')||'')
  const supabase=await createSupabaseServerClient()
  if(!supabase)redirect('/fantasy')
  const {data:{user}}=await supabase.auth.getUser()
  if(!user)redirect('/fantasy')
  const {error}=await supabase.rpc(name,args)
  if(error)redirect(routeFor(leagueId,'error',error.message))
  revalidatePath(`/fantasy/league/${leagueId}`, 'layout')
  // A reaction shouldn't fling the reader back to the top of the feed with a
  // banner — only real posts/comments announce themselves.
  if(silent)return
  redirect(routeFor(leagueId,'message',message))
}

export async function createPost(formData) {
  const leagueId=String(formData.get('leagueId')||'')
  return run(formData,'create_fantasy_feed_post',{p_league_id:leagueId,p_body:String(formData.get('body')||'')},'Posted to the league')
}

export async function createComment(formData) {
  return run(formData,'comment_fantasy_feed_post',{p_post_id:String(formData.get('postId')||''),p_body:String(formData.get('body')||'')},'Comment added')
}

export async function toggleReaction(formData) {
  return run(formData,'toggle_fantasy_feed_reaction',{p_post_id:String(formData.get('postId')||''),p_reaction:String(formData.get('reaction')||'')},'Reaction updated',{silent:true})
}
