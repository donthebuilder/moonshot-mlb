// PREVIEW GATE (2026-08-08). The whole site sits behind a password until
// Week 1. Server-side: the middleware runs on Vercel's edge before any page
// renders, so there is nothing to "view source" around. The password lives
// ONLY in the PREVIEW_PASSWORD env var on Vercel — never in this repo.
// Unset PREVIEW_PASSWORD (or delete this file) at launch and the gate is gone.
import { NextResponse } from 'next/server'

export function middleware(req) {
  const pass = process.env.PREVIEW_PASSWORD || ''
  if (!pass) return NextResponse.next() // no password configured = open
  const { pathname } = req.nextUrl
  if (pathname.startsWith('/gate') || pathname.startsWith('/api/gate')) {
    return NextResponse.next()
  }
  const cookie = req.cookies.get('nfl_preview')?.value || ''
  if (cookie === pass) return NextResponse.next()
  const url = req.nextUrl.clone()
  url.pathname = '/gate'
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
