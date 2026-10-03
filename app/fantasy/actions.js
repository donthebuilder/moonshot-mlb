'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '../../lib/supabase/server'

const clean = (value, max = 60) => String(value || '').trim().slice(0, max)

function fantasyRedirect(type, message, extra = {}) {
  const params = new URLSearchParams({ [type]: message })
  for (const [key, value] of Object.entries(extra)) {
    if (value) params.set(key, value)
  }
  redirect(`/fantasy?${params.toString()}`)
}

async function requireClient() {
  const supabase = await createSupabaseServerClient()
  if (!supabase) fantasyRedirect('error', 'Supabase is not configured yet')
  return supabase
}

// Sign-up and sign-in are the network's own (app/(front)/actions.js
// dashSignUp / dashSignIn through components/DashAuthCard.js, 2026-10-03 R10;
// /login has carried every signed-out /fantasy visit since the 09-05 gate):
// they keep what you typed on a mistake and have the confirm step; the invite
// rides in `next`.

export async function signOut() {
  const supabase = await requireClient()
  await supabase.auth.signOut()
  revalidatePath('/fantasy')
  redirect('/fantasy')
}

export async function createLeague(formData) {
  const supabase = await requireClient()
  const leagueName = clean(formData.get('leagueName'), 60)
  const teamName = clean(formData.get('teamName'), 40)
  if (!leagueName || !teamName) fantasyRedirect('error', 'League and team names are required')

  const settings = {
    team_count: Number(formData.get('teamCount')),
    scoring: clean(formData.get('scoring'), 20),
    has_kicker: formData.get('hasKicker') === 'on',
    has_defense: formData.get('hasDefense') === 'on',
    ir_slots: Number(formData.get('irSlots')),
    draft_timer_seconds: Number(formData.get('draftTimer')),
    draft_order_method: clean(formData.get('draftOrder'), 20),
  }

  const { error } = await supabase.rpc('create_fantasy_league', {
    p_name: leagueName,
    p_team_name: teamName,
    p_settings: settings,
  })

  if (error) fantasyRedirect('error', error.message)
  revalidatePath('/fantasy')
  fantasyRedirect('message', 'League created — share its invite code')
}

export async function joinLeague(formData) {
  const supabase = await requireClient()
  const inviteCode = clean(formData.get('inviteCode'), 20).toUpperCase()
  const teamName = clean(formData.get('teamName'), 40)
  if (!inviteCode || !teamName) fantasyRedirect('error', 'Invite code and team name are required')

  const { error } = await supabase.rpc('join_fantasy_league', {
    p_invite_code: inviteCode,
    p_team_name: teamName,
  })

  if (error) fantasyRedirect('error', error.message)
  revalidatePath('/fantasy')
  fantasyRedirect('message', 'You joined the league')
}
