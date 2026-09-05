// /api/dash/homers/card?day=YYYY-MM-DD&pid=<mlb id>&n=<hr number>
//
// The homer share card at a public URL. Discord embeds it; a person can save
// it; the cron does not use this route (it renders in-process for the X
// upload — see lib/dash/homerCard.js). Reads the homer_feed row so the card
// says what the record says, never something recomputed later.
//
// Cached hard: a row never changes after it is written (the role is frozen at
// first sight), so the image for (day, pid, n) is the same forever.

import { createClient } from '@supabase/supabase-js'
import { homerCard, pregameCard, recapCard } from '../../../../../lib/dash/homerCard'

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
  const day = String(u.searchParams.get('day') || '').slice(0, 10)
  const pid = String(u.searchParams.get('pid') || '').trim()
  const n = Math.max(1, Number(u.searchParams.get('n') || 1) || 1)
  const recap = u.searchParams.get('recap') === '1'
  const pregame = u.searchParams.get('pregame') === '1'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || (!recap && !pregame && !/^\d+$/.test(pid))) {
    return Response.json({ error: 'day=YYYY-MM-DD&pid=<id>[&n=1]  or  day=YYYY-MM-DD&recap=1  or  day=YYYY-MM-DD&pregame=1' }, { status: 400 })
  }
  const db = client()
  if (!db) return Response.json({ error: 'not configured' }, { status: 503 })
  const site = (process.env.NEXT_PUBLIC_SITE_URL || 'dashnetwork.vercel.app').replace(/^https?:\/\//, '').replace(/\/$/, '')

  let img
  if (pregame) {
    // The morning's call, from what was actually posted — never from the
    // board as it is now.
    const { data: post } = await db.from('homer_feed_posts').select('payload').match({ day, kind: 'pregame' }).maybeSingle()
    const picks = post?.payload?.picks
    if (!Array.isArray(picks) || !picks.length) return Response.json({ error: 'no pregame post for that day' }, { status: 404 })
    img = await pregameCard(day, picks, { site })
    const headers = new Headers(img.headers)
    headers.set('Cache-Control', 'public, max-age=86400, s-maxage=31536000, immutable')
    return new Response(img.body, { status: 200, headers })
  }
  if (recap) {
    // The night's card. Cached for an hour rather than forever: the night is
    // still being written until the last game goes final.
    const since = new Date(`${day}T12:00:00Z`)
    since.setUTCDate(since.getUTCDate() - 9)
    const [{ data: rows }, { data: hist }] = await Promise.all([
      db.from('homer_feed').select('name,team,role,on_board,board_rank').eq('day', day),
      db.from('homer_feed').select('day,role').gte('day', since.toISOString().slice(0, 10)).lte('day', day),
    ])
    img = await recapCard(day, rows || [], hist || [], { site })
    const headers = new Headers(img.headers)
    headers.set('Cache-Control', 'public, max-age=300, s-maxage=3600')
    return new Response(img.body, { status: 200, headers })
  }

  const { data: row } = await db.from('homer_feed').select('*').match({ day, player_id: pid, hr_n: n }).maybeSingle()
  if (!row) return Response.json({ error: 'no such homer' }, { status: 404 })
  img = await homerCard(row, { site })
  const headers = new Headers(img.headers)
  headers.set('Cache-Control', 'public, max-age=86400, s-maxage=31536000, immutable')
  return new Response(img.body, { status: 200, headers })
}
