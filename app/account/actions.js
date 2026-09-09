'use server'

// Changing your own name, email and password.
//
// THREE DIFFERENT STORES, and the reason there are three is worth writing
// down because it is the only tricky thing on this page:
//
//   · auth.users            email and password. Supabase owns this; changing
//                           an email sends a confirmation link and does NOT
//                           take effect until it is clicked.
//   · user_metadata         where signUp stashed display_name at sign-up
//                           (app/(front)/actions.js), and what the front door
//                           greets you by.
//   · public.profiles       the display name Franchise shows in a league —
//                           seeded from user_metadata by the handle_new_user
//                           trigger (202608250001) and never updated since,
//                           because until now there was nothing that could
//                           change a name.
//
// So a rename writes the last two TOGETHER. Writing one would give you a
// person greeted as their new name on the front door and still listed under
// the old one in their league, which is the kind of split nobody debugs — they
// just conclude the rename didn't work.

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '../../lib/supabase/server'

const clean = (value, max = 60) => String(value || '').trim().slice(0, max)

function back(type, message) {
  redirect(`/account?${type}=${encodeURIComponent(message)}`)
}

async function me() {
  const supabase = await createSupabaseServerClient()
  if (!supabase) back('error', 'Accounts are not configured on this deploy')
  const { data } = await supabase.auth.getUser()
  if (!data?.user) back('error', 'Sign in first')
  return { supabase, user: data.user }
}

export async function updateDisplayName(formData) {
  const { supabase, user } = await me()
  const displayName = clean(formData.get('displayName'), 40)
  // The same bound the profiles table enforces (1–40). Checked here so the
  // answer is a sentence rather than a constraint-violation string.
  if (!displayName) back('error', 'Enter a name')

  const { error: metaError } = await supabase.auth.updateUser({ data: { display_name: displayName } })
  if (metaError) back('error', metaError.message)

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ display_name: displayName })
    .eq('id', user.id)
  if (profileError) back('error', profileError.message)

  revalidatePath('/', 'layout')
  back('message', `You are ${displayName} everywhere now, leagues included`)
}

export async function updateEmail(formData) {
  const { supabase, user } = await me()
  const email = clean(formData.get('email'), 200).toLowerCase()
  if (!email || !email.includes('@')) back('error', 'Enter a valid email')
  if (email === String(user.email || '').toLowerCase()) back('message', 'That is already your email')

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: `${siteUrl}/auth/callback?next=/account` },
  )
  if (error) back('error', error.message)

  // Deliberately not "changed": Supabase sends a confirmation to the NEW
  // address and the old one keeps working until it is clicked. Saying
  // "changed" here is how someone locks themselves out.
  back('message', `Check ${email} for a confirmation link. Until you click it, sign in with your old email.`)
}

export async function updatePassword(formData) {
  const { supabase } = await me()
  const password = String(formData.get('password') || '')
  const confirm = String(formData.get('confirm') || '')
  if (password.length < 8) back('error', 'Use at least 8 characters')
  if (password !== confirm) back('error', 'The two passwords do not match')

  const { error } = await supabase.auth.updateUser({ password })
  if (error) back('error', error.message)
  back('message', 'Password changed. Other devices stay signed in — sign out everywhere below if you want them out.')
}

/**
 * Sign out on every device, not just this one.
 *
 * scope 'global' revokes every refresh token this account has. The reason
 * it is a separate button from Sign out — and worded plainly — is that it is
 * the one thing to do if you think someone else has your password, and it
 * should not be buried behind a normal sign-out.
 */
export async function signOutEverywhere() {
  const { supabase } = await me()
  await supabase.auth.signOut({ scope: 'global' })
  revalidatePath('/', 'layout')
  redirect('/')
}
