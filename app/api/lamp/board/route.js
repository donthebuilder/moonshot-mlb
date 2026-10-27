// LAMP · BOARD — GET /api/lamp/board?date=YYYY-MM-DD
//
// Tonight's goal board as the record has it — lib/nhl/boardRead.js does
// the reading (locked rows, else a live PREVIEW flagged as such); this is
// the HTTP face of it, cached a minute at the edge.
import { slateNight } from '../../../../lib/slateNight'
import { validDate } from '../../../../lib/nhl/api'
import { readBoard, BOARD_MARKETS } from '../../../../lib/nhl/boardRead'
import { ok, bad, delayed } from '../../../../lib/nhl/respond'
import { recordNhlBoard } from '../../../../lib/rankSnapshots/record'
import { MEMBER_FEED_PARAM } from '../../../../lib/members/boardGate'
import { boardForViewer } from '../../../../lib/members/boardViewer'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') || await slateNight('nhl')
  if (!validDate(date)) return bad('date must be a real YYYY-MM-DD day')
  // ?market=SOG (LAMP v2); GOAL when absent, so every old link reads as before.
  const market = String(searchParams.get('market') || 'GOAL').toUpperCase()
  if (!BOARD_MARKETS[market]) return bad(`market must be one of ${Object.keys(BOARD_MARKETS).join(', ')}`)
  try {
    const board = await readBoard(date, { market, lines: true, proj: market === 'GOAL' })
    await recordNhlBoard(date, market, board)   // the ordering behind the rank arrows (lib/rankSnapshots): a quiet no-op until its table exists
    // THE PAID PICKS STAY PAID (2026-10-26, lib/members/boardGate.js): the plain address is the gated board for everyone (cached as before);
    // m=1 from a member's own login is the full board, private
    const v = await boardForViewer(board, { sport: 'nhl', memberAsked: searchParams.get(MEMBER_FEED_PARAM) === '1' })
    const body = { ...v.body, fetchedAt: new Date().toISOString() }
    return v.private ? Response.json(body, { headers: { 'Cache-Control': 'private, no-store' } }) : ok(body, 60)
  } catch (e) {
    return delayed(`board ${date}`, e)
  }
}
