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

// ── A BOUNCE USED TO COST YOU THE WHOLE FORM (2026-08-31) ───────────────────
//
// Donovan, reporting a 45+ user who could not get through sign-up: "the sign
// up process is hard on both mobile and desktop."
//
// This function was most of the reason. It redirected to `next` — which is `/`
// — with the message in the query string. The front door renders that message
// as a <p> directly under the nav bar, and the auth card is at the BOTTOM of a
// 275-line marketing page. So one mistyped password did all of this at once:
//
//   · threw you to the top of a long page you had already scrolled past
//   · put the explanation ~1,500px away from the form it was about
//   · emptied every field, including the name and email that were fine
//
// The person then has to work out where the form went, scroll back down to it,
// and retype everything to fix one field. That is not a hard form, it is a
// form that punishes a typo, and it is exactly where somebody gives up.
//
// Now the bounce lands ON the card (the #hash), and carries back what was
// already typed so only the broken field needs attention. The password is
// deliberately NOT carried — a password in a URL ends up in history, in
// server logs and in the back button, and no amount of convenience is worth
// that.
// WHICH PAGE HOLDS THE FORM (2026-09-05). Now that the boards are behind an
// account, `next` is usually a board URL (`/app#sport=mlb&tab=home`) — a page
// with no form on it, and a gated one, so a bounce there would loop back to
// /login with the message lost. The form lives in exactly two places: the
// front door when `next` is `/`, and /login?next=… for everything else.
const host = (next) => (safeNext(next) === '/' ? '/' : `/login?next=${encodeURIComponent(safeNext(next))}`)

function back(next, type, message, keep = {}) {
  const target = host(next)
  const q = new URLSearchParams({ [type]: message })
  if (keep.email) q.set('em', keep.email)
  if (keep.name) q.set('nm', keep.name)
  // Which tab to reopen, so a failed sign-up does not reappear as a sign-in
  // form with the person's details missing from it.
  const hash = keep.mode === 'signin' ? '#sign-in' : '#create-account'
  redirect(`${target}${target.includes('?') ? '&' : '?'}${q.toString()}${hash}`)
}

async function client(next) {
  const supabase = await createSupabaseServerClient()
  if (!supabase) back(next, 'error', 'Accounts are not configured on this deploy')
  return supabase
}

export async function dashSignIn(formData) {
  const next = safeNext(formData.get('next'))
  const supabase = await client(next)
  const email = clean(formData.get('email'), 200).toLowerCase()
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: String(formData.get('password') || ''),
  })
  if (error) back(next, 'error', error.message, { email, mode: 'signin' })
  revalidatePath('/', 'layout')
  redirect(next)
}

export async function dashSignUp(formData) {
  const next = safeNext(formData.get('next'))
  const supabase = await client(next)
  const email = clean(formData.get('email'), 200).toLowerCase()
  const password = String(formData.get('password') || '')
  const displayName = clean(formData.get('displayName'), 40)

  const keep = { email, name: displayName, mode: 'create' }

  // Say WHICH of the three is wrong. "Enter a name, email, and a password of
  // at least 8 characters" is three requirements in one sentence and leaves
  // the reader to work out which one they missed — on a form that had just
  // emptied itself.
  if (!displayName) back(next, 'error', 'Add your name — it is what the site calls you.', keep)
  if (!email) back(next, 'error', 'Add your email address.', keep)
  if (password.length < 8) {
    back(next, 'error', `Your password needs at least 8 characters — that one has ${password.length}.`, keep)
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

  if (error) back(next, 'error', error.message, keep)
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    // Reopen the SIGN-IN tab with the email already in it: the answer to "that
    // account exists" is a sign-in, and making the person find the other tab
    // and retype the address is the same punishment in a smaller box.
    back(next, 'error', 'You already have an account with that email — sign in below.', { email, mode: 'signin' })
  }
  // Email confirmation is not a toast. It is the whole of what happens next,
  // and until 2026-08-31 it rendered as one line at the top of a page whose
  // form was 1,500px further down, still sitting there looking like nothing
  // had happened. `confirm` makes the card replace itself with the
  // instruction — see components/DashAuthCard.js.
  if (!data.session) {
    const h = host(next)
    redirect(`${h}${h.includes('?') ? '&' : '?'}confirm=${encodeURIComponent(email)}#create-account`)
  }
  revalidatePath('/', 'layout')
  // WHAT NOW. Donovan's third report was "didn't know what to do after signing
  // up", and the old code redirected to `/` — the same page, no acknowledgement
  // that anything had happened at all. `welcome` turns the auth section into a
  // short first-run panel with the three things worth doing first.
  // The welcome panel is a front-door section; a board `next` carries its own
  // hash (the tab) that `#sign-in` would overwrite. So: front door gets the
  // welcome, anywhere else gets where they were going.
  if (safeNext(next) !== '/') redirect(safeNext(next))
  redirect(`${safeNext(next)}?welcome=${encodeURIComponent(displayName)}#sign-in`)
}

export async function dashSignOut(formData) {
  const next = safeNext(formData?.get?.('next'))
  const supabase = await client(next)
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect(next)
}

// ── Password recovery ───────────────────────────────────────────────────────
// The 2026-08-29 review: there was no forgot-password path anywhere on the
// network — a person who lost their password lost their account. These two
// actions are the whole flow: request a reset email, then set the new
// password once the email link has signed them in (the recovery link goes
// through /auth/callback, which exchanges the code for a real session and
// forwards to /reset-password).

export async function dashForgotPassword(formData) {
  const supabase = await client('/forgot-password')
  const email = clean(formData.get('email'), 200).toLowerCase()
  if (!email) back('/forgot-password', 'error', 'Enter the email you signed up with')

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent('/reset-password')}`,
  })
  // Deliberately the same answer whether or not the email has an account —
  // a different message for unknown addresses lets anyone probe who has one.
  back('/forgot-password', 'message', 'If that email has an account, a reset link is on its way. Check spam too.')
}

export async function dashResetPassword(formData) {
  const supabase = await client('/reset-password')
  const password = String(formData.get('password') || '')
  const confirm = String(formData.get('confirm') || '')
  if (password.length < 8) back('/reset-password', 'error', 'The new password needs at least 8 characters')
  if (password !== confirm) back('/reset-password', 'error', 'The two passwords do not match')

  const { error } = await supabase.auth.updateUser({ password })
  if (error) back('/reset-password', 'error', error.message)
  revalidatePath('/', 'layout')
  back('/', 'message', 'Password changed — you are signed in')
}
