// GET /api/rank-snapshots?sport=mlb|nfl|nhl|nba&date=YYYY-MM-DD&board=<board>&sig=<the reader's ordering fingerprint>[&mode=today|tomorrow|this|next]
//
// The shared memory behind the rank arrows (components/RankMove.js, lib/useRankMove.js): the ordering a board showed
// BEFORE the one the reader is looking at, so every visitor sees the same arrows. Information only.
//
// MOONSHOT and TUDDY: the route reads the published slate itself (the same file the board reads), works out each
// board's default ordering with the board's own ordering code (lib/rankSnapshots/compute.js) and records it when the
// table has not seen it. LAMP and BUCKETS record where their own board routes compute the night
// (app/api/lamp/board, app/api/buckets/board), so here they only read. No cron, no polling: a read of an ordering
// the table already holds writes nothing, and an answer is held 30 s per server instance.
//
// The table may not exist yet, or Supabase may be unreachable: the answer is then { status: 'unreachable' } with a 200,
// and the page falls back to its own device memory. Nothing here ever throws at a reader.
import { adminClient } from '../../../lib/supabase/admin'
import { recordAndPrev, readBySig } from '../../../lib/rankSnapshots/store'
import { bucketsGuard } from '../../../lib/nba/gate'
import { mlbBoards, nflBoards } from '../../../lib/rankSnapshots/compute'
import { slatePaths } from '../../../lib/dataSource'
import { nflSlatePaths } from '../../../lib/nfl/dataSource'
import { isSport } from '../../../lib/routes'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const json = (body) => Response.json(body, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } })

async function readJson(paths) {
  for (const u of paths) {
    try {
      const r = await fetch(u, { next: { revalidate: 60 } })
      if (r.ok) return await r.json()
    } catch { /* try the next */ }
  }
  return null
}

// sport -> the bot files a sport's boards are read from, tried in turn until one is the reader's slate (its own game date).
// Sports computed on the site itself are absent: their own board routes record.
const SERVER_BOARDS = {
  mlb: async () => [await readJson(slatePaths('today')), await readJson(slatePaths('tomorrow'))].filter(Boolean).map(mlbBoards),
  nfl: async () => [await readJson(nflSlatePaths('this')), await readJson(nflSlatePaths('next'))].filter(Boolean).map(nflBoards),
}

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const sport = q.get('sport'), date = q.get('date') || '', board = q.get('board') || '', sig = q.get('sig') || ''
  if (!isSport(sport) || !board || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ status: 'skipped' })
  if (sport === 'nba') { const blocked = await bucketsGuard(); if (blocked) return blocked }   // BUCKETS stays hidden: no ordering leaves before it opens
  const db = adminClient({ anon: true })
  if (!db) return json({ status: 'unreachable' })
  const build = SERVER_BOARDS[sport]
  if (build) {
    // the slate the server reads must be the reader's (same game date) and hold this board
    const night = (await build()).find((n) => n.date === date && n.boards?.[board])
    if (!night) return json({ status: 'skipped' })
    return json(await recordAndPrev(db, { sport, board, date, ranks: night.boards[board], record: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) }))
  }
  // LAMP / BUCKETS: the board route recorded this ordering when it computed it; read it back by the reader's fingerprint
  if (!sig) return json({ status: 'skipped' })
  return json(await readBySig(db, { sport, board, date, sig }))
}
