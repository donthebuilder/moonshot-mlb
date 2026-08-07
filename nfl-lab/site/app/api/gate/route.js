// Checks the password and sets the preview cookie for 30 days. The cookie
// value equals the password itself — acceptable for a friends-preview gate
// (httpOnly, so scripts can't read it), not a design for real secrets.
import { NextResponse } from 'next/server'

export async function POST(req) {
  const { password } = await req.json().catch(() => ({}))
  const pass = process.env.PREVIEW_PASSWORD || ''
  if (!pass || password !== pass) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set('nfl_preview', pass, {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30, path: '/',
  })
  return res
}
