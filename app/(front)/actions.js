'use server'

// Network-level sign in / up / out.
//
// The same Supabase calls Franchise has made since 202608250001 — deliberately
// the same account, not a second one — with the one difference that matters
// here: they take you back where you were. Franchise's own actions redirect to
// /fantasy unconditionally, which is correct for Franchise and wrong for a
// person who signed in from the MOONSHOT board to save a watchlist.

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '../../lib/supabase/server'

const clean = (value, max = 60) => String(value || '').trim().slice(0, max)

// Only same-origin paths, and never a protocol-relative one — a `next` that
// can point off-site turns the sign-in form into an open redirect. The
// fallback is the front door, which is `/` since the move (it was /dash for
// about a day).
function safeNext(value) {
  const next = String(value || '/')
  return next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

function back(next, type, message) {
  const target = safeNext(next)
  redirect(`${target}${target.includes('?') ? '&' : '?'}${type}=${encodeURIComponent(message)}`)
}

async function client(next) {
  const supabase = await createSupabaseServerClient()
  if (!supabase) back(next, 'error', 'Accounts are not configured on this deploy')
  return supabase
}

export async function dashSignIn(formData) {
  const next = safeNext(formData.get('next'))
  const supabase = await client(next)
  const { error } = await supabase.auth.signInWithPassword({
    email: clean(formData.get('email'), 200).toLowerCase(),
    password: String(formData.get('password') || ''),
  })
  if (error) back(next, 'error', error.message)
  revalidatePath('/', 'layout')
  redirect(next)
}

export async function dashSignUp(formData) {
  const next = safeNext(formData.get('next'))
  const supabase = await client(next)
  const email = clean(formData.get('email'), 200).toLowerCase()
  const password = String(formData.get('password') || '')
  const displayName = clean(formData.get('displayName'), 40)

  if (!email || password.length < 8 || !displayName) {
    back(next, 'error', 'Enter a name, email, and a password of at least 8 characters')
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  })

  if (error) back(next, 'error', error.message)
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    back(next, 'error', 'That account already exists — sign in with the same email and password')
  }
  if (!data.session) back(next, 'message', 'Check your email to confirm your account')
  revalidatePath('/', 'layout')
  redirect(next)
}

export async function dashSignOut(formData) {
  const next = safeNext(formData?.get?.('next'))
  const supabase = await client(next)
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect(next)
}
