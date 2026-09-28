// THE GOAL CARD, BY URL (2026-09-28, MLB-PARITY plan C1) -- LAMP's twin of
// app/api/dash/homers/card: renders lib/nhl/goalCard.js for one standing
// lamp_goal_feed row, so Discord can embed it by URL and a post can be
// re-checked by eye. Reads the frozen row; never recomputes a label.
//   /api/lamp/goals/card?game=<game_id>&pid=<player_id>[&n=<goal_n>]
import { createClient } from '@supabase/supabase-js'
import { goalCard } from '../../../../../lib/nhl/goalCard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const client = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function GET(request) {
  const u = new URL(request.url)
  const game = String(u.searchParams.get('game') || '').trim()
  const pid = String(u.searchParams.get('pid') || '').trim()
  const n = Math.max(1, Number(u.searchParams.get('n') || 1) || 1)
  if (!/^\d{10}$/.test(game) || !/^\d{7}$/.test(pid)) {
    return Response.json({ error: 'game=<10-digit game id>&pid=<7-digit player id>[&n=1]' }, { status: 400 })
  }
  const db = client()
  if (!db) return Response.json({ error: 'not configured' }, { status: 503 })
  const { data: row } = await db.from('lamp_goal_feed').select('*').match({ game_id: Number(game), player_id: Number(pid), goal_n: n }).is('overturned_at', null).maybeSingle()
  if (!row) return Response.json({ error: 'no standing goal row for that game / player / n' }, { status: 404 })
  const site = (process.env.NEXT_PUBLIC_SITE_URL || 'dashnetwork.vercel.app').replace(/^https?:\/\//, '').replace(/\/$/, '')
  const img = await goalCard(row, { site })
  const headers = new Headers(img.headers)
  // A goal's frozen row doesn't change once it stands; a day at the edge.
  headers.set('Cache-Control', 'public, max-age=3600, s-maxage=86400')
  return new Response(img.body, { status: 200, headers })
}
