// THE HOMER FEED CRON — every home run, on the record, within a minute.
//
// 2026-09-05. Donovan: "the X account will help with getting the site out
// there — people keep telling me to drop the site." This is the public half
// of the push sender: the same live slate, the same board, the same
// insert-and-see-what-stuck dedupe — but it keeps EVERY homer instead of only
// the followed ones, writes each to homer_feed, and posts it.
//
// The rules it inherits from app/api/dash/push/tick, unchanged:
//
//   1. NEW EVENTS ONLY, ATOMICALLY. The insert into homer_feed is ON CONFLICT
//      DO NOTHING; the rows that stick are the new homers. Two overlapping
//      runs cannot both post the same ball.
//   2. THE ROLE IS FROZEN AT FIRST SIGHT. The board is read when the homer is
//      seen and copied onto the row. A later slate rebuild changes nothing.
//   3. IT NEVER FAILS LOUDLY. No config → counted no-op. X refuses → the row
//      stays unposted and the next tick retries it (x_post_id is null).
//      A cron that throws is a cron that stops running.
//
// WHAT IT POSTS, AND WHERE. Discord gets every homer. X gets every homer or
// only the bot's — X_POST_MODE = all | flagged (default flagged, because the
// free tier cannot carry a full night; see lib/dash/xPost.js). At the end of
// the night, once every game is settled, one recap post: "called 7 of 22."
//
// THE BOARD IS READ AT MOST ONCE PER TEN MINUTES PER INSTANCE. today_slim is
// four megabytes; the designations do not change during a game. A cold
// instance pays one fetch; a warm one pays none.

import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'

import { easternToday } from '../../../../../lib/data'
import { fetchLiveSlate } from '../../../../../lib/liveSlate'
import { fetchBoard } from '../../../../../lib/dash/board'
import { oddsPaths } from '../../../../../lib/dataSource'
import { boardIndexFrom, captureFrom, homersFrom, postText } from '../../../../../lib/dash/homerFeed'
import { homerCard } from '../../../../../lib/dash/homerCard'
import { hasX, postToDiscord, postToX, uploadImageToX } from '../../../../../lib/dash/xPost'
import { isMaintenanceMode } from '../../../../../lib/edgeConfig'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
const CALLED_URL = SITE ? `${SITE}/called` : ''
const SITE_HOST = SITE.replace(/^https?:\/\//, '') || 'dashnetwork.app'
const cardUrl = (row) => (SITE ? `${SITE}/api/dash/homers/card?day=${row.day}&pid=${row.player_id}&n=${row.hr_n}` : null)
const HANDLE = String(process.env.X_HANDLE || '').trim()          // e.g. "@dashnetwork" — optional
const MODE = /^all$/i.test(String(process.env.X_POST_MODE || '')) ? 'all' : 'flagged'

function authorized(request) {
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  if (!supplied) return false
  return [process.env.CRON_SECRET, process.env.FRANCHISE_CRON_SECRET].filter(Boolean).some((expected) => {
    const a = Buffer.from(expected)
    const b = Buffer.from(supplied)
    return a.length === b.length && timingSafeEqual(a, b)
  })
}

const service = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

// ── the board, cached per instance ─────────────────────────────────────────
const BOARD_TTL_MS = 10 * 60 * 1000
let _board = { at: 0, day: '', index: null }

async function boardIndex(day) {
  if (_board.index && _board.day === day && Date.now() - _board.at < BOARD_TTL_MS) return _board.index
  const rows = await fetchBoard('today').catch(() => null)
  const index = boardIndexFrom(rows)
  // An empty board is not cached: a bot that has not published yet should be
  // asked again next minute, not remembered as "nobody is on it" for ten.
  if (index.size) _board = { at: Date.now(), day, index }
  return index
}

// ── the odds, same cadence ─────────────────────────────────────────────────
//
// odds_latest.json is ~1.3MB and the bot refreshes it a handful of times per
// slate; the price stapled to a homer is the best_over/best_book the file
// held when the ball left. Ten minutes stale is fine — the file itself
// freezes each market at first pitch.
let _odds = { at: 0, data: null }
async function oddsFile() {
  if (_odds.data && Date.now() - _odds.at < BOARD_TTL_MS) return _odds.data
  for (const url of oddsPaths()) {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) continue
      const json = await res.json()
      if (json?.by_player_id) { _odds = { at: Date.now(), data: json }; return json }
    } catch { /* next candidate */ }
  }
  return _odds.data
}

// The card, as PNG bytes, or null. Never throws: the image is the garnish.
async function cardBytes(row) {
  try {
    const img = await homerCard(row, { site: SITE_HOST })
    return Buffer.from(await img.arrayBuffer())
  } catch (err) {
    console.error(`[homers] card failed for ${row?.name}: ${String(err?.message || err)}`)
    return null
  }
}

const strip = (row) => {
  const out = {}
  for (const [k, v] of Object.entries(row)) if (!k.startsWith('_')) out[k] = v
  return out
}

export async function GET(request) {
  if (!authorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (await isMaintenanceMode()) return Response.json({ skipped: 'maintenance_mode' })
  const db = service()
  if (!db) return Response.json({ skipped: 'supabase-service-key-missing' })

  const day = easternToday()
  const snap = await fetchLiveSlate({ force: true }).catch(() => null)
  if (!snap?.games?.length) return Response.json({ day, skipped: 'no-games' })

  const started = snap.games.some((g) => g?.state === 'Live' || g?.state === 'Final')
  if (!started) return Response.json({ day, skipped: 'nothing-started' })

  const [board, odds] = await Promise.all([boardIndex(day), oddsFile()])
  const homers = homersFrom(snap, day, board, odds)
  const totals = { day, seen: homers.length, fresh: 0, discord: 0, x: 0, xFailed: 0, board: board.size, mode: MODE }

  // ── 1. claim the new ones ────────────────────────────────────────────────
  if (homers.length) {
    const { data: claimed, error } = await db
      .from('homer_feed')
      .upsert(homers.map(strip), { onConflict: 'day,player_id,hr_n', ignoreDuplicates: true })
      .select('player_id,hr_n')
    if (error) {
      console.error('[homers] insert failed: ' + error.message)
      return Response.json({ ...totals, error: 'insert-failed' })
    }
    totals.fresh = claimed?.length || 0
  }

  // ── 2. post whatever is still unposted for today (fresh + earlier failures) ─
  //
  // Reading back from the table rather than from `claimed` is deliberate: a
  // homer whose post failed last minute has a row with x_post_id null and
  // discord_sent false, and this is what retries it. Bounded so a dead X key
  // cannot turn every tick into forty failed requests forever.
  const { data: pending } = await db
    .from('homer_feed')
    .select('*')
    .eq('day', day)
    .or('discord_sent.eq.false,x_post_id.is.null')
    .order('seen_at', { ascending: true })
    .limit(12)

  const byKey = new Map(homers.map((h) => [`${h.player_id}:${h.hr_n}`, h]))
  const xOn = hasX()
  for (const row of pending || []) {
    // Recover the bits the post needs that the table does not store.
    const live = byKey.get(`${row.player_id}:${row.hr_n}`)
    const ev = { ...row, _roles: live?._roles || row.role || '' }
    const text = postText(ev, { site: CALLED_URL, handle: HANDLE })
    const patch = {}

    if (!row.discord_sent) {
      const r = await postToDiscord(text, { imageUrl: cardUrl(row) })
      if (r.ok) { patch.discord_sent = true; totals.discord += 1 }
    }
    const wantsX = xOn && (MODE === 'all' || Boolean(row.role))
    if (!row.x_post_id) {
      if (wantsX) {
        // Card first, then the post with it attached. Either half of the
        // image step failing degrades to a text post, never to no post.
        const png = await cardBytes(ev)
        const mediaId = png ? await uploadImageToX(png) : null
        const r = await postToX(text, { mediaId })
        if (r.ok && r.id) { patch.x_post_id = r.id; totals.x += 1 }
        else {
          totals.xFailed += 1
          console.error(`[homers] X refused ${row.name}: ${r.status} ${r.error}`)
          // A quota or auth refusal will refuse every row; stop spending the tick.
          if (r.status === 429 || r.status === 401 || r.status === 403) break
        }
      } else if (xOn) {
        // Not going to X by policy (flagged mode, no role) — mark it so it
        // stops showing up as pending. With X unconfigured the null stays, so
        // the night's rows post the moment the keys land.
        patch.x_post_id = 'skipped'
      }
    }
    if (Object.keys(patch).length) {
      await db.from('homer_feed').update(patch).match({ day, player_id: row.player_id, hr_n: row.hr_n })
    }
  }

  // ── 3. the recap, once, when the night is over ───────────────────────────
  const allDone = snap.games.every((g) => g?.settled || g?.postponed || g?.suspended || g?.state === 'Final')
  if (allDone) {
    const key = `homerfeed:recap:${day}`
    const { data: claim } = await db
      .from('dash_push_seen')
      .upsert([{ event_key: key }], { onConflict: 'event_key', ignoreDuplicates: true })
      .select('event_key')
    if (claim?.length) {
      const { data: rows } = await db.from('homer_feed').select('role,on_board').eq('day', day)
      const c = captureFrom(rows)
      if (c.total) {
        const roles = Object.entries(c.byRole).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r} ${n}`).join(' · ')
        const text = [
          `\u{1F4CB} ${day} — the bot called ${c.called} of ${c.total} home runs (${c.pct}%)`,
          roles ? `⭐ ${roles}` : '',
          c.rated ? `⚪ ${c.rated} more were rated, not picked` : '',
          [CALLED_URL, HANDLE].filter(Boolean).join(' · '),
        ].filter(Boolean).join('\n')
        await postToDiscord(text)
        if (xOn) {
          const r = await postToX(text)
          if (r.ok) totals.recap = r.id
          else console.error(`[homers] recap refused: ${r.status} ${r.error}`)
        }
      }
    }
  }

  return Response.json(totals)
}
