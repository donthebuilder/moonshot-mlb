// THE HOMER FEED CRON — every home run, on the record, within a minute.
//
// 2026-09-05. Donovan: "the X account will help with getting the site out
// there — people keep telling me to drop the site." This is the public half
// of the push sender: the same live slate, the same board, the same
// insert-and-see-what-stuck dedupe — but it keeps EVERY homer instead of only
// the followed ones, writes each to homer_feed, and posts it with a card.
//
// The rules it inherits from app/api/dash/push/tick, unchanged:
//
//   1. NEW EVENTS ONLY, ATOMICALLY. The insert into homer_feed is ON CONFLICT
//      DO NOTHING; the rows that stick are the new homers. Two overlapping
//      runs cannot both post the same ball.
//   2. EVERYTHING ON THE ROW IS FROZEN AT FIRST SIGHT. Role, rank, price,
//      stats, hook lines — all copied when the homer is seen. A later slate
//      rebuild, odds move or pair-file refresh changes nothing about what was
//      said. The card can be re-rendered from the row alone, forever.
//   3. IT NEVER FAILS LOUDLY. No config → counted no-op. X refuses → the row
//      stays unposted and the next tick retries it. A cron that throws is a
//      cron that stops running.
//
// WHAT IT POSTS, AND WHERE. Every homer goes to Discord and to X (Donovan:
// "all HRs go on X, we are making a tracker"). X_POST_MODE=flagged narrows X
// to the bot's own homers if the quota ever bites. At the end of the night,
// once every game is settled, one recap post with its own card.
//
// THE THREE PUBLISHED FILES are read at most once per ten minutes per
// instance: the FULL board (the slimmed sender copy drops the stats the card
// prints), the odds file, and the pair-history summary.

import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'

import { easternToday } from '../../../../../lib/data'
import { fetchLiveSlate } from '../../../../../lib/liveSlate'
import { fetchBoardFull } from '../../../../../lib/dash/board'
import { oddsPaths, pairSummaryPaths } from '../../../../../lib/dataSource'
import { boardIndexFrom, captureFrom, homersFrom, hooksFor, postText } from '../../../../../lib/dash/homerFeed'
import { homerCard, recapCard } from '../../../../../lib/dash/homerCard'
import { hasX, postToDiscord, postToX, uploadImageToX } from '../../../../../lib/dash/xPost'
import { isMaintenanceMode } from '../../../../../lib/edgeConfig'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
const CALLED_URL = SITE ? `${SITE}/called` : ''
const SITE_HOST = SITE.replace(/^https?:\/\//, '') || 'dashnetwork.app'
const HANDLE = String(process.env.X_HANDLE || '').trim()          // e.g. "@dashnetwork" — optional
const MODE = /^flagged$/i.test(String(process.env.X_POST_MODE || '')) ? 'flagged' : 'all'
const cardUrl = (row) => (SITE ? `${SITE}/api/dash/homers/card?day=${row.day}&pid=${row.player_id}&n=${row.hr_n}` : null)
const recapUrl = (day) => (SITE ? `${SITE}/api/dash/homers/card?day=${day}&recap=1` : null)

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

// ── the published files, cached per instance ───────────────────────────────
const TTL_MS = 10 * 60 * 1000
const _cache = { board: { at: 0, day: '', index: null }, odds: { at: 0, data: null }, pairs: { at: 0, data: null } }

async function boardIndex(day) {
  const c = _cache.board
  if (c.index && c.day === day && Date.now() - c.at < TTL_MS) return c.index
  const rows = await fetchBoardFull('today').catch(() => null)
  const index = boardIndexFrom(rows)
  // An empty board is not cached: a bot that has not published yet should be
  // asked again next minute, not remembered as "nobody is on it" for ten.
  if (index.size) _cache.board = { at: Date.now(), day, index }
  return index
}

async function published(slot, paths, ok) {
  const c = _cache[slot]
  if (c.data && Date.now() - c.at < TTL_MS) return c.data
  for (const url of paths) {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) continue
      const json = await res.json()
      if (ok(json)) { _cache[slot] = { at: Date.now(), data: json }; return json }
    } catch { /* next candidate */ }
  }
  return c.data
}
const oddsFile = () => published('odds', oddsPaths(), (j) => Boolean(j?.by_player_id))
const pairsFile = () => published('pairs', pairSummaryPaths(), (j) => Array.isArray(j?.top_pairs))

/** His jersey number off the league, or null. One small call per new homer. */
async function jerseyOf(id) {
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/people?personIds=${encodeURIComponent(id)}&fields=people,id,primaryNumber`, { cache: 'no-store' })
    if (!res.ok) return null
    const j = await res.json()
    const raw = String(j?.people?.[0]?.primaryNumber ?? '').trim()
    return raw && Number.isFinite(Number(raw)) ? Number(raw) : null
  } catch {
    return null
  }
}

// PNG bytes, or null. Never throws: the image is the garnish.
async function bytesOf(make) {
  try {
    const img = await make()
    return Buffer.from(await img.arrayBuffer())
  } catch (err) {
    console.error(`[homers] card failed: ${String(err?.message || err)}`)
    return null
  }
}

const strip = (row) => {
  const out = {}
  for (const [k, v] of Object.entries(row)) if (!k.startsWith('_')) out[k] = v
  return out
}

const shiftDay = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
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

  const [board, odds, pairs] = await Promise.all([boardIndex(day), oddsFile(), pairsFile()])
  const homers = homersFrom(snap, day, board, odds)
  const totals = { day, seen: homers.length, fresh: 0, discord: 0, x: 0, xFailed: 0, board: board.size, mode: MODE }

  // ── 1. claim the new ones ────────────────────────────────────────────────
  let freshKeys = new Set()
  if (homers.length) {
    const { data: claimed, error } = await db
      .from('homer_feed')
      .upsert(homers.map(strip), { onConflict: 'day,player_id,hr_n', ignoreDuplicates: true })
      .select('player_id,hr_n')
    if (error) {
      console.error('[homers] insert failed: ' + error.message)
      return Response.json({ ...totals, error: 'insert-failed' })
    }
    freshKeys = new Set((claimed || []).map((r) => `${r.player_id}:${r.hr_n}`))
    totals.fresh = freshKeys.size
  }

  // ── 2. the hooks, for the rows this run created ──────────────────────────
  //
  // Computed once, here, and written to the row. The partner check needs
  // tonight's other homers, the back-to-back check needs last night's, the
  // record needs his earlier rows; three small reads shared by every fresh
  // homer in this tick.
  if (freshKeys.size) {
    const todayIds = new Set(homers.map((h) => String(h.player_id)))
    const { data: yRows } = await db.from('homer_feed').select('player_id').eq('day', shiftDay(day, -1))
    const yesterdayIds = new Set((yRows || []).map((r) => String(r.player_id)))
    for (const ev of homers) {
      if (!freshKeys.has(`${ev.player_id}:${ev.hr_n}`)) continue
      const [{ data: hist }, jersey] = await Promise.all([
        db.from('homer_feed').select('role').eq('player_id', ev.player_id).lt('day', day).order('day', { ascending: false }).limit(5),
        jerseyOf(ev.player_id),
      ])
      const hooks = hooksFor(ev, { pairs, todayIds, yesterdayIds, history: hist || [], jersey })
      const stats = { ...(ev.stats || {}), jersey }
      ev.hooks = hooks
      ev.stats = stats
      await db.from('homer_feed').update({ hooks, stats }).match({ day, player_id: ev.player_id, hr_n: ev.hr_n })
    }
  }

  // ── 3. post whatever is still unposted for today (fresh + earlier failures) ─
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
        const png = await bytesOf(() => homerCard(ev, { site: SITE_HOST }))
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

  // ── 4. the recap, once, when the night is over ───────────────────────────
  const allDone = snap.games.every((g) => g?.settled || g?.postponed || g?.suspended || g?.state === 'Final')
  if (allDone) {
    const key = `homerfeed:recap:${day}`
    const { data: claim } = await db
      .from('dash_push_seen')
      .upsert([{ event_key: key }], { onConflict: 'event_key', ignoreDuplicates: true })
      .select('event_key')
    if (claim?.length) {
      const { data: rows } = await db.from('homer_feed').select('name,team,role,on_board,board_rank').eq('day', day)
      const c = captureFrom(rows)
      if (c.total) {
        const roles = Object.entries(c.byRole).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r} ${n}`).join(' · ')
        const text = [
          `📋 ${day} — the bot called ${c.called} of ${c.total} home runs (${c.pct}%)`,
          roles ? `⭐ ${roles}` : '',
          c.rated ? `⚪ ${c.rated} more were rated, not picked` : '',
          [CALLED_URL, HANDLE].filter(Boolean).join(' · '),
        ].filter(Boolean).join('\n')
        await postToDiscord(text, { imageUrl: recapUrl(day) })
        if (xOn) {
          const { data: hist } = await db.from('homer_feed').select('day,role').gte('day', shiftDay(day, -9)).lte('day', day)
          const png = await bytesOf(() => recapCard(day, rows || [], hist || [], { site: SITE_HOST }))
          const mediaId = png ? await uploadImageToX(png) : null
          const r = await postToX(text, { mediaId })
          if (r.ok) totals.recap = r.id
          else console.error(`[homers] recap refused: ${r.status} ${r.error}`)
        }
      }
    }
  }

  return Response.json(totals)
}
