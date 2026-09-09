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

export async function signUp(formData) {
  const supabase = await requireClient()
  const email = clean(formData.get('email'), 200).toLowerCase()
  const password = String(formData.get('password') || '')
  const displayName = clean(formData.get('displayName'), 40)
  // Carried in from an invite LINK (?invite=CODE) via a hidden field on the
  // auth forms, so clicking someone's invite through sign-up still lands you
  // back on the join form with the code filled in, instead of losing it.
  const invite = clean(formData.get('invite'), 20).toUpperCase()

  if (!email || password.length < 8 || !displayName) {
    fantasyRedirect('error', 'Enter a name, email, and password of at least 8 characters', { invite })
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const next = invite ? `/fantasy?invite=${encodeURIComponent(invite)}` : '/fantasy'
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  })

  if (error) fantasyRedirect('error', error.message, { invite })
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    fantasyRedirect('error', 'That account already exists — use Sign in with the same email and password', { invite })
  }
  if (!data.session) fantasyRedirect('message', 'Check your email to confirm your account', { invite })
  revalidatePath('/fantasy')
  redirect(next)
}

export async function signIn(formData) {
  const supabase = await requireClient()
  const email = clean(formData.get('email'), 200).toLowerCase()
  const password = String(formData.get('password') || '')
  const invite = clean(formData.get('invite'), 20).toUpperCase()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) fantasyRedirect('error', error.message, { invite })
  revalidatePath('/fantasy')
  redirect(invite ? `/fantasy?invite=${encodeURIComponent(invite)}` : '/fantasy')
}

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
